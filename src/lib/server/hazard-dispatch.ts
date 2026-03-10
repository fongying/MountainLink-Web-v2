import { createHash, createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { AlertItem } from '$lib/types/alerts';
import { db } from '$lib/server/db';

const ALERT_TOPIC = 'mlink/alerts';

type DispatchPayload = {
  id: string;
  type: AlertItem['type'];
  status: 'active' | 'ended';
  severity: AlertItem['severity'];
  title: string;
  region?: string;
  issuedAt?: string;
  eventAt?: string;
  topic: string;
  message: string;
  generatedAt: string;
  reason?: string;
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

function statusOf(item: AlertItem) {
  return item.status === 'ended' ? 'ended' : 'active';
}

function severityLabel(severity: AlertItem['severity']) {
  return severity === 'critical' || severity === 'warning' ? '警戒' : '注意';
}

function shortRegionName(name: string) {
  return name
    .trim()
    .replace(/臺/g, '台')
    .replace(/(縣|市)$/u, '');
}

function formatRegion(region?: string) {
  if (!region) return '';
  const values = Array.from(
    new Set(
      region
        .split(/[、,，]/)
        .map((value) => shortRegionName(value))
        .filter(Boolean)
    )
  );
  if (values.length === 0) return '';
  if (values.length > 4) return `${values.slice(0, 4).join('、')}等${values.length}處`;
  return values.join('、');
}

function compactTitle(item: AlertItem, status: 'active' | 'ended') {
  const title = item.title.trim();
  const summary = item.summary.trim();

  if (status === 'ended') {
    if (summary.includes('解除')) return summary;
    if (title.includes('解除')) return title;
    return `解除${title}`;
  }

  if (item.type === 'earthquake') {
    const matched = title.match(/M\d+(?:\.\d+)?/);
    return matched ? `地震${matched[0]}` : '地震通知';
  }

  return title;
}

function buildMessage(item: AlertItem) {
  const status = statusOf(item);
  const prefix = `[${severityLabel(item.severity)}]`;
  const title = compactTitle(item, status);
  const region = status === 'ended' ? '' : formatRegion(item.region);
  return region ? `${prefix}${title},區域:${region}` : `${prefix}${title}`;
}

function dispatchKey(item: AlertItem, payloadHash: string) {
  return createHash('sha1').update(`${item.id}|${statusOf(item)}|${payloadHash}`).digest('hex');
}

function payloadHash(payload: DispatchPayload) {
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

async function hasDispatched(dispatchKeyValue: string) {
  const row = await getOne<{ dispatch_key: string }>(
    'SELECT dispatch_key FROM hazard_dispatches WHERE dispatch_key = ?',
    [dispatchKeyValue]
  );
  return Boolean(row);
}

async function storeDispatch(dispatchKeyValue: string, payloadHashValue: string, payload: DispatchPayload) {
  await run(
    `INSERT INTO hazard_dispatches (dispatch_key, alert_id, type, status, topic, payload_hash, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      dispatchKeyValue,
      payload.id,
      payload.type,
      payload.status,
      payload.topic,
      payloadHashValue,
      JSON.stringify(payload)
    ]
  );
}

async function postToWebhook(payload: DispatchPayload) {
  const url = env.MLINK_ALERT_WEBHOOK_URL?.trim() || '';
  if (!url) return false;

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
    body: rawBody
  });

  if (!response.ok) {
    throw new Error(`Hazard webhook failed (${response.status}): ${await response.text()}`);
  }

  return true;
}

function toDispatchPayload(item: AlertItem, reason?: string): DispatchPayload {
  return {
    id: item.id,
    type: item.type,
    status: statusOf(item),
    severity: item.severity,
    title: item.title,
    region: item.region,
    issuedAt: item.issuedAt,
    eventAt: item.eventAt,
    topic: ALERT_TOPIC,
    message: buildMessage(item),
    generatedAt: new Date().toISOString(),
    reason
  };
}

export async function dispatchHazardItems(items: AlertItem[], reason?: string) {
  const results: DispatchPayload[] = [];

  for (const item of items) {
    const payload = toDispatchPayload(item, reason);
    const hash = payloadHash(payload);
    const key = dispatchKey(item, hash);
    if (await hasDispatched(key)) continue;

    const sent = await postToWebhook(payload);
    if (!sent) continue;

    await storeDispatch(key, hash, payload);
    results.push(payload);
  }

  return results;
}

