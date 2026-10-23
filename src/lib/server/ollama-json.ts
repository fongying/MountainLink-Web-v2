export type StructuredRequest = {
  baseUrl: string; model: string; cpuOnly: boolean;
  system: string; prompt: string; schema: Record<string, unknown>; signal: AbortSignal;
};

// Always retain structured output constraints, including during retries.
export async function requestStructuredJson(options: StructuredRequest, request: typeof fetch = fetch) {
  for (const [attempt, limit] of [2048, 4096].entries()) {
    const response = await request(`${options.baseUrl}/api/generate`, {
      method: 'POST', redirect: 'error', signal: options.signal,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        model: options.model,
        system: `${options.system}\n\n只允許輸出完整 JSON。不要 markdown 或額外說明。每個摘要以簡短句子呈現。`,
        prompt: options.prompt + (attempt ? '\n請重新產生完整 JSON，縮短敘述但保留所有必要欄位與證據識別碼。' : ''),
        format: options.schema, stream: false,
        options: { num_ctx: 8192, num_batch: 64, ...(options.cpuOnly ? { num_gpu: 0 } : {}),
          temperature: 0.1, top_p: 0.8, repeat_penalty: 1.08, num_predict: limit },
        keep_alive: '10m'
      })
    });
    if (!response.ok) {
      const details = await response.json().catch(() => null);
      throw new Error(`Ollama request failed (${response.status})${typeof details?.error === 'string' ? ': ' + details.error.slice(0, 240) : ''}`);
    }
    const raw = await response.json();
    if (!raw || typeof raw !== 'object' || raw.error) throw new Error('Ollama 未回傳有效的推論結果。');
    const text = typeof raw.response === 'string' ? raw.response.trim() : '';
    let json: unknown;
    let parsed = false;
    try { json = JSON.parse(text); parsed = Boolean(json && typeof json === 'object' && !Array.isArray(json)); } catch { /* Retry from the original prompt, never repair partial JSON. */ }
    const truncated = raw.done_reason === 'length' || raw.done !== true;
    if (!truncated && parsed) return { model: options.model, raw, json };
    if (attempt === 1) {
      if (truncated) throw new Error(`Ollama 分析回覆達輸出上限或未完成（上限 ${limit} tokens），兩次嘗試後仍無完整 JSON。`);
      throw new Error('Ollama 兩次回覆皆不是完整 JSON，請更換模型或檢查模型的結構化輸出支援。');
    }
  }
  throw new Error('Ollama 未產生完整 JSON。');
}

export function constrainRecommendationSchema(schema: Record<string, unknown>, values: {
  focusDeviceId: string; evidenceIds: string[]; targetAreas: string[];
}) {
  const allowedArray = (items: string[], maxItems: number) => ({
    type: 'array', maxItems: items.length ? maxItems : 0,
    items: items.length ? { type: 'string', enum: [...new Set(items)] } : { type: 'string' }
  });
  return { ...schema, properties: {
    ...(schema.properties as Record<string, unknown>),
    focusDeviceId: { type: 'string', const: values.focusDeviceId },
    evidenceIds: allowedArray(values.evidenceIds, 20),
    targetAreas: allowedArray(values.targetAreas, 20)
  } };
}
