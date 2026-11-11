"""Patch the SDK protobuf-default channel without inventing explicit null values."""
from pathlib import Path
import hashlib,shutil,datetime
p=Path('/home/pi/meshtastic-getway/src/tak_sos.py');s=p.read_text()
old='        channel = packet.get("channel")\n';new='        channel = packet.get("channel", 0)  # protobuf omits default scalar channel 0\n'
if new not in s:
 assert s.count(old)==1,'unexpected channel parser; stop'
 b=p.parent.parent/'backups'/('sos-channel-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));b.mkdir(parents=True)
 shutil.copy2(p,b/'tak_sos.py');s=s.replace(old,new,1);compile(s,str(p),'exec');p.write_text(s)
 print('CHANNEL_PATCHED',b)
else:print('CHANNEL_ALREADY_PATCHED')
