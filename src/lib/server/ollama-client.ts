import { readAiSettings } from '$lib/server/ai-settings';
import { env } from '$env/dynamic/private';
import { requestStructuredJson } from '$lib/server/ollama-json';

export type OllamaGenerateOptions = {
  system: string; prompt: string; schema: Record<string, unknown>; timeoutMs?: number;
};
export type OllamaGenerateResult = { model: string; raw: unknown; json: unknown };

export function ollamaModel() { return readAiSettings().model; }
export function isOllamaConfigured() { return Boolean(readAiSettings().baseUrl.trim()); }
function ollamaTimeoutMs() {
  const timeout = Number(env.OLLAMA_TIMEOUT_MS ?? 240_000);
  return Number.isFinite(timeout) ? Math.max(10_000, timeout) : 240_000;
}
export async function generateOllamaJson(options: OllamaGenerateOptions): Promise<OllamaGenerateResult> {
  const settings = readAiSettings();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? ollamaTimeoutMs());
  try {
    return await requestStructuredJson({
      baseUrl: settings.baseUrl.replace(/\/+$/u, ''), model: settings.model, cpuOnly: settings.cpuOnly,
      system: options.system, prompt: options.prompt, schema: options.schema, signal: controller.signal
    });
  } finally { clearTimeout(timer); }
}
