<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeviceTelemetry, MLinkSseEvent } from '$lib/types';
  import { connectSse } from '$lib/client/sse';

  export let data: {
    user: { id: number; username: string; is_admin: number };
    devices: DeviceTelemetry[];
  };

  type FilterMode = 'all' | 'online' | 'sos' | 'risk' | 'offline';

  let devices: DeviceTelemetry[] = data.devices;
  let filter: FilterMode = 'all';
  let query = '';
  let sseStatus: 'open' | 'error' | 'connecting' = 'connecting';

  const fmtTime = (ms: number) => new Date(ms).toLocaleString();
  const titleOf = (device: DeviceTelemetry) => device.displayName?.trim() || device.deviceId;
  const unitOf = (device: DeviceTelemetry) => device.unit?.trim() || '未分類';
  const batteryText = (device: DeviceTelemetry) => `${device.battery ?? 0}%${device.charging ? ' 充電中' : ''}`;
  const coordinateText = (device: DeviceTelemetry) => {
    if (device.lat == null || device.lon == null) return '無定位';
    const alt = device.alt == null ? '' : ` / ${Math.round(device.alt)}m`;
    return `${device.lat.toFixed(5)}, ${device.lon.toFixed(5)}${alt}`;
  };

  function physiologicalAbnormalities(device: DeviceTelemetry) {
    const items: string[] = [];
    if (device.hr != null && (device.hr > 150 || device.hr < 50)) items.push(`HR ${device.hr}`);
    if (device.spo2 != null && device.spo2 < 90) items.push(`SpO2 ${device.spo2}%`);
    if (device.bt != null && (device.bt > 41 || device.bt < 32)) items.push(`BT ${device.bt}°C`);
    if (device.bpHi != null && (device.bpHi > 200 || device.bpHi < 90)) items.push(`SBP ${device.bpHi}`);
    return items;
  }

  function statusLabel(device: DeviceTelemetry) {
    if (device.sos) return 'SOS';
    if (!device.online) return '離線';
    if (physiologicalAbnormalities(device).length > 0) return '生理異常';
    if ((device.battery ?? 0) <= 20) return '低電量';
    return '正常';
  }

  function statusClass(device: DeviceTelemetry) {
    if (device.sos) return 'danger';
    if (!device.online) return 'offline';
    if (physiologicalAbnormalities(device).length > 0) return 'risk';
    if ((device.battery ?? 0) <= 20) return 'warn';
    return 'ok';
  }

  function matchesFilter(device: DeviceTelemetry) {
    if (filter === 'online') return device.online;
    if (filter === 'sos') return Boolean(device.sos);
    if (filter === 'risk') return physiologicalAbnormalities(device).length > 0 || (device.battery ?? 0) <= 20;
    if (filter === 'offline') return !device.online;
    return true;
  }

  function matchesQuery(device: DeviceTelemetry) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return [device.deviceId, device.displayName, device.unit, device.sender]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized));
  }

  function applyTelemetry(next: DeviceTelemetry[]) {
    const map = new Map(devices.map((device) => [device.deviceId, device]));
    for (const device of next) {
      const previous = map.get(device.deviceId);
      if (previous?.updatedAt != null && device.updatedAt != null && device.updatedAt < previous.updatedAt) continue;
      map.set(device.deviceId, { ...previous, ...device });
    }
    devices = Array.from(map.values()).sort((a, b) => a.deviceId.localeCompare(b.deviceId));
  }

  function handleEvent(evt: MLinkSseEvent) {
    if (evt.type === 'telemetry') {
      applyTelemetry(evt.devices);
      return;
    }

    if (evt.type === 'online') {
      applyTelemetry([
        {
          deviceId: evt.deviceId,
          online: evt.online,
          battery: devices.find((device) => device.deviceId === evt.deviceId)?.battery ?? 0,
          updatedAt: evt.updatedAt
        }
      ]);
    }
  }

  onMount(() => {
    let disposed = false;
    const disconnect = connectSse(
      '/api/stream',
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

  $: onlineCount = devices.filter((device) => device.online).length;
  $: sosCount = devices.filter((device) => device.sos).length;
  $: riskCount = devices.filter((device) => physiologicalAbnormalities(device).length > 0 || (device.battery ?? 0) <= 20).length;
  $: offlineCount = devices.filter((device) => !device.online).length;
  $: filteredDevices = devices.filter((device) => matchesFilter(device) && matchesQuery(device));
  $: latestUpdate = devices.reduce((latest, device) => Math.max(latest, device.updatedAt ?? 0), 0);
</script>

<svelte:head>
  <title>MountainLink 裝置列表</title>
</svelte:head>

<section class="deviceListPage">
  <header class="pageHeader">
    <div>
      <p class="eyebrow">Device Registry</p>
      <h1>裝置列表</h1>
      <p>集中檢視 Meshtastic 裝置、隊伍單位、生命徵象、定位與連線狀態。</p>
    </div>
    <div class="headerStatus">
      <span class={`conn ${sseStatus}`}>即時連線 {sseStatus === 'open' ? '正常' : sseStatus === 'error' ? '異常' : '連線中'}</span>
      <span>更新 {latestUpdate ? fmtTime(latestUpdate) : '尚無資料'}</span>
      {#if data.user.is_admin}
        <a href="/register">新增帳號</a>
      {/if}
    </div>
  </header>

  <section class="summaryGrid" aria-label="裝置摘要">
    <button type="button" class:active={filter === 'all'} onclick={() => (filter = 'all')}>
      <span>全部</span>
      <strong>{devices.length}</strong>
      <small>裝置總數</small>
    </button>
    <button type="button" class:active={filter === 'online'} onclick={() => (filter = 'online')}>
      <span>在線</span>
      <strong>{onlineCount}</strong>
      <small>可接收資料</small>
    </button>
    <button type="button" class="danger" class:active={filter === 'sos'} onclick={() => (filter = 'sos')}>
      <span>SOS</span>
      <strong>{sosCount}</strong>
      <small>待救援</small>
    </button>
    <button type="button" class="warn" class:active={filter === 'risk'} onclick={() => (filter = 'risk')}>
      <span>風險</span>
      <strong>{riskCount}</strong>
      <small>生理或電量</small>
    </button>
    <button type="button" class="muted" class:active={filter === 'offline'} onclick={() => (filter = 'offline')}>
      <span>離線</span>
      <strong>{offlineCount}</strong>
      <small>待確認</small>
    </button>
  </section>

  <section class="listPanel">
    <div class="panelToolbar">
      <div>
        <h2>所有裝置</h2>
        <p>{filteredDevices.length} 筆符合條件</p>
      </div>
      <label class="searchBox">
        <span>搜尋</span>
        <input bind:value={query} placeholder="裝置 ID、隊伍、單位" />
      </label>
    </div>

    {#if filteredDevices.length === 0}
      <p class="empty">目前沒有符合條件的裝置。</p>
    {:else}
      <div class="deviceTable" role="table" aria-label="裝置列表">
        <div class="tableHead" role="row">
          <span>裝置</span>
          <span>狀態</span>
          <span>生命徵象</span>
          <span>電量 / 訊號</span>
          <span>定位</span>
          <span>更新</span>
        </div>
        {#each filteredDevices as device (device.deviceId)}
          {@const abnormalities = physiologicalAbnormalities(device)}
          <a class="deviceRow" href={`/devices/${encodeURIComponent(device.deviceId)}`} role="row">
            <span class="deviceIdentity">
              <strong>{titleOf(device)}</strong>
              <small>{device.deviceId}</small>
              <em>{unitOf(device)}</em>
            </span>
            <span>
              <b class={`statusPill ${statusClass(device)}`}>{statusLabel(device)}</b>
            </span>
            <span class="metricStack">
              <small>HR {device.hr ?? '—'} / SpO2 {device.spo2 ?? '—'}%</small>
              <small>BP {device.bpHi ?? '—'} / {device.bpLo ?? '—'} / BT {device.bt ?? '—'}°C</small>
              {#if abnormalities.length}
                <em>{abnormalities.join('、')}</em>
              {/if}
            </span>
            <span class="metricStack">
              <small>{batteryText(device)}</small>
              <small>RSSI {device.rssi ?? '—'} / SNR {device.snr ?? '—'}</small>
            </span>
            <span class="coord">{coordinateText(device)}</span>
            <span class="updated">{fmtTime(device.updatedAt)}</span>
          </a>
        {/each}
      </div>
    {/if}
  </section>
</section>

<style>
  .deviceListPage{
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

  .pageHeader{
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: flex-start;
    margin-bottom: 18px;
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
    font-size: 30px;
    line-height: 1.1;
    letter-spacing: 0;
  }

  .pageHeader p,
  .panelToolbar p{
    margin-top: 6px;
    color: var(--muted);
    font-size: 13px;
  }

  .headerStatus{
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
    color: var(--muted);
    font-family: "Fira Code", monospace;
    font-size: 12px;
  }

  .headerStatus span,
  .headerStatus a{
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    text-decoration: none;
  }

  .conn.open{
    border-color: rgba(16, 185, 129, 0.46);
    color: #a7f3d0;
    background: rgba(16, 185, 129, 0.09);
  }

  .conn.error{
    border-color: rgba(239, 68, 68, 0.4);
    color: #fecaca;
  }

  .summaryGrid{
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }

  .summaryGrid button{
    min-width: 0;
    border: 1px solid var(--line);
    border-left: 3px solid var(--blue);
    border-radius: 8px;
    padding: 12px 14px;
    background: rgba(8, 19, 24, 0.92);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    transition: border-color 180ms ease, background 180ms ease;
  }

  .summaryGrid button:hover,
  .summaryGrid button:focus-visible,
  .summaryGrid button.active{
    border-color: rgba(96, 165, 250, 0.62);
    background: rgba(14, 48, 68, 0.7);
    outline: none;
  }

  .summaryGrid .danger{
    border-left-color: var(--red);
  }

  .summaryGrid .warn{
    border-left-color: var(--amber);
  }

  .summaryGrid .muted{
    border-left-color: #64748b;
  }

  .summaryGrid span,
  .summaryGrid small{
    display: block;
    color: var(--muted);
    font-size: 12px;
  }

  .summaryGrid strong{
    display: block;
    margin: 4px 0;
    font-family: "Fira Code", monospace;
    font-size: 30px;
    line-height: 1;
  }

  .listPanel{
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px;
    background: rgba(8, 19, 24, 0.94);
  }

  .panelToolbar{
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 12px;
  }

  .searchBox{
    display: grid;
    gap: 5px;
    min-width: min(320px, 100%);
    color: var(--muted);
    font-size: 12px;
  }

  .searchBox input{
    min-height: 36px;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0 11px;
    background: rgba(15, 23, 42, 0.72);
    color: var(--text);
    font: inherit;
  }

  .searchBox input:focus{
    border-color: rgba(96, 165, 250, 0.6);
    outline: none;
  }

  .deviceTable{
    display: grid;
    gap: 7px;
  }

  .tableHead,
  .deviceRow{
    display: grid;
    grid-template-columns: minmax(190px, 1.3fr) 100px minmax(210px, 1.4fr) minmax(150px, 1fr) minmax(170px, 1.1fr) 150px;
    gap: 10px;
    align-items: center;
  }

  .tableHead{
    padding: 0 10px 4px;
    color: var(--muted);
    font-family: "Fira Code", monospace;
    font-size: 11px;
  }

  .deviceRow{
    min-width: 0;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 8px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    text-decoration: none;
    transition: border-color 180ms ease, background 180ms ease;
  }

  .deviceRow:hover,
  .deviceRow:focus-visible{
    border-color: rgba(96, 165, 250, 0.48);
    background: rgba(96, 165, 250, 0.08);
    outline: none;
  }

  .deviceIdentity,
  .metricStack{
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .deviceIdentity strong,
  .deviceIdentity small,
  .deviceIdentity em,
  .metricStack small,
  .metricStack em,
  .coord,
  .updated{
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .deviceIdentity strong{
    font-size: 14px;
  }

  .deviceIdentity small,
  .metricStack small,
  .coord,
  .updated{
    color: var(--muted);
    font-size: 12px;
  }

  .deviceIdentity em,
  .metricStack em{
    color: #bfdbfe;
    font-size: 11px;
    font-style: normal;
  }

  .statusPill{
    display: inline-flex;
    justify-content: center;
    min-width: 60px;
    border-radius: 999px;
    padding: 4px 8px;
    background: rgba(148, 163, 184, 0.11);
    color: #cbd5e1;
    font-size: 12px;
  }

  .statusPill.ok{
    background: rgba(16, 185, 129, 0.12);
    color: #a7f3d0;
  }

  .statusPill.danger{
    background: rgba(239, 68, 68, 0.16);
    color: #fecaca;
  }

  .statusPill.risk{
    background: rgba(167, 139, 250, 0.15);
    color: #ddd6fe;
  }

  .statusPill.warn{
    background: rgba(245, 158, 11, 0.14);
    color: #fde68a;
  }

  .statusPill.offline{
    background: rgba(100, 116, 139, 0.16);
    color: #cbd5e1;
  }

  .empty{
    border: 1px dashed var(--line);
    border-radius: 8px;
    padding: 14px;
    color: var(--muted);
  }

  @media (max-width: 1180px){
    .summaryGrid{
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .tableHead{
      display: none;
    }

    .deviceRow{
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
    }

    .deviceRow > span:nth-child(n + 3){
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 760px){
    .deviceListPage{
      border-radius: 0;
      padding: 16px;
    }

    .pageHeader,
    .panelToolbar{
      flex-direction: column;
      align-items: stretch;
    }

    .headerStatus{
      justify-content: flex-start;
    }

    .summaryGrid{
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
