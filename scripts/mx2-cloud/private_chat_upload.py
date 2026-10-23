"""Durable private-text uplink from Recorder JSONL; never opens the radio."""
import base64
import datetime as dt
import hashlib
import json
from pathlib import Path
import sqlite3
import time
from urllib.parse import urlsplit, urlunsplit

GATEWAY_NODE = '!c0c31f54'


def chat_endpoint(url):
    parsed = urlsplit(url)
    if not (url.startswith('http://127.0.0.1:') or parsed.scheme == 'https'):
        raise ValueError('chat upload requires HTTPS or local SSH tunnel')
    if not parsed.path.endswith('/api/ingest/mx2'):
        raise ValueError('unexpected MX2 upload path')
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path[:-len('/api/ingest/mx2')] + '/api/chat/ingest', '', ''))


def node_num(value):
    if isinstance(value, str) and value.startswith('!') and len(value) == 9:
        return int(value[1:], 16)
    if type(value) is int:
        return value
    raise ValueError('invalid node')


def private_message(record, start_ms):
    if not isinstance(record, dict):
        return None
    if record.get('decoded_portnum') not in ('TEXT_MESSAGE_APP', 1):
        return None
    try:
        sender, destination = node_num(record.get('from')), node_num(record.get('to'))
        if not 0 < sender < 4294967295 or destination != int(GATEWAY_NODE[1:], 16) or sender in (0, 4294967295, destination):
            return None
        packet_id = record.get('packet_id')
        if type(packet_id) is not int or not 0 < packet_id <= 4294967295:
            return None
        stamp = dt.datetime.fromisoformat(record['pi_receive_time'].replace('Z', '+00:00'))
        if stamp.tzinfo is None:
            return None
        received = round(stamp.timestamp() * 1000)
        if received < start_ms or received > time.time() * 1000 + 60000:
            return None
        raw = base64.b64decode(record['payload_bytes'], validate=True)
        if not 0 < len(raw) <= 228:
            return None
        text = raw.decode('utf-8')
        if not text.strip():
            return None
        source = f'{sender:08x}'
        # Daily identity plus cloud 24-hour packet/content dedupe handles retransmission.
        key = hashlib.sha256(json.dumps([GATEWAY_NODE, source, packet_id, text, received // 86400000], ensure_ascii=False).encode()).hexdigest()
        return {'key': key, 'gateway_node': GATEWAY_NODE, 'source_node': source,
                'packet_id': packet_id, 'received_at': received, 'text': text}
    except (ValueError, TypeError, KeyError, UnicodeError):
        return None


class ChatUplink:
    def __init__(self, root):
        self.root = Path(root)
        self.db = sqlite3.connect(self.root / 'private_chat_upload.sqlite3')
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''PRAGMA journal_mode=WAL;
          CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value INTEGER);
          CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY,offset INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS messages(key TEXT PRIMARY KEY,body TEXT NOT NULL,created REAL NOT NULL,
            acknowledged REAL,attempts INTEGER NOT NULL DEFAULT 0,next_try REAL NOT NULL DEFAULT 0,error TEXT);''')
        row = self.db.execute("SELECT value FROM settings WHERE key='start_ms'").fetchone()
        with self.db:
            self.start_ms = row[0] if row else round(time.time() * 1000)
            if not row:
                self.db.execute("INSERT INTO settings VALUES('start_ms',?)", (self.start_ms,))
                # Do not upload previously private chats on initial enable.
                for path in self.root.glob('raw_gateway*.jsonl'):
                    self.db.execute('INSERT OR IGNORE INTO files VALUES(?,?)', (str(path), path.stat().st_size))

    def follow(self):
        for path in sorted(self.root.glob('raw_gateway*.jsonl')):
            row = self.db.execute('SELECT offset FROM files WHERE path=?', (str(path),)).fetchone()
            offset = row[0] if row else 0
            if path.stat().st_size < offset:
                raise RuntimeError('append-only chat source was truncated')
            with path.open('rb') as stream, self.db:
                stream.seek(offset)
                for _ in range(1000):
                    line = stream.readline()
                    if not line or not line.endswith(b'\n'):
                        break
                    try:
                        message = private_message(json.loads(line), self.start_ms)
                        if message:
                            self.db.execute('INSERT OR IGNORE INTO messages(key,body,created) VALUES(?,?,?)',
                                            (message['key'], json.dumps(message, ensure_ascii=False), time.time()))
                    except (ValueError, TypeError, UnicodeError):
                        pass
                    offset = stream.tell()
                    self.db.execute('INSERT OR REPLACE INTO files VALUES(?,?)', (str(path), offset))

    def send(self, post, now=None):
        now = time.time() if now is None else now
        for row in self.db.execute('SELECT * FROM messages WHERE acknowledged IS NULL AND next_try<=? ORDER BY created LIMIT 10', (now,)).fetchall():
            try:
                ack = post(json.loads(row['body']))
                if ack.get('key') != row['key'] or ack.get('status') not in ('inserted', 'existing'):
                    raise ValueError('incorrect chat acknowledgement')
                with self.db:
                    self.db.execute('UPDATE messages SET acknowledged=?,error=NULL WHERE key=?', (now, row['key']))
            except Exception as error:
                with self.db:
                    self.db.execute('UPDATE messages SET attempts=attempts+1,next_try=?,error=? WHERE key=?',
                                    (now + min(300, 2 ** min(row['attempts'] + 1, 8)), type(error).__name__, row['key']))

    def close(self):
        self.db.close()
