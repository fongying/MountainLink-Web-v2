<script lang="ts">
  import { onMount } from 'svelte';
  import type { GeoAssessment } from '$lib/geohazards';
  export let deviceId: string;
  export let positionKey = '';
  let result:GeoAssessment|null=null;
  let mounted=false, sequence=0;
  async function refresh(id:string, _key:string) {
    const request=++sequence;
    try {
      const response=await fetch(`/api/geohazards?deviceId=${encodeURIComponent(id)}`);
      if(!response.ok) throw Error();
      const next=await response.json();
      if(request===sequence) result=next;
    } catch { if(request===sequence) result={status:'unavailable',summary:'官方崩塌圖資比對暫時無法使用。',accuracyKnown:false,matches:[]}; }
  }
  onMount(()=>{mounted=true; const timer=setInterval(()=>refresh(deviceId,positionKey),60000); return ()=>{mounted=false;sequence++;clearInterval(timer);};});
  $: if(mounted) refresh(deviceId,positionKey);
</script>
<section class="geohazard" aria-live="polite">
  <b>地質災害潛勢 · 大規模崩塌</b>
  <p>{result?.summary ?? '正在比對官方圖資…'}</p>
  {#each result?.matches ?? [] as match}
    <p><a href={`https://data.gov.tw/dataset/${match.dataset}`} target="_blank" rel="noreferrer">{match.officialId}</a> · {match.county}{match.town}{match.village} · {match.kind==='potential'?'潛勢區':'影響範圍'}{match.relation==='outside' ? `，距邊界約 ${match.distanceMeters.toLocaleString()}m（平面近似距離）` : ''}{match.risk ? ` · 官方風險屬性：${match.risk}` : ''}</p>
  {/each}
  <small>來源：農業部農村發展及水土保持署 · {result?.year ?? 115} 年版。潛勢圖不是即時警戒，不能表示災害已發生。</small>
</section>
<style>
.geohazard{margin-top:12px;padding:14px;border:1px solid #615234;border-radius:10px;background:#151b1a;color:#dce9ee}.geohazard p{margin:8px 0;font-size:14px;line-height:1.6}.geohazard small{color:#a6beca}.geohazard a{color:#f5ce82}
</style>
