import unittest,tempfile,json,base64,datetime as dt,time
from pathlib import Path
from private_chat_upload import private_message,ChatUplink,chat_endpoint
class TestChatUplink(unittest.TestCase):
 def record(self,**edit):
  return dict({'decoded_portnum':'TEXT_MESSAGE_APP','from':'!f6fcf190','to':'!c0c31f54','packet_id':123,'pi_receive_time':dt.datetime.now(dt.timezone.utc).isoformat(),'payload_bytes':base64.b64encode('私訊測試'.encode()).decode()},**edit)
 def test_only_private_text(self):
  self.assertIsNotNone(private_message(self.record(),0))
  for edits in [{'to':'!ffffffff'},{'to':'!12345678'},{'from':'!c0c31f54'},{'decoded_portnum':'ATAK_PLUGIN'},{'payload_bytes':'***'},{'packet_id':0}]:
   self.assertIsNone(private_message(self.record(**edits),0))
  self.assertIsNone(private_message([],0))
 def test_byte_limit_and_start(self):
  self.assertIsNone(private_message(self.record(payload_bytes=base64.b64encode(('中'*77).encode()).decode()),0))
  self.assertIsNone(private_message(self.record(),time.time()*1000+1000))
 def test_queue_restart_partial_and_ack(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'raw_gateway.jsonl';p.write_text(json.dumps(self.record())+'\n')
   q=ChatUplink(d);q.follow();self.assertEqual(q.db.execute('SELECT count(*) FROM messages').fetchone()[0],0)
   text=json.dumps(self.record(packet_id=124));p.write_text(p.read_text()+text[:30]);q.follow()
   with p.open('a') as f:f.write(text[30:]+'\n')
   q.follow();self.assertEqual(q.db.execute('SELECT count(*) FROM messages').fetchone()[0],1)
   q.send(lambda b:{'key':'wrong','status':'inserted'},now=time.time()+1)
   self.assertIsNone(q.db.execute('SELECT acknowledged FROM messages').fetchone()[0]);q.close()
   q=ChatUplink(d);q.follow();q.send(lambda b:{'key':b['key'],'status':'inserted'},now=time.time()+10)
   self.assertIsNotNone(q.db.execute('SELECT acknowledged FROM messages').fetchone()[0]);q.close()
 def test_endpoint(self):
  self.assertEqual(chat_endpoint('http://127.0.0.1:18080/api/ingest/mx2'),'http://127.0.0.1:18080/api/chat/ingest')
  with self.assertRaises(ValueError):chat_endpoint('http://bad/api/ingest/mx2')
if __name__=='__main__':unittest.main()
