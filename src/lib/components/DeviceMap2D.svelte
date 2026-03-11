<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeviceTelemetry } from '$lib/types';
  import { importGmapsLibrary } from '$lib/client/gmaps';

  export let device: DeviceTelemetry | null = null;

  export let height = 320;
  export let zoom = 16;
  export let lockView = true;
  export let showTerrain = false;

  let mapEl: HTMLDivElement | null = null;
  let map: google.maps.Map | null = null;
  let marker: google.maps.Marker | null = null;

  function toNum(v: unknown): number | null {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function getLatLng(d: DeviceTelemetry | null): { lat: number; lng: number } | null {
    if (!d) return null;
    const lat = toNum(d.lat);
    const lng = toNum(d.lon);
    if (lat == null || lng == null) return null;
    return { lat, lng };
  }

  function unitOf(d: DeviceTelemetry) {
    return (d as { unit?: string }).unit ?? '登山者';
  }

  const UNIT_COLORS: Record<string, string> = {
    '登山者': '#16a34a',
    '待救者': '#dc2626',
    '特種搜救隊(NFA SSRT)': '#1d4ed8',
    '警消': '#f97316',
    '志工': '#7c3aed'
  };

  const UNIT_PATHS: Record<string, string> = {
    '登山者': 'M 0 -1.2 A 1.2 1.2 0 1 0 0 1.2 A 1.2 1.2 0 1 0 0 -1.2',
    '待救者': 'M 0 -1.3 L 1.2 1.1 L -1.2 1.1 Z',
    '特種搜救隊(NFA SSRT)': 'M -1.2 0 L -0.6 -1.0 L 0.6 -1.0 L 1.2 0 L 0.6 1.0 L -0.6 1.0 Z',
    '警消': 'M 0 -1.3 L 1.3 0 L 0 1.3 L -1.3 0 Z',
    '志工': 'M -1 -1 L 1 -1 L 1 1 L -1 1 Z'
  };

  function markerStyle(d: DeviceTelemetry) {
    const unit = unitOf(d);
    let color = UNIT_COLORS[unit] ?? '#16a34a';
    let path = UNIT_PATHS[unit] ?? UNIT_PATHS['登山者'];

    if (!d.online) color = '#9ca3af';
    if (d.sos) {
      color = '#dc2626';
      path = UNIT_PATHS['待救者'];
    }

    return { color, path };
  }

  function buildIcon(d: DeviceTelemetry): google.maps.Symbol {
    const { color, path } = markerStyle(d);
    return {
      path,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 8
    };
  }

  function applyLockOptions() {
    if (!map) return;
    map.setOptions(
      lockView
        ? {
            gestureHandling: 'none',
            zoomControl: false,
            draggable: false,
            keyboardShortcuts: false,
            disableDoubleClickZoom: true,
            clickableIcons: false
          }
        : {
            gestureHandling: 'auto',
            zoomControl: true,
            draggable: true,
            keyboardShortcuts: true,
            disableDoubleClickZoom: false,
            clickableIcons: true
          }
    );
  }

  function renderOnce() {
    if (!mapEl || !device) return;

    const ll = getLatLng(device);
    if (!ll) return;

    map = new google.maps.Map(mapEl, {
      center: ll,
      zoom,
      mapId: import.meta.env.VITE_GOOGLE_MAP_ID,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      mapTypeId: showTerrain ? 'terrain' : 'roadmap'
    });

    applyLockOptions();

    marker = new google.maps.Marker({
      map,
      position: ll,
      title: device.deviceId,
      icon: buildIcon(device)
    });
  }

  function syncView() {
    if (!map || !device) return;

    const ll = getLatLng(device);
    if (!ll) return;

    map.setCenter(ll);
    map.setZoom(zoom);
    map.setMapTypeId(showTerrain ? 'terrain' : 'roadmap');
    applyLockOptions();

    if (marker) {
      marker.setPosition(ll);
      marker.setIcon(buildIcon(device));
      marker.setTitle(device.deviceId);
    }
  }

  onMount(() => {
    if (!mapEl) return;

    let disposed = false;

    (async () => {
      try {
        await importGmapsLibrary('maps');
        if (disposed) return;
        renderOnce();
      } catch (err: unknown) {
        console.error('裝置地圖載入失敗', err);
      }
    })();

    return () => {
      disposed = true;
      marker?.setMap(null);
      marker = null;
      map = null;
    };
  });

  $: if (map) {
    syncView();
  }
</script>

<div style="border:1px solid #ddd; border-radius:12px; overflow:hidden;">
  {#if getLatLng(device)}
    <div bind:this={mapEl} style={`height:${height}px; width:100%;`}></div>
  {:else}
    <div style={`height:${height}px; display:flex; align-items:center; justify-content:center; color:#666;`}>
      尚無位置資訊
    </div>
  {/if}
</div>
