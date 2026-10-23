"""Durable MX2 JSONL follower. Radio receive/SOS handling never waits on HTTP."""
import base64
import datetime as dt
import hashlib
import json
import logging
import os
from pathlib import Path
import sqlite3
import time
import urllib.request

from meshtastic.protobuf import atak_pb2
from tak_sos import parse_mx2_core, parse_mx2_meta, ProtocolError

LOG = logging.getLogger("mx2-upload")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def radio_metadata(record):
    mesh = {k: record.get(k) for k in
            ('packet_id', 'rx_rssi', 'rx_snr', 'hop_count', 'hop_start', 'hop_limit')}
    raw = record.get('raw_packet_summary')
    mesh['channel'] = raw.get('channel') if isinstance(raw, dict) else record.get('channel')
    return mesh


class Queue:
    def __init__(self, path, gateway, start_ms, metadata_wait_seconds=86400, max_waiting=10000):
        self.gateway, self.start_ms = gateway, start_ms
        self.metadata_wait_seconds = metadata_wait_seconds
        self.max_waiting = max_waiting
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, offset INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS meta(source TEXT, short TEXT, body TEXT, PRIMARY KEY(source,short));
        CREATE TABLE IF NOT EXISTS samples(
          key TEXT PRIMARY KEY, source TEXT, short TEXT, seq INTEGER, core TEXT,
          received TEXT, mesh TEXT, body TEXT, attempts INTEGER DEFAULT 0,
          next_try REAL DEFAULT 0, acknowledged REAL, error TEXT, created REAL);
        CREATE TABLE IF NOT EXISTS rejects(id INTEGER PRIMARY KEY, reason TEXT, record TEXT, created REAL);
        """)

    def reject(self, reason, record):
        self.db.execute("INSERT INTO rejects(reason,record,created) VALUES(?,?,?)",
                        (str(reason), canonical(record), time.time()))

    def ingest(self, record):
        if record.get("decoded_portnum") not in (72, "ATAK_PLUGIN"):
            return
        received = record.get("pi_receive_time")
        if not isinstance(received, str):
            raise ValueError("missing Pi receive time")
        receive_ms = int(dt.datetime.fromisoformat(received).timestamp() * 1000)
        source = str(record.get("from", "")).lower().removeprefix("!")
        if len(source) != 8 or any(c not in "0123456789abcdef" for c in source):
            raise ValueError("invalid radio source")
        # Decode the original protobuf even when the recorder rejected Core for missing metadata.
        raw = record.get("payload_bytes")
        if not isinstance(raw, str):
            return
        tak = atak_pb2.TAKPacket()
        tak.ParseFromString(base64.b64decode(raw, validate=True))
        if tak.is_compressed or not tak.HasField("chat"):
            return
        text = tak.chat.message
        if text.startswith("MX2M,"):
            meta = parse_mx2_meta(text)
            expected = hashlib.sha256(meta["r"].encode()).hexdigest()[:8].upper()
            if expected != meta["run_short"]:
                raise ValueError("metadata run hash mismatch")
            old = self.db.execute("SELECT body FROM meta WHERE source=? AND short=?",
                                  (source, meta["run_short"])).fetchone()
            body = canonical(meta)
            if old and old[0] != body:
                raise ValueError("conflicting sender/run metadata")
            self.db.execute("INSERT OR IGNORE INTO meta VALUES(?,?,?)", (source, meta["run_short"], body))
            self.resolve(source, meta["run_short"])
        elif text.startswith("MX2,"):
            core = parse_mx2_core(text)
            # Never replay historical field runs into live state on first enable.
            if receive_ms < self.start_ms:
                return
            key = f"{self.gateway}:{source}:{core['run_short']}:{core['q']}"
            old = self.db.execute("SELECT core FROM samples WHERE key=?", (key,)).fetchone()
            if old and old[0] != text:
                raise ValueError("conflicting Core sample")
            mesh = radio_metadata(record)
            self.db.execute("""INSERT OR IGNORE INTO samples
                (key,source,short,seq,core,received,mesh,created) VALUES(?,?,?,?,?,?,?,?)""",
                (key, source, core["run_short"], core["q"], text, received, canonical(mesh), time.time()))
            has_meta = self.db.execute('SELECT 1 FROM meta WHERE source=? AND short=?', (source, core['run_short'])).fetchone()
            waiting = self.db.execute("SELECT count(*) FROM samples WHERE body IS NULL AND error IS NULL").fetchone()[0]
            if not old and not has_meta and waiting > self.max_waiting:
                # Keep the evidence but bound the active orphan queue. Manual review is explicit.
                self.db.execute("UPDATE samples SET error='metadata_capacity_exceeded' WHERE key=?", (key,))
            self.resolve(source, core["run_short"])

    def resolve(self, source, short):
        row = self.db.execute("SELECT body FROM meta WHERE source=? AND short=?", (source, short)).fetchone()
        if not row:
            return
        meta = json.loads(row[0])
        for sample in self.db.execute("SELECT * FROM samples WHERE source=? AND short=? AND body IS NULL AND error IS NULL", (source, short)).fetchall():
            core = parse_mx2_core(sample["core"])
            body = {"gateway_id": self.gateway, "source_node": source, "run_short": short,
                    "run_id": meta["r"], "node_id": meta["n"], "seq": core["q"],
                    "experiment_id": meta["e"], "condition_id": meta["condition_id"],
                    "sample_ts": (meta["start_s"] + core["elapsed_s"]) * 1000,
                    "recv_ts": sample["received"], "lat": core["lat_i"] / 1e7,
                    "lon": core["lon_i"] / 1e7, "alt": core["alt_dm"] / 10,
                    "hr": core["h"], "gps_valid": bool(core["flags"] & 1),
                    "heart_rate_valid": bool(core["flags"] & 2),
                    "data_source": "mock" if core["flags"] & 4 else "real",
                    "gps_source": meta["gs"], "hr_source": meta["hs"],
                    "raw_text": sample["core"], **json.loads(sample["mesh"])}
            if 'battery_raw' in core:
                body['battery_raw'] = core['battery_raw']
            self.db.execute("UPDATE samples SET body=? WHERE key=?", (canonical(body), sample["key"]))

    def follow(self, root):
        for path in sorted(Path(root).glob("raw_gateway*.jsonl")):
            old = self.db.execute("SELECT offset FROM files WHERE path=?", (str(path),)).fetchone()
            offset = old[0] if old else 0
            if path.stat().st_size < offset:
                raise RuntimeError(f"append-only record truncated: {path.name}")
            with path.open("rb") as stream, self.db:
                stream.seek(offset)
                # Bound each pass so a large backlog cannot starve upload processing.
                for _ in range(5000):
                    line = stream.readline()
                    if not line or not line.endswith(b"\n"):
                        break
                    # One transaction per file batch; savepoints isolate malformed records.
                    self.db.execute("INSERT OR IGNORE INTO files VALUES(?,?)", (str(path), offset))
                    self.db.execute("SAVEPOINT record")
                    try:
                        self.ingest(json.loads(line))
                    except Exception as exc:
                        self.db.execute("ROLLBACK TO record")
                        self.reject(exc, {"file": path.name, "offset": offset})
                    self.db.execute("RELEASE record")
                    offset = stream.tell()
                    self.db.execute("INSERT OR REPLACE INTO files VALUES(?,?)", (str(path), offset))
        with self.db:
            self.db.execute("UPDATE samples SET error='metadata_wait_expired' WHERE body IS NULL AND created<?",
                            (time.time() - self.metadata_wait_seconds,))

    def send(self, post, now=None):
        now = time.time() if now is None else now
        rows = self.db.execute("""SELECT * FROM samples WHERE body IS NOT NULL AND acknowledged IS NULL
            AND next_try<=? ORDER BY received LIMIT 20""", (now,)).fetchall()
        for row in rows:
            body = json.loads(row["body"])
            try:
                ack = post(body)
                if ack.get("key") != row["key"] or ack.get("status") not in ("inserted", "existing"):
                    raise ValueError("cloud did not acknowledge this sample")
                with self.db:
                    self.db.execute("UPDATE samples SET acknowledged=?,error=NULL WHERE key=?", (now, row["key"]))
            except Exception as exc:
                # Do not log URLs, headers or response bodies, which may contain credentials.
                with self.db:
                    self.db.execute("UPDATE samples SET attempts=attempts+1,next_try=?,error=? WHERE key=?",
                                    (now + min(300, 2 ** min(row["attempts"] + 1, 8)),
                                     type(exc).__name__ + (f':{exc.code}' if hasattr(exc, 'code') else ''), row["key"]))

    def health(self):
        row = dict(self.db.execute("""SELECT count(*) AS samples,
            sum(body IS NULL AND error IS NULL) AS awaiting_metadata,
            sum(error='metadata_wait_expired') AS metadata_expired,
            sum(error='metadata_capacity_exceeded') AS metadata_capacity_exceeded,
            sum(body IS NOT NULL AND acknowledged IS NULL) AS pending,
            sum(acknowledged IS NOT NULL) AS acknowledged,
            sum(body IS NOT NULL AND acknowledged IS NULL AND error IS NOT NULL) AS upload_errors FROM samples""").fetchone())
        return {key: int(value or 0) for key, value in row.items()}


def main():
    logging.basicConfig(level=logging.INFO)
    root = Path(os.environ["MX2_DATA_DIR"])
    queue = Queue(root / "mx2_upload.sqlite3", os.environ["MX2_GATEWAY_ID"], int(os.environ["MX2_START_MS"]))
    url = os.environ["MX2_UPLOAD_URL"]
    if not url.startswith(("http://127.0.0.1:", "https://")):
        raise ValueError("upload requires HTTPS or local SSH tunnel")
    key = os.environ["MX2_UPLOAD_KEY"]

    chat = None
    try:
        from private_chat_upload import ChatUplink, chat_endpoint
        chat_url = chat_endpoint(url)
        chat = ChatUplink(root)
    except Exception as error:
        LOG.warning("Private chat disabled: %s", type(error).__name__)

    def post_to(target, body):
        request = urllib.request.Request(target, data=canonical(body).encode(), method="POST",
            headers={"Content-Type": "application/json", "X-MLINK-MX2-KEY": key})
        # Disable redirects: never forward an ingest credential to another endpoint.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=10) as response:
            return json.loads(response.read(65536))

    while True:
        try:
            queue.follow(root)
            queue.send(lambda body: post_to(url, body))
            status = {**queue.health(), "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}
            temp = root / "mx2_upload_health.tmp"
            temp.write_text(canonical(status))
            temp.replace(root / "mx2_upload_health.json")
        except Exception:
            LOG.exception("MX2 upload iteration failed")
        try:
            if chat:
                chat.follow()
                chat.send(lambda body: post_to(chat_url, body))
        except Exception as error:
            LOG.warning("Private chat upload iteration failed: %s", type(error).__name__)
        time.sleep(2)


if __name__ == "__main__":
    main()
