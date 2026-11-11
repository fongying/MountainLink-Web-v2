export type RadioMapping = {
  node_id: string; source_node: string; received_at: number; sample_ts: number;
  data_source: string; run_id: string;
};
export type PrivateDelivery = {
  mode: 'private'; destination: string; focusDeviceId: string;
  mappedAt: string; sampleAt: string; runId: string;
};
export const MAPPING_MAX_AGE_MS = 10 * 60 * 1000;
// Never infer a radio address from the logical device ID or a demo device.
export function resolvePrivateDelivery(focus: string | undefined, rows: RadioMapping[], now = Date.now()): PrivateDelivery {
  if (!focus || /^NT-DEMO-/i.test(focus)) throw new Error('私訊阻擋：未指定真實裝置');
  const fresh = (t: number) => Number.isFinite(t) && now - t >= -60_000 && now - t < MAPPING_MAX_AGE_MS;
  const latestBySource = new Map<string, RadioMapping>();
  for (const row of rows) {
    const old = latestBySource.get(row.source_node);
    if (old && row.sample_ts === old.sample_ts && row.node_id !== old.node_id)
      throw new Error('私訊阻擋：同一無線電的身分對照衝突');
    if (!old || row.sample_ts > old.sample_ts ||
      (row.sample_ts === old.sample_ts && row.received_at > old.received_at)) latestBySource.set(row.source_node, row);
    else if (row.sample_ts === old.sample_ts && row.node_id !== old.node_id) {
      throw new Error('私訊阻擋：同一無線電的身分對照衝突');
    }
  }
  const matches = [...latestBySource.values()].filter(row => row.node_id === focus && row.data_source === 'real' &&
    fresh(row.received_at) && fresh(row.sample_ts) && /^[0-9a-f]{8}$/.test(row.source_node) &&
    !['00000000', 'ffffffff', 'c0c31f54'].includes(row.source_node));
  if (matches.length !== 1) throw new Error('私訊阻擋：找不到唯一且 10 分鐘內有效的 MX2M／Sender 對照');
  const m = matches[0];
  return { mode: 'private', destination: `!${m.source_node}`, focusDeviceId: focus,
    mappedAt: new Date(m.received_at).toISOString(), sampleAt: new Date(m.sample_ts).toISOString(), runId: m.run_id };
}
