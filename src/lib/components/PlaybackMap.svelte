<script lang="ts">
  import { onMount } from 'svelte';
  import { importGmapsLibrary } from '$lib/client/gmaps';
  import { hasPosition, lastPosition, playbackStatus, playbackTime, routeSegments, type PlaybackFrame } from '$lib/playback';
  export let frames: PlaybackFrame[] = [];
  export let index = 0;
  export let onSelect: (index: number) => void = () => {};
  let element: HTMLDivElement;
  let map: google.maps.Map | null = null;
  let currentMarker: google.maps.Marker | null = null;
  let pins: google.maps.Marker[] = [];
  let lines: google.maps.Polyline[] = [];
  let ready = false;
  let failed = false;
  let follow = false;
  $: current = frames[index];
  $: known = lastPosition(frames,index);
  $: valid = frames.filter(hasPosition);
  $: bounds = valid.length ? {
    minLat: Math.min(...valid.map(p=>p.lat!)), maxLat: Math.max(...valid.map(p=>p.lat!)),
    minLon: Math.min(...valid.map(p=>p.lon!)), maxLon: Math.max(...valid.map(p=>p.lon!))
  } : null;
  function xy(p: {lat: number; lng: number}) {
    if (!bounds) return { x: 300, y: 160 };
    return { x: 50 + (p.lng-bounds.minLon)/(bounds.maxLon-bounds.minLon || 0.01)*500,
      y: 270 - (p.lat-bounds.minLat)/(bounds.maxLat-bounds.minLat || 0.01)*220 };
  }
  $: previewPaths = routeSegments(frames).map(s=>s.map(p=>{const v=xy(p);return `${v.x},${v.y}`}).join(' '));
  $: previewPlayed = routeSegments(frames,index).map(s=>s.map(p=>{const v=xy(p);return `${v.x},${v.y}`}).join(' '));
  $: previewMarker = known ? xy({lat:known.lat!,lng:known.lon!}) : null;
  function fit() {
    if (!map || !valid.length) return;
    const extent = new google.maps.LatLngBounds();
    valid.forEach(p=>extent.extend({lat:p.lat!,lng:p.lon!}));
    map.fitBounds(extent,45);
    if (valid.length===1) map.setZoom(15);
  }
  function update() {
    if (!map || !currentMarker || !current) return;
    lines.forEach(line=>line.setMap(null)); lines=[];
    for (const [segments,color,width,opacity] of [
      [routeSegments(frames),'#8294ae',4,0.5], [routeSegments(frames,index),'#00bdab',5,1]
    ] as const) {
      for (const path of segments) if (path.length>1) lines.push(new google.maps.Polyline({ map,path,
        strokeColor:color,strokeWeight:width,strokeOpacity:opacity,clickable:false }));
    }
    const position = lastPosition(frames,index);
    currentMarker.setVisible(Boolean(position));
    if (!position) return;
    const actual = hasPosition(current);
    currentMarker.setPosition({lat:position.lat!,lng:position.lon!});
    currentMarker.setIcon({path:google.maps.SymbolPath.CIRCLE,scale:11,
      fillColor:actual?playbackStatus(current).color:'#94a3b8',fillOpacity:actual?1:0.55,
      strokeColor:'#ffffff',strokeWeight:3});
    currentMarker.setTitle(`${actual?'選取位置':'最後有效位置'} ${playbackTime(position.sampleAt ?? position.ts)}`);
    if (follow) map.panTo({lat:position.lat!,lng:position.lon!});
  }
  $: if (ready) { frames; index; follow; update(); }
  onMount(()=>{
    let disposed=false;
    (async()=>{
      try {
        await importGmapsLibrary('maps');
        if (disposed || !element || !valid.length) return;
        map=new google.maps.Map(element,{center:{lat:valid[0].lat!,lng:valid[0].lon!},zoom:14,
          mapTypeId:'terrain',mapTypeControl:false,streetViewControl:false,fullscreenControl:true,
          gestureHandling:'cooperative',clickableIcons:false});
        frames.forEach((p,i)=>{
          if(!hasPosition(p)) return;
          const pin=new google.maps.Marker({map,position:{lat:p.lat!,lng:p.lon!},
            title:`${playbackTime(p.ts)}・${playbackStatus(p).label}`,
            icon:{path:google.maps.SymbolPath.CIRCLE,scale:3,fillColor:'#e2e8f0',fillOpacity:0.9,strokeColor:'#365467',strokeWeight:1}});
          pin.addListener('click',()=>onSelect(i));pins.push(pin);
        });
        currentMarker=new google.maps.Marker({map,zIndex:1000});
        fit();ready=true;
      } catch { if(!disposed) failed=true; }
    })();
    return ()=>{
      disposed=true;ready=false;lines.forEach(l=>l.setMap(null));pins.forEach(p=>{google.maps.event.clearInstanceListeners(p);p.setMap(null)});
      currentMarker?.setMap(null);map=null;
    };
  });
</script>

<div class="playbackMap">
  <div class="canvas" bind:this={element} aria-label="歷史軌跡地圖"></div>
  {#if !valid.length}
    <div class="mapFallback"><p>這 3 天沒有有效定位紀錄</p><span>拖曳時間條仍可檢視各時間格的資料狀態。</span></div>
  {:else if failed}
    <div class="mapFallback">
      <span>底圖暫時無法載入 · 以下為座標軌跡示意</span>
      <svg viewBox="0 0 600 320" role="img" aria-label="座標軌跡示意，非導航地圖">
        {#each previewPaths as points}<polyline {points} fill="none" stroke="#607489" stroke-width="3" />{/each}
        {#each previewPlayed as points}<polyline {points} fill="none" stroke="#00bdab" stroke-width="4" />{/each}
        {#if previewMarker}<circle cx={previewMarker.x} cy={previewMarker.y} r="8" fill={hasPosition(current)?playbackStatus(current).color:'#94a3b8'} stroke="white" stroke-width="2" />{/if}
      </svg>
      <small>水平經度 · 垂直緯度 · 非實際地形</small>
    </div>
  {:else if !ready}<div class="loading">載入歷史軌跡地圖…</div>{/if}
  {#if ready}
    <div class="mapTools"><button type="button" on:click={fit}>完整軌跡</button><button type="button" aria-pressed={follow} on:click={()=>follow=!follow}>{follow?'✓ ':''}跟隨位置</button></div>
  {/if}
  <div class="legend"><span><i class="played"></i>已回放</span><span><i class="history"></i>其餘歷史</span><span>定位缺口不連線</span></div>
  {#if current && !hasPosition(current) && known}
    <div class="positionNotice">此時無有效定位 · 圓點為 {playbackTime(known.sampleAt ?? known.ts,true)} 的最後回報位置</div>
  {/if}
</div>

<style>
  .playbackMap{height:100%;min-height:350px;position:relative;overflow:hidden;background:#0c1c26;border-radius:16px}
  .canvas{position:absolute;inset:0}.mapTools{position:absolute;top:14px;left:14px;display:flex;gap:7px;flex-wrap:wrap;right:65px}
  button{border:1px solid #385160;border-radius:8px;background:#0b202ded;color:#dfedf4;padding:9px 12px;font:inherit;font-size:12px;cursor:pointer;min-height:38px}
  button[aria-pressed="true"]{background:#006d64;border-color:#14b8a6}button:focus-visible{outline:3px solid #5eead4;outline-offset:3px}
  .legend{position:absolute;bottom:12px;left:12px;padding:9px 12px;background:#071a25eb;color:#d1e0ea;font-size:11px;border-radius:8px;display:flex;gap:15px;flex-wrap:wrap;max-width:calc(100% - 80px);pointer-events:none}
  .legend span{display:flex;align-items:center;gap:5px}.legend i{width:18px;height:3px;display:block}.played{background:#00bdab}.history{background:#8294ae}
  .positionNotice{position:absolute;top:64px;left:14px;right:14px;max-width:430px;background:#172c3bed;border:1px solid #68768a;border-radius:8px;padding:10px;color:#e2e8f0;font-size:12px;pointer-events:none}
  .loading,.mapFallback{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;padding:25px;color:#aac1d0;text-align:center;font-size:13px}
  .mapFallback svg{max-height:270px;width:100%}.mapFallback p{font-size:18px;font-weight:700;color:#e2e8f0}.mapFallback span,.mapFallback small{line-height:1.7}
  @media(max-width:600px){.playbackMap{min-height:330px}.positionNotice{font-size:11px}.legend{gap:10px;font-size:10px}}
</style>
