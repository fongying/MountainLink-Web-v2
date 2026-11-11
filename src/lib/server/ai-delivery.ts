import { db } from '$lib/server/db';
import { DELIVERY_RANK, type AiDeliveryState } from '$lib/ai-delivery';
function get<T>(sql: string, params: unknown[]) {
  return new Promise<T | undefined>((resolve, reject) => db.get(sql, params as any,
    (err, row) => err ? reject(err) : resolve(row as T | undefined)));
}
export async function getAiDelivery(id: string): Promise<AiDeliveryState | undefined> {
  const row = await get<any>(`SELECT payload_json,delivery_stage,delivery_packet_id,delivery_updated_at
    FROM ai_dispatches WHERE recommendation_id=? ORDER BY created_at DESC LIMIT 1`, [id]);
  if (!row?.delivery_stage) return undefined;
  const payload = JSON.parse(row.payload_json);
  if (payload.delivery?.mode !== 'private') return undefined;
  return { destination: payload.delivery.destination, stage: row.delivery_stage,
    packetId: row.delivery_packet_id ?? undefined, updatedAt: row.delivery_updated_at ?? undefined };
}
export async function acceptAiDelivery(body: any) {
  if (!body || typeof body.id !== 'string' || !body.id.startsWith('ai-') ||
      body.gateway !== '!c0c31f54' || !/^[a-f0-9]{64}$/.test(body.command_id) ||
      !Object.hasOwn(DELIVERY_RANK, body.stage) || body.stage === 'webhook_accepted') return false;
  if (['radio_ack','radio_nak','radio_api_accepted'].includes(body.stage) &&
      (!Number.isInteger(body.packet_id) || body.packet_id < 1 || body.packet_id > 4294967295)) return false;
  const id = body.id.slice(3);
  const row = await get<any>('SELECT dispatch_key,payload_json FROM ai_dispatches WHERE recommendation_id=? ORDER BY created_at DESC LIMIT 1', [id]);
  if (!row) return false;
  const payload = JSON.parse(row.payload_json);
  if (payload.id !== body.id || payload.delivery?.mode !== 'private' || payload.delivery.destination !== body.destination) return false;
  const rank = DELIVERY_RANK[body.stage as keyof typeof DELIVERY_RANK];
  await new Promise<void>((resolve, reject) => db.run(`UPDATE ai_dispatches SET delivery_stage=?,delivery_rank=?,
    delivery_packet_id=COALESCE(?,delivery_packet_id),delivery_updated_at=?
    WHERE dispatch_key=? AND delivery_rank<=?`,
    [body.stage,rank,body.packet_id ?? null,Date.now(),row.dispatch_key,rank], err => err ? reject(err) : resolve()));
  return true;
}
