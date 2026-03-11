<script lang="ts">
  import type { DeviceTelemetry } from '$lib/types';

  export let device: DeviceTelemetry;
  export let showNavigate = true;

  export let onNavigate: ((deviceId: string) => void) | undefined;

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
  $: sosText = device.sos ? '🚨 SOS 觸發中' : '狀態正常';
  $: sosColor = device.sos ? '#b00020' : '#166534';
  $: hrText = device.hr != null ? `${device.hr} bpm` : '—';
  $: batText = device.battery != null ? `${device.battery}%${device.charging ? '（充電中）' : ''}` : '—';
  $: spo2Text = device.spo2 != null ? `${device.spo2}%` : '—';
  $: bpText = device.bpHi != null && device.bpLo != null ? `${device.bpHi}/${device.bpLo}` : '—';
  $: btText = device.bt != null ? `${device.bt}°C` : '—';
</script>

<div class="card">
  <div class="body">
    <div class="title">{displayTitle}</div>
    {#if deviceIdText}
      <div class="deviceId">{deviceIdText}</div>
    {/if}

    <div class="unitBadge">
      <span class={`unitIcon shape-${unitShape}`} style={`--unit-color:${unitColor};`}></span>
      <span>{unitText}</span>
    </div>

    <div class="grid">
      <div><b>單位：</b>{unitText}</div>
      <div><b>座標：</b>{coordText(device)}</div>
      <div><b>心率：</b>{hrText}</div>
      <div><b>電量：</b>{batText}</div>
      <div><b>血氧：</b>{spo2Text}</div>
      <div><b>血壓：</b>{bpText}</div>
      <div><b>體溫：</b>{btText}</div>
      <div><b>狀態：</b>{device.online ? 'Online' : 'Offline'}</div>
      <div class="sos" style={`color: ${sosColor};`}>{sosText}</div>
      <div class="muted"><b>最後更新：</b>{updatedText(device)}</div>
    </div>

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
    width: 260px;
    border-radius: 14px;
    border: 1px solid #ddd;
    background: #fff;
    overflow: hidden;
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
  }

  .body{ padding: 12px 12px 8px; }

  .title{
    font-weight: 800;
    font-size: 15px;
    margin-bottom: 6px;
  }

  .deviceId{
    margin: -2px 0 8px;
    font-size: 12px;
    color: #667578;
  }

  .unitBadge{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: #0b1b1e;
    background: rgba(12, 40, 46, 0.06);
    margin-bottom: 8px;
  }

  .unitIcon{
    --unit-color: #16a34a;
    width: 10px;
    height: 10px;
    display: inline-block;
    background: var(--unit-color);
    border: 2px solid #fff;
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
    gap: 6px;
    font-size: 12.5px;
  }

  .sos{ font-weight: 800; }

  .muted{ color: #666; }

  .cta{
    margin-top: 10px;
    width: 100%;
    padding: 9px 10px;
    border-radius: 12px;
    border: 1px solid #ddd;
    cursor: pointer;
    background: #fff;
    font-weight: 700;
  }
</style>
