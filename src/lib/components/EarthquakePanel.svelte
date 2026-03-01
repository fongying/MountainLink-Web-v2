<script lang="ts">
  import { onMount } from 'svelte';
  import type { EarthquakeEvent } from '$lib/types';

  export let title = '地震通知';

  let events: EarthquakeEvent[] = [];
  let updatedAt: number | null = null;
  let loading = true;
  let error = '';

  const fmtTime = (ms: number) => new Date(ms).toLocaleString();

  function intensityText(e: EarthquakeEvent) {
    if (!e.intensityByCounty) return '-';
    const sorted = Object.entries(e.intensityByCounty).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant')
    );
    return sorted
      .slice(0, 5)
      .map(([county, intensity]) => `${county}${intensity}級`)
      .join('、');
  }

  async function loadEvents() {
    try {
      error = '';
      const res = await fetch('/api/eq/events?limit=20', { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { updatedAt: number; events: EarthquakeEvent[] };
      events = json.events ?? [];
      updatedAt = json.updatedAt ?? Date.now();
    } catch (e) {
      error = `地震資料載入失敗：${e instanceof Error ? e.message : 'unknown error'}`;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadEvents();
    const timer = setInterval(() => void loadEvents(), 60_000);
    return () => clearInterval(timer);
  });
</script>

<section class="card eqCard">
  <div class="cardHeader">
    <div>
      <h2>{title}</h2>
      <p class="muted">Trigger + CWA 地震報告整合</p>
    </div>
    {#if updatedAt}
      <span class="updated">更新：{fmtTime(updatedAt)}</span>
    {/if}
  </div>

  {#if error}
    <p class="error">{error}</p>
  {:else if loading && events.length === 0}
    <p class="empty">資料載入中...</p>
  {:else if events.length === 0}
    <p class="empty">目前沒有地震事件</p>
  {:else}
    <div class="events">
      {#each events as e (e.id)}
        <article class={`event ${e.hasReport ? 'has-report' : 'trigger-only'}`}>
          <div class="top">
            <div class="badges">
              <span class={`badge ${e.hasReport ? 'badge-report' : 'badge-trigger'}`}>
                {#if e.hasReport}Report{:else}Trigger{/if}
              </span>
              {#if e.hasTrigger}
                <span class="badge badge-source">x{e.triggerIds.length}</span>
              {/if}
            </div>
            <span class="time">{fmtTime(e.originTime ?? e.firstSeenAt)}</span>
          </div>

          <h3>{e.title}</h3>
          <p class="summary">{e.summary}</p>

          <div class="meta">
            <span>最大震度：{e.maxIntensity ?? '-'}</span>
            <span>規模：{e.magnitude != null ? `M${e.magnitude.toFixed(1)}` : '-'}</span>
            <span>深度：{e.depthKm != null ? `${e.depthKm} km` : '-'}</span>
          </div>
          {#if e.hasReport}
            <p class="counties">縣市震度：{intensityText(e)}</p>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .eqCard {
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
    gap: 8px;
    margin-bottom: 10px;
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

  .updated {
    font-size: 12px;
    color: #53656a;
  }

  .events {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 10px;
  }

  .event {
    border: 1px solid rgba(12, 40, 46, 0.12);
    border-radius: 12px;
    padding: 12px;
    display: grid;
    gap: 8px;
    background: rgba(255, 255, 255, 0.84);
  }

  .has-report {
    border-left: 4px solid #f59e0b;
  }

  .trigger-only {
    border-left: 4px solid #ef4444;
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .badges {
    display: inline-flex;
    gap: 6px;
  }

  .badge {
    font-size: 11px;
    font-weight: 700;
    border: 1px solid transparent;
    border-radius: 999px;
    padding: 2px 8px;
  }

  .badge-report {
    color: #854d0e;
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.16);
  }

  .badge-trigger {
    color: #7f1d1d;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.16);
  }

  .badge-source {
    color: #1e3a8a;
    border-color: #60a5fa;
    background: rgba(96, 165, 250, 0.16);
  }

  .time {
    font-size: 12px;
    color: #53656a;
  }

  .summary,
  .counties {
    margin: 0;
    color: #53656a;
    font-size: 13px;
  }

  .meta {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 12px;
    color: #0b1b1e;
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
