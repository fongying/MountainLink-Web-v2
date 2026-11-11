import { createHash, createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { AiRecommendation } from '$lib/types';
import { db } from '$lib/server/db';

import { resolvePrivateDelivery, type PrivateDelivery, type RadioMapping } from '$lib/ai-private-route';

const AGENT_TOPIC = 'mlink/agent-alerts';

export type AiDispatchPayload = {
  id: string;
  recommendationId: string;
  topic: string;
  severity: AiRecommendation['severity'];
  title: string;
  targetAreas: string[];
  message: string;
  evidence: AiRecommendation['evidence'];
  generatedAt: string;
  delivery: PrivateDelivery;
};

function getOne<T>(sql: string, params: unknown[] = []) {
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params as any, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });
}

function run(sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params as any, (err) => (err ? reject(err) : resolve()));
  });
}

function hashPayload(payload: AiDispatchPayload) {
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

function dispatchKey(recommendation: AiRecommendation, payloadHash: string) {
  return createHash('sha1').update(`${recommendation.fingerprint}|${payloadHash}`).digest('hex');
}

function toPayload(recommendation: AiRecommendation, delivery: PrivateDelivery): AiDispatchPayload {
  return {
    delivery,
    id: `ai-${recommendation.id}`,
    recommendationId: recommendation.id,
    topic: AGENT_TOPIC,
    severity: recommendation.severity,
    title: recommendation.title,
    targetAreas: recommendation.targetAreas,
    message: recommendation.message,
    evidence: recommendation.evidence,
    generatedAt: recommendation.generatedAt
  };
}

async function postToWebhook(payload: AiDispatchPayload) {
  const url = env.MLINK_ALERT_WEBHOOK_URL?.trim() || '';
  if (!url) return { sent: false, error: 'MLINK_ALERT_WEBHOOK_URL 未設定' };

  const rawBody = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8'
  };

  const secret = env.MLINK_ALERT_WEBHOOK_SECRET?.trim() || '';
  if (secret) {
    const timestamp = Date.now().toString();
    const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    headers['X-MLINK-Timestamp'] = timestamp;
    headers['X-MLINK-Signature'] = signature;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: rawBody,
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    return { sent: false, error: `AI webhook failed (${response.status}): ${await response.text()}` };
  }

  return { sent: true, error: '' };
}

export async function dispatchAiRecommendation(recommendation: AiRecommendation) {
  let delivery: PrivateDelivery;
  try {
    const rows = await new Promise<RadioMapping[]>((resolve, reject) => db.all(
      `SELECT node_id,source_node,received_at,sample_ts,data_source,run_id FROM mx2_samples
       WHERE received_at >= ?`, [Date.now() - 600_000],
      (err, rows) => err ? reject(err) : resolve(rows as RadioMapping[])));
    delivery = resolvePrivateDelivery(recommendation.focusDeviceId, rows);
    if (!recommendation.message.trim() || Buffer.byteLength(recommendation.message, 'utf8') > 228)
      throw new Error('私訊阻擋：訊息超過 228 UTF-8 bytes 或為空');
  } catch (error) {
    return { sent: false, skipped: false, error: error instanceof Error ? error.message : '私訊對照查詢失敗', dispatchedAt: undefined };
  }
  const payload = toPayload(recommendation, delivery);
  const payloadHash = hashPayload(payload);
  const key = dispatchKey(recommendation, payloadHash);

  const existing = await getOne<{ dispatch_key: string }>(
    'SELECT dispatch_key FROM ai_dispatches WHERE dispatch_key = ?',
    [key]
  );
  if (existing) {
    return { sent: false, skipped: true, error: '同一建議已送出', dispatchedAt: undefined };
  }

  // Persist correlation before the webhook; Gateway receipts may race the HTTP response.
  await run(
    `INSERT INTO ai_dispatches (dispatch_key, recommendation_id, topic, payload_hash, payload_json, status, delivery_stage)
     VALUES (?, ?, ?, ?, ?, 'pending', 'webhook_accepted')`,
    [key, recommendation.id, AGENT_TOPIC, payloadHash, JSON.stringify(payload)]
  );
  const result = await postToWebhook(payload).catch((error) => ({ sent: false, error: String(error) }));
  await run('UPDATE ai_dispatches SET status=?,error=? WHERE dispatch_key=?',
    [result.sent ? 'sent' : 'failed', result.error || null, key]);

  return {
    sent: result.sent,
    skipped: false,
    error: result.error,
    delivery: { ...delivery, stage: 'webhook_accepted' as const },
    dispatchedAt: result.sent ? new Date().toISOString() : undefined
  };
}
