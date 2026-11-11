export type ProbeSettings = { baseUrl: string; model: string; cpuOnly: boolean };
export type ProbeResult = ProbeSettings & {
  ok: boolean; elapsedMs: number; testedAt: string; response?: string;
  error?: string; stage: 'inference' | 'response' | 'complete'; tokens?: number; tokensPerSecond?: number;
};
export async function probeOllama(settings: ProbeSettings, request: typeof fetch = fetch, timeoutMs = 90000): Promise<ProbeResult> {
  const started = performance.now();
  const signal = AbortSignal.timeout(timeoutMs);
  const result = (fields: Partial<ProbeResult>): ProbeResult => ({
    ...settings, ok: false, stage: 'inference', elapsedMs: Math.round(performance.now() - started),
    testedAt: new Date().toISOString(), ...fields
  });
  try {
    const response = await request(`${settings.baseUrl}/api/generate`, {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.model, stream: false,
        system: 'This is a connectivity test. Return only the requested JSON object.',
        prompt: 'Return {"ok":true}. Do not add explanation.',
        format: { type: 'object', properties: { ok: { type: 'boolean', const: true } }, required: ['ok'], additionalProperties: false },
        options: { num_ctx: 4096, num_batch: 64, num_predict: 512, temperature: 0.1, top_p: 0.8,
          repeat_penalty: 1.08, ...(settings.cpuOnly ? { num_gpu: 0 } : {}) },
        keep_alive: '10m'
      })
    });
    if (!response.ok) {
      const details = await response.json().catch(() => null);
      const reason = typeof details?.error === 'string' ? `：${details.error.slice(0, 240)}` : '';
      return result({ error: `Ollama 回覆 HTTP ${response.status}${reason}` });
    }
    const raw = await response.json().catch(() => null);
    if (!raw || typeof raw !== 'object') return result({ stage: 'response', error: 'Ollama 回傳格式無效，尚未通過測試。' });
    if (raw.error) return result({ error: `Ollama 執行失敗：${String(raw.error).slice(0, 240)}` });
    const text = typeof raw.response === 'string' ? raw.response.trim() : '';
    if (!text) return result({ stage: 'response', error: '模型未回傳答案，可能尚在思考或已達輸出上限；請更換模型後重試。' });
    let json: unknown;
    try { json = JSON.parse(text); } catch { return result({ stage: 'response', response: text.slice(0, 500), error: '已連上模型，但回覆不是有效 JSON，尚未通過測試。' }); }
    if (raw.done !== true || !json || typeof json !== 'object' || (json as {ok?: unknown}).ok !== true) {
      return result({ stage: 'response', response: text.slice(0, 500), error: '已收到回覆，但內容不符合測試要求。' });
    }
    const tokens = Number(raw.eval_count);
    const duration = Number(raw.eval_duration);
    return result({ ok: true, stage: 'complete', response: text.slice(0, 500),
      ...(Number.isFinite(tokens) && tokens >= 0 ? { tokens } : {}),
      ...(Number.isFinite(tokens) && Number.isFinite(duration) && duration > 0 ? { tokensPerSecond: Math.round(tokens / (duration / 1e9) * 10) / 10 } : {})
    });
  } catch {
    return result({ error: signal.aborted ? `推論超過 ${Math.round(timeoutMs / 1000)} 秒，已中止；請檢查模型負載或切換 CPU 模式。` : '無法完成 Ollama 請求，請檢查 Tailscale、服務連線或 runner 狀態。' });
  }
}
