<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { mount, unmount } from 'svelte';
  import type { DeviceTelemetry } from '$lib/types';
  import { importGmapsLibrary } from '$lib/client/gmaps';
  import DeviceInfoCard from '$lib/components/DeviceInfoCard.svelte';

  export let devices: DeviceTelemetry[] = [];
  export let height = 520;

  export let center = { lat: 23.7, lng: 121.0, altitude: 0 };
  export let range = 12000;
  export let tilt = 67.5;
  export let heading = 0;

  const dispatch = createEventDispatcher<{ select: { deviceId: string } }>();

  let hostEl: HTMLDivElement | null = null;

  let map3d: any = null;
  let Marker3DInteractiveElement: any = null;
  let PopoverElement: any = null;
  let MapMode: any = null;

  const markers = new Map<string, any>();

  let popover: any = null;
  let popHost: HTMLDivElement | null = null;
  let popCard: any = null;
  let selectedId3d: string | null = null;

  let centeredOnce = false;

  // -----------------------
  // 工具：座標與資料處理
  // -----------------------
  function toNum(v: unknown): number | null {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function toPosition(d: DeviceTelemetry) {
    const lat = toNum((d as any).lat);
    const lng = toNum((d as any).lon);
    if (lat == null || lng == null) return null;

    const alt = toNum((d as any).alt);
    return { lat, lng, altitude: alt != null ? alt : 0 };
  }

  function firstDeviceCenter() {
    for (const d of devices) {
      const pos = toPosition(d);
      if (pos) return { lat: pos.lat, lng: pos.lng, altitude: 0 };
    }
    return null;
  }

  // -----------------------
  // 顏色策略
  // -----------------------
  const UNIT_COLORS: Record<string, string> = {
    登山者: '#16a34a',
    待救者: '#dc2626',
    '特種搜救隊(NFA SSRT)': '#1d4ed8',
    警消: '#f97316',
    志工: '#7c3aed'
  };

  function unitOf(d: DeviceTelemetry) {
    return (d as any).unit ?? '登山者';
  }

  function markerColor(d: DeviceTelemetry) {
    if (!d.online) return '#9ca3af';
    if (d.sos) return '#dc2626';
    return UNIT_COLORS[unitOf(d)] ?? '#16a34a';
  }

  // -----------------------
  // ✅ maps3d marker 的自訂圖釘（穩定）
  // 直接用 SVG + slot="content"
  // -----------------------
  function buildSvgPin(d: DeviceTelemetry): HTMLElement {
    const color = markerColor(d);

    const wrap = document.createElement('div');
    wrap.slot = 'content';

    // ✅ 讓圖釘往上提一點，看起來像插在地上
    wrap.style.transform = 'translateY(-18px)';
    wrap.style.filter = 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))';
    wrap.style.pointerEvents = 'none';

    // ✅ 24x36 的水滴 pin
    // wrap.innerHTML = `
    //   <svg width="28" height="42" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
    //     <path d="M12 0C7.03 0 3 4.03 3 9c0 6.63 9 18 9 18s9-11.37 9-18c0-4.97-4.03-9-9-9z"
    //           fill="${color}" stroke="#ffffff" stroke-width="2" />
    //     <circle cx="12" cy="9" r="3.2" fill="#ffffff" />
    //   </svg>
    // `;
    wrap.innerHTML = `<div style="width:26px;height:26px;background:#00f;border:3px solid #fff;border-radius:6px;"></div>`;

    (wrap as any).__pinColor = color;
    return wrap;
  }

  function applyPin(marker: any, d: DeviceTelemetry) {
    // ✅ 換上自訂 SVG pin
    const pin = buildSvgPin(d);
    marker.replaceChildren(pin);
    marker.__pinWrap = pin;

    // ✅ 防止被內部重算/更新時吃掉（保底）
    if (!marker.__pinObserver) {
      const obs = new MutationObserver(() => {
        const curr = marker.firstElementChild;
        if (!curr || curr !== marker.__pinWrap) {
          const latest = devices.find((x) => x.deviceId === marker.__deviceId) ?? d;
          const repin = buildSvgPin(latest);
          marker.replaceChildren(repin);
          marker.__pinWrap = repin;
        }
      });
      obs.observe(marker, { childList: true });
      marker.__pinObserver = obs;
    }
  }

  // -----------------------
  // Popover
  // -----------------------
  function ensurePopover() {
    if (!map3d || !PopoverElement) return;

    if (!popover) {
      popover = new PopoverElement({ open: false });
      popHost = document.createElement('div');

      popover.append(popHost);
      map3d.append(popover);
    }
  }

  function renderPopover(latest: DeviceTelemetry) {
    if (!popover || !popHost) return;

    // ✅ Svelte 5：不要 $set，直接重建最穩
    try {
      if (popCard) unmount(popCard);
    } catch {}
    popHost.innerHTML = '';

    popCard = mount(DeviceInfoCard, {
      target: popHost,
      props: {
        device: latest,
        showNavigate: true,

        // ✅ 你的 DeviceInfoCard TS 型別看起來「要求」onNavigate
        // 這裡保留，避免 TS 報錯
        onNavigate: (id: string) => {
          popover.open = false;
          dispatch('select', { deviceId: id });
        }
      },
      events: {
        navigate: (e: CustomEvent<{ deviceId: string }>) => {
          popover.open = false;
          dispatch('select', { deviceId: e.detail.deviceId });
        }
      }
    });
  }

  function openPopoverFor(deviceId: string, anchorMarker: any) {
    ensurePopover();
    if (!popover) return;

    selectedId3d = deviceId;

    const latest = devices.find((x) => x.deviceId === deviceId);
    if (!latest) return;

    popover.positionAnchor = anchorMarker;
    renderPopover(latest);
    popover.open = true;
  }

  function refreshPopoverIfOpen() {
    if (!popover?.open || !selectedId3d) return;
    const latest = devices.find((x) => x.deviceId === selectedId3d);
    if (!latest) return;
    renderPopover(latest);
  }

  // -----------------------
  // Marker 管理
  // -----------------------
  function ensureMarker(d: DeviceTelemetry) {
    if (!map3d || !Marker3DInteractiveElement) return;

    const id = d.deviceId;
    const pos = toPosition(d);
    if (!pos) return;

    const existing = markers.get(id);
    if (existing) {
      existing.position = pos;
      existing.title = id;
      applyPin(existing, d);
      return;
    }

    const m: any = new Marker3DInteractiveElement({
      position: pos,
      title: id
    });

    m.__deviceId = id;
    applyPin(m, d);

    m.addEventListener('gmp-click', () => openPopoverFor(id, m));

    map3d.append(m);
    markers.set(id, m);
  }

  function syncMarkers() {
    if (!map3d || !Marker3DInteractiveElement) return;

    const alive = new Set<string>();

    for (const d of devices) {
      if (!toPosition(d)) continue;
      alive.add(d.deviceId);
      ensureMarker(d);
    }

    for (const [id, m] of markers.entries()) {
      if (!alive.has(id)) {
        if (selectedId3d === id && popover) popover.open = false;

        if (m.__pinObserver) {
          try { m.__pinObserver.disconnect(); } catch {}
          m.__pinObserver = null;
        }

        m.remove?.();
        markers.delete(id);
      }
    }
  }

  // -----------------------
  // Mount
  // -----------------------
  onMount(() => {
    if (!hostEl) return;

    let disposed = false;

    (async () => {
      try {
        const lib3d: any = await importGmapsLibrary('maps3d');
        if (disposed || !hostEl) return;

        const { Map3DElement } = lib3d;
        Marker3DInteractiveElement = lib3d.Marker3DInteractiveElement;
        PopoverElement = lib3d.PopoverElement;
        MapMode = lib3d.MapMode;

        const initCenter = firstDeviceCenter() ?? center;

        map3d = new Map3DElement({
          center: initCenter,
          range,
          tilt,
          heading,
          //mode: MapMode?.HYBRID ?? 'HYBRID',
          mode: MapMode?.SATELLITE ?? 'SATELLITE',
          mapId: import.meta.env.VITE_GOOGLE_MAP_ID
        });

        hostEl.appendChild(map3d);

        ensurePopover();
        syncMarkers();

        if (firstDeviceCenter()) centeredOnce = true;
      } catch (err) {
        console.error('Google 3D Maps 載入失敗', err);
      }
    })();

    return () => {
      disposed = true;

      for (const m of markers.values()) {
        if (m.__pinObserver) {
          try { m.__pinObserver.disconnect(); } catch {}
          m.__pinObserver = null;
        }
        m.remove?.();
      }
      markers.clear();

      try { if (popCard) unmount(popCard); } catch {}
      popCard = null;

      popHost = null;
      popover?.remove?.();
      popover = null;

      map3d?.remove?.();
      map3d = null;

      Marker3DInteractiveElement = null;
      PopoverElement = null;
      MapMode = null;

      selectedId3d = null;
      centeredOnce = false;
    };
  });

  // devices 更新：同步 marker + popover
  $: if (map3d && Marker3DInteractiveElement) {
    syncMarkers();

    if (!centeredOnce) {
      const c = firstDeviceCenter();
      if (c) {
        map3d.center = c;
        map3d.range = Math.max(map3d.range ?? 0, 8000);
        centeredOnce = true;
      }
    }

    refreshPopoverIfOpen();
  }

  // 外部調相機參數
  $: if (map3d) {
    map3d.tilt = tilt;
    map3d.heading = heading;
    map3d.range = range;
  }
</script>

<div style="border:1px solid #ddd; border-radius:12px; overflow:hidden;">
  <div bind:this={hostEl} style={`height:${height}px; width:100%;`}></div>
</div>
