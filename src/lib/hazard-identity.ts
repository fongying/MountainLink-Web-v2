import { createHash } from 'node:crypto';
export function hazardPayloadHash(payload: object) {
  const { generatedAt: _generatedAt, reason: _reason, ...stable } = payload as Record<string, unknown>;
  return createHash('sha1').update(JSON.stringify(stable)).digest('hex');
}
