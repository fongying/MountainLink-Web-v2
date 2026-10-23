import { probeOllama } from '$lib/server/ollama-probe';
import { fail, redirect } from '@sveltejs/kit';
import { readAiSettings, listOllamaModels, saveAiSettings } from '$lib/server/ai-settings';
import type { Actions, PageServerLoad } from './$types';

function requireAdmin(locals: App.Locals) {
  if (!locals.user) throw redirect(303, '/login');
  if (!locals.user.is_admin) throw redirect(303, '/dashboard');
}
export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  const settings = readAiSettings();
  // Use the configured Lab endpoint, while allowing the former env endpoint to be replaced.
  const baseUrl = settings.baseUrl.includes('100.119.28.121') ? settings.baseUrl : 'http://100.119.28.121:11434';
  try { return { settings: { ...settings, baseUrl }, models: await listOllamaModels(baseUrl), connectionError: '' }; }
  catch { return { settings: { ...settings, baseUrl }, models: [], connectionError: '無法連接 Lab Ollama，請確認 Tailscale、服務監聽與連接埠。' }; }
};
export const actions: Actions = {
  test: async ({ locals, request }) => {
    requireAdmin(locals);
    const form = await request.formData();
    const baseUrl = String(form.get('baseUrl') ?? '');
    const model = String(form.get('model') ?? '');
    const cpuOnly = form.get('cpuOnly') === 'on';
    try {
      const models = await listOllamaModels(baseUrl);
      if (!models.some(m => m.name === model)) return fail(400, { models, message: '模型不存在，請重新偵測並選擇。' });
      const testResult = await probeOllama({ baseUrl: baseUrl.replace(/\/+$/u, ''), model, cpuOnly });
      return { models, testResult };
    } catch {
      return fail(400, { message: '模型清單讀取失敗，請確認 Lab VPN 位址、連線與服務。' });
    }
  },
  discover: async ({ locals, request }) => {
    requireAdmin(locals);
    const form = await request.formData();
    const baseUrl = String(form.get('baseUrl') ?? '');
    try { return { models: await listOllamaModels(baseUrl), baseUrl, message: '模型偵測完成，請選擇模型後儲存。' }; }
    catch { return fail(400, { baseUrl, message: '偵測失敗：請確認 VPN、Ollama 位址與連接埠。', models: [] }); }
  },
  save: async ({ locals, request }) => {
    requireAdmin(locals);
    const form = await request.formData();
    const baseUrl = String(form.get('baseUrl') ?? '');
    const model = String(form.get('model') ?? '');
    try {
      const models = await listOllamaModels(baseUrl);
      if (!models.some(m => m.name === model)) return fail(400, { message: '此模型不在 Lab 目前可用清單，請重新偵測。', models, baseUrl });
      saveAiSettings({ provider: 'ollama', baseUrl, model, cpuOnly: form.get('cpuOnly') === 'on' });
      return { message: `已啟用 Ollama / ${model}，下一次 AI 分析會使用此模型。`, models, baseUrl, saved: true };
    } catch { return fail(400, { message: '儲存失敗，請確認 Lab 連線與模型仍可使用。', baseUrl }); }
  }
};
