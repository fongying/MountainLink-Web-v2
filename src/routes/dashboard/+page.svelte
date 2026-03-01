<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeviceTelemetry, MLinkSseEvent } from '$lib/types';
  import { connectSse } from '$lib/client/sse';
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

  const fmtTime = (ms: number) => new Date(ms).toLocaleString();
  const unitOf = (d: DeviceTelemetry) => d.sos ? '待救者' : (d as { unit?: string }).unit ?? '登山者';

  function onSelect(e: CustomEvent<{ deviceId: string }>) {
    goto(`/devices/${encodeURIComponent(e.detail.deviceId)}`);
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
    const disconnect = connectSse('/api/stream', handleEvent, (status) => (sseStatus = status));
    return () => disconnect();
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

  <WeatherAlertPanel />

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
              <p>電量：{d.battery}% {#if d.battery <= 15}<span class="warn">低電量</span>{/if}</p>
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
  }
</style>
