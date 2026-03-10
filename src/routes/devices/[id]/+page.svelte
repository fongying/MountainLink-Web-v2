<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeviceTelemetry, MLinkSseEvent } from '$lib/types';
  import { connectSse } from '$lib/client/sse';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import DeviceMap2D from '$lib/components/DeviceMap2D.svelte';

  const MAX_POINTS = 60;
  const MAX_LOGS = 20;

  type HistoryRow = {
    ts: number;
    hr: number | null;
    battery: number | null;
    lat?: number | null;
    lon?: number | null;
    alt?: number | null;
    sos?: boolean | number | null;
    rssi?: number | null;
    snr?: number | null;
    online?: boolean | number | null;
  };

  export let data: {
    user: { id: number; username: string; is_admin: number };
    deviceId: string;
    device: DeviceTelemetry | null;
    history: HistoryRow[];
  };

  let sseStatus: 'open' | 'error' | 'connecting' = 'connecting';
  let current: DeviceTelemetry | null = data.device ?? null;

  let timeSeries: number[] = [];
  let hrSeries: number[] = [];
  let batSeries: number[] = [];
  let leftCardEl: HTMLDivElement | null = null;
  let chartW = 520; // 預設值，避免 SSR/HMR 初始為 0

  let logs: string[] = [];
  const fmtTime = (ms: number) => new Date(ms).toLocaleString();

  function pushLog(msg: string) {
    // 少拷貝：頭插仍需新陣列，但固定長度
    logs = [msg, ...logs];
    if (logs.length > MAX_LOGS) logs = logs.slice(0, MAX_LOGS);
  }

  function trimTail<T>(arr: T[]) {
    // 比 slice + spread 省
    if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
  }

  function initFromHistory(history: HistoryRow[]) {
    const sliced = history.length > MAX_POINTS ? history.slice(-MAX_POINTS) : history;

    timeSeries = sliced.map((r) => r.ts);

    let lastHr: number | null = null;
    let lastBat: number | null = null;

    hrSeries = [];
    batSeries = [];

    for (const r of sliced) {
      if (r.hr != null) lastHr = r.hr;
      if (r.battery != null) lastBat = r.battery;
      hrSeries.push(lastHr ?? NaN);
      batSeries.push(lastBat ?? NaN);
    }

    hrSeries = backfillNaN(hrSeries, 60);     // 沒資料時先用 60bpm 當顯示用預設
    batSeries = backfillNaN(batSeries, 100);  // 沒資料時先用 100% 當顯示用預設
  }

  // 初始化一次
  initFromHistory(data.history);

  function backfillNaN(series: number[], fallback: number) {
    // 找第一個有效值
    const first = series.find((v) => Number.isFinite(v));
    const fill = (first ?? fallback);

    return series.map((v) => (Number.isFinite(v) ? v : fill));
  }

  function fillAllNaN(series: number[], value: number) {
    if (!Number.isFinite(value)) return series;
    return series.map((v) => (Number.isFinite(v) ? v : value));
  }

  function applyTelemetry(dev: DeviceTelemetry) {
    // 避免亂序覆蓋
    if (current?.updatedAt != null && dev.updatedAt != null && dev.updatedAt < current.updatedAt) return;

    current = { ...current, ...dev };

    const t = dev.updatedAt ?? Date.now();

    // 時間序列
    timeSeries.push(t);
    trimTail(timeSeries);

    // 這裡就是 prevHr / prevBat 的來源：取「上一個點」
    const prevHr = hrSeries.length ? hrSeries[hrSeries.length - 1] : NaN;
    const prevBat = batSeries.length ? batSeries[batSeries.length - 1] : NaN;

    // 缺值沿用前值（確保序列等長）
    const nextHr = dev.hr != null ? dev.hr : prevHr;
    const nextBat = dev.battery != null ? dev.battery : prevBat;

    hrSeries.push(nextHr);
    batSeries.push(nextBat);

    // 一旦收到有效值，就把舊 NaN 一次補齊（否則折線會整條消失）
    if (Number.isFinite(nextHr)) hrSeries = fillAllNaN(hrSeries, nextHr);
    if (Number.isFinite(nextBat)) batSeries = fillAllNaN(batSeries, nextBat);

    trimTail(hrSeries);
    trimTail(batSeries);
  }

  function handleEvent(evt: MLinkSseEvent) {
    if (evt.type === 'telemetry') {
      const target = evt.devices.find((d) => d.deviceId === data.deviceId);
      if (!target) return;

      applyTelemetry(target);
      pushLog(
        `[telemetry] ${fmtTime(target.updatedAt)} hr=${target.hr ?? '—'} bat=${target.battery ?? '—'} sos=${target.sos ? 'Y' : 'N'}`
      );
      return;
    }

    if (evt.type === 'online' && evt.deviceId === data.deviceId) {
      applyTelemetry({
        deviceId: evt.deviceId,
        online: evt.online,
        battery: current?.battery ?? 0,
        updatedAt: evt.updatedAt
      });
      pushLog(`[online] ${fmtTime(evt.updatedAt)} online=${evt.online}`);
      return;
    }
  }

  onMount(() => {
    let disposed = false;

    const disconnect = connectSse(
      `/api/stream?deviceId=${encodeURIComponent(data.deviceId)}`,
      (evt) => {
        if (disposed) return;
        handleEvent(evt);
      },
      (status) => {
        if (disposed) return;
        sseStatus = status;
      }
    );

    return () => {
      disposed = true;
      disconnect?.();
    };
  });

  $: sparkW = Math.max(260, (chartW || 0) - 24); // 24 ≈ 左右 padding 12+12
</script>

<div class="devicePage">
  <header class="hero">
    <div class="heroLeft">
      <p class="eyebrow">Device</p>
      <h1>裝置詳情</h1>
      <p class="deviceLine">
        <span>裝置</span>
        <strong>{data.deviceId}</strong>
      </p>
    </div>
    <div class="heroRight">
      <div class="heroActions">
        <a class="backLink" href="/dashboard">← 回 Dashboard</a>
        {#if data.user?.is_admin}
          <a class="backLink" href={`/devices/${encodeURIComponent(data.deviceId)}/unit`}>調整單位</a>
        {/if}
      </div>
      <div class="chipRow">
        <span class={`chip ${sseStatus === 'open' ? 'chip-ok' : sseStatus === 'error' ? 'chip-warn' : 'chip-idle'}`}>
          SSE：
          {#if sseStatus === 'open'}
            已連線
          {:else if sseStatus === 'error'}
            異常（重連中）
          {:else}
            連線中
          {/if}
        </span>
        <span class={`chip ${current?.online ? 'chip-ok' : current ? 'chip-off' : 'chip-idle'}`}>
          裝置：
          {#if current}
            {#if current.online}Online{:else}Offline{/if}
          {:else}
            未知
          {/if}
        </span>
      </div>
      <p class="heroTime">最後更新：{current ? fmtTime(current.updatedAt) : '—'}</p>
    </div>
  </header>

  <section class="card mapCard">
    <div class="cardHeader">
      <div>
        <h2>位置地圖</h2>
        <p class="muted">鎖定視角 · Terrain</p>
      </div>
      <span class="cardTag">Zoom 16</span>
    </div>
    {#if current || data.device}
      <div class="mapFrame">
        <DeviceMap2D
          device={(current ?? data.device) as any}
          height={360}
          zoom={16}
          lockView={true}
          showTerrain={true}
        />
      </div>
    {:else}
      <p class="empty">地圖載入中…（尚未取得裝置資料）</p>
    {/if}
  </section>

  <div class="grid">
    <section class="card statsCard">
      <div class="cardHeader">
        <div>
          <h2>即時狀態</h2>
          <p class="muted">裝置指標與連線狀態</p>
        </div>
        {#if current?.sos}
          <span class="alertPill">🚨 SOS</span>
        {/if}
      </div>

      {#if current}
        <div class="kv">
          <div class="kvLabel">狀態</div>
          <div class="kvValue">
            <span class={`statusDot ${current.online ? 'dot-online' : 'dot-offline'}`}></span>
            {#if current.online}Online{:else}Offline{/if}
          </div>

          <div class="kvLabel">單位</div>
          <div class="kvValue">{current?.sos ? '待救者' : (current as any)?.unit ?? '登山者'}</div>

          <div class="kvLabel">電量</div>
          <div class="kvValue">
            {current.battery}%{#if current.charging}（充電中）{/if}
            {#if current.battery <= 15}
              <span class="warn">低電量</span>
            {/if}
          </div>

          <div class="kvLabel">心率</div>
          <div class="kvValue">{current.hr ?? '—'} bpm</div>

          <div class="kvLabel">血氧</div>
          <div class="kvValue">{current.spo2 ?? '—'}%</div>

          <div class="kvLabel">血壓</div>
          <div class="kvValue">{current.bpHi ?? '—'} / {current.bpLo ?? '—'}</div>

          <div class="kvLabel">體溫</div>
          <div class="kvValue">{current.bt ?? '—'}°C</div>

          <div class="kvLabel">座標</div>
          <div class="kvValue mono">
            {current.lat ?? '—'}, {current.lon ?? '—'} {#if current.alt != null}(alt {current.alt}m){/if}
          </div>

          <div class="kvLabel">訊號</div>
          <div class="kvValue">RSSI {current.rssi ?? '—'} / SNR {current.snr ?? '—'}</div>

          <div class="kvLabel">最後更新</div>
          <div class="kvValue">{fmtTime(current.updatedAt)}</div>
        </div>

        {#if current.sos}
          <div class="sosBanner">🚨 SOS 觸發中</div>
        {/if}
      {:else}
        <p class="empty">尚未收到此裝置的即時資料…（等待 SSE）</p>
      {/if}
    </section>

    <section class="card chartCard" bind:clientWidth={chartW}>
      <div class="cardHeader">
        <div>
          <h2>生命跡象</h2>
          <p class="muted">近 {MAX_POINTS} 點的即時趨勢</p>
        </div>
        <span class="cardTag">Live</span>
      </div>

      {#if current}
        <div class="chartBlock">
          <div class="chartHeader">
            <strong>心率（bpm）</strong>
            <span class="metricBadge">目前：{current.hr ?? '—'}</span>
          </div>
          <Sparkline
            values={hrSeries}
            times={timeSeries}
            width={sparkW}
            height={110}
            min={40}
            max={180}
            tickEverySeconds={10}
            bands={[
              { from: 50, to: 60,  color: '#22c55e', opacity: 0.12, label: '偏低' },
              { from: 60, to: 120, color: '#eab308', opacity: 0.12, label: '正常' },
              { from: 120, to: 160, color: '#ef4444', opacity: 0.12, label: '偏高' }
            ]}
          />
        </div>

        <div class="divider"></div>

        <div class="chartBlock">
          <div class="chartHeader">
            <strong>電量（%）</strong>
            <span class="metricBadge">目前：{current.battery ?? '—'}%</span>
          </div>
          <Sparkline values={batSeries} times={timeSeries} width={sparkW} height={100} min={0} max={100} tickEverySeconds={10} />
        </div>
      {:else}
        <p class="empty">尚未收到圖表資料…</p>
      {/if}
    </section>

    <section class="card logCard">
      <div class="cardHeader">
        <div>
          <h2>即時事件紀錄</h2>
          <p class="muted">最新 {MAX_LOGS} 筆訊息</p>
        </div>
        <span class="cardTag">SSE</span>
      </div>

      {#if logs.length === 0}
        <p class="empty">尚無事件</p>
      {:else}
        <ul class="logs">
          {#each logs as line}
            <li><code>{line}</code></li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

  .devicePage{
    --ink: #0b1b1e;
    --muted: #53656a;
    --accent: #ff6b4a;
    --accent-2: #18b7a4;
    --card: rgba(255, 255, 255, 0.92);
    --stroke: rgba(12, 40, 46, 0.12);
    --shadow: 0 14px 38px rgba(10, 22, 26, 0.12);
    position: relative;
    padding: 24px 20px 44px;
    border-radius: 22px;
    background:
      radial-gradient(1200px 340px at -10% -20%, rgba(24, 183, 164, 0.18), transparent 60%),
      radial-gradient(900px 300px at 110% 0%, rgba(255, 107, 74, 0.18), transparent 55%),
      linear-gradient(180deg, #f7fbfb 0%, #eef3f2 100%);
    color: var(--ink);
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
    overflow: hidden;
  }

  .devicePage::after{
    content: "";
    position: absolute;
    inset: 24px 12px auto auto;
    width: 220px;
    height: 220px;
    background:
      radial-gradient(circle at 30% 30%, rgba(255, 107, 74, 0.28), transparent 55%),
      radial-gradient(circle at 70% 70%, rgba(24, 183, 164, 0.2), transparent 55%);
    opacity: 0.8;
    pointer-events: none;
  }

  .devicePage > *{
    position: relative;
    z-index: 1;
  }

  .hero{
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 18px;
    margin-bottom: 18px;
  }

  .heroLeft h1{
    margin: 4px 0 6px;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
    font-size: 34px;
    letter-spacing: -0.02em;
  }

  .eyebrow{
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .deviceLine{
    margin: 0;
    font-size: 15px;
    color: var(--muted);
  }
  .deviceLine strong{
    margin-left: 6px;
    font-weight: 700;
    color: var(--ink);
  }

  .heroRight{
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    text-align: right;
  }

  .heroActions{
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .backLink{
    font-size: 13px;
    text-decoration: none;
    color: var(--ink);
    border: 1px solid var(--stroke);
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.7);
  }
  .backLink:hover{ border-color: rgba(12, 40, 46, 0.25); }

  .chipRow{
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .chip{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    border: 1px solid transparent;
    background: rgba(255, 255, 255, 0.75);
  }
  .chip-ok{
    color: #0b665d;
    border-color: rgba(24, 183, 164, 0.4);
    background: rgba(24, 183, 164, 0.12);
  }
  .chip-warn{
    color: #8a360e;
    border-color: rgba(255, 107, 74, 0.5);
    background: rgba(255, 107, 74, 0.12);
  }
  .chip-off{
    color: #384548;
    border-color: rgba(56, 69, 72, 0.25);
    background: rgba(56, 69, 72, 0.08);
  }
  .chip-idle{
    color: #4f5b5e;
    border-color: rgba(79, 91, 94, 0.2);
    background: rgba(79, 91, 94, 0.08);
  }

  .heroTime{
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .grid{
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    grid-template-areas:
      "stats logs"
      "charts logs";
    gap: 16px;
    align-items: start;
    margin-top: 18px;
  }

  .card{
    min-width: 0;
    border: 1px solid var(--stroke);
    border-radius: 16px;
    padding: 16px;
    background: var(--card);
    box-shadow: var(--shadow);
    overflow: hidden;
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
  }

  .mapCard{ margin-top: 8px; }

  .statsCard{ grid-area: stats; }
  .chartCard{ grid-area: charts; }
  .logCard{
    grid-area: logs;
    background: #0f1a1c;
    color: #e6f1f1;
    border-color: rgba(255, 255, 255, 0.08);
  }

  .cardHeader{
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }

  .cardHeader h2{
    margin: 0;
    font-size: 20px;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
  }

  .cardHeader .muted{ margin: 4px 0 0; }

  .cardTag{
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--stroke);
    color: var(--muted);
    background: rgba(255, 255, 255, 0.7);
  }

  .logCard .cardTag{
    border-color: rgba(255, 255, 255, 0.2);
    color: #cbd7d7;
    background: rgba(255, 255, 255, 0.08);
  }

  .mapFrame{
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(12, 40, 46, 0.12);
  }

  .muted{ color: var(--muted); font-size: 13px; }

  .kv{
    display: grid;
    grid-template-columns: 130px 1fr;
    gap: 10px 14px;
  }
  .kvLabel{
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .kvValue{ font-weight: 600; }
  .mono{ font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace; }

  .statusDot{
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    background: #8a8a8a;
  }
  .dot-online{ background: #17c3b2; box-shadow: 0 0 10px rgba(23, 195, 178, 0.6); }
  .dot-offline{ background: #6b7a7f; }

  .warn{
    margin-left: 6px;
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 999px;
    color: #8a360e;
    background: rgba(255, 107, 74, 0.16);
  }

  .sosBanner{
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 68, 68, 0.12);
    border: 1px solid rgba(255, 68, 68, 0.4);
    color: #a1001d;
    font-weight: 700;
  }

  .alertPill{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    color: #a1001d;
    border: 1px solid rgba(255, 68, 68, 0.45);
    background: rgba(255, 68, 68, 0.14);
  }

  .chartBlock{
    margin-top: 8px;
    min-width: 0;
  }
  .chartHeader{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .metricBadge{
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(24, 183, 164, 0.14);
    color: #0b665d;
  }

  .divider{
    height: 1px;
    margin: 14px 0;
    background: rgba(12, 40, 46, 0.12);
  }

  .logCard .muted{ color: #9fb0b4; }

  .logs{
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 420px;
    overflow: auto;
    font-size: 12px;
    display: grid;
    gap: 6px;
  }
  .logs li{
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 8px 10px;
  }
  .logs code{
    display: block;
    color: #d7efed;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .empty{
    margin: 0;
    padding: 12px;
    border-radius: 12px;
    background: rgba(12, 40, 46, 0.06);
    color: var(--muted);
  }
  .logCard .empty{
    background: rgba(255, 255, 255, 0.08);
    color: #a8b8bb;
  }

  @media (max-width: 1100px){
    .grid{
      grid-template-columns: 1fr;
      grid-template-areas:
        "stats"
        "charts"
        "logs";
    }
    .logs{ max-height: 360px; }
  }

  @media (max-width: 720px){
    .devicePage{ padding: 18px 14px 32px; }
    .hero{ flex-direction: column; align-items: flex-start; }
    .heroRight{ align-items: flex-start; text-align: left; }
    .chipRow{ justify-content: flex-start; }
  }
</style>
