<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { mount, unmount } from 'svelte';
  import type { DeviceTelemetry } from '$lib/types';
  import { importGmapsLibrary } from '$lib/client/gmaps';
  import DeviceInfoCard from '$lib/components/DeviceInfoCard.svelte';

  export let showContours = false; // ??蝑?蝺?terrain嚗?

  export let devices: DeviceTelemetry[] = [];
  export let height = 520;

  export let center = { lat: 23.7, lng: 121.0 };
  export let zoom = 7;

  const dispatch = createEventDispatcher<{ select: { deviceId: string } }>();

  let mapEl: HTMLDivElement | null = null;
  let map: google.maps.Map | null = null;

  let infoOpen = false;

  // Marker嚗?瘝輻 google.maps.Marker嚗??? AdvancedMarker 銋??嚗?
  const markers = new Map<string, google.maps.Marker>();

  // ???梁 InfoWindow + ?∠?摰孵
  let infoWindow: google.maps.InfoWindow | null = null;
  let infoHost: HTMLDivElement | null = null;

  // ??Svelte 5嚗ount ????instance嚗 any ???頝?
  let infoCard: any = null;
  let selectedId2d: string | null = null;

  function ensureInfoWindow() {
    if (!infoWindow) infoWindow = new google.maps.InfoWindow();
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
    const unit = d.sos ? '待救者' : unitOf(d);
    let color = UNIT_COLORS[unit] ?? '#16a34a';
    let path = UNIT_PATHS[unit] ?? 'M 0 -1.2 A 1.2 1.2 0 1 0 0 1.2 A 1.2 1.2 0 1 0 0 -1.2';

    if (!d.online) color = '#9ca3af';
    if (d.sos) { color = '#dc2626'; path = UNIT_PATHS['待救者']; }

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

  // ???冽???devices ?湔/?遣?∠?
  function renderInfoCard(deviceId: string, anchor: google.maps.Marker) {
    if (!map) return;
    ensureInfoWindow();
    if (!infoWindow || !infoHost) return;

    const latest = devices.find((x) => x.deviceId === deviceId);
    if (!latest) return;

    selectedId2d = deviceId;

    // ? mount嚗?蝛抬?銝? $set嚗?
    if (infoCard) {
      unmount(infoCard);
      infoCard = null;
      infoHost.innerHTML = '';
    }

    infoCard = mount(DeviceInfoCard, {
      target: infoHost,
      props: {
        device: latest,
        showNavigate: true,
        onNavigate: (id: string) => {
          infoWindow?.close();
          infoOpen = false;
          dispatch('select', { deviceId: id });
        }
      } as any // ?乩? TS ???湔?嚗???any
    });

    infoWindow.setContent(infoHost);
    infoWindow.open({ map, anchor });
    infoOpen = true;
  }

  function ensureMarker(d: DeviceTelemetry) {
    if (!map) return;

    const id = d.deviceId;

    // ???ㄐ銋???number嚗??d.lat ?臬?銝脖?雿?as number 霈?NaN
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

    const m = new google.maps.Marker({
      map,
      position: pos,
      title: id,
      icon: buildIcon(d)
    });

    m.addListener('click', () => {
      renderInfoCard(id, m);
    });

    markers.set(id, m);
  }

  function syncMarkers() {
    if (!map) return;

    const activeIds = new Set<string>();

    for (const d of devices) {
      if (!hasLatLon(d)) continue;
      activeIds.add(d.deviceId);
      ensureMarker(d);
    }

    for (const [id, m] of markers.entries()) {
      if (!activeIds.has(id)) {
        m.setMap(null);
        markers.delete(id);

        // ?亦?????∠??航◤蝘駁??嚗???
        if (selectedId2d === id) infoWindow?.close();
      }
    }
  }

  onMount(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!apiKey) {
      console.error('蝻箏? VITE_GOOGLE_MAPS_API_KEY');
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
        syncMarkers();
      })
      .catch((err: unknown) => {
        console.error('Google Maps 頛憭望?', err);
      });

    return () => {
      disposed = true;

      for (const m of markers.values()) m.setMap(null);
      markers.clear();

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

  // ??鋆蔭?湔嚗?甇?markers
  $: if (map) {
    syncMarkers();
  }

  // ????InfoWindow 甇????銝?啗?蝵株????湔嚗?撱箏???批捆撠望??湔嚗?
  $: if (map && infoWindow && selectedId2d && infoOpen) {
    const anchor = markers.get(selectedId2d);
    if (anchor) renderInfoCard(selectedId2d, anchor);
  }

  // ??蝑?蝺???
  $: if (map) {
    map.setMapTypeId(showContours ? 'terrain' : 'roadmap');
  }
</script>

<div style="border:1px solid #ddd; border-radius:12px; overflow:hidden;">
  <div bind:this={mapEl} style={`height:${height}px; width:100%;`}></div>
</div>
