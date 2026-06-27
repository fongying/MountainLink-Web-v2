<script lang="ts">
  import type { DeviceTelemetry } from '$lib/types';

  export let device: DeviceTelemetry;
  export let showNavigate = true;

  export let onNavigate: ((deviceId: string) => void) | undefined = undefined;
  export let onClose: (() => void) | undefined = undefined;

  function coordText(d: DeviceTelemetry) {
    const lat = typeof d.lat === 'number' ? d.lat : Number(d.lat);
    const lon = typeof d.lon === 'number' ? d.lon : Number(d.lon);
    const ok = Number.isFinite(lat) && Number.isFinite(lon);
    if (!ok) return '—';
    const alt = typeof d.alt === 'number' ? d.alt : Number(d.alt);
    const altTxt = Number.isFinite(alt) ? ` (alt ${alt.toFixed(1)}m)` : '';
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}${altTxt}`;
  }

  function updatedText(d: DeviceTelemetry) {
    const t = typeof d.updatedAt === 'number' ? d.updatedAt : Number(d.updatedAt);
    if (!Number.isFinite(t)) return '—';
    return new Date(t).toLocaleString();
  }

  $: unitText = (device as { unit?: string }).unit ?? '登山者';
  $: displayTitle = device.displayName?.trim() || device.deviceId;
  $: deviceIdText = device.displayName?.trim() ? device.deviceId : '';
  const UNIT_COLORS: Record<string, string> = {
    '登山者': '#16a34a',
    '待救者': '#dc2626',
    '特種搜救隊(NFA SSRT)': '#1d4ed8',
    '警消': '#f97316',
    '志工': '#7c3aed'
  };
  const UNIT_SHAPES: Record<string, string> = {
    '登山者': 'dot',
    '待救者': 'tri',
    '特種搜救隊(NFA SSRT)': 'hex',
    '警消': 'dia',
    '志工': 'sq'
  };
  $: unitColor = UNIT_COLORS[unitText] ?? '#16a34a';
  $: unitShape = UNIT_SHAPES[unitText] ?? 'dot';
  $: sosText = device.sos ? 'SOS 觸發中' : '狀態正常';
  $: hrText = device.hr != null ? `${device.hr} bpm` : '—';
  $: batText = device.battery != null ? `${device.battery}%${device.charging ? '（充電中）' : ''}` : '—';
  $: spo2Text = device.spo2 != null ? `${device.spo2}%` : '—';
  $: bpText = device.bpHi != null && device.bpLo != null ? `${device.bpHi}/${device.bpLo}` : '—';
  $: btText = device.bt != null ? `${device.bt}°C` : '—';
</script>

<div class="card">
  {#if onClose}
    <button class="closeButton" type="button" aria-label="關閉裝置資訊" on:click={onClose}>×</button>
  {/if}
  <div class="body">
    <div class="header">
      <div>
        <div class="title">{displayTitle}</div>
        {#if deviceIdText}
          <div class="deviceId">{deviceIdText}</div>
        {/if}
      </div>
    </div>

    <div class="badgeRow">
      <div class="unitBadge">
        <span class={`unitIcon shape-${unitShape}`} style={`--unit-color:${unitColor};`}></span>
        <span>{unitText}</span>
      </div>
      <div class:activeSos={device.sos} class="statusBadge">{sosText}</div>
    </div>

    <div class="grid">
      <div class="wide"><b>座標</b><span>{coordText(device)}</span></div>
      <div><b>心率</b><span>{hrText}</span></div>
      <div><b>血氧</b><span>{spo2Text}</span></div>
      <div><b>血壓</b><span>{bpText}</span></div>
      <div><b>體溫</b><span>{btText}</span></div>
      <div><b>電量</b><span>{batText}</span></div>
      <div><b>狀態</b><span>{device.online ? 'Online' : 'Offline'}</span></div>
    </div>

    <div class="updatedLine">最後更新 {updatedText(device)}</div>

    {#if showNavigate}
      <button class="cta" on:click={() => onNavigate?.(device.deviceId)}>
        查看裝置詳情
      </button>
    {/if}
  </div>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');

  .card{
    position: relative;
    width: 292px;
    max-width: calc(100vw - 48px);
    border-radius: 10px;
    border: 1px solid rgba(96, 165, 250, 0.42);
    background: #07151b;
    color: #edf7fb;
    overflow: hidden;
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.38);
  }

  .body{ padding: 10px 12px 11px; }

  .closeButton{
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(148, 197, 253, 0.32);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.82);
    color: #dff5ff;
    cursor: pointer;
    font-size: 22px;
    line-height: 1;
  }

  .closeButton:hover,
  .closeButton:focus-visible{
    border-color: rgba(148, 197, 253, 0.72);
    background: rgba(30, 64, 175, 0.6);
    outline: none;
  }

  .header{
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding-right: 34px;
    min-height: 30px;
    align-items: start;
  }

  .title{
    font-weight: 800;
    font-size: 15px;
    line-height: 1.25;
    margin: 0 0 5px 0;
    color: #f8fafc;
  }

  .deviceId{
    margin: 0 0 8px 0;
    font-size: 12px;
    color: #93a4ad;
  }

  .badgeRow{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  .unitBadge,
  .statusBadge{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: #dff8ff;
    background: rgba(96, 165, 250, 0.12);
    border: 1px solid rgba(96, 165, 250, 0.22);
  }

  .statusBadge{
    color: #bbf7d0;
    background: rgba(34, 197, 94, 0.12);
    border-color: rgba(74, 222, 128, 0.26);
  }

  .statusBadge.activeSos{
    color: #fecaca;
    background: rgba(220, 38, 38, 0.14);
    border-color: rgba(248, 113, 113, 0.32);
  }

  .unitIcon{
    --unit-color: #16a34a;
    width: 10px;
    height: 10px;
    display: inline-block;
    background: var(--unit-color);
    border: 2px solid #edf7fb;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }

  .shape-dot{ border-radius: 50%; }
  .shape-tri{
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 10px solid var(--unit-color);
    background: transparent;
    border-radius: 0;
    border-top: 0;
    box-shadow: none;
  }
  .shape-hex{
    width: 12px;
    height: 10px;
    background: var(--unit-color);
    clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
    border: none;
  }
  .shape-dia{
    width: 10px;
    height: 10px;
    background: var(--unit-color);
    transform: rotate(45deg);
    border-radius: 2px;
    border: none;
  }
  .shape-sq{
    width: 10px;
    height: 10px;
    background: var(--unit-color);
    border-radius: 2px;
    border: none;
  }

  .grid{
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    font-size: 12px;
    color: #d7e8ee;
  }

  .grid > div{
    min-width: 0;
    display: grid;
    gap: 2px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 7px;
    padding: 5px 7px 4px;
    background: rgba(255, 255, 255, 0.035);
  }

  .grid .wide{
    grid-column: 1 / -1;
  }

  .grid b{
    color: #91c9f7;
    font-weight: 700;
    font-size: 11px;
  }

  .grid span{
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.3;
  }

  .updatedLine{
    margin-top: 6px;
    color: #9eb0b8;
    font-size: 11px;
    line-height: 1.2;
  }

  .cta{
    margin-top: 7px;
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid rgba(96, 165, 250, 0.32);
    cursor: pointer;
    background: rgba(96, 165, 250, 0.12);
    color: #edf7fb;
    font-weight: 700;
    font-size: 12px;
  }

  .cta:hover,
  .cta:focus-visible{
    border-color: rgba(96, 165, 250, 0.62);
    background: rgba(96, 165, 250, 0.2);
    outline: none;
  }
</style>
