<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { mount, unmount } from 'svelte';
  import type { DeviceTelemetry } from '$lib/types';
  import type { MapAlertRegion } from '$lib/map-alert-regions';
  import { importGmapsLibrary } from '$lib/client/gmaps';
  import DeviceInfoCard from '$lib/components/DeviceInfoCard.svelte';

  export let showContours = false;
  export let devices: DeviceTelemetry[] = [];
  export let alertRegions: MapAlertRegion[] = [];
  export let height = 520;
  export let center = { lat: 23.7, lng: 121.0 };
  export let zoom = 7;

  const dispatch = createEventDispatcher<{ select: { deviceId: string } }>();

  let mapEl: HTMLDivElement | null = null;
  let map: google.maps.Map | null = null;
  let infoOpen = false;
  const markers = new Map<string, google.maps.Marker>();
  let boundaryLayerLoaded = false;
  let infoWindow: google.maps.InfoWindow | null = null;
  let infoHost: HTMLDivElement | null = null;
  let infoCard: any = null;
  let selectedId2d: string | null = null;
  const boundaryListeners: google.maps.MapsEventListener[] = [];

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

  function ensureInfoWindow() {
    if (!infoWindow) infoWindow = new google.maps.InfoWindow({ headerDisabled: true });
    if (!infoHost) infoHost = document.createElement('div');
  }

  function hasLatLon(d: DeviceTelemetry) {
    const lat = typeof d.lat === 'number' ? d.lat : Number(d.lat);
    const lon = typeof d.lon === 'number' ? d.lon : Number(d.lon);
    return Number.isFinite(lat) && Number.isFinite(lon);
  }

  function unitOf(d: DeviceTelemetry) {
    return (d as { unit?: string }).unit ?? '登山者';
  }

  function markerStyle(d: DeviceTelemetry) {
    const unit = d.sos ? '待救者' : unitOf(d);
    let color = UNIT_COLORS[unit] ?? UNIT_COLORS['登山者'];
    let path = UNIT_PATHS[unit] ?? UNIT_PATHS['登山者'];

    if (!d.online) color = '#9ca3af';
    if (d.sos) {
      color = UNIT_COLORS['待救者'];
      path = UNIT_PATHS['待救者'];
    }

    return { color, path };
  }

  function buildIcon(d: DeviceTelemetry): any {
    const { color, path } = markerStyle(d);
    return {
      path,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 7
    };
  }

  function renderInfoCard(deviceId: string, anchor: google.maps.Marker) {
    if (!map) return;
    ensureInfoWindow();
    if (!infoWindow || !infoHost) return;

    const latest = devices.find((x) => x.deviceId === deviceId);
    if (!latest) return;

    selectedId2d = deviceId;

    if (infoCard) {
      unmount(infoCard);
      infoCard = null;
      infoHost.innerHTML = '';
    }

    infoCard = mount(DeviceInfoCard, {
      target: infoHost,
      props: {
        device: latest,
        showNavigate: false,
        onNavigate: (id: string) => {
          infoWindow?.close();
          infoOpen = false;
          dispatch('select', { deviceId: id });
        },
        onClose: () => {
          infoWindow?.close();
          infoOpen = false;
          selectedId2d = null;
        }
      } as any
    });

    infoWindow.setContent(infoHost);
    infoWindow.open({ map, anchor });
    infoOpen = true;
  }

  function ensureMarker(d: DeviceTelemetry) {
    if (!map) return;

    const id = d.deviceId;
    const lat = typeof d.lat === 'number' ? d.lat : Number(d.lat);
    const lng = typeof d.lon === 'number' ? d.lon : Number(d.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const pos = { lat, lng };
    const existing = markers.get(id);

    if (existing) {
      existing.setPosition(pos);
      existing.setIcon(buildIcon(d));
      existing.setTitle(id);
      return;
    }

    const marker = new google.maps.Marker({
      map,
      position: pos,
      title: id,
      icon: buildIcon(d)
    });

    marker.addListener('click', () => {
      renderInfoCard(id, marker);
    });

    markers.set(id, marker);
  }

  function syncMarkers() {
    if (!map) return;

    const activeIds = new Set<string>();

    for (const d of devices) {
      if (!hasLatLon(d)) continue;
      activeIds.add(d.deviceId);
      ensureMarker(d);
    }

    for (const [id, marker] of markers.entries()) {
      if (!activeIds.has(id)) {
        marker.setMap(null);
        markers.delete(id);

        if (selectedId2d === id) infoWindow?.close();
      }
    }
  }

  function alertRegionStyle(severity: MapAlertRegion['severity']) {
    if (severity === 'critical') return { fill: '#ef4444', stroke: '#fecaca', opacity: 0.25 };
    if (severity === 'warning') return { fill: '#f59e0b', stroke: '#fde68a', opacity: 0.22 };
    if (severity === 'watch') return { fill: '#38bdf8', stroke: '#bae6fd', opacity: 0.18 };
    return { fill: '#94a3b8', stroke: '#e2e8f0', opacity: 0.12 };
  }

  function alertRegionLabel(severity: MapAlertRegion['severity']) {
    if (severity === 'critical') return '重大';
    if (severity === 'warning') return '警戒';
    if (severity === 'watch') return '注意';
    return '資訊';
  }

  function syncAlertRegions() {
    if (!map) return;

    const activeRegions = new Map(alertRegions.map((region) => [region.areaKey, region]));

    map.data.setStyle((feature) => {
      const areaKey = String(feature.getProperty('areaKey') ?? '');
      const region = activeRegions.get(areaKey);
      if (!region) {
        return {
          visible: false
        };
      }

      const style = alertRegionStyle(region.severity);
      return {
        visible: true,
        clickable: true,
        fillColor: style.fill,
        fillOpacity: style.opacity,
        strokeColor: style.stroke,
        strokeOpacity: 0.92,
        strokeWeight: 2,
        zIndex: 2
      };
    });
  }

  function loadBoundaryLayer() {
    if (!map || boundaryLayerLoaded) return;
    boundaryLayerLoaded = true;
    map.data.loadGeoJson('/data/mountain-town-boundaries.geojson', {}, () => {
      syncAlertRegions();
    });
    map.data.setStyle({ visible: false });

    boundaryListeners.push(
      map.data.addListener('mouseover', (event: google.maps.Data.MouseEvent) => {
        const areaKey = String(event.feature.getProperty('areaKey') ?? '');
        const region = alertRegions.find((item) => item.areaKey === areaKey);
        if (!areaKey || !region || !map) return;

        const style = alertRegionStyle(region.severity);
        map.data.overrideStyle(event.feature, {
          fillOpacity: Math.min(style.opacity + 0.14, 0.42),
          strokeWeight: 3,
          strokeOpacity: 1
        });
      }),
      map.data.addListener('mouseout', (event: google.maps.Data.MouseEvent) => {
        map?.data.revertStyle(event.feature);
      })
    );
  }

  function clearBoundaryLayer() {
    if (!map) return;
    for (const listener of boundaryListeners) listener.remove();
    boundaryListeners.length = 0;
    map.data.forEach((feature) => {
      map?.data.remove(feature);
    });
    boundaryLayerLoaded = false;
  }

  onMount(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!apiKey) {
      console.error('缺少 VITE_GOOGLE_MAPS_API_KEY');
      return;
    }
    if (!mapEl) return;

    const mapId = import.meta.env.VITE_GOOGLE_MAP_ID as string | undefined;
    let disposed = false;

    importGmapsLibrary('maps')
      .then(({ Map }) => {
        if (disposed || !mapEl) return;

        map = new Map(mapEl, {
          center,
          zoom,
          mapId,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          mapTypeId: showContours ? 'terrain' : 'roadmap'
        });

        ensureInfoWindow();
        loadBoundaryLayer();
        syncAlertRegions();
        syncMarkers();
      })
      .catch((err: unknown) => {
        console.error('Google Maps 載入失敗', err);
      });

    return () => {
      disposed = true;

      for (const marker of markers.values()) marker.setMap(null);
      markers.clear();
      clearBoundaryLayer();

      if (infoCard) {
        unmount(infoCard);
        infoCard = null;
      }

      infoWindow?.close();
      infoWindow = null;
      infoHost = null;
      map = null;
    };
  });

  $: if (map) {
    syncAlertRegions();
    syncMarkers();
  }

  $: if (map && infoWindow && selectedId2d && infoOpen) {
    const anchor = markers.get(selectedId2d);
    if (anchor) renderInfoCard(selectedId2d, anchor);
  }

  $: if (map) {
    map.setMapTypeId(showContours ? 'terrain' : 'roadmap');
  }
</script>

<div class="mapShell">
  <div bind:this={mapEl} style={`height:${height}px; width:100%;`}></div>
</div>

<style>
  .mapShell{
    border: 1px solid #ddd;
    border-radius: 12px;
    overflow: hidden;
  }

  :global(.gm-style .gm-style-iw-c){
    max-width: none !important;
    min-width: 292px !important;
    padding: 0 !important;
    border-radius: 10px !important;
    background: #07151b !important;
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.38) !important;
  }

  :global(.gm-style .gm-style-iw-d){
    overflow: visible !important;
    max-height: none !important;
    height: auto !important;
  }

  :global(.gm-style .gm-style-iw-d > div){
    overflow: visible !important;
    height: auto !important;
  }

  :global(.gm-style .gm-style-iw-tc::after){
    background: #07151b !important;
  }

</style>
