import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { receiveEqTrigger, type TriggerWebhookPayload } from '$lib/server/earthquake';
import { getUnifiedHazardSnapshot } from '$lib/server/hazards';
import { broadcastSse } from '$lib/server/stream';

const MAX_SKEW_MS = 60_000;

function toBufferHex(hex: string) {
  try {
    return Buffer.from(hex, 'hex');
  } catch {
    return null;
  }
}

function verifySignature(rawBody: string, timestamp: string, signature: string, secret: string): boolean {
  const expectedHex = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const expected = toBufferHex(expectedHex);
  const actual = toBufferHex(signature.toLowerCase());
  if (!expected || !actual) return false;
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export const POST = async ({ request }: any) => {
  const secret = env.MLINK_WEBHOOK_SECRET || '';
  if (!secret) {
    return json({ error: 'Missing MLINK_WEBHOOK_SECRET' }, { status: 503 });
  }

  const timestamp = request.headers.get('X-MLINK-Timestamp')?.trim() || '';
  const signature = request.headers.get('X-MLINK-Signature')?.trim() || '';
  if (!timestamp || !signature) {
    return json({ error: 'Missing X-MLINK-Timestamp or X-MLINK-Signature' }, { status: 401 });
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return json({ error: 'Invalid timestamp' }, { status: 401 });
  }
  if (Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return json({ error: 'Timestamp outside allowed skew' }, { status: 401 });
  }

  const rawBody = await request.text();
  if (!verifySignature(rawBody, timestamp, signature, secret)) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: TriggerWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as TriggerWebhookPayload;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const result = await receiveEqTrigger(payload);
    const { snapshot } = await getUnifiedHazardSnapshot({
      force: true,
      reason: 'eq_trigger'
    });
    broadcastSse('hazard_update', snapshot);

    return json({
      ok: true,
      id: result.id,
      isNew: result.isNew
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unknown trigger processing error' },
      { status: 400 }
    );
  }
};
