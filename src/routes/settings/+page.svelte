<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  export let data;
  export let form;
  let busy = false;
  let testing = false;
  let baseUrl = data.settings.baseUrl;
  let model = data.settings.model;
  let cpuOnly = data.settings.cpuOnly;
  $: models = form?.models ?? data.models;
  $: testResult = form && 'testResult' in form ? form.testResult : null;
  $: testIsStale = testResult && (testResult.model !== model || testResult.cpuOnly !== cpuOnly || testResult.baseUrl !== baseUrl.replace(/\/+$/u, ''));
  const submit: SubmitFunction = ({ submitter }) => {
    busy = true;
    testing = submitter?.getAttribute('formaction') === '?/test';
    return async ({ update }) => { try { await update({ reset: false }); } finally { busy = false; testing = false; } };
  };
</script>

<svelte:head><title>AI 設定 | MountainLink</title></svelte:head>
<section class="settings">
  <a href="/dashboard">← 回到監控中心</a>
  <header><p>LAB CONNECTION</p><h1>AI 模型設定</h1><p>透過 Tailscale 連接 Lab，偵測並選擇 AI 建議使用的 Ollama 模型。</p></header>
  <div class="panel">
    <p>目前供應者：<strong>{data.settings.provider}</strong> ／ 模型：<strong>{data.settings.model}</strong></p>
    <form method="POST" action="?/discover" use:enhance={submit}>
      <label for="baseUrl">Lab Ollama 位址</label>
      <div class="row"><input id="baseUrl" name="baseUrl" type="url" bind:value={baseUrl} required disabled={busy} /><button disabled={busy}>{busy ? '處理中…' : '重新偵測模型'}</button></div>
      <small>VPN IP：100.119.28.121；預設連接埠 11434。偵測由雲端伺服器執行。</small>
    </form>
    {#if form?.message}<p class="notice" role="status">{form.message}</p>{:else if data.connectionError}<p class="notice" role="status">{data.connectionError}</p>{/if}
    <form method="POST" action="?/save" use:enhance={submit}>
      <input type="hidden" name="baseUrl" value={baseUrl} />
      <label for="model">可用模型（{models.length} 個）</label>
      <select id="model" name="model" bind:value={model} required disabled={busy || !models.length}>
        <option value="" disabled>請選擇模型</option>
        {#each models as item}<option value={item.name}>{item.name} · {item.parameters} · {(item.size / 1e9).toFixed(1)} GB</option>{/each}
      </select>
      <label class="cpu"><input type="checkbox" name="cpuOnly" bind:checked={cpuOnly} disabled={busy} />CPU 相容模式（GPU 執行異常時使用）</label>
      <div class="row actions">
        <button type="submit" formaction="?/test" disabled={busy || !models.some(item => item.name === model)}>{testing ? '測試中，最多等待 90 秒…' : '測試模型'}</button>
        <button class="primary" type="submit" disabled={busy || !models.some(item => item.name === model)}>儲存並使用 Ollama</button>
      </div>
      <small>測試使用目前選取的模型與 CPU 模式，不需先儲存。只發送簡短固定問題，不會發送裝置資料或聊天廣播。</small>
    </form>
    {#if testing}<p class="notice" role="status">正在測試模型推論，首次載入模型可能較慢，最多等待 90 秒。</p>{/if}
    {#if testResult && !testing}
      <section class="testResult" class:passed={testResult.ok} class:failed={!testResult.ok} aria-label="模型測試結果" aria-live="polite">
        <h2>{testResult.ok ? '測試通過' : '測試未通過'}</h2>
        <p>{testResult.model} ／ {testResult.cpuOnly ? 'CPU 相容模式' : '自動硬體模式'} ／ 耗時 {(testResult.elapsedMs / 1000).toFixed(2)} 秒</p>
        {#if testResult.error}<p>{testResult.error}</p>{/if}
        {#if testResult.response}<pre>{testResult.response}</pre>{/if}
        {#if testResult.tokensPerSecond != null}<small>輸出速度 {testResult.tokensPerSecond} tokens/s · {testResult.tokens} tokens</small>{/if}
        {#if testIsStale}<p class="notice">目前選項已變更，請重新測試。</p>{/if}
        <p class="hint">這是簡短推論測試。完整 AI 建議仍需回監控中心按「分析」驗收。</p>
      </section>
    {/if}
    <p class="hint">儲存後立即套用，不需重啟服務；模型未安裝時不會自動下載。AI 建議仍需由管理者核對。</p>
  </div>
</section>
<style>
  .settings{max-width:880px;margin:24px auto;color:#dceaf1;background:#0b171d;padding:28px;border-radius:18px;}
  a{color:#5eead4;} header{margin:24px 0;} header>p:first-child{letter-spacing:.16em;color:#2dd4bf;font-size:12px;}
  h1{font-size:28px;margin:8px 0;} p,small{line-height:1.6;} .panel{padding:24px;border:1px solid #334155;border-radius:12px;}
  form{display:grid;gap:12px;margin:24px 0;} label{font-weight:600;} .row{display:flex;gap:12px;flex-wrap:wrap;}
  input,select,button{font:inherit;border:1px solid #475569;border-radius:8px;padding:12px;background:#14252e;color:#e2e8f0;max-width:100%;box-sizing:border-box;}
  .cpu{display:flex;align-items:center;gap:10px;} .cpu input{flex:none;min-width:20px;width:20px;height:20px;}
  input{flex:1;min-width:200px;} select{width:100%;} button{cursor:pointer;min-height:44px;} button:hover{border-color:#2dd4bf;} .primary{background:#0f766e;justify-self:start;}
  button:disabled{opacity:.5;cursor:wait;} :is(input,select,button,a):focus-visible{outline:2px solid #38bdf8;outline-offset:3px;}
  .actions{align-items:center;} .testResult{margin:20px 0;padding:18px;border:1px solid #64748b;border-radius:10px;} .passed{border-color:#2dd4bf;} .failed{border-color:#f59e0b;} .testResult h2{font-size:20px;margin:0 0 8px;} pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:#0b171d;border-radius:6px;}
  small,.hint{color:#a5b8c4;} .notice{padding:12px;background:#193746;border-radius:8px;} @media(max-width:600px){.settings{padding:16px;margin:12px 0;}.panel{padding:16px;}}
</style>
