<script lang="ts">
  import type { AlertItem, HazardType, Severity } from '$lib/types/alerts';

  export let title = '自然災害警示區';
  export let items: AlertItem[] = [];
  export let loading = false;
  export let notice = '';

  let view: 'all' | HazardType = 'all';

  $: rainCount = items.filter((x) => x.type === 'rain').length;
  $: coldCount = items.filter((x) => x.type === 'cold').length;
  $: eqCount = items.filter((x) => x.type === 'earthquake').length;
  $: visibleItems = view === 'all' ? items : items.filter((x) => x.type === view);

  function typeLabel(type: HazardType) {
    if (type === 'rain') return '豪雨';
    if (type === 'cold') return '低溫';
    return '地震';
  }

  function typeIcon(type: HazardType) {
    if (type === 'rain') return '🌧️';
    if (type === 'cold') return '🥶';
    return '🌎';
  }

  function severityLabel(severity: Severity) {
    if (severity === 'critical') return '重大';
    if (severity === 'warning') return '警戒';
    if (severity === 'watch') return '注意';
    return '資訊';
  }

  function severityClass(severity: Severity) {
    if (severity === 'critical') return 'sev-critical';
    if (severity === 'warning') return 'sev-warning';
    if (severity === 'watch') return 'sev-watch';
    return 'sev-info';
  }

  function fmtTime(v?: string) {
    if (!v) return '—';
    const t = Date.parse(v);
    if (!Number.isFinite(t)) return '—';
    return new Date(t).toLocaleString();
  }
</script>

<section class="card hazardCard">
  <div class="cardHeader">
    <div>
      <h2>{title}</h2>
      <p class="muted">同一清單顯示雨、低溫、地震；地震只保留近 3 天最多 3 筆</p>
    </div>
    <div class="meta">
      <div class="segment" role="group" aria-label="Hazard filter">
        <button class={`seg ${view === 'all' ? 'seg-active' : ''}`} type="button" on:click={() => (view = 'all')} aria-pressed={view === 'all'}>
          全部
        </button>
        <button class={`seg ${view === 'rain' ? 'seg-active' : ''}`} type="button" on:click={() => (view = 'rain')} aria-pressed={view === 'rain'}>
          豪雨
        </button>
        <button class={`seg ${view === 'cold' ? 'seg-active' : ''}`} type="button" on:click={() => (view = 'cold')} aria-pressed={view === 'cold'}>
          低溫
        </button>
        <button class={`seg ${view === 'earthquake' ? 'seg-active' : ''}`} type="button" on:click={() => (view = 'earthquake')} aria-pressed={view === 'earthquake'}>
          地震
        </button>
      </div>

      <div class="chipRow">
        <span class="chip chip-rain">豪雨 {rainCount}</span>
        <span class="chip chip-cold">低溫 {coldCount}</span>
        <span class="chip chip-eq">地震 {eqCount}</span>
      </div>
    </div>
  </div>

  {#if notice}
    <p class="notice">{notice}</p>
  {/if}

  {#if loading && visibleItems.length === 0}
    <p class="empty">資料載入中...</p>
  {:else if visibleItems.length === 0}
    <p class="empty">近 3 天無災害警示</p>
  {:else}
    <div class="alerts">
      {#each visibleItems as item (item.id)}
        <article class="alert">
          <div class="alertTop">
            <div class="left">
              <span class="kind">{typeIcon(item.type)} {typeLabel(item.type)}</span>
              <span class={`severity ${severityClass(item.severity)}`}>{severityLabel(item.severity)}</span>
            </div>
            <span class="time">{fmtTime(item.eventAt ?? item.issuedAt)}</span>
          </div>

          <h3>{item.title}</h3>
          <p class="summary">{item.summary}</p>
          {#if item.region}
            <p class="region">影響區域：{item.region}</p>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .hazardCard {
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

  .notice {
    margin: 0 0 10px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(245, 158, 11, 0.16);
    color: #854d0e;
    font-size: 12px;
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
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    color: #2b3a3c;
    border: 1px solid rgba(12, 40, 46, 0.12);
    background: rgba(255, 255, 255, 0.8);
  }

  .severity {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    border: 1px solid transparent;
  }

  .sev-critical {
    color: #7f1d1d;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.16);
  }

  .sev-warning {
    color: #9a3412;
    border-color: #f97316;
    background: rgba(249, 115, 22, 0.16);
  }

  .sev-watch {
    color: #854d0e;
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.16);
  }

  .sev-info {
    color: #1e3a8a;
    border-color: #60a5fa;
    background: rgba(96, 165, 250, 0.16);
  }

  .time {
    font-size: 12px;
    color: #53656a;
  }

  .summary,
  .region {
    margin: 0;
    font-size: 13px;
    color: #53656a;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .empty {
    margin: 0;
    padding: 12px;
    border-radius: 12px;
    background: rgba(12, 40, 46, 0.06);
    color: #53656a;
  }

  @media (max-width: 720px) {
    .meta {
      justify-items: start;
    }
  }
</style>
