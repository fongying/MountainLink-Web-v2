import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolvePrivateDelivery, type RadioMapping } from './ai-private-route.ts';
const now = Date.now();
const sample: RadioMapping = { node_id:'logical-1', source_node:'f6fcf190', received_at:now-1000,
  sample_ts:now-2000, data_source:'real', run_id:'DEV-REAL' };
test('MX2M logical identity maps to physical radio, not logical device hex', () => {
  const d=resolvePrivateDelivery('logical-1',[sample],now);
  assert.equal(d.destination,'!f6fcf190'); assert.equal(d.focusDeviceId,'logical-1');
});
test('missing, demo, mock, invalid and stale mappings never fall back to broadcast', () => {
  for (const focus of [undefined,'NT-DEMO-002','unknown']) assert.throws(()=>resolvePrivateDelivery(focus,[sample],now));
  for (const edit of [{data_source:'mock'},{source_node:'ffffffff'},{source_node:'c0c31f54'},
    {received_at:now-600000},{sample_ts:now-600000},{sample_ts:now+61000}])
    assert.throws(()=>resolvePrivateDelivery('logical-1',[{...sample,...edit}],now));
});
test('new logical owner supersedes former owner and replayed old samples do not restore it', () => {
  const next={...sample,node_id:'logical-2',sample_ts:now-500,received_at:now-400};
  assert.throws(()=>resolvePrivateDelivery('logical-1',[sample,next,{...sample,received_at:now}],now));
  assert.equal(resolvePrivateDelivery('logical-2',[sample,next],now).destination,'!f6fcf190');
});
test('ambiguous ownership or multiple active radios blocks routing', () => {
  assert.throws(()=>resolvePrivateDelivery('logical-1',[sample,{...sample,source_node:'12345678'}],now));
  assert.throws(()=>resolvePrivateDelivery('logical-1',[sample,{...sample,node_id:'other'}],now));
});
