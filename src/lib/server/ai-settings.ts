import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { env } from '$env/dynamic/private';

export type AiSettings = { provider: 'ollama' | 'nvidia'; baseUrl: string; model: string; cpuOnly: boolean };
const path = 'data/ai-settings.json';
export function readAiSettings(): AiSettings {
  let saved: Partial<AiSettings> = {};
  try { saved = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return {
    provider: saved.provider ?? (env.AI_AGENT_PROVIDER === 'nvidia' ? 'nvidia' : 'ollama'),
    baseUrl: saved.baseUrl ?? env.OLLAMA_BASE_URL?.trim() ?? 'http://100.119.28.121:11434',
    model: saved.model ?? env.OLLAMA_MODEL?.trim() ?? 'gpt-oss:20b',
    cpuOnly: saved.cpuOnly ?? false
  };
}
export function validateLabUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== '100.119.28.121' ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('請使用 Lab VPN IP 100.119.28.121 的 HTTP 或 HTTPS 位址。');
  }
  return url.origin;
}
export async function listOllamaModels(baseUrl: string) {
  const response = await fetch(`${validateLabUrl(baseUrl)}/api/tags`, {
    signal: AbortSignal.timeout(10000), redirect: 'error'
  });
  if (!response.ok) throw new Error(`Ollama 模型偵測失敗（HTTP ${response.status}）`);
  const body = await response.json();
  if (!Array.isArray(body.models)) throw new Error('Ollama 未回傳有效模型清單。');
  return body.models.filter((m: any) => typeof m.name === 'string').map((m: any) => ({
    name: m.name as string,
    size: Number(m.size) || 0,
    parameters: String(m.details?.parameter_size ?? '')
  })) as { name: string; size: number; parameters: string }[];
}
export function saveAiSettings(settings: AiSettings) {
  settings.baseUrl = validateLabUrl(settings.baseUrl);
  mkdirSync('data', { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(settings, null, 2), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}
