import { env } from '$env/dynamic/private';

export type NvidiaGenerateOptions = {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  timeoutMs?: number;
};

export type NvidiaGenerateResult = {
  model: string;
  raw: unknown;
  json: unknown;
};

type NvidiaChoice = {
  message?: {
    content?: unknown;
    reasoning_content?: unknown;
  };
  text?: unknown;
};

type NvidiaResponse = {
  choices?: NvidiaChoice[];
};

function nvidiaBaseUrl() {
  return (env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/u, '');
}

export function nvidiaModel() {
  return env.NVIDIA_MODEL?.trim() || 'meta/llama-3.3-70b-instruct';
}

export function isNvidiaConfigured() {
  return Boolean((env.NVIDIA_API_KEY || '').trim());
}

function nvidiaTimeoutMs() {
  const timeout = Number(env.NVIDIA_TIMEOUT_MS ?? 90_000);
  return Number.isFinite(timeout) ? Math.max(10_000, timeout) : 90_000;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('NVIDIA returned an empty response.');

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) return JSON.parse(fenced);

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('NVIDIA returned invalid JSON.');
  }
}

function textFromContent(content: unknown) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        return part.text;
      }
      return '';
    })
    .join('')
    .trim();
}

function readMessageContent(raw: unknown) {
  const choice = (raw as NvidiaResponse)?.choices?.[0];
  const text = textFromContent(choice?.message?.content ?? choice?.text);
  if (text) return text;

  const reasoning = textFromContent(choice?.message?.reasoning_content);
  if (reasoning) {
    throw new Error(
      'NVIDIA model returned reasoning only and no final JSON content. Use a non-reasoning instruct model such as meta/llama-3.3-70b-instruct.'
    );
  }

  throw new Error('NVIDIA response did not include message content.');
}

export async function generateNvidiaJson(options: NvidiaGenerateOptions): Promise<NvidiaGenerateResult> {
  const apiKey = env.NVIDIA_API_KEY?.trim();
  if (!apiKey) throw new Error('NVIDIA_API_KEY is not configured.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? nvidiaTimeoutMs());
  const model = nvidiaModel();

  try {
    const response = await fetch(`${nvidiaBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        top_p: 0.8,
        max_tokens: 900,
        messages: [
          {
            role: 'system',
            content: `${options.system}\n\n你只能輸出一個 JSON object。不要 markdown，不要說明，不要額外文字。`
          },
          {
            role: 'user',
            content: `${options.prompt}\n\n請依照這個 JSON schema 的欄位輸出完整 JSON object：\n${JSON.stringify(options.schema)}`
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`NVIDIA request failed (${response.status}): ${await response.text()}`);
    }

    const raw = await response.json();
    const text = readMessageContent(raw);

    return {
      model,
      raw,
      json: extractJsonObject(text)
    };
  } finally {
    clearTimeout(timer);
  }
}
