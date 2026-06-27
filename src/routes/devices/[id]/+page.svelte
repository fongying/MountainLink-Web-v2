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
  let chartW = 640;
  let logs: string[] = [];

  const fmtTime = (ms: number) => new Date(ms).toLocaleString();
  const displayTitle = (d: DeviceTelemetry | null) => d?.displayName?.trim() || d?.deviceId || data.deviceId;
  const unitOf = (d: DeviceTelemetry | null) => d?.unit?.trim() || '未分類';

  function trimTail<T>(arr: T[]) {
    if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
  }

  function backfillNaN(series: number[], fallback: number) {
    const first = series.find((v) => Number.isFinite(v));
    const fill = first ?? fallback;
    return series.map((v) => (Number.isFinite(v) ? v : fill));
  }

  function fillAllNaN(series: number[], value: number) {
    if (!Number.isFinite(value)) return series;
    return series.map((v) => (Number.isFinite(v) ? v : value));
  }

  function initFromHistory(history: HistoryRow[]) {
    const sliced = history.length > MAX_POINTS ? history.slice(-MAX_POINTS) : history;
    timeSeries = sliced.map((r) => r.ts);

    let lastHr: number | null = null;
    let lastBat: number | null = null;
    hrSeries = [];
    batSeries = [];

    for (const row of sliced) {
      if (row.hr != null) lastHr = row.hr;
      if (row.battery != null) lastBat = row.battery;
      hrSeries.push(lastHr ?? NaN);
      batSeries.push(lastBat ?? NaN);
    }

    hrSeries = backfillNaN(hrSeries, current?.hr ?? 60);
    batSeries = backfillNaN(batSeries, current?.battery ?? 100);
  }

  initFromHistory(data.history);

  function physiologicalAbnormalities(device: DeviceTelemetry | null) {
    if (!device) return [];
    const items: string[] = [];
    if (device.hr != null && (device.hr > 150 || device.hr < 50)) items.push(`HR ${device.hr} bpm`);
    if (device.spo2 != null && device.spo2 < 90) items.push(`SpO2 ${device.spo2}%`);
    if (device.bt != null && (device.bt > 41 || device.bt < 32)) items.push(`BT ${device.bt}°C`);
    if (device.bpHi != null && (device.bpHi > 200 || device.bpHi < 90)) items.push(`SBP ${device.bpHi} mmHg`);
    return items;
  }

  function deviceStatusLabel(device: DeviceTelemetry | null) {
    if (!device) return '未知';
    if (device.sos) return 'SOS';
    if (!device.online) return '離線';
    if (physiologicalAbnormalities(device).length > 0) return '生理異常';
    if ((device.battery ?? 0) <= 20) return '低電量';
    return '正常';
  }

  function deviceStatusClass(device: DeviceTelemetry | null) {
    if (!device) return 'idle';
    if (device.sos) return 'danger';
    if (!device.online) return 'offline';
    if (physiologicalAbnormalities(device).length > 0) return 'risk';
    if ((device.battery ?? 0) <= 20) return 'warn';
    return 'ok';
  }

  function signalLabel(device: DeviceTelemetry | null) {
    if (!device?.online) return '無連線';
    if (device.rssi == null) return '未知';
    if (device.rssi >= -85) return '良好';
    if (device.rssi >= -100) return '偏弱';
    return '弱訊號';
  }

  function coordinateText(device: DeviceTelemetry | null) {
    if (!device || device.lat == null || device.lon == null) return '無定位資料';
    const alt = device.alt == null ? '' : ` / ${Math.round(device.alt)}m`;
    return `${device.lat.toFixed(6)}, ${device.lon.toFixed(6)}${alt}`;
  }

  function pushLog(msg: string) {
    logs = [msg, ...logs].slice(0, MAX_LOGS);
  }

  function applyTelemetry(dev: DeviceTelemetry) {
    if (current?.updatedAt != null && dev.updatedAt != null && dev.updatedAt < current.updatedAt) return;

    current = { ...current, ...dev };
    const t = dev.updatedAt ?? Date.now();
    timeSeries.push(t);
    trimTail(timeSeries);

    const prevHr = hrSeries.length ? hrSeries[hrSeries.length - 1] : NaN;
    const prevBat = batSeries.length ? batSeries[batSeries.length - 1] : NaN;
    const nextHr = dev.hr != null ? dev.hr : prevHr;
    const nextBat = dev.battery != null ? dev.battery : prevBat;

    hrSeries.push(nextHr);
    batSeries.push(nextBat);

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
      pushLog(`[telemetry] ${fmtTime(target.updatedAt)} HR ${target.hr ?? '-'} / Bat ${target.battery ?? '-'} / SOS ${target.sos ? 'ON' : 'OFF'}`);
      return;
    }

    if (evt.type === 'online' && evt.deviceId === data.deviceId) {
      applyTelemetry({
        deviceId: evt.deviceId,
        online: evt.online,
        battery: current?.battery ?? 0,
        updatedAt: evt.updatedAt
      });
      pushLog(`[online] ${fmtTime(evt.updatedAt)} ${evt.online ? 'Online' : 'Offline'}`);
    }
  }

  onMount(() => {
    let disposed = false;
    const disconnect = connectSse(
      `/api/stream?deviceId=${encodeURIComponent(data.deviceId)}`,
      (evt) => {
        if (!disposed) handleEvent(evt);
      },
      (status) => {
        if (!disposed) sseStatus = status;
      }
    );

    return () => {
      disposed = true;
      disconnect?.();
    };
  });

  $: abnormalities = physiologicalAbnormalities(current);
  $: sparkW = Math.max(280, (chartW || 0) - 28);
  $: lastUpdateText = current ? fmtTime(current.updatedAt) : '尚無資料';
</script>

<svelte:head>
  <title>{displayTitle(current ?? data.device)} | MountainLink 裝置詳情</title>
</svelte:head>

<section class="deviceDetailPage">
  <header class="deviceHeader">
    <div class="identityBlock">
      <p class="eyebrow">Device Detail</p>
      <h1>{displayTitle(current ?? data.device)}</h1>
      <div class="identityMeta">
        <span>{data.deviceId}</span>
        <span>{unitOf(current ?? data.device)}</span>
        <span>更新 {lastUpdateText}</span>
      </div>
    </div>
    <div class="headerActions">
      <a href="/devices">裝置列表</a>
      <a href="/dashboard">回監控中心</a>
      {#if data.user?.is_admin}
        <a href={`/devices/${encodeURIComponent(data.deviceId)}/unit`}>調整單位</a>
      {/if}
    </div>
  </header>

  <main class="detailGrid">
    <section class="panel mapPanel">
      <div class="panelHeader">
        <div>
          <h2>位置地圖</h2>
          <p>鎖定裝置位置與地形視角</p>
        </div>
        <span>Zoom 16</span>
      </div>
      {#if current || data.device}
        <div class="mapFrame">
          <DeviceMap2D device={(current ?? data.device) as any} height="100%" zoom={16} lockView={true} showTerrain={true} />
        </div>
      {:else}
        <p class="empty">尚未取得裝置定位資料。</p>
      {/if}
      <div class="locationBar">
        <b>座標</b>
        <span>{coordinateText(current)}</span>
      </div>
    </section>

    <aside class="panel telemetryPanel">
      <div class="panelHeader">
        <div>
          <h2>即時狀態</h2>
          <p>生命徵象、通訊與裝置資料</p>
        </div>
        <span class={`livePill ${sseStatus}`}>{sseStatus === 'open' ? 'Live' : sseStatus === 'error' ? 'Retry' : 'Wait'}</span>
      </div>

      {#if current}
        <div class="compactStatusGrid" aria-label="裝置狀態摘要">
          <div class={`statusMetric ${deviceStatusClass(current)}`}>
            <span>狀態</span>
            <strong>{deviceStatusLabel(current)}</strong>
            <small>{current.online ? 'Online' : 'Offline'}</small>
          </div>
          <div class={`statusMetric ${(current.battery ?? 0) <= 20 ? 'warn' : 'ok'}`}>
            <span>電量</span>
            <strong>{current.battery ?? '—'}%</strong>
            <small>{current.charging ? '充電中' : '一般供電'}</small>
          </div>
          <div class={`statusMetric ${abnormalities.some((item) => item.includes('心率')) ? 'danger' : 'ok'}`}>
            <span>心率</span>
            <strong>{current.hr ?? '—'} <small>bpm</small></strong>
            <small>即時生命徵象</small>
          </div>
          <div class="statusMetric signal">
            <span>訊號</span>
            <strong>{signalLabel(current)}</strong>
            <small>RSSI {current.rssi ?? '—'} / SNR {current.snr ?? '—'}</small>
          </div>
        </div>

        <div class="vitalGrid">
          <div>
            <span>血氧</span>
            <strong>{current.spo2 ?? '—'}%</strong>
          </div>
          <div>
            <span>血壓</span>
            <strong>{current.bpHi ?? '—'} / {current.bpLo ?? '—'}</strong>
          </div>
          <div>
            <span>體溫</span>
            <strong>{current.bt ?? '—'}°C</strong>
          </div>
          <div>
            <span>海拔</span>
            <strong>{current.alt ?? '—'}m</strong>
          </div>
          <div>
            <span>封包</span>
            <strong>{current.packetId ?? '—'}</strong>
          </div>
          <div>
            <span>頻道</span>
            <strong>{current.channel ?? '—'}</strong>
          </div>
        </div>

        <div class="detailList">
          <div><span>Sender</span><b>{current.sender ?? '—'}</b></div>
          <div><span>Hop</span><b>{current.hopsAway ?? '—'} / {current.hopStart ?? '—'}</b></div>
          <div><span>最後更新</span><b>{fmtTime(current.updatedAt)}</b></div>
        </div>

        {#if abnormalities.length}
          <div class="riskBox">
            <b>生理警示</b>
            <p>{abnormalities.join('、')}</p>
          </div>
        {:else}
          <div class="okBox">
            <b>生理狀態</b>
            <p>目前未偵測到 HR、SpO2、體溫或收縮壓異常。</p>
          </div>
        {/if}
      {:else}
        <p class="empty">尚未收到此裝置的即時資料。</p>
      {/if}
    </aside>

    <section class="panel chartPanel" bind:clientWidth={chartW}>
      <div class="panelHeader">
        <div>
          <h2>生命跡象趨勢</h2>
          <p>近 {MAX_POINTS} 點資料，保留最近回報值</p>
        </div>
        <span>Live Trend</span>
      </div>
      {#if current}
        <div class="chartBlock">
          <div class="chartHeader">
            <strong>心率</strong>
            <span>{current.hr ?? '—'} bpm</span>
          </div>
          <Sparkline
            values={hrSeries}
            times={timeSeries}
            width={sparkW}
            height={112}
            min={40}
            max={180}
            tickEverySeconds={10}
            bands={[
              { from: 50, to: 60, color: '#22c55e', opacity: 0.12, label: '偏低' },
              { from: 60, to: 120, color: '#eab308', opacity: 0.12, label: '正常' },
              { from: 120, to: 160, color: '#ef4444', opacity: 0.12, label: '偏高' }
            ]}
          />
        </div>
        <div class="chartBlock">
          <div class="chartHeader">
            <strong>電量</strong>
            <span>{current.battery ?? '—'}%</span>
          </div>
          <Sparkline values={batSeries} times={timeSeries} width={sparkW} height={100} min={0} max={100} tickEverySeconds={10} />
        </div>
      {:else}
        <p class="empty">尚未收到圖表資料。</p>
      {/if}
    </section>

    <section class="panel logPanel">
      <div class="panelHeader">
        <div>
          <h2>即時事件</h2>
          <p>最新 {MAX_LOGS} 筆 SSE 訊息</p>
        </div>
        <span>SSE</span>
      </div>
      {#if logs.length === 0}
        <p class="empty">尚無事件。</p>
      {:else}
        <ul class="logs">
          {#each logs as line}
            <li><code>{line}</code></li>
          {/each}
        </ul>
      {/if}
    </section>
  </main>
</section>

<style>
  .deviceDetailPage{
    --bg: #020617;
    --panel: #081318;
    --panel-2: #0d1d24;
    --line: rgba(148, 163, 184, 0.18);
    --text: #f8fafc;
    --muted: #9fb0b8;
    --green: #10b981;
    --blue: #60a5fa;
    --amber: #f59e0b;
    --red: #ef4444;
    min-height: calc(100vh - 120px);
    border-radius: 18px;
    padding: 22px;
    background:
      radial-gradient(900px 280px at 8% -20%, rgba(16, 185, 129, 0.13), transparent 60%),
      radial-gradient(700px 260px at 100% 0%, rgba(96, 165, 250, 0.1), transparent 55%),
      var(--bg);
    color: var(--text);
    font-family: "Fira Sans", "Noto Sans TC", sans-serif;
  }

  .deviceHeader{
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px;
    align-items: start;
    margin-bottom: 14px;
  }

  .eyebrow{
    margin: 0 0 4px;
    color: var(--green);
    font-family: "Fira Code", monospace;
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p{
    margin: 0;
  }

  h1{
    overflow-wrap: anywhere;
    font-size: 30px;
    line-height: 1.1;
    letter-spacing: 0;
  }

  .identityMeta,
  .headerActions{
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .identityMeta span,
  .headerActions a,
  .panelHeader > span,
  .livePill{
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--muted);
    font-family: "Fira Code", monospace;
    font-size: 12px;
    text-decoration: none;
  }

  .headerActions{
    align-items: center;
    align-self: start;
    justify-content: flex-end;
    margin-top: 0;
  }

  .headerActions a{
    color: var(--text);
    cursor: pointer;
    transition: border-color 180ms ease, background 180ms ease;
  }

  .headerActions a:hover,
  .headerActions a:focus-visible{
    border-color: rgba(96, 165, 250, 0.5);
    background: rgba(96, 165, 250, 0.1);
    outline: none;
  }

  .detailGrid{
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.75fr);
    gap: 12px;
    align-items: stretch;
  }

  .panel{
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px;
    background: rgba(8, 19, 24, 0.94);
  }

  .panelHeader{
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }

  .panelHeader h2{
    font-size: 20px;
    line-height: 1.2;
  }

  .panelHeader p{
    margin-top: 4px;
    color: var(--muted);
    font-size: 13px;
  }

  .livePill.open{
    border-color: rgba(16, 185, 129, 0.46);
    color: #a7f3d0;
    background: rgba(16, 185, 129, 0.09);
  }

  .livePill.error{
    border-color: rgba(239, 68, 68, 0.4);
    color: #fecaca;
  }

  .mapFrame{
    flex: 1 1 auto;
    min-height: 420px;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    background: #111827;
  }

  .mapPanel{
    display: flex;
    flex-direction: column;
  }

  .locationBar{
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    margin-top: 10px;
    border: 1px solid rgba(96, 165, 250, 0.16);
    border-radius: 8px;
    padding: 9px 10px;
    background: rgba(96, 165, 250, 0.06);
  }

  .locationBar span{
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-family: "Fira Code", monospace;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vitalGrid{
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .compactStatusGrid{
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }

  .statusMetric{
    min-width: 0;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-left: 3px solid var(--blue);
    border-radius: 8px;
    padding: 9px 10px;
    background: rgba(255, 255, 255, 0.04);
  }

  .statusMetric.ok{
    border-left-color: var(--green);
  }

  .statusMetric.danger{
    border-left-color: var(--red);
    background: rgba(127, 29, 29, 0.2);
  }

  .statusMetric.risk{
    border-left-color: #a78bfa;
  }

  .statusMetric.warn{
    border-left-color: var(--amber);
  }

  .statusMetric.offline,
  .statusMetric.idle{
    border-left-color: #64748b;
  }

  .statusMetric > span,
  .statusMetric > small{
    display: block;
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .statusMetric > strong{
    display: block;
    min-width: 0;
    overflow: hidden;
    margin: 3px 0;
    font-family: "Fira Code", monospace;
    font-size: 18px;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .statusMetric > strong small{
    color: var(--muted);
    font-size: 10px;
    font-weight: 500;
  }

  .vitalGrid div,
  .detailList div,
  .riskBox,
  .okBox{
    min-width: 0;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 8px;
    padding: 9px;
    background: rgba(255, 255, 255, 0.04);
  }

  .vitalGrid span,
  .detailList span{
    display: block;
    color: var(--muted);
    font-size: 12px;
  }

  .vitalGrid strong{
    display: block;
    margin-top: 4px;
    overflow: hidden;
    font-family: "Fira Code", monospace;
    font-size: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detailList{
    display: grid;
    gap: 8px;
    margin-top: 10px;
  }

  .detailList div{
    display: grid;
    grid-template-columns: 86px minmax(0, 1fr);
    gap: 8px;
  }

  .detailList b{
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .riskBox,
  .okBox{
    margin-top: 10px;
  }

  .riskBox{
    border-color: rgba(239, 68, 68, 0.32);
    background: rgba(127, 29, 29, 0.2);
  }

  .okBox{
    border-color: rgba(16, 185, 129, 0.24);
    background: rgba(16, 185, 129, 0.06);
  }

  .riskBox b,
  .okBox b{
    display: block;
    margin-bottom: 5px;
  }

  .riskBox p,
  .okBox p{
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }

  .chartPanel{
    grid-column: 1 / 2;
  }

  .logPanel{
    grid-column: 2 / 3;
  }

  .chartBlock{
    min-width: 0;
    display: grid;
    gap: 6px;
    margin-top: 10px;
  }

  .chartBlock + .chartBlock{
    border-top: 1px solid rgba(148, 163, 184, 0.12);
    padding-top: 12px;
  }

  .chartHeader{
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: var(--muted);
    font-size: 13px;
  }

  .chartHeader strong{
    color: var(--text);
  }

  .logs{
    display: grid;
    max-height: 312px;
    margin: 0;
    padding: 0;
    overflow: auto;
    gap: 7px;
    list-style: none;
  }

  .logs li{
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 8px;
    padding: 8px 9px;
    background: rgba(255, 255, 255, 0.04);
  }

  .logs code{
    display: block;
    color: #d7efed;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    font-size: 12px;
  }

  .empty{
    border: 1px dashed var(--line);
    border-radius: 8px;
    padding: 12px;
    color: var(--muted);
    font-size: 13px;
  }

  @media (max-width: 1180px){
    .detailGrid{
      grid-template-columns: 1fr;
    }

    .chartPanel,
    .logPanel{
      grid-column: auto;
    }

  }

  @media (max-width: 760px){
    .deviceDetailPage{
      border-radius: 0;
      padding: 16px;
    }

    .deviceHeader{
      grid-template-columns: 1fr;
    }

    .headerActions{
      justify-content: flex-start;
    }

    .vitalGrid{
      grid-template-columns: 1fr;
    }
  }
</style>
