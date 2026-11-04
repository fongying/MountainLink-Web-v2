import unittest,json,base64,datetime as dt,time,tempfile
from pathlib import Path
from sos_upload import sos_message,parse_help,SosUplink
from private_chat_upload import ChatUplink
try:
 from meshtastic.protobuf import atak_pb2
except ImportError:atak_pb2=None
class SosTests(unittest.TestCase):
 def record(self,text='SOS HELP id=1ba59c04 HR=100 GPS=25.00000,121.00000 ev=f909c452',**edit):
  return dict({'from':'!f6fcf190','to':'^all','packet_id':123,'decoded_portnum':'TEXT_MESSAGE_APP','payload_bytes':base64.b64encode(text.encode()).decode(),'pi_receive_time':dt.datetime.now(dt.timezone.utc).isoformat()},**edit)
 def test_native_and_validation(self):
  self.assertEqual(sos_message(self.record(),0)['node_id'],'1ba59c04')
  for text in ['SOS HELP id=x HR=999 ev=f909c452','SOS HELP id=x GPS=99.00000,119.00000 ev=f909c452','hello SOS HELP id=x ev=f909c452','SOS OFF id=x ev=f909c452']:
   self.assertIsNone(sos_message(self.record(text),0))
  self.assertIsNone(sos_message(self.record(to='!12345678'),0))
 def test_mock(self):
  self.assertEqual(sos_message(self.record('SOS HELP id=1ba59c04 MOCK ev=f909c452'),0)['data_source'],'mock')
 @unittest.skipUnless(atak_pb2,'Meshtastic runtime required')
 def test_actual_tak_and_sender(self):
  p=atak_pb2.TAKPacket();p.contact.callsign='N1ba59c04';p.contact.device_callsign='N1ba59c04|123';p.chat.to='All Chat Rooms';p.chat.message='SOS HELP id=1ba59c04 ev=f909c452'
  r=self.record(decoded_portnum='ATAK_PLUGIN',payload_bytes=base64.b64encode(p.SerializeToString()).decode())
  self.assertIsNotNone(sos_message(r,0));p.contact.callsign='Nanother';r['payload_bytes']=base64.b64encode(p.SerializeToString()).decode();self.assertIsNone(sos_message(r,0))
 def test_durable_backfill_and_no_private_chat_regression(self):
  with tempfile.TemporaryDirectory() as root:
   path=Path(root)/'raw_gateway_session.jsonl';path.write_text(json.dumps(self.record())+'\n')
   chat=ChatUplink(root);chat.follow();self.assertEqual(chat.db.execute('select count(*) from messages').fetchone()[0],0);chat.close()
   q=SosUplink(root);q.follow();self.assertEqual(q.db.execute('select count(*) from messages').fetchone()[0],1)
   q.send(lambda b:{'key':'wrong','status':'inserted'},now=time.time()+1);q.close()
   q=SosUplink(root);q.follow();q.send(lambda b:{'key':b['key'],'status':'inserted'},now=time.time()+10)
   self.assertEqual(q.db.execute('select count(*) from messages where acknowledged is not null').fetchone()[0],1);q.close()
if __name__=='__main__':unittest.main()
