const p = msg.payload;
if (!p || typeof p.message !== 'string' || !p.message.trim() || !p.id) return null;
const ai = p.topic === 'mlink/agent-alerts';
if (!ai && !['rain', 'cold', 'earthquake'].includes(p.type) && p.reason !== 'downlink_test') return null;
if (Buffer.byteLength(p.message, 'utf8') > 228) { node.warn('Downlink text exceeds radio limit'); return null; }
let to = 4294967295;
if (ai) {
  const d = p.delivery;
  const fresh = v => Number.isFinite(Date.parse(v)) && Date.now()-Date.parse(v) >= -60000 && Date.now()-Date.parse(v) < 600000;
  if (!d || d.mode !== 'private' || !/^![0-9a-f]{8}$/.test(d.destination) ||
      !d.focusDeviceId || /^NT-DEMO-/i.test(d.focusDeviceId) || !d.runId ||
      !fresh(d.mappedAt) || !fresh(d.sampleAt)) { node.warn('AI private route missing or expired; blocked'); return null; }
  to = parseInt(d.destination.slice(1), 16);
  if (to === 0 || to === 4294967295 || to === 3234013012) return null;
}
msg.topic = 'mlink/2/json/mqtt/!c0c31f54';
msg.payload = JSON.stringify({ type: 'sendtext', from: 3234013012, to, channel: 0,
  payload: p.message, id: p.id, status: p.status || 'active',
  deliveryMode: ai ? 'private' : 'broadcast', delivery: ai ? p.delivery : undefined,
  generatedAt: new Date().toISOString() });
return msg;
