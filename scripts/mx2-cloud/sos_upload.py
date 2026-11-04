"""SOS HELP uplink using Recorder evidence; no Radio writes or inferred channel."""
import base64,datetime as dt,hashlib,re,time
from private_chat_upload import ChatUplink,node_num
PATTERN = re.compile(r'SOS HELP id=([A-Za-z0-9_.!-]{1,64})(?: HR=([0-9]{1,3}))?(?: GPS=(-?[0-9]+\.[0-9]{5}),(-?[0-9]+\.[0-9]{5}))?( MOCK)? ev=([0-9a-f]{8})')
def parse_help(text):
    m=PATTERN.fullmatch(text)
    if not m: raise ValueError('invalid SOS HELP message')
    node,hr,lat,lon,mock,event=m.groups()
    if hr is not None and not 1<=int(hr)<=255: raise ValueError('invalid heart rate')
    if lat is not None and not (-90<=float(lat)<=90 and -180<=float(lon)<=180): raise ValueError('invalid GPS')
    return {'node_id':node,'event_token':event,'data_source':'mock' if mock else 'real'}
def sos_message(record,start_ms):
    if not isinstance(record,dict):return None
    try:
        port=record.get('decoded_portnum')
        if port not in ('ATAK_PLUGIN',72,'TEXT_MESSAGE_APP',1):return None
        raw=base64.b64decode(record['payload_bytes'],validate=True)
        if len(raw)>225:return None
        if port in ('ATAK_PLUGIN',72):
            from meshtastic.protobuf import atak_pb2
            tak=atak_pb2.TAKPacket();tak.ParseFromString(raw)
            if not tak.HasField('chat') or tak.chat.to!='All Chat Rooms':return None
            text=tak.chat.message;fields=parse_help(text)
            expected='N'+fields['node_id']
            if tak.contact.callsign!=expected or not tak.contact.device_callsign.startswith(expected+'|'):return None
        else:text=raw.decode('utf-8');fields=parse_help(text)
        source=node_num(record['from']);destination=0xffffffff if record.get('to')=='^all' else node_num(record['to'])
        if source in (0,0xffffffff,0xc0c31f54) or destination not in (0xffffffff,0xc0c31f54):return None
        stamp=dt.datetime.fromisoformat(record['pi_receive_time'].replace('Z','+00:00'))
        if stamp.tzinfo is None:return None
        received=round(stamp.timestamp()*1000);packet=record['packet_id']
        if type(packet) is not int or not 0<packet<=0xffffffff or not start_ms<=received<=time.time()*1000+60000:return None
        # Protobuf omits the scalar default (channel 0); preserve unknown metadata as unknown.
        mesh=record.get('raw_packet_summary') or {};channel=mesh.get('channel',record.get('channel'))
        key=hashlib.sha256(f'{source:08x}:{packet}:{text}:{received//86400000}'.encode()).hexdigest()
        return {**fields,'key':key,'gateway_node':'!c0c31f54','source_node':f'{source:08x}',
                'packet_id':packet,'received_at':received,'text':text,'channel':channel}
    except Exception:
        return None
class SosUplink(ChatUplink):
    database_name='sos_upload.sqlite3'
    extract=staticmethod(sos_message)
    def __init__(self,root):
        from pathlib import Path
        first=not (Path(root)/self.database_name).exists()
        super().__init__(root)
        if first:
            # Bootstrap recent actual evidence, never manufacture an SOS. Old receipts are history-only in cloud.
            self.start_ms-=86400000
            with self.db:
                self.db.execute("UPDATE settings SET value=? WHERE key='start_ms'",(self.start_ms,))
                for p in self.root.glob('raw_gateway*.jsonl'):
                    if p.stat().st_mtime*1000<self.start_ms:continue
                    offset=max(0,p.stat().st_size-1048576)
                    if offset:
                        with p.open('rb') as stream:
                            stream.seek(offset);stream.readline();offset=stream.tell()
                    self.db.execute('UPDATE files SET offset=? WHERE path=?',(offset,str(p)))
