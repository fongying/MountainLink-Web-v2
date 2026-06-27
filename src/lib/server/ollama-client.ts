import { env } from '$env/dynamic/private';

export type OllamaGenerateOptions = {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  timeoutMs?: number;
};

export type OllamaGenerateResult = {
  model: string;
  raw: unknown;
  json: unknown;
};

function ollamaBaseUrl() {
  return (env.OLLAMA_BASE_URL || 'http://10.77.0.10:11434').replace(/\/+$/u, '');
}

export function ollamaModel() {
  return env.OLLAMA_MODEL?.trim() || 'gpt-oss:20b';
}

export function isOllamaConfigured() {
  return Boolean((env.OLLAMA_BASE_URL || '').trim());
}

function ollamaTimeoutMs() {
  const timeout = Number(env.OLLAMA_TIMEOUT_MS ?? 240_000);
  return Number.isFinite(timeout) ? Math.max(10_000, timeout) : 240_000;
}

export async function generateOllamaJson(options: OllamaGenerateOptions): Promise<OllamaGenerateResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? ollamaTimeoutMs());
  const model = ollamaModel();

  try {
    const raw = await requestOllamaGenerate({
      model,
      system: options.system,
      prompt: options.prompt,
      format: options.schema,
      signal: controller.signal
    });
    const text = typeof raw?.response === 'string' ? raw.response : '';
    const fallbackRaw = text.trim()
      ? raw
      : await requestOllamaGenerate({
          model,
          system: options.system,
          prompt: `${options.prompt}\n\n你必須只輸出一個可被 JSON.parse 解析的 JSON object，不要 markdown，不要說明文字。`,
          signal: controller.signal
        });
    const fallbackText = typeof fallbackRaw?.response === 'string' ? fallbackRaw.response : '';
    if (!fallbackText.trim()) throw new Error('Ollama returned an empty response.');

    try {
      return {
        model,
        raw: fallbackRaw,
        json: JSON.parse(fallbackText)
      };
    } catch (error) {
      throw new Error(`Ollama returned invalid JSON: ${error instanceof Error ? error.message : 'unknown parse error'}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function requestOllamaGenerate(options: {
  model: string;
  system: string;
  prompt: string;
  format?: Record<string, unknown>;
  signal: AbortSignal;
}) {
  const response = await fetch(`${ollamaBaseUrl()}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        model: options.model,
        system: `${options.system}\n\n只允許輸出 JSON。不要輸出 markdown 或額外說明。`,
        prompt: options.prompt,
        stream: false,
        ...(options.format ? { format: options.format } : {}),
        options: {
          temperature: 0.1,
          top_p: 0.8,
          repeat_penalty: 1.08,
          num_predict: 512
        },
        keep_alive: '10m'
      }),
      signal: options.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
    }

  return response.json();
}
