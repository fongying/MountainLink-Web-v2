<script lang="ts">
  import { onMount } from 'svelte';
  import type { GeoAssessment } from '$lib/geohazards';
  import { geohazardPresentation, geohazardDistance, GEO_PANEL_NEAR_METERS } from '$lib/geohazard-presentation';
  export let deviceId: string;
  export let positionKey = '';
  let result:GeoAssessment|null=null;
  let mounted=false, sequence=0, activeKey='', lastDevice='';
  let expanded=false;
  $: view=geohazardPresentation(result);
  $: if(deviceId!==lastDevice) { expanded=false;lastDevice=deviceId; }
  async function refresh(id:string, key:string) {
    const request=++sequence;
    const identity=`${id}|${key}`;
    if(activeKey!==identity) { result=null;activeKey=identity; }
    try {
      const response=await fetch(`/api/geohazards?deviceId=${encodeURIComponent(id)}`);
      if(!response.ok) throw Error();
      const next=await response.json();
      if(request===sequence) result=next;
    } catch { if(request===sequence) result={status:'unavailable',summary:'崩塌圖資比對暫時無法使用，不能判定目前位置。',accuracyKnown:false,matches:[]}; }
  }
  onMount(()=>{mounted=true;const timer=setInterval(()=>refresh(deviceId,positionKey),60000);return ()=>{mounted=false;sequence++;clearInterval(timer);};});
  $: if(mounted) refresh(deviceId,positionKey);
</script>

<div class="geohazardPanel" aria-live="polite">
  {#if view.mode!=='quiet'}
    <section class="locationNotice" class:inside={view.mode==='inside'} aria-label="崩塌圖資位置提示">
      <b>{view.label}</b>
      {#if view.mode==='near'}
        <p>目前座標在圖斑外，距邊界 {GEO_PANEL_NEAR_METERS} m 內；請核對實際位置及定位精度。</p>
      {:else if view.mode==='boundary'}
        <p>座標位於圖資邊界，無法僅憑此結果確認實際位於區域內或外。</p>
      {:else}<p>目前回報座標落入下列圖斑；靜態潛勢圖不能表示災害已發生。</p>{/if}
      {#each view.highlighted as match}
        <p class="match"><a href={`https://data.gov.tw/dataset/${match.dataset}`} target="_blank" rel="noreferrer">{match.officialId}</a> · {match.county}{match.town}{match.village} · {match.kind==='potential'?'潛勢區':'影響範圍'}{match.relation==='outside'?` · 圖斑外，距邊界約 ${geohazardDistance(match.distanceMeters)}`:''}</p>
      {/each}
      {#if view.mode==='near'}<small>{GEO_PANEL_NEAR_METERS} m 是介面提醒距離，非官方警戒門檻，也不是 GPS 誤差值。</small>
      {:else if !result?.accuracyKnown}<small>未提供 GPS 水平精度，仍須核對實際位置。</small>{/if}
    </section>
  {/if}
  <details class="geoDetails" bind:open={expanded}>
    <summary><span>崩塌圖資詳情</span><small>{view.mode==='quiet'?view.label:'來源與完整比對結果'}</small></summary>
    <div class="detailBody">
      <p>{result?.summary ?? '正在比對官方圖資…'}</p>
      {#if result?.matches.some(m=>m.relation==='outside')}
        <p class="referenceLabel">最近圖斑參考，非目前位置的風險等級；距離是平面近似距離，不是行走距離。</p>
      {/if}
      {#each result?.matches ?? [] as match}
        <p class="match"><a href={`https://data.gov.tw/dataset/${match.dataset}`} target="_blank" rel="noreferrer">{match.officialId}</a> · {match.county}{match.town}{match.village} · {match.kind==='potential'?'潛勢區':'影響範圍'} · {match.relation==='inside'?'圖斑內':match.relation==='boundary'?'圖資邊界':`圖斑外，距邊界約 ${geohazardDistance(match.distanceMeters)}`}{match.risk?` · 圖斑官方屬性：${match.risk}`:''}</p>
      {/each}
      <small>來源：農業部農村發展及水土保持署 · {result?.year ?? 115} 年版。未落入不代表沒有其他災害風險；潛勢圖不是即時警戒。</small>
    </div>
  </details>
</div>

<style>
  .geohazardPanel{margin-top:12px;color:#dce9ee;font-size:13px}
  .locationNotice{margin-bottom:8px;padding:14px;border:1px solid #695b32;border-radius:10px;background:#211f16}
  .locationNotice.inside{border-color:#8a6235;background:#261e17}.locationNotice b{font-size:14px;color:#f4d58e}
  .locationNotice p,.detailBody p{margin:8px 0;line-height:1.65;overflow-wrap:anywhere}
  small{color:#a6beca;line-height:1.65;font-size:11px}.match{font-size:12px}a{color:#a6d9ec}a:hover{color:#d4f5ff}
  .geoDetails{border:1px solid #2a414d;border-radius:9px;background:transparent}
  summary{cursor:pointer;min-height:42px;padding:11px 13px;box-sizing:border-box;line-height:1.6;color:#b3c9d5}
  summary span{font-size:12px;font-weight:600}summary small{margin-left:12px;font-size:11px;color:#91aaba}
  .detailBody{border-top:1px solid #263c47;padding:3px 13px 13px}.referenceLabel{color:#9fb7c6;font-size:12px}
  summary:focus-visible,a:focus-visible{outline:2px solid #5eead4;outline-offset:3px}
  @media(max-width:600px){summary small{display:block;margin-left:15px}.locationNotice{padding:12px}}
</style>
