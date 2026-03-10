<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeviceTelemetry, MLinkSseEvent } from '$lib/types';
  import type { AlertItem } from '$lib/types/alerts';
  import GoogleMapView from '$lib/components/GoogleMapView.svelte';
  import GoogleMap3DView from '$lib/components/GoogleMap3DView.svelte';
  import WeatherAlertPanel from '$lib/components/WeatherAlertPanel.svelte';
  import { goto } from '$app/navigation';

  // 地圖模式
  let mode: '2d' | '3d' = '2d';
  let showContours = false;

  export let data: {
    user: { id: number; username: string; is_admin: number };
    devices: DeviceTelemetry[];
  };

  let devices: DeviceTelemetry[] = data.devices;
  let sseStatus: 'open' | 'error' | 'connecting' = 'connecting';
  let hazardItems: AlertItem[] = [];
  let hazardLoading = true;
  let hazardNotice = '';
  let testDispatchBusy = false;
  let toasts: EqToast[] = [];
  let hasHazardSnapshot = false;

  const TOAST_LIFETIME_MS = 15000;
  const MAX_TOASTS = 3;
  const EQ_SOUND_SOURCES = ['/sounds/eq-alert.mp3', '/sounds/eq-alert.ogg'];
  const seenEqAlertIds = new Set<string>();
  const seenEqAlertOrder: string[] = [];
  const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

  type HazardUpdatePayload = {
    generatedAt: string;
    items: AlertItem[];
    reason?: string;
    notice?: string;
  };

  type EqToast = {
    id: string;
    alertId: string;
    title: string;
    summary: string;
    meta: string;
    createdAt: number;
  };

  const fmtTime = (ms: number) => new Date(ms).toLocaleString();
  const unitOf = (d: DeviceTelemetry) => d.sos ? '待救者' : (d as { unit?: string }).unit ?? '登山者';
  const batteryText = (d: DeviceTelemetry) => d.charging ? `${d.battery}%（充電中）` : `${d.battery}%`;

  function severityText(level: AlertItem['severity']) {
    if (level === 'critical') return '高風險';
    if (level === 'warning') return '警示';
    if (level === 'watch') return '注意';
    return '資訊';
  }

  function fmtIsoTime(iso?: string) {
    if (!iso) return '';
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? fmtTime(ms) : '';
  }

  function rememberEqAlert(id: string) {
    if (seenEqAlertIds.has(id)) return;
    seenEqAlertIds.add(id);
    seenEqAlertOrder.push(id);

    if (seenEqAlertOrder.length > 300) {
      const removed = seenEqAlertOrder.shift();
      if (removed) seenEqAlertIds.delete(removed);
    }
  }

  function dismissToast(id: string) {
    const timer = toastTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.delete(id);
    }
    toasts = toasts.filter((toast) => toast.id !== id);
  }

  function pushEarthquakeToast(alert: AlertItem) {
    const id = `${alert.id}-${Date.now()}`;
    const toast: EqToast = {
      id,
      alertId: alert.id,
      title: alert.title || '地震快訊',
      summary: alert.summary || '',
      meta: [severityText(alert.severity), alert.region, fmtIsoTime(alert.eventAt ?? alert.issuedAt)].filter(Boolean).join(' · '),
      createdAt: Date.now()
    };

    toasts = [toast, ...toasts].slice(0, MAX_TOASTS);

    const activeIds = new Set(toasts.map((item) => item.id));
    for (const [toastId, timer] of toastTimers.entries()) {
      if (!activeIds.has(toastId)) {
        clearTimeout(timer);
        toastTimers.delete(toastId);
      }
    }

    const timer = setTimeout(() => {
      dismissToast(id);
    }, TOAST_LIFETIME_MS);

    toastTimers.set(id, timer);
  }

  async function playEarthquakeSound() {
    for (const src of EQ_SOUND_SOURCES) {
      try {
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.volume = 1;
        await audio.play();
        return;
      } catch {
        // Ignore autoplay blocks and try fallback source.
      }
    }
  }

  function onSelect(e: CustomEvent<{ deviceId: string }>) {
    goto(`/devices/${encodeURIComponent(e.detail.deviceId)}`);
  }

  async function triggerTestDispatch() {
    if (testDispatchBusy) return;
    testDispatchBusy = true;
    try {
      const res = await fetch('/api/alerts/test-dispatch', {
        method: 'POST'
      });
      const payload = await res.json().catch(() => ({}));
      hazardNotice = res.ok
        ? (payload.message as string) || '測試通報已送出。'
        : (payload.error as string) || '測試通報送出失敗。';
    } catch {
      hazardNotice = '測試通報送出失敗。';
    } finally {
      testDispatchBusy = false;
    }
  }

  function upsertDevices(next: DeviceTelemetry[]) {
    const map = new Map(devices.map((d) => [d.deviceId, d]));
    for (const nd of next) {
      const prev = map.get(nd.deviceId);

      // 避免亂序覆蓋
      if (prev && prev.updatedAt != null && nd.updatedAt != null && nd.updatedAt < prev.updatedAt) continue;

      map.set(nd.deviceId, { ...prev, ...nd });
    }
    devices = Array.from(map.values()).sort((a, b) => a.deviceId.localeCompare(b.deviceId));
  }

  function handleEvent(evt: MLinkSseEvent) {
    if (evt.type === 'telemetry') {
      upsertDevices(evt.devices);
      return;
    }
    if (evt.type === 'online') {
      upsertDevices([
        {
          deviceId: evt.deviceId,
          online: evt.online,
          battery: devices.find((d) => d.deviceId === evt.deviceId)?.battery ?? 0,
          updatedAt: evt.updatedAt
        }
      ]);
      return;
    }
  }

  onMount(() => {
    const es = new EventSource('/api/stream');

    es.onopen = () => {
      sseStatus = 'open';
    };

    es.onerror = () => {
      sseStatus = 'error';
    };

    const telemetryHandler = (e: MessageEvent) => {
      try {
        handleEvent(JSON.parse(e.data) as MLinkSseEvent);
      } catch {
        // ignore parse error
      }
    };

    const hazardHandler = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as HazardUpdatePayload;
        const nextItems = payload.items ?? [];
        const eqAlerts = nextItems.filter((item) => item.type === 'earthquake');

        if (!hasHazardSnapshot) {
          eqAlerts.forEach((item) => rememberEqAlert(item.id));
          hasHazardSnapshot = true;
        } else {
          const freshEqAlerts = eqAlerts.filter((item) => !seenEqAlertIds.has(item.id));
          if (freshEqAlerts.length > 0) {
            freshEqAlerts.forEach((item) => {
              rememberEqAlert(item.id);
              pushEarthquakeToast(item);
            });
            void playEarthquakeSound();
          }
        }

        hazardItems = nextItems;
        hazardNotice = payload.notice ?? '';
      } catch {
        hazardNotice = '災害資料解析失敗';
      } finally {
        hazardLoading = false;
      }
    };

    es.addEventListener('telemetry', telemetryHandler);
    es.addEventListener('online', telemetryHandler);
    es.addEventListener('hazard_update', hazardHandler);

    return () => {
      for (const timer of toastTimers.values()) {
        clearTimeout(timer);
      }
      toastTimers.clear();
      es.close();
    };
  });
</script>

<div class="dashboardPage">
  <header class="hero">
    <div class="heroLeft">
      <p class="eyebrow">Dashboard</p>
      <h1>總覽</h1>
      <p class="welcome">
        歡迎，<strong>{data.user.username}</strong>{data.user.is_admin ? '（Admin）' : ''}
      </p>
    </div>
    <div class="heroRight">
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
        <span class="chip chip-idle">裝置數：{devices.length}</span>
      </div>
      {#if data.user.is_admin}
        <a class="backLink" href="/register">新增裝置</a>
      {/if}
      <p class="heroTime">最後更新：{devices[0]?.updatedAt ? fmtTime(devices[0].updatedAt) : '—'}</p>
    </div>
  </header>

  <WeatherAlertPanel
    items={hazardItems}
    loading={hazardLoading}
    notice={hazardNotice}
    showTestButton={Boolean(data.user?.is_admin)}
    {testDispatchBusy}
    onTestDispatch={triggerTestDispatch}
  />

  <div class="toastStack" aria-live="assertive" aria-atomic="false">
    {#each toasts as toast (toast.id)}
      <article class="eqToast" role="alert">
        <div class="eqToastHead">
          <strong class="eqToastLabel">地震快訊</strong>
          <button class="eqToastClose" type="button" on:click={() => dismissToast(toast.id)} aria-label="關閉通知">
            ×
          </button>
        </div>
        <p class="eqToastTitle">{toast.title}</p>
        {#if toast.meta}
          <p class="eqToastMeta">{toast.meta}</p>
        {/if}
        {#if toast.summary}
          <p class="eqToastBody">{toast.summary}</p>
        {/if}
        <p class="eqToastTime">{fmtTime(toast.createdAt)}</p>
      </article>
    {/each}
  </div>

  <section class="card mapCard">
    <div class="cardHeader">
      <div>
        <h2>地圖總覽</h2>
        <p class="muted">即時顯示所有裝置位置</p>
      </div>
      <div class="controls">
        <div class="segmented" role="group" aria-label="Map mode">
          <button class={`seg ${mode === '2d' ? 'seg-active' : ''}`} on:click={() => (mode = '2d')} aria-pressed={mode === '2d'}>
            2D
          </button>
          <button class={`seg ${mode === '3d' ? 'seg-active' : ''}`} on:click={() => (mode = '3d')} aria-pressed={mode === '3d'}>
            3D
          </button>
        </div>
        {#if mode === '2d'}
          <label class="toggle">
            <input type="checkbox" bind:checked={showContours} />
            Terrain
          </label>
        {/if}
      </div>
    </div>
    <div class="legend">
      <span class="legendItem"><span class="markerDot dot-hiker"></span>登山者</span>
      <span class="legendItem"><span class="markerTri tri-sos"></span>待救者</span>
      <span class="legendItem"><span class="markerHex hex-ssrt"></span>特種搜救隊</span>
      <span class="legendItem"><span class="markerDia dia-police"></span>警消</span>
      <span class="legendItem"><span class="markerSq sq-vol"></span>志工</span>
    </div>

    <div class="mapFrame">
      {#if mode === '2d'}
        <GoogleMapView {devices} height={520} {showContours} on:select={onSelect} />
      {:else}
        <GoogleMap3DView {devices} height={520} on:select={onSelect} />
      {/if}
    </div>
  </section>

  <section class="card listCard">
    <div class="cardHeader">
      <div>
        <h2>裝置清單</h2>
        <p class="muted">點擊卡片查看裝置詳情</p>
      </div>
      <span class="cardTag">Live</span>
    </div>

    {#if devices.length === 0}
      <p class="empty">目前沒有可顯示的裝置</p>
    {:else}
      <div class="deviceGrid">
        {#each devices as d (d.deviceId)}
          <a class="deviceCard" href={`/devices/${encodeURIComponent(d.deviceId)}`}>
            <div class="deviceTop">
              <strong>{d.deviceId}</strong>
              <span class={`state ${d.online ? 'state-on' : 'state-off'}`}>
                {#if d.online}Online{:else}Offline{/if}
              </span>
            </div>

            {#if d.sos}
              <p class="sos">🚨 SOS 觸發中</p>
            {/if}

            <div class="deviceMeta">
              <p>單位：{unitOf(d)}</p>
              <p>電量：{batteryText(d)} {#if d.battery <= 15}<span class="warn">低電量</span>{/if}</p>
              <p>心率：{d.hr ?? '—'} bpm</p>
              <p>座標：{d.lat ?? '—'}, {d.lon ?? '—'} {#if d.alt != null}(alt {d.alt}m){/if}</p>
              <p>訊號：RSSI {d.rssi ?? '—'} / SNR {d.snr ?? '—'}</p>
            </div>
            <p class="updated">最後更新：{fmtTime(d.updatedAt)}</p>
          </a>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

  .dashboardPage{
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

  .dashboardPage::after{
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

  .dashboardPage > *{ position: relative; z-index: 1; }

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

  .welcome{
    margin: 0;
    font-size: 15px;
    color: var(--muted);
  }
  .welcome strong{ font-weight: 700; color: var(--ink); }

  .heroRight{
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    text-align: right;
  }

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
  .chip-idle{
    color: #4f5b5e;
    border-color: rgba(79, 91, 94, 0.2);
    background: rgba(79, 91, 94, 0.08);
  }

  .backLink{
    font-size: 13px;
    text-decoration: none;
    color: var(--ink);
    border: 1px solid var(--stroke);
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.7);
  }

  .heroTime{
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .toastStack{
    position: fixed;
    top: 16px;
    right: 16px;
    width: min(360px, calc(100vw - 24px));
    display: grid;
    gap: 10px;
    z-index: 60;
    pointer-events: none;
  }

  .eqToast{
    pointer-events: auto;
    border-radius: 12px;
    border: 1px solid rgba(176, 0, 32, 0.24);
    border-left: 4px solid #b00020;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 14px 30px rgba(12, 20, 22, 0.24);
    padding: 10px 12px;
    animation: toast-in 180ms ease-out;
  }

  .eqToastHead{
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }

  .eqToastLabel{
    font-size: 12px;
    letter-spacing: 0.08em;
    color: #8a1322;
  }

  .eqToastClose{
    border: none;
    background: transparent;
    color: #7f141f;
    cursor: pointer;
    line-height: 1;
    font-size: 18px;
    padding: 0;
  }

  .eqToastTitle{
    margin: 0;
    font-weight: 700;
    color: #1c2325;
  }

  .eqToastBody{
    margin: 4px 0 0;
    font-size: 13px;
    color: #354448;
    line-height: 1.45;
  }

  .eqToastMeta{
    margin: 4px 0 0;
    font-size: 12px;
    color: #6a7a7e;
  }

  .eqToastTime{
    margin: 6px 0 0;
    font-size: 11px;
    color: #607174;
  }

  @keyframes toast-in{
    from{
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
    }
    to{
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .card{
    min-width: 0;
    border: 1px solid var(--stroke);
    border-radius: 16px;
    padding: 16px;
    background: var(--card);
    box-shadow: var(--shadow);
    overflow: hidden;
    margin-top: 16px;
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

  .muted{ color: var(--muted); font-size: 13px; margin: 4px 0 0; }

  .controls{
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .legend{
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--muted);
  }

  .legendItem{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(12, 40, 46, 0.08);
  }

  .markerDot{
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
    background: #16a34a;
    border: 2px solid #fff;
  }

  .markerTri{
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 10px solid #dc2626;
    filter: drop-shadow(0 0 0 #fff);
  }

  .markerHex{
    width: 12px;
    height: 10px;
    background: #1d4ed8;
    position: relative;
    clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
    border: 2px solid #fff;
  }

  .markerDia{
    width: 10px;
    height: 10px;
    background: #f97316;
    transform: rotate(45deg);
    border: 2px solid #fff;
  }

  .markerSq{
    width: 10px;
    height: 10px;
    background: #7c3aed;
    border: 2px solid #fff;
    border-radius: 2px;
  }

  .segmented{
    display: inline-flex;
    border: 1px solid var(--stroke);
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.7);
  }
  .seg{
    border: none;
    background: transparent;
    padding: 6px 14px;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
    font-size: 12px;
    cursor: pointer;
    color: var(--muted);
  }
  .seg-active{
    background: #0f1a1c;
    color: #eef5f5;
  }

  .toggle{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
  }

  .mapFrame{
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(12, 40, 46, 0.12);
  }

  .cardTag{
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--stroke);
    color: var(--muted);
    background: rgba(255, 255, 255, 0.7);
  }

  .deviceGrid{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 14px;
  }

  .deviceCard{
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-radius: 14px;
    border: 1px solid rgba(12, 40, 46, 0.12);
    padding: 14px;
    text-decoration: none;
    color: inherit;
    background: rgba(255, 255, 255, 0.82);
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }
  .deviceCard:hover{
    transform: translateY(-3px);
    box-shadow: 0 18px 34px rgba(12, 20, 22, 0.16);
    border-color: rgba(24, 183, 164, 0.35);
  }

  .deviceTop{
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
  }

  .state{
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid transparent;
  }
  .state-on{
    color: #0b665d;
    border-color: rgba(24, 183, 164, 0.4);
    background: rgba(24, 183, 164, 0.12);
  }
  .state-off{
    color: #4f5b5e;
    border-color: rgba(79, 91, 94, 0.25);
    background: rgba(79, 91, 94, 0.08);
  }

  .deviceMeta p{
    margin: 0;
    font-size: 14px;
    color: #2b3a3c;
  }

  .updated{
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .sos{
    margin: 0;
    font-weight: 700;
    color: #b00020;
  }

  .warn{
    margin-left: 6px;
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 999px;
    color: #8a360e;
    background: rgba(255, 107, 74, 0.16);
  }

  .empty{
    margin: 0;
    padding: 12px;
    border-radius: 12px;
    background: rgba(12, 40, 46, 0.06);
    color: var(--muted);
  }

  @media (max-width: 900px){
    .hero{ flex-direction: column; align-items: flex-start; }
    .heroRight{ align-items: flex-start; text-align: left; }
    .chipRow{ justify-content: flex-start; }
  }

  @media (max-width: 640px){
    .dashboardPage{ padding: 18px 14px 32px; }
    .card{ padding: 14px; }
    .toastStack{
      top: 12px;
      right: 12px;
      width: calc(100vw - 24px);
    }
  }
</style>
