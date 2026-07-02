<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { AiRecommendation, DeviceTelemetry, MLinkSseEvent } from '$lib/types';
  import type { AlertItem } from '$lib/types/alerts';
  import type { RiskQueueItem } from '$lib/server/risk-assessments';
  import { mapAlertRegionsFromItems } from '$lib/map-alert-regions';
  import GoogleMapView from '$lib/components/GoogleMapView.svelte';
  import GoogleMap3DView from '$lib/components/GoogleMap3DView.svelte';

  export let data: {
    user: { id: number; username: string; is_admin: number };
    devices: DeviceTelemetry[];
    riskQueue: RiskQueueItem[];
    aiRecommendation: AiRecommendation | null;
  };

  let devices: DeviceTelemetry[] = data.devices;
  let riskQueue: RiskQueueItem[] = data.riskQueue;
  let mode: '2d' | '3d' = '2d';
  let showContours = false;
  let sseStatus: 'open' | 'error' | 'connecting' = 'connecting';
  let hazardItems: AlertItem[] = [];
  let hazardLoading = true;
  let hazardNotice = '';
  let testDispatchBusy = false;
  let toasts: EqToast[] = [];
  let hasHazardSnapshot = false;
  let collapsedAlertKeys: string[] = [];
  let aiRecommendation: AiRecommendation | null = data.aiRecommendation;
  let aiDialogOpen = false;
  let activeAlert: AlertItem | null = null;
  let aiBusy = false;

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

  type AlertRegionGroup = {
    city: string;
    areas: string[];
  };

  type PhysiologicalRiskItem = {
    device: DeviceTelemetry;
    abnormalities: string[];
  };

  const fmtTime = (ms: number) => new Date(ms).toLocaleString();
  const unitOf = (d: DeviceTelemetry) => (d as { unit?: string }).unit ?? '未分類';
  const deviceTitle = (d: DeviceTelemetry) => d.displayName?.trim() || d.deviceId;
  const deviceHref = (deviceId?: string | null) => (deviceId ? `/devices/${encodeURIComponent(deviceId)}` : '/dashboard');
  const applicationHref = (applicationId?: number | null) => (applicationId ? `/apply/${applicationId}` : '/apply');
  const batteryText = (d: DeviceTelemetry) => `${d.battery}%${d.charging ? ' 充電中' : ''}`;

  $: deviceById = new Map(devices.map((device) => [device.deviceId, device]));
  $: onlineCount = devices.filter((device) => device.online).length;
  $: sosDevices = devices.filter((device) => device.sos);
  $: lowBatteryDevices = devices.filter((device) => device.battery <= 20);
  $: offlineDevices = devices.filter((device) => !device.online);
  $: normalDevices = devices.filter((device) => !device.sos && device.online && device.battery > 20);
  $: highRiskItems = devices
    .map((device): PhysiologicalRiskItem => ({ device, abnormalities: physiologicalAbnormalities(device) }))
    .filter((item) => item.abnormalities.length > 0);
  $: deviceRiskTotal = sosDevices.length + highRiskItems.length + lowBatteryDevices.length + offlineDevices.length;
  $: unboundRiskItems = riskQueue.filter((item) => !item.meshtasticDeviceId || !deviceById.has(item.meshtasticDeviceId));
  $: activeHazards = hazardItems.filter((item) => item.severity === 'critical' || item.severity === 'warning');
  $: mapAlertRegions = mapAlertRegionsFromItems(hazardItems);
  $: latestUpdate = devices.reduce((latest, device) => Math.max(latest, device.updatedAt ?? 0), 0);
  $: firstSosDevice = sosDevices[0];
  $: firstOnlineDevice = devices.find((device) => device.online);
  $: firstAbnormalDevice = lowBatteryDevices[0] ?? offlineDevices[0];
  $: firstHighRiskItem = highRiskItems[0];
  $: firstUnboundRiskItem = unboundRiskItems[0];
  $: sosKpiHref = deviceHref(firstSosDevice?.deviceId);
  $: onlineKpiHref = '/devices';
  $: abnormalKpiHref = deviceHref(firstAbnormalDevice?.deviceId);
  $: highRiskKpiHref = deviceHref(firstHighRiskItem?.device.deviceId);
  $: unboundKpiHref = firstUnboundRiskItem?.meshtasticDeviceId
    ? deviceHref(firstUnboundRiskItem.meshtasticDeviceId)
    : applicationHref(firstUnboundRiskItem?.applicationId);

  function severityText(level: AlertItem['severity']) {
    if (level === 'critical') return '極高';
    if (level === 'warning') return '警戒';
    if (level === 'watch') return '注意';
    return '資訊';
  }

  function fmtIsoTime(iso?: string) {
    if (!iso) return '';
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? fmtTime(ms) : '';
  }

  function physiologicalAbnormalities(device: DeviceTelemetry) {
    const items: string[] = [];
    if (device.hr != null && (device.hr > 150 || device.hr < 50)) items.push(`HR ${device.hr} bpm`);
    if (device.spo2 != null && device.spo2 < 90) items.push(`SpO2 ${device.spo2}%`);
    if (device.bt != null && (device.bt > 41 || device.bt < 32)) items.push(`BT ${device.bt}°C`);
    if (device.bpHi != null && (device.bpHi > 200 || device.bpHi < 90)) items.push(`SBP ${device.bpHi} mmHg`);
    return items;
  }

  function aiStatusText(status?: AiRecommendation['status']) {
    if (status === 'sent') return '已發送';
    if (status === 'blocked') return '驗證阻擋';
    if (status === 'failed') return '處理失敗';
    if (status === 'disabled') return 'AI 暫停';
    return '建議待觀察';
  }

  function aiSeverityText(severity?: AiRecommendation['severity']) {
    if (severity === 'critical') return '極高';
    if (severity === 'warning') return '警戒';
    if (severity === 'watch') return '注意';
    return '資訊';
  }

  function aiPanelMeta(recommendation: AiRecommendation | null) {
    if (!recommendation) return '尚無 AI 分析';
    return `${aiStatusText(recommendation.status)} / ${fmtIsoTime(recommendation.generatedAt) || '未知時間'}`;
  }

  function closeDetailDialogs() {
    aiDialogOpen = false;
    activeAlert = null;
  }

  function closeDialogOnBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) closeDetailDialogs();
  }

  function handleModalKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && (aiDialogOpen || activeAlert)) closeDetailDialogs();
  }

  function compactAlertRegion(region?: string) {
    if (!region) return '';
    const areas = region
      .split(/[、,，\s]+/)
      .map((area) => area.trim())
      .filter(Boolean);
    if (areas.length <= 4) return region;
    return `${areas.slice(0, 4).join('、')} 等 ${areas.length} 區`;
  }

  function parseAlertRegionGroups(region?: string): AlertRegionGroup[] {
    if (!region) return [];
    const groups = new Map<string, string[]>();
    const areas = region
      .split(/[、,，\s]+/)
      .map((area) => area.trim())
      .filter(Boolean);

    for (const area of areas) {
      const match = area.match(/^(.+?[縣市])(.+)$/);
      const city = match?.[1] ?? area;
      const township = match?.[2]?.trim() ?? '';
      const townships = groups.get(city) ?? [];
      if (township && !townships.includes(township)) townships.push(township);
      groups.set(city, townships);
    }

    return Array.from(groups.entries()).map(([city, townships]) => ({
      city,
      areas: townships
    }));
  }

  function alertRegionTotal(groups: AlertRegionGroup[]) {
    return groups.reduce((total, group) => total + (group.areas.length || 1), 0);
  }

  function alertRegionSummary(groups: AlertRegionGroup[]) {
    if (groups.length === 0) return '';
    return `${groups.length} 縣市 / ${alertRegionTotal(groups)} 區`;
  }

  function previewRegionGroups(groups: AlertRegionGroup[], limit = 3) {
    return groups.slice(0, limit);
  }

  function hiddenRegionCount(groups: AlertRegionGroup[], limit = 3) {
    return Math.max(0, groups.length - limit);
  }

  function alertCollapseKey(item: AlertItem, index: number) {
    return [item.id || `alert-${index}`, item.title || '', item.severity, item.eventAt ?? item.issuedAt ?? ''].join('|');
  }

  function isAlertExpanded(item: AlertItem, index: number) {
    return !collapsedAlertKeys.includes(alertCollapseKey(item, index));
  }

  function toggleAlert(item: AlertItem, index: number) {
    const key = alertCollapseKey(item, index);
    const expanded = isAlertExpanded(item, index);
    collapsedAlertKeys = expanded
      ? [...collapsedAlertKeys, key]
      : collapsedAlertKeys.filter((itemKey) => itemKey !== key);
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
      title: alert.title || '地震警示',
      summary: alert.summary || '',
      meta: [severityText(alert.severity), alert.region, fmtIsoTime(alert.eventAt ?? alert.issuedAt)].filter(Boolean).join(' / '),
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

    const timer = setTimeout(() => dismissToast(id), TOAST_LIFETIME_MS);
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
        // autoplay may be blocked
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
      const res = await fetch('/api/alerts/test-dispatch', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      hazardNotice = res.ok ? (payload.message as string) || '測試警示已送出' : (payload.error as string) || '測試警示送出失敗';
    } catch {
      hazardNotice = '測試警示送出失敗';
    } finally {
      testDispatchBusy = false;
    }
  }
  async function runAiAnalysis() {
    if (aiBusy) return;
    aiBusy = true;
    try {
      const res = await fetch('/api/ai/recommendations/run', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.recommendation) {
        aiRecommendation = payload.recommendation as AiRecommendation;
        aiDialogOpen = false;
      } else {
        aiRecommendation = {
          id: `client-error-${Date.now()}`,
          status: 'failed',
          severity: 'info',
          title: 'AI 分析失敗',
          reasoningSummary: payload.error || '無法取得 AI 分析結果。',
          recommendedAction: '維持現有災害與裝置監控，檢查 AI provider 設定與服務狀態。',
          message: '',
          targetAreas: [],
          evidence: [],
          validationErrors: [payload.error || 'AI analysis failed'],
          fingerprint: '',
          provider: 'ollama',
          model: 'unknown',
          generatedAt: new Date().toISOString()
        };
      }
    } finally {
      aiBusy = false;
    }
  }
  function upsertDevices(next: DeviceTelemetry[]) {
    const map = new Map(devices.map((d) => [d.deviceId, d]));
    for (const nd of next) {
      const prev = map.get(nd.deviceId);
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
        hazardNotice = '???????鞈Ｘ?﹝?折???';
      } finally {
        hazardLoading = false;
      }
    };

    const aiHandler = (e: MessageEvent) => {
      try {
        aiRecommendation = JSON.parse(e.data) as AiRecommendation;
      } catch {
        // Ignore malformed AI recommendation payloads.
      }
    };

    es.addEventListener('telemetry', telemetryHandler);
    es.addEventListener('online', telemetryHandler);
    es.addEventListener('hazard_update', hazardHandler);
    es.addEventListener('ai_recommendation_update', aiHandler);

    return () => {
      for (const timer of toastTimers.values()) clearTimeout(timer);
      toastTimers.clear();
      es.close();
    };
  });
</script>

<svelte:window onkeydown={handleModalKeydown} />

<svelte:head>
  <title>MountainLink 指揮中心</title>
</svelte:head>

<div class="commandShell">
  <header class="commandHeader">
    <div>
      <p class="eyebrow">MountainLink Command</p>
      <h1>山域安全指揮中心</h1>
    </div>
    <div class="headerStatus">
      <span class={`conn ${sseStatus}`}>即時連線 {sseStatus === 'open' ? '正常' : sseStatus === 'error' ? '異常' : '連線中'}</span>
      <span>使用者 {data.user.username}{data.user.is_admin ? ' / Admin' : ''}</span>
      <span>更新 {latestUpdate ? fmtTime(latestUpdate) : '尚無資料'}</span>
    </div>
  </header>

  <section class="kpiStrip" aria-label="指揮中心指標">
    <a class="kpi danger" href={sosKpiHref}>
      <span>SOS</span>
      <strong>{sosDevices.length}</strong>
      <small>待救援</small>
    </a>
    <a class="kpi risk" href={highRiskKpiHref}>
      <span>高風險</span>
      <strong>{highRiskItems.length}</strong>
      <small>生理異常</small>
    </a>
    <a class="kpi" href={onlineKpiHref}>
      <span>在線</span>
      <strong>{onlineCount}</strong>
      <small>裝置 / {devices.length}</small>
    </a>
    <a class="kpi warn" href={abnormalKpiHref}>
      <span>異常</span>
      <strong>{lowBatteryDevices.length + offlineDevices.length}</strong>
      <small>低電量或離線</small>
    </a>
    <a class="kpi bind" href={unboundKpiHref}>
      <span>待綁定</span>
      <strong>{unboundRiskItems.length}</strong>
      <small>申請裝置</small>
    </a>
  </section>
  <main class="opsGrid">
    <section class="panel mapPanel">
      <div class="panelHeader">
        <div>
          <h2>山域位置圖</h2>
          <p>登山者、救援單位與 SOS 狀態</p>
        </div>
        <div class="mapControls">
          <div class="segmented" role="group" aria-label="地圖模式">
            <button class:active={mode === '2d'} type="button" onclick={() => (mode = '2d')}>2D</button>
            <button class:active={mode === '3d'} type="button" onclick={() => (mode = '3d')}>3D</button>
          </div>
          {#if mode === '2d'}
            <label class="terrainToggle">
              <input type="checkbox" bind:checked={showContours} />
              地形
            </label>
          {/if}
        </div>
      </div>

      <div class="mapLegend">
        <span><i class="dot green"></i>登山者</span>
        <span><i class="tri"></i>SOS</span>
        <span><i class="dot blue"></i>搜救</span>
        <span><i class="dot orange"></i>警消</span>
        <i class="legendDivider" aria-hidden="true"></i>
        <span><i class="hazardSwatch rain"></i>豪雨／大雨</span>
        <span><i class="hazardSwatch cold"></i>低溫</span>
        <span><i class="hazardSwatch earthquake"></i>地震</span>
      </div>

      <div class="mapViewport">
        {#if mode === '2d'}
          <GoogleMapView {devices} alertRegions={mapAlertRegions} height={460} {showContours} on:select={onSelect} />
        {:else}
          <GoogleMap3DView {devices} height={460} on:select={onSelect} />
        {/if}
      </div>
    </section>
    <section class="panel riskPanel">
      <div class="panelHeader compact">
        <div>
          <h2>裝置與生理風險</h2>
          <p>SOS、離線、低電量與生命徵象異常</p>
        </div>
        <span>{deviceRiskTotal} 項</span>
      </div>

      {#if deviceRiskTotal === 0}
        <p class="empty">目前沒有裝置或生理異常。</p>
      {:else}
        <div class="riskList combinedRiskList">
          {#if sosDevices.length > 0}
            <div class="riskGroup">
              <div class="riskGroupHead danger"><strong>SOS</strong><span>{sosDevices.length}</span></div>
              {#each sosDevices.slice(0, 3) as device}
                <a class="riskItem danger" href={`/devices/${encodeURIComponent(device.deviceId)}`}>
                  <span>SOS</span>
                  <strong>{deviceTitle(device)}</strong>
                  <small>{unitOf(device)} / {device.online ? 'Online' : 'Offline'} / {fmtTime(device.updatedAt)}</small>
                </a>
              {/each}
            </div>
          {/if}

          {#if highRiskItems.length > 0}
            <div class="riskGroup">
              <div class="riskGroupHead critical"><strong>生理異常</strong><span>{highRiskItems.length}</span></div>
              {#each highRiskItems.slice(0, 4) as item}
                <a class="riskItem critical" href={`/devices/${encodeURIComponent(item.device.deviceId)}`}>
                  <span>{item.abnormalities.length} 項</span>
                  <strong>{deviceTitle(item.device)}</strong>
                  <small>{unitOf(item.device)} / {item.device.online ? 'Online' : 'Offline'} / {fmtTime(item.device.updatedAt)}</small>
                  <em>{item.abnormalities.join('、')}</em>
                </a>
              {/each}
            </div>
          {/if}

          {#if lowBatteryDevices.length > 0}
            <div class="riskGroup compactGroup">
              <div class="riskGroupHead warn"><strong>低電量</strong><span>{lowBatteryDevices.length}</span></div>
              {#each lowBatteryDevices.slice(0, 3) as device}
                <a class="riskItem warn" href={`/devices/${encodeURIComponent(device.deviceId)}`}>
                  <span>{batteryText(device)}</span>
                  <strong>{deviceTitle(device)}</strong>
                  <small>{unitOf(device)} / {fmtTime(device.updatedAt)}</small>
                </a>
              {/each}
            </div>
          {/if}

          {#if offlineDevices.length > 0}
            <div class="riskGroup compactGroup">
              <div class="riskGroupHead muted"><strong>離線</strong><span>{offlineDevices.length}</span></div>
              {#each offlineDevices.slice(0, 3) as device}
                <a class="riskItem muted" href={`/devices/${encodeURIComponent(device.deviceId)}`}>
                  <span>Offline</span>
                  <strong>{deviceTitle(device)}</strong>
                  <small>{unitOf(device)} / {fmtTime(device.updatedAt)}</small>
                </a>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </section>
    <section class={`panel aiPanel ${aiRecommendation?.status ?? 'empty'}`}>
      <div class="panelHeader compact">
        <div>
          <h2>AI 建議</h2>
          <p>{aiPanelMeta(aiRecommendation)}</p>
        </div>
        {#if data.user.is_admin}
          <button class="dispatchButton" type="button" disabled={aiBusy} onclick={runAiAnalysis}>{aiBusy ? '分析中' : '分析'}</button>
        {/if}
      </div>

      {#if !aiRecommendation}
        <p class="empty">尚無 AI 分析結果；管理者可手動觸發分析。</p>
      {:else}
        <article class="aiQueueItem">
          <div class="aiQueueMain">
            <span class={`aiBadge ${aiRecommendation.severity}`}>{aiSeverityText(aiRecommendation.severity)}</span>
            <div class="aiQueueText">
              <strong>{aiRecommendation.teamContext?.name || aiRecommendation.title}</strong>
              <p>{aiRecommendation.globalSummary || aiRecommendation.reasoningSummary || aiRecommendation.teamContext?.situationSummary || aiRecommendation.recommendedAction}</p>
            </div>
          </div>
          <button class="detailButton" type="button" onclick={() => (aiDialogOpen = true)}>詳情</button>
        </article>
      {/if}
    </section>
    <section class="panel alertPanel">
      <div class="panelHeader compact">
        <div>
          <h2>災害警示</h2>
          <p>{hazardLoading ? '載入中' : `${activeHazards.length} 則需注意`}</p>
        </div>
        {#if data.user.is_admin}
          <button class="dispatchButton" type="button" disabled={testDispatchBusy} onclick={triggerTestDispatch}>測試</button>
        {/if}
      </div>

      {#if hazardItems.length === 0}
        <p class="empty">{hazardNotice || '目前沒有災害警示。'}</p>
      {:else}
        <div class="alertList">
          {#each hazardItems.slice(0, 6) as item, index}
            {@const regionGroups = parseAlertRegionGroups(item.region)}
            {@const alertKey = alertCollapseKey(item, index)}
            <article class={`alertItem ${item.severity}`} data-alert-key={alertKey}>
              <div class="alertItemHead">
                <span class="alertSeverity">{severityText(item.severity)}</span>
                <strong>{item.title}</strong>
                <small>{regionGroups.length ? alertRegionSummary(regionGroups) : fmtIsoTime(item.eventAt ?? item.issuedAt)}</small>
              </div>
              <button class="detailButton" type="button" onclick={() => (activeAlert = item)}>詳情</button>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  </main>

  {#if aiDialogOpen && aiRecommendation}
    <div class="detailModalBackdrop" role="presentation" onclick={closeDialogOnBackdrop}>
      <div class="detailModal" role="dialog" aria-modal="true" aria-labelledby="ai-dialog-title" tabindex="-1">
        <header class="detailModalHeader">
          <div>
            <span class={`aiBadge ${aiRecommendation.severity}`}>{aiSeverityText(aiRecommendation.severity)}</span>
            <h2 id="ai-dialog-title">{aiRecommendation.title}</h2>
            <p>{aiPanelMeta(aiRecommendation)}</p>
          </div>
          <button class="modalClose" type="button" aria-label="關閉 AI 建議詳情" onclick={closeDetailDialogs}>×</button>
        </header>
        <div class="detailModalBody">
          {#if aiRecommendation.globalSummary || aiRecommendation.reasoningSummary}
            <p class="modalLead">{aiRecommendation.globalSummary || aiRecommendation.reasoningSummary}</p>
          {/if}
          {#if aiRecommendation.teamContext}
            <div class="aiTeamCard">
              <div class="aiTeamHead"><span>鎖定隊伍</span><strong>{aiRecommendation.teamContext.name}</strong></div>
              <p>{aiRecommendation.teamContext.situationSummary}</p>
              <div class="aiTeamGrid">
                <div><b>生理</b><span>{aiRecommendation.teamContext.physiologySummary}</span></div>
                <div><b>地形</b><span>{aiRecommendation.teamContext.terrainSummary}</span></div>
              </div>
              <p class="aiOperator">{aiRecommendation.teamContext.operatorRecommendation}</p>
            </div>
          {/if}
          {#if aiRecommendation.message}
            <div class="aiMessage"><span>{aiStatusText(aiRecommendation.status)} / Meshtastic 草稿</span><p>{aiRecommendation.message}</p></div>
          {/if}
          {#if aiRecommendation.targetAreas.length > 0}
            <div class="aiAreaList">{#each aiRecommendation.targetAreas as area}<span>{area}</span>{/each}</div>
          {/if}
          <div class="aiDetails">
            <div><b>建議動作</b><p>{aiRecommendation.recommendedAction}</p></div>
            {#if aiRecommendation.teamContext?.movementMeters != null}
              <div><b>位移檢查</b><p>最近 {aiRecommendation.teamContext.movementWindowMinutes ?? 30} 分鐘位移約 {aiRecommendation.teamContext.movementMeters}m。</p></div>
            {/if}
            {#if aiRecommendation.evidence.length > 0}
              <div><b>證據</b><ul>{#each aiRecommendation.evidence as evidence}<li>{evidence.label}{evidence.detail ? `：${evidence.detail}` : ''}</li>{/each}</ul></div>
            {/if}
            {#if aiRecommendation.validationErrors.length > 0 || aiRecommendation.dispatchError}
              <div class="aiErrors"><b>阻擋 / 錯誤</b><ul>{#each aiRecommendation.validationErrors as error}<li>{error}</li>{/each}{#if aiRecommendation.dispatchError}<li>{aiRecommendation.dispatchError}</li>{/if}</ul></div>
            {/if}
            <small>{aiRecommendation.provider} / {aiRecommendation.model}</small>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if activeAlert}
    {@const activeAlertGroups = parseAlertRegionGroups(activeAlert.region)}
    <div class="detailModalBackdrop" role="presentation" onclick={closeDialogOnBackdrop}>
      <div class="detailModal alertDetailModal" role="dialog" aria-modal="true" aria-labelledby="alert-dialog-title" tabindex="-1">
        <header class="detailModalHeader">
          <div>
            <span class="alertSeverity">{severityText(activeAlert.severity)}</span>
            <h2 id="alert-dialog-title">{activeAlert.title}</h2>
            <p>{fmtIsoTime(activeAlert.eventAt ?? activeAlert.issuedAt) || '未知時間'} · {alertRegionSummary(activeAlertGroups)}</p>
          </div>
          <button class="modalClose" type="button" aria-label="關閉災害警示詳情" onclick={closeDetailDialogs}>×</button>
        </header>
        <div class="detailModalBody">
          {#if activeAlertGroups.length > 0}
            <div class="alertRegionGroups modalRegions">
              {#each activeAlertGroups as group}
                <div class="alertRegionGroup">
                  <div class="alertRegionGroupHead"><span>{group.city}</span><b>{group.areas.length || 1}</b></div>
                  <small>{group.areas.join('、') || '全區'}</small>
                </div>
              {/each}
            </div>
          {:else}
            <p class="modalLead">目前警示未提供鄉鎮範圍。</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <div class="toastStack" aria-live="assertive" aria-atomic="false">
    {#each toasts as toast (toast.id)}
      <article class="eqToast" role="alert">
        <div class="eqToastHead">
          <strong>地震警示</strong>
          <button type="button" onclick={() => dismissToast(toast.id)} aria-label="關閉警示">×</button>
        </div>
        <p>{toast.title}</p>
        {#if toast.meta}<small>{toast.meta}</small>{/if}
        {#if toast.summary}<span>{toast.summary}</span>{/if}
      </article>
    {/each}
  </div>
</div>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@400;500;600;700&display=swap');

  :global(body){
    overflow-x: hidden;
  }

  :global(html:has(.commandShell)),
  :global(body:has(.commandShell)){
    overflow: hidden;
  }

  .commandShell{
    --bg: #071014;
    --panel: #0d1a20;
    --panel2: #10242b;
    --line: rgba(148, 163, 184, 0.2);
    --muted: #9fb1bb;
    --text: #edf7fb;
    --green: #10b981;
    --blue: #60a5fa;
    --amber: #f59e0b;
    --red: #ef4444;
    height: calc(100vh - 24px);
    min-height: 0;
    max-height: calc(100vh - 24px);
    box-sizing: border-box;
    overflow: hidden;
    display: grid;
    grid-template-rows: 54px 82px minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
    border-radius: 12px;
    background:
      linear-gradient(180deg, rgba(8, 20, 25, 0.96), rgba(5, 12, 16, 0.98)),
      repeating-linear-gradient(90deg, rgba(148, 163, 184, 0.05) 0 1px, transparent 1px 32px);
    color: var(--text);
    font-family: "Fira Sans", "Noto Sans TC", sans-serif;
  }

  .commandHeader,
  .kpiStrip,
  .opsGrid,
  .panel,
  .panelHeader,
  .headerStatus,
  .mapControls,
  .segmented,
  .mapLegend{
    min-width: 0;
  }

  .commandHeader{
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .eyebrow{
    margin: 0;
    color: var(--green);
    font-family: "Fira Code", monospace;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p{
    margin: 0;
    letter-spacing: 0;
  }

  h1{
    margin-top: 2px;
    font-size: 24px;
    line-height: 1.1;
  }

  .headerStatus{
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    color: var(--muted);
    font-family: "Fira Code", monospace;
    font-size: 12px;
  }

  .headerStatus span{
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 9px;
    background: rgba(255, 255, 255, 0.04);
  }

  .conn.open{
    color: #b7f7d8;
    border-color: rgba(16, 185, 129, 0.45);
    background: rgba(16, 185, 129, 0.12);
  }

  .conn.error{
    color: #fecaca;
    border-color: rgba(239, 68, 68, 0.45);
    background: rgba(239, 68, 68, 0.12);
  }

  .kpiStrip{
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }

  .kpi,
  .panel{
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgba(13, 26, 32, 0.88);
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.22);
  }

  .kpi{
    display: grid;
    align-content: center;
    gap: 2px;
    padding: 10px 12px;
    border-left: 3px solid var(--blue);
    color: var(--text);
    text-decoration: none;
    cursor: pointer;
    transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
  }

  .kpi:hover,
  .kpi:focus-visible{
    transform: translateY(-2px);
    border-color: rgba(237, 247, 251, 0.42);
    background: rgba(16, 32, 40, 0.96);
    outline: none;
  }

  .kpi.danger{ border-left-color: var(--red); }
  .kpi.risk{ border-left-color: #a78bfa; }
  .kpi.warn{ border-left-color: var(--amber); }
  .kpi.bind{ border-left-color: var(--green); }

  .kpi span,
  .kpi small{
    color: var(--muted);
    font-size: 12px;
  }

  .kpi strong{
    font-family: "Fira Code", monospace;
    font-size: 30px;
    line-height: 1;
  }

  .opsGrid{
    display: grid;
    grid-template-columns: minmax(520px, 1.45fr) minmax(290px, 0.78fr) minmax(320px, 0.92fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
    overflow: hidden;
  }

  .panel{
    overflow: hidden;
    padding: 12px;
  }

  .mapPanel{
    grid-row: 1 / -1;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 8px;
  }

  .riskPanel,
  .aiPanel,
  .alertPanel{
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
  }

  .riskPanel{
    grid-row: 1 / -1;
  }

  .panelHeader{
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .panelHeader h2{
    font-size: 17px;
    line-height: 1.2;
  }

  .panelHeader p,
  .panelHeader span{
    color: var(--muted);
    font-size: 12px;
    text-decoration: none;
  }

  .panelHeader span,
  .dispatchButton{
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 9px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }

  .mapControls{
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .segmented{
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
  }

  .segmented button{
    border: 0;
    padding: 5px 10px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-family: "Fira Code", monospace;
    font-size: 12px;
  }

  .segmented button.active{
    background: var(--green);
    color: #04120d;
  }

  .terrainToggle{
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--muted);
    font-size: 12px;
  }

  .mapLegend{
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    color: var(--muted);
    font-size: 12px;
  }

  .mapLegend span{
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .dot{
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
  }

  .green{ background: var(--green); }
  .blue{ background: var(--blue); }
  .orange{ background: var(--amber); }

  .tri{
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 9px solid var(--red);
  }

  .legendDivider{
    width: 1px;
    height: 14px;
    background: rgba(148, 163, 184, 0.28);
  }

  .hazardSwatch{
    width: 13px;
    height: 9px;
    display: inline-block;
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: 2px;
  }

  .hazardSwatch.rain{ background: #f59e0b; }
  .hazardSwatch.cold{ background: #06b6d4; }
  .hazardSwatch.earthquake{ background: #a855f7; }

  .mapViewport{
    min-height: 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    background: #111827;
  }

  .riskList{
    overflow: auto;
    padding-right: 2px;
  }

  .aiPanel{
    border-color: rgba(129, 140, 248, 0.28);
  }

  .aiPanel.sent{
    border-color: rgba(16, 185, 129, 0.42);
  }

  .aiPanel.blocked,
  .aiPanel.failed{
    border-color: rgba(245, 158, 11, 0.38);
  }

  .aiCard{
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 8px;
    overflow: auto;
    padding-right: 2px;
    scrollbar-width: none;
  }

  .aiCard::-webkit-scrollbar{
    display: none;
  }

  .aiQueueItem{
    min-width: 0;
    align-self: start;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(129, 140, 248, 0.24);
    border-radius: 8px;
    padding: 8px;
    background: rgba(99, 102, 241, 0.08);
  }

  .aiQueueMain{
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }

  .aiQueueText{
    min-width: 0;
  }

  .aiQueueText strong,
  .aiQueueText p{
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aiQueueText strong{
    font-size: 13px;
  }

  .aiQueueText p{
    margin-top: 3px;
    color: var(--muted);
    font-size: 11px;
  }

  .detailButton{
    min-height: 28px;
    border: 1px solid rgba(96, 165, 250, 0.3);
    border-radius: 999px;
    padding: 4px 9px;
    background: rgba(96, 165, 250, 0.1);
    color: #dbeafe;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    transition: border-color 180ms ease, background 180ms ease;
  }

  .detailButton:hover,
  .detailButton:focus-visible{
    border-color: rgba(96, 165, 250, 0.65);
    background: rgba(96, 165, 250, 0.2);
    outline: none;
  }

  .aiBadge{
    min-width: 38px;
    border-radius: 6px;
    padding: 3px 6px;
    background: rgba(96, 165, 250, 0.15);
    color: #bfdbfe;
    font-family: "Fira Code", monospace;
    font-size: 12px;
    text-align: center;
  }

  .aiBadge.warning,
  .aiBadge.watch{
    background: rgba(245, 158, 11, 0.14);
    color: #fcd34d;
  }

  .aiBadge.critical{
    background: rgba(239, 68, 68, 0.18);
    color: #fecaca;
  }

  .aiReason{
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }

  .aiTeamCard{
    display: grid;
    gap: 8px;
    border: 1px solid rgba(96, 165, 250, 0.2);
    border-radius: 8px;
    padding: 8px;
    background: rgba(14, 48, 68, 0.42);
  }

  .aiTeamHead{
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }

  .aiTeamHead span{
    border-radius: 999px;
    padding: 3px 7px;
    background: rgba(96, 165, 250, 0.14);
    color: #bfdbfe;
    font-size: 11px;
    font-weight: 800;
  }

  .aiTeamHead strong{
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font-size: 13px;
  }

  .aiTeamCard p,
  .aiTeamGrid span{
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }

  .aiTeamGrid{
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .aiTeamGrid div{
    min-width: 0;
    display: grid;
    gap: 3px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 7px;
    padding: 7px;
    background: rgba(15, 23, 42, 0.22);
  }

  .aiTeamGrid b{
    color: #93c5fd;
    font-size: 11px;
  }

  .aiOperator{
    border-top: 1px solid rgba(148, 163, 184, 0.12);
    padding-top: 7px;
  }

  .aiMessage{
    display: grid;
    gap: 5px;
    border: 1px solid rgba(16, 185, 129, 0.22);
    border-radius: 8px;
    padding: 8px;
    background: rgba(16, 185, 129, 0.07);
  }

  .aiMessage span{
    color: #a7f3d0;
    font-family: "Fira Code", monospace;
    font-size: 11px;
  }

  .aiMessage p{
    color: var(--text);
    font-size: 12px;
    line-height: 1.45;
  }

  .aiAreaList{
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .aiAreaList span{
    border: 1px solid rgba(96, 165, 250, 0.18);
    border-radius: 999px;
    padding: 2px 7px;
    background: rgba(96, 165, 250, 0.08);
    color: #bfdbfe;
    font-size: 11px;
  }

  .aiDetails{
    display: grid;
    gap: 8px;
    border-top: 1px solid rgba(148, 163, 184, 0.14);
    padding-top: 8px;
  }

  .aiDetails b,
  .aiDetails small{
    color: var(--muted);
    font-size: 11px;
  }

  .aiDetails p,
  .aiDetails li{
    color: var(--text);
    font-size: 12px;
    line-height: 1.45;
  }

  .aiDetails ul{
    margin: 4px 0 0;
    padding-left: 16px;
  }

  .aiErrors{
    border: 1px solid rgba(245, 158, 11, 0.22);
    border-radius: 8px;
    padding: 7px;
    background: rgba(245, 158, 11, 0.06);
  }

  .alertList{
    overflow: auto;
    padding-right: 4px;
    overscroll-behavior: contain;
  }

  .alertList,
  .riskList{
    scrollbar-width: thin;
    scrollbar-color: rgba(96, 165, 250, 0.55) rgba(15, 23, 42, 0.55);
  }

  .alertList,
  .riskList{
    scrollbar-width: none;
  }

  .alertList::-webkit-scrollbar,
  .riskList::-webkit-scrollbar{
    width: 7px;
    height: 7px;
  }

  .alertList::-webkit-scrollbar,
  .riskList::-webkit-scrollbar{
    display: none;
  }

  .alertList::-webkit-scrollbar-track{
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.55);
  }

  .alertList::-webkit-scrollbar-thumb{
    border-radius: 999px;
    border: 2px solid rgba(15, 23, 42, 0.55);
    background: linear-gradient(180deg, rgba(16, 185, 129, 0.75), rgba(96, 165, 250, 0.75));
  }

  .alertList::-webkit-scrollbar-thumb:hover{
    background: linear-gradient(180deg, rgba(52, 211, 153, 0.92), rgba(147, 197, 253, 0.92));
  }

  .riskList,
  .alertList{
    display: grid;
    align-content: start;
    gap: 8px;
  }

  .riskItem,
  .alertItem{
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.045);
  }

  .combinedRiskList{
    gap: 10px;
  }

  .riskGroup{
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .riskGroupHead{
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    border-radius: 7px;
    padding: 4px 7px;
    background: rgba(148, 163, 184, 0.08);
    color: var(--text);
    font-size: 12px;
  }

  .riskGroupHead span{
    min-width: 24px;
    border-radius: 999px;
    padding: 1px 7px;
    background: rgba(255, 255, 255, 0.08);
    color: #e5e7eb;
    font-family: "Fira Code", monospace;
    text-align: center;
  }

  .riskGroupHead.danger,
  .riskGroupHead.critical{
    background: rgba(239, 68, 68, 0.12);
    color: #fecaca;
  }

  .riskGroupHead.warn{
    background: rgba(245, 158, 11, 0.11);
    color: #fde68a;
  }

  .riskGroupHead.muted{
    background: rgba(148, 163, 184, 0.09);
    color: #cbd5e1;
  }

  .riskItem{
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 3px 8px;
    padding: 8px;
    color: var(--text);
    text-decoration: none;
  }

  .riskItem span{
    grid-row: span 3;
    align-self: start;
    border-radius: 6px;
    padding: 5px 7px;
    background: rgba(96, 165, 250, 0.16);
    color: #dbeafe;
    font-family: "Fira Code", monospace;
    font-size: 12px;
    font-style: normal;
  }

  .riskItem.high span,
  .riskItem.critical span,
  .riskItem.danger span{
    background: rgba(239, 68, 68, 0.18);
    color: #fecaca;
  }

  .riskItem.warn span{
    background: rgba(245, 158, 11, 0.16);
    color: #fde68a;
  }

  .riskItem.muted span{
    background: rgba(148, 163, 184, 0.12);
    color: #cbd5e1;
  }

  .riskItem strong{
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .riskItem small,
  .riskItem em,
  .alertItem small{
    color: var(--muted);
    font-size: 12px;
    font-style: normal;
    line-height: 1.35;
  }

  .alertItem{
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    padding: 8px;
    overflow: visible;
    transition: border-color 180ms ease, background 180ms ease;
  }

  .alertItem:focus-within{
    border-color: rgba(245, 158, 11, 0.48);
    background: rgba(245, 158, 11, 0.07);
    outline: none;
  }

  .alertItemHead{
    min-width: 0;
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
    font: inherit;
    list-style: none;
  }

  .alertSeverity{
    min-width: 38px;
    border-radius: 6px;
    padding: 3px 6px;
    background: rgba(245, 158, 11, 0.14);
    color: var(--amber);
    font-family: "Fira Code", monospace;
    font-size: 12px;
    text-align: center;
  }

  .alertItem.critical .alertSeverity{
    background: rgba(239, 68, 68, 0.18);
    color: #fecaca;
  }

  .alertItemHead strong{
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .alertItemHead small{
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }

  .alertRegionGroups{
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    padding: 1px 2px 2px 0;
  }

  .detailModalBackdrop{
    position: fixed;
    inset: 0;
    z-index: 2500;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(2, 6, 23, 0.78);
    backdrop-filter: blur(5px);
  }

  .detailModal{
    width: min(760px, 100%);
    max-height: min(82vh, 760px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid rgba(96, 165, 250, 0.42);
    border-radius: 10px;
    background: #08171e;
    color: var(--text);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
  }

  .detailModalHeader{
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 16px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
    padding: 16px 18px;
    background: rgba(15, 47, 64, 0.72);
  }

  .detailModalHeader > div{
    min-width: 0;
  }

  .detailModalHeader h2{
    margin-top: 8px;
    overflow-wrap: anywhere;
    font-size: 20px;
    line-height: 1.25;
  }

  .detailModalHeader p{
    margin-top: 5px;
    color: var(--muted);
    font-size: 12px;
  }

  .modalClose{
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 50%;
    padding: 0;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text);
    cursor: pointer;
    font-size: 22px;
    line-height: 1;
  }

  .modalClose:hover,
  .modalClose:focus-visible{
    border-color: rgba(96, 165, 250, 0.62);
    background: rgba(96, 165, 250, 0.15);
    outline: none;
  }

  .detailModalBody{
    min-height: 0;
    display: grid;
    align-content: start;
    gap: 12px;
    overflow-y: auto;
    padding: 16px 18px 20px;
    scrollbar-color: rgba(96, 165, 250, 0.42) transparent;
    scrollbar-width: thin;
  }

  .modalLead{
    color: #d6e3e8;
    font-size: 14px;
    line-height: 1.55;
  }

  .modalRegions{
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .alertRegionGroup{
    min-width: 0;
  }

  .alertRegionGroupHead{
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px 6px;
    min-height: 28px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 7px;
    padding: 4px 7px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    font: inherit;
    font-size: 12px;
  }

  .alertRegionGroupHead span{
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
  }

  .alertRegionGroup small{
    min-width: 0;
    display: block;
    overflow: hidden;
    margin-top: 3px;
    border: 1px solid rgba(96, 165, 250, 0.16);
    border-radius: 7px;
    padding: 5px 7px;
    background: rgba(96, 165, 250, 0.07);
    color: var(--muted);
    font-size: 10.5px;
    line-height: 1.45;
    white-space: normal;
  }

  .alertRegionGroupHead b{
    min-width: 20px;
    border-radius: 999px;
    padding: 0 5px;
    background: rgba(245, 158, 11, 0.18);
    color: #fcd34d;
    font-family: "Fira Code", monospace;
    font-size: 11px;
    line-height: 1.5;
    text-align: center;
  }

  .empty{
    border: 1px dashed var(--line);
    border-radius: 8px;
    padding: 10px;
    color: var(--muted);
    font-size: 13px;
  }

  .toastStack{
    position: fixed;
    top: 14px;
    right: 14px;
    z-index: 80;
    display: grid;
    gap: 8px;
    width: min(360px, calc(100vw - 28px));
    pointer-events: none;
  }

  .eqToast{
    pointer-events: auto;
    border: 1px solid rgba(239, 68, 68, 0.38);
    border-left: 4px solid var(--red);
    border-radius: 8px;
    background: rgba(13, 26, 32, 0.96);
    padding: 10px;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.32);
  }

  .eqToastHead{
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .eqToast button{
    border: 0;
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }

  .eqToast p,
  .eqToast small,
  .eqToast span{
    display: block;
    margin-top: 4px;
    color: var(--muted);
    font-size: 12px;
  }

  @media (max-width: 1180px){
    :global(html:has(.commandShell)),
    :global(body:has(.commandShell)){
      overflow: auto;
    }

    .commandShell{
      height: auto;
      max-height: none;
      overflow: visible;
      margin: 0;
      border-radius: 0;
    }

    .opsGrid{
      grid-template-columns: 1fr;
      grid-template-rows: auto;
      overflow: visible;
    }

    .mapPanel,
    .riskPanel,
    .aiPanel,
    .alertPanel{
      grid-row: auto;
    }

    .panel{
      overflow: visible;
    }

    .riskList,
    .aiCard,
    .alertList{
      max-height: none;
      overflow: visible;
    }
  }

  @media (max-width: 760px){
    .commandShell{
      min-height: 0;
      grid-template-rows: auto;
    }

    .commandHeader,
    .headerStatus{
      align-items: flex-start;
      flex-direction: column;
    }

    .kpiStrip{
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .alertRegionGroups{
      grid-template-columns: 1fr;
    }

    .aiTeamGrid{
      grid-template-columns: 1fr;
    }

    .detailModalBackdrop{
      align-items: end;
      padding: 10px;
    }

    .detailModal{
      max-height: 88vh;
    }

    .detailModalHeader,
    .detailModalBody{
      padding-left: 14px;
      padding-right: 14px;
    }

    .modalRegions{
      grid-template-columns: 1fr;
    }
  }
</style>
