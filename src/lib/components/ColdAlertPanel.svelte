<script lang="ts">
  import { onMount } from 'svelte';
  import type { ColdAlert } from '$lib/types';

  export let county: string | null = null;
  export let title = '低溫特報';

  let alerts: ColdAlert[] = [];
  let updatedAt: number | null = null;
  let loading = true;
  let error = '';

  function buildUrl() {
    const url = new URL('/api/alerts/cold', window.location.origin);
    url.searchParams.set('activeOnly', 'true');
    url.searchParams.set('includeEnded', 'false');
    url.searchParams.set('limit', '30');
    if (county) url.searchParams.set('county', county);
    return `${url.pathname}${url.search}`;
  }

  async function loadAlerts() {
    try {
      error = '';
      const res = await fetch(buildUrl(), { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { updatedAt: number; alerts: ColdAlert[] };
      alerts = json.alerts ?? [];
      updatedAt = json.updatedAt ?? Date.now();
    } catch (e) {
      error = `警報資料載入失敗：${e instanceof Error ? e.message : 'unknown error'}`;
    } finally {
      loading = false;
    }
  }

  const fmtTime = (ms: number) => new Date(ms).toLocaleString();

  onMount(() => {
    void loadAlerts();
    const timer = setInterval(() => void loadAlerts(), 60_000);
    return () => clearInterval(timer);
  });
</script>

<section class="card coldCard">
  <div class="cardHeader">
    <div>
      <h2>{title}</h2>
      <p class="muted">資料來源：中央氣象署 W-C0033-004 低溫特報</p>
    </div>
    <div class="meta">
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
  {:else if loading && alerts.length === 0}
    <p class="empty">資料載入中...</p>
  {:else if alerts.length === 0}
    <p class="empty">目前沒有生效中的低溫特報</p>
  {:else}
    <div class="alerts">
      {#each alerts as a (a.id)}
        <article class="alert">
          <div class="alertTop">
            <span
              class={`badge ${
                a.level === '低溫紅色燈號'
                  ? 'lv-red'
                  : a.level === '低溫橙色燈號'
                    ? 'lv-orange'
                    : a.level === '低溫黃色燈號'
                      ? 'lv-yellow'
                      : 'lv-cold'
              }`}
            >
              {a.level}
            </span>
            {#if a.expiresAt}
              <span class="expires">至 {fmtTime(a.expiresAt)}</span>
            {/if}
          </div>
          <h3>{a.title}</h3>
          <p class="headline">{a.headline}</p>
          <div class="areas">
            {#each a.counties as c}
              <span class="areaChip">{c}</span>
            {/each}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .coldCard {
    margin-top: 0;
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

  .county {
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(12, 40, 46, 0.18);
    background: rgba(255, 255, 255, 0.7);
  }

  .alerts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
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

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    border: 1px solid transparent;
  }

  .lv-red {
    color: #7f1d1d;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.16);
  }

  .lv-orange {
    color: #9a3412;
    border-color: #f97316;
    background: rgba(249, 115, 22, 0.16);
  }

  .lv-yellow {
    color: #854d0e;
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.16);
  }

  .lv-cold {
    color: #1e3a8a;
    border-color: #60a5fa;
    background: rgba(96, 165, 250, 0.16);
  }

  .expires {
    font-size: 12px;
    color: #53656a;
  }

  .headline {
    margin: 0;
    font-size: 13px;
    color: #53656a;
  }

  .areas {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .areaChip {
    font-size: 12px;
    color: #0b1b1e;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(12, 40, 46, 0.12);
    background: rgba(255, 255, 255, 0.8);
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
</style>
