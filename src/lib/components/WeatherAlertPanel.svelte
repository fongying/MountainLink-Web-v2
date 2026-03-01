<script lang="ts">
  import { onMount } from 'svelte';
  import type { ColdAlert, EarthquakeEvent, RainAlert } from '$lib/types';

  const EQ_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
  const EQ_MAX_COUNT = 3;

  export let county: string | null = null;
  export let title = '自然災害警示區';

  type AlertKind = 'RAIN' | 'COLD' | 'EQ';

  type AlertItem = {
    id: string;
    kind: AlertKind;
    level: string;
    title: string;
    headline: string;
    areas: string[];
    issuedAt: number;
    expiresAt?: number;
    priority: number;
    eqIntensity?: number;
  };

  let alerts: AlertItem[] = [];
  let updatedAt: number | null = null;
  let loading = true;
  let error = '';

  let rainCount = 0;
  let coldCount = 0;
  let eqCount = 0;

  let view: 'ALL' | AlertKind = 'ALL';

  const fmtTime = (ms: number) => new Date(ms).toLocaleString();

  $: visibleAlerts = view === 'ALL' ? alerts : alerts.filter((a) => a.kind === view);

  function buildWeatherUrl(pathname: string) {
    const url = new URL(pathname, window.location.origin);
    url.searchParams.set('activeOnly', 'true');
    url.searchParams.set('includeEnded', 'false');
    url.searchParams.set('limit', '50');
    if (county) url.searchParams.set('county', county);
    return `${url.pathname}${url.search}`;
  }

  function rainPriority(level: string) {
    if (level.includes('超大豪雨')) return 44;
    if (level.includes('大豪雨')) return 43;
    if (level.includes('豪雨')) return 42;
    if (level.includes('大雨')) return 41;
    return 40;
  }

  function coldPriority(level: string) {
    if (level.includes('紅色')) return 34;
    if (level.includes('橙色')) return 33;
    if (level.includes('黃色')) return 32;
    return 31;
  }

  function eqPriority(eq: EarthquakeEvent) {
    const intensity = eq.maxIntensity ?? 0;
    return 45 + intensity * 2 + (eq.hasReport ? 2 : 0);
  }

  function levelClass(item: AlertItem) {
    if (item.kind === 'RAIN') {
      if (item.level.includes('超大豪雨')) return 'lv-rain-red';
      if (item.level.includes('大豪雨')) return 'lv-rain-orange';
      if (item.level.includes('豪雨')) return 'lv-rain-gold';
      return 'lv-rain-yellow';
    }

    if (item.kind === 'COLD') {
      if (item.level.includes('紅色')) return 'lv-cold-red';
      if (item.level.includes('橙色')) return 'lv-cold-orange';
      if (item.level.includes('黃色')) return 'lv-cold-yellow';
      return 'lv-cold-blue';
    }

    if ((item.eqIntensity ?? 0) >= 5) return 'lv-eq-high';
    if ((item.eqIntensity ?? 0) >= 3) return 'lv-eq-mid';
    return 'lv-eq-low';
  }

  function kindClass(kind: AlertKind) {
    if (kind === 'RAIN') return 'kind-rain';
    if (kind === 'COLD') return 'kind-cold';
    return 'kind-eq';
  }

  function kindLabel(kind: AlertKind) {
    if (kind === 'RAIN') return '豪雨';
    if (kind === 'COLD') return '低溫';
    return '地震';
  }

  function toEqAlerts(events: EarthquakeEvent[]): AlertItem[] {
    const cutoff = Date.now() - EQ_WINDOW_MS;

    return events
      .filter((e) => (e.originTime ?? e.firstSeenAt ?? 0) >= cutoff)
      .sort(
        (a, b) =>
          b.severityScore - a.severityScore ||
          (b.originTime ?? b.firstSeenAt ?? 0) - (a.originTime ?? a.firstSeenAt ?? 0)
      )
      .slice(0, EQ_MAX_COUNT)
      .map<AlertItem>((e) => ({
        id: e.id,
        kind: 'EQ',
        level: e.maxIntensity != null ? `最大震度 ${e.maxIntensity}` : '地震通知',
        title: e.title,
        headline: e.summary,
        areas: Object.keys(e.intensityByCounty ?? {}).slice(0, 8),
        issuedAt: e.originTime ?? e.firstSeenAt,
        priority: eqPriority(e),
        eqIntensity: e.maxIntensity
      }));
  }

  async function loadAlerts() {
    try {
      error = '';

      const [rainRes, coldRes, eqRes] = await Promise.all([
        fetch(buildWeatherUrl('/api/alerts/rain'), { method: 'GET' }),
        fetch(buildWeatherUrl('/api/alerts/cold'), { method: 'GET' }),
        fetch('/api/eq/events?limit=30', { method: 'GET' })
      ]);

      if (!rainRes.ok || !coldRes.ok || !eqRes.ok) {
        throw new Error(`rain=${rainRes.status}, cold=${coldRes.status}, eq=${eqRes.status}`);
      }

      const rainJson = (await rainRes.json()) as { updatedAt: number; alerts: RainAlert[] };
      const coldJson = (await coldRes.json()) as { updatedAt: number; alerts: ColdAlert[] };
      const eqJson = (await eqRes.json()) as { updatedAt: number; events: EarthquakeEvent[] };

      const rainAlerts = (rainJson.alerts ?? []).map<AlertItem>((a) => ({
        id: a.id,
        kind: 'RAIN',
        level: a.level,
        title: a.title,
        headline: a.headline,
        areas: a.areas,
        issuedAt: a.issuedAt,
        expiresAt: a.expiresAt,
        priority: rainPriority(a.level)
      }));

      const coldAlerts = (coldJson.alerts ?? []).map<AlertItem>((a) => ({
        id: a.id,
        kind: 'COLD',
        level: a.level,
        title: a.title,
        headline: a.headline,
        areas: a.counties.length ? a.counties : a.areas,
        issuedAt: a.issuedAt,
        expiresAt: a.expiresAt,
        priority: coldPriority(a.level)
      }));

      const eqAlerts = toEqAlerts(eqJson.events ?? []);

      rainCount = rainAlerts.length;
      coldCount = coldAlerts.length;
      eqCount = eqAlerts.length;

      alerts = [...rainAlerts, ...coldAlerts, ...eqAlerts].sort(
        (a, b) => b.priority - a.priority || b.issuedAt - a.issuedAt
      );

      updatedAt = Math.max(rainJson.updatedAt || 0, coldJson.updatedAt || 0, eqJson.updatedAt || 0, Date.now());
    } catch (e) {
      error = `警報資料載入失敗：${e instanceof Error ? e.message : 'unknown error'}`;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadAlerts();
    const timer = setInterval(() => void loadAlerts(), 60_000);
    return () => clearInterval(timer);
  });
</script>

<section class="card alertCenter">
  <div class="cardHeader">
    <div>
      <h2>{title}</h2>
      <p class="muted">整合豪雨、低溫、地震；地震僅顯示近 3 天最多 3 則</p>
    </div>
    <div class="meta">
      <div class="segment" role="group" aria-label="Alert type filter">
        <button class={`seg ${view === 'ALL' ? 'seg-active' : ''}`} type="button" on:click={() => (view = 'ALL')} aria-pressed={view === 'ALL'}>
          全部
        </button>
        <button class={`seg ${view === 'RAIN' ? 'seg-active' : ''}`} type="button" on:click={() => (view = 'RAIN')} aria-pressed={view === 'RAIN'}>
          豪雨
        </button>
        <button class={`seg ${view === 'COLD' ? 'seg-active' : ''}`} type="button" on:click={() => (view = 'COLD')} aria-pressed={view === 'COLD'}>
          低溫
        </button>
        <button class={`seg ${view === 'EQ' ? 'seg-active' : ''}`} type="button" on:click={() => (view = 'EQ')} aria-pressed={view === 'EQ'}>
          地震
        </button>
      </div>

      <div class="chipRow">
        <span class="chip chip-rain">豪雨 {rainCount}</span>
        <span class="chip chip-cold">低溫 {coldCount}</span>
        <span class="chip chip-eq">地震 {eqCount}</span>
      </div>

      {#if updatedAt}
        <span>更新：{fmtTime(updatedAt)}</span>
      {/if}
      {#if county}
        <span class="county">{county}</span>
      {/if}
    </div>
  </div>

  {#if error}
    <p class="error">{error}</p>
  {:else if loading && visibleAlerts.length === 0}
    <p class="empty">資料載入中...</p>
  {:else if visibleAlerts.length === 0}
    <p class="empty">目前沒有符合條件的告警</p>
  {:else}
    <div class="alerts">
      {#each visibleAlerts as a (a.kind + ':' + a.id)}
        <article class="alert">
          <div class="alertTop">
            <div class="left">
              <span class={`kind ${kindClass(a.kind)}`}>{kindLabel(a.kind)}</span>
              <span class={`badge ${levelClass(a)}`}>{a.level}</span>
            </div>
            <span class="issued">{fmtTime(a.issuedAt)}</span>
          </div>

          <h3>{a.title}</h3>
          <p class="headline">{a.headline}</p>
          {#if a.areas.length > 0}
            <p class="areas">{a.areas.join('、')}</p>
          {/if}
          {#if a.expiresAt}
            <p class="expires">到期：{fmtTime(a.expiresAt)}</p>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .alertCenter {
    margin-top: 16px;
  }

  .card {
    min-width: 0;
    border: 1px solid rgba(12, 40, 46, 0.12);
    border-radius: 16px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 14px 38px rgba(10, 22, 26, 0.12);
    overflow: hidden;
  }

  .cardHeader {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    font-family: 'Space Grotesk', 'Noto Sans TC', sans-serif;
  }

  h3 {
    margin: 0;
    font-size: 16px;
  }

  .muted {
    margin: 4px 0 0;
    color: #53656a;
    font-size: 13px;
  }

  .meta {
    display: grid;
    justify-items: end;
    gap: 4px;
    font-size: 12px;
    color: #53656a;
  }

  .segment {
    display: inline-flex;
    border: 1px solid rgba(12, 40, 46, 0.12);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.85);
    overflow: hidden;
  }

  .seg {
    border: 0;
    background: transparent;
    color: #53656a;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .seg-active {
    color: #f8fbfb;
    background: #0b1b1e;
  }

  .chipRow {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .chip {
    border-radius: 999px;
    border: 1px solid transparent;
    padding: 2px 8px;
    font-weight: 700;
  }

  .chip-rain {
    color: #7c2d12;
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.16);
  }

  .chip-cold {
    color: #1e3a8a;
    border-color: #60a5fa;
    background: rgba(96, 165, 250, 0.16);
  }

  .chip-eq {
    color: #7f1d1d;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.16);
  }

  .county {
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(12, 40, 46, 0.18);
    background: rgba(255, 255, 255, 0.7);
  }

  .alerts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 10px;
  }

  .alert {
    border: 1px solid rgba(12, 40, 46, 0.12);
    border-radius: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.82);
    display: grid;
    gap: 8px;
  }

  .alertTop {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .left {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .kind {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    border: 1px solid transparent;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .kind-rain {
    color: #7c2d12;
    border-color: #fbbf24;
    background: rgba(251, 191, 36, 0.12);
  }

  .kind-cold {
    color: #1e3a8a;
    border-color: #93c5fd;
    background: rgba(147, 197, 253, 0.12);
  }

  .kind-eq {
    color: #7f1d1d;
    border-color: #fca5a5;
    background: rgba(252, 165, 165, 0.14);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    border: 1px solid transparent;
  }

  .lv-rain-red {
    color: #7f1d1d;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.16);
  }

  .lv-rain-orange {
    color: #9a3412;
    border-color: #f97316;
    background: rgba(249, 115, 22, 0.16);
  }

  .lv-rain-gold {
    color: #854d0e;
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.16);
  }

  .lv-rain-yellow {
    color: #7c2d12;
    border-color: #fbbf24;
    background: rgba(251, 191, 36, 0.16);
  }

  .lv-cold-red {
    color: #7f1d1d;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.16);
  }

  .lv-cold-orange {
    color: #9a3412;
    border-color: #f97316;
    background: rgba(249, 115, 22, 0.16);
  }

  .lv-cold-yellow {
    color: #854d0e;
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.16);
  }

  .lv-cold-blue {
    color: #1e3a8a;
    border-color: #60a5fa;
    background: rgba(96, 165, 250, 0.16);
  }

  .lv-eq-high {
    color: #7f1d1d;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.16);
  }

  .lv-eq-mid {
    color: #9a3412;
    border-color: #f97316;
    background: rgba(249, 115, 22, 0.16);
  }

  .lv-eq-low {
    color: #0b1b1e;
    border-color: rgba(12, 40, 46, 0.22);
    background: rgba(12, 40, 46, 0.08);
  }

  .issued,
  .expires {
    font-size: 12px;
    color: #53656a;
    margin: 0;
  }

  .headline,
  .areas {
    margin: 0;
    font-size: 13px;
    color: #53656a;
  }

  .empty {
    margin: 0;
    padding: 12px;
    border-radius: 12px;
    background: rgba(12, 40, 46, 0.06);
    color: #53656a;
  }

  .error {
    margin: 0;
    padding: 12px;
    border-radius: 12px;
    background: rgba(239, 68, 68, 0.12);
    color: #991b1b;
  }

  @media (max-width: 720px) {
    .meta {
      justify-items: start;
    }
  }
</style>
