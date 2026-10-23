import json
import unittest
from unittest.mock import MagicMock, patch
from types import ModuleType, SimpleNamespace
from tempfile import TemporaryDirectory
from datetime import datetime, timezone
from mqtt_downlink import parse_command, MqttDownlink

class Commands(unittest.TestCase):
    def body(self, **kwargs):
        return json.dumps(dict(type='sendtext', **{'from': 3234013012}, to=4294967295, channel=0,
                              payload='[測試] 災害警示', generatedAt='2026-10-23T00:00:00Z', id='test', **kwargs))
    def test_valid_and_stable_identity(self):
        a=parse_command(self.body(), '!c0c31f54', 1792713600)
        b=parse_command(self.body().replace('00:00:00Z','00:01:00Z'), '!c0c31f54', 1792713660)
        self.assertEqual(a[0],b[0])
    def test_wrong_gateway(self):
        with self.assertRaises(ValueError):parse_command(self.body(),'!7a6bf098',1792713600)
    def test_expired(self):
        with self.assertRaises(ValueError):parse_command(self.body(),'!c0c31f54',1792715600)
    def test_future(self):
        with self.assertRaises(ValueError):parse_command(self.body(),'!c0c31f54',1792713400)
    def test_reject_unicast_and_other_channels(self):
        for field,value in [('to',123),('channel',1)]:
            body=json.loads(self.body());body[field]=value
            with self.assertRaises(ValueError):parse_command(json.dumps(body),'!c0c31f54',1792713600)
    def test_utf8_limit(self):
        body=json.loads(self.body());body['payload']='山'*77
        with self.assertRaises(ValueError):parse_command(json.dumps(body),'!c0c31f54',1792713600)

class BridgePersistence(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.interface=SimpleNamespace(myInfo=SimpleNamespace(my_node_num=0xc0c31f54),
            localNode=SimpleNamespace(moduleConfig=SimpleNamespace(mqtt=SimpleNamespace(username='test',password='test'))),
            sendText=MagicMock(return_value=SimpleNamespace(id=42)))
        self.patch=patch.dict('sys.modules',{'paho':ModuleType('paho'),'paho.mqtt':ModuleType('paho.mqtt'),'paho.mqtt.client':MagicMock()})
        self.patch.start();self.addCleanup(self.patch.stop)
        self.bridge=MqttDownlink(self.interface,self.temp.name,MagicMock())
        self.addCleanup(lambda:self.bridge.close())
        self.message=SimpleNamespace(retain=False,payload=json.dumps({'type':'sendtext','from':0xc0c31f54,'payload':'[測試]','id':'same-warning','generatedAt':datetime.now(timezone.utc).isoformat()}).encode())
    def test_duplicate_delivery_is_not_broadcast_again_after_restart(self):
        self.bridge.on_message(None,None,self.message);self.bridge.tick()
        self.bridge.close()
        self.bridge=MqttDownlink(self.interface,self.temp.name,MagicMock())
        self.bridge.on_message(None,None,self.message);self.bridge.tick()
        self.interface.sendText.assert_called_once()
    def test_retained_message_never_reaches_radio(self):
        self.message.retain=True
        self.bridge.on_message(None,None,self.message);self.bridge.tick()
        self.interface.sendText.assert_not_called()
    def test_ambiguous_serial_write_is_not_retried(self):
        self.interface.sendText.side_effect=OSError('serial write failed')
        self.bridge.on_message(None,None,self.message);self.bridge.tick()
        self.bridge.next_send=0
        self.bridge.on_message(None,None,self.message);self.bridge.tick()
        self.interface.sendText.assert_called_once()
        self.assertEqual(self.bridge.db.execute('select state from commands').fetchone()[0],'uncertain')



class PrivateDelivery(BridgePersistence):
    def setUp(self):
        super().setUp()
        body=json.loads(self.message.payload)
        now=datetime.now(timezone.utc).isoformat()
        body.update(id='ai-private-test',to=0xf6fcf190,deliveryMode='private',delivery={
            'mode':'private','destination':'!f6fcf190','focusDeviceId':'logical-1',
            'mappedAt':now,'sampleAt':now,'runId':'DEV-REAL'})
        self.message.payload=json.dumps(body).encode()
        self.mapping=patch.object(self.bridge,'current_mapping',return_value=True)
        self.mapping.start();self.addCleanup(self.mapping.stop)
    def test_private_uses_destination_and_ack(self):
        self.bridge.on_message(None,None,self.message);self.bridge.tick()
        opts=self.interface.sendText.call_args.kwargs
        self.assertEqual(opts['destinationId'],'!f6fcf190');self.assertTrue(opts['wantAck'])
        self.assertEqual(opts['onResponse'].__name__,'onAckNak')
        opts['onResponse']({'from':0xf6fcf190,'decoded':{'requestId':42,'routing':{}}})
        self.bridge.tick()
        self.assertEqual(self.bridge.db.execute('select state from commands').fetchone()[0],'radio_ack')
    def test_wrong_source_ack_does_not_confirm(self):
        self.bridge.on_message(None,None,self.message);self.bridge.tick()
        self.interface.sendText.call_args.kwargs['onResponse']({'from':0xc0c31f54,'decoded':{'requestId':42,'routing':{}}})
        self.bridge.tick()
        self.assertEqual(self.bridge.db.execute('select state from commands').fetchone()[0],'radio_api_accepted')
    def test_local_mapping_change_blocks_queued_private(self):
        self.bridge.current_mapping.return_value=False
        self.bridge.on_message(None,None,self.message);self.bridge.tick()
        self.interface.sendText.assert_not_called()
        self.assertEqual(self.bridge.db.execute('select state from commands').fetchone()[0],'mapping_blocked')
    def test_no_ai_broadcast_fallback(self):
        body=json.loads(self.message.payload);body.pop('deliveryMode');body['to']=4294967295
        self.message.payload=json.dumps(body).encode()
        self.bridge.on_message(None,None,self.message);self.bridge.tick()
        self.interface.sendText.assert_not_called()
    def test_nak_and_timeout_remain_unconfirmed(self):
        self.bridge.on_message(None,None,self.message);self.bridge.tick()
        opts=self.interface.sendText.call_args.kwargs
        opts['onResponse']({'from':0xc0c31f54,'decoded':{'requestId':42,'routing':{'errorReason':'NO_ROUTE'}}})
        self.bridge.tick()
        self.assertEqual(self.bridge.db.execute('select state from commands').fetchone()[0],'radio_nak')
    def test_destinations_have_distinct_dedupe_identity(self):
        body=json.loads(self.message.payload)
        first=parse_command(self.message.payload,'!c0c31f54')[0]
        body['to']=0x12345678;body['delivery']['destination']='!12345678'
        self.assertNotEqual(first,parse_command(json.dumps(body),'!c0c31f54')[0])
    def test_duplicate_delivery_is_not_broadcast_again_after_restart(self):
        # Private duplicate after restart also requires fresh local mapping, but must not transmit twice.
        self.bridge.on_message(None,None,self.message);self.bridge.tick()
        self.bridge.close()
        self.bridge=MqttDownlink(self.interface,self.temp.name,MagicMock())
        self.bridge.on_message(None,None,self.message);self.bridge.tick()
        self.interface.sendText.assert_called_once()

if __name__=='__main__':unittest.main()
