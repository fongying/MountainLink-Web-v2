<script lang="ts">
  import { onDestroy } from 'svelte';
  import PlaybackMap from '$lib/components/PlaybackMap.svelte';
  import { hasPosition, lastPosition, playbackEvents, playbackStatus, playbackTime, type PlaybackData } from '$lib/playback';
  export let data: { playback: PlaybackData };
  let index = 0;
  let speed = 1;
  let playing = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let snapshotKey = '';
  $: playback = data.playback;
  $: frames = playback.frames;
  $: point = frames[index];
  $: status = playbackStatus(point);
  $: known = lastPosition(frames,index);
  $: events = playbackEvents(frames);
  $: progress = index/(frames.length-1)*100;
  $: reportCount = frames.filter(p=>p.source!=='missing').length;
  $: if (snapshotKey !== `${data.playback.deviceId}:${data.playback.end}`) {
    pause();index=0;snapshotKey=`${data.playback.deviceId}:${data.playback.end}`;
  }
  function pause() { if(timer) clearInterval(timer);timer=null;playing=false; }
  function select(value: number) { pause();index=Math.max(0,Math.min(frames.length-1,Math.round(value))); }
  function play() {
    if(playing){pause();return;}
    if(index===frames.length-1) index=0;
    playing=true;
    timer=setInterval(()=>{ if(index>=frames.length-1){pause();return;} index+=1;
      if(index===frames.length-1) pause(); },1000/speed);
  }
  function changeSpeed() { const resume=playing;pause();if(resume) play(); }
  function jumpToTime(value:string) {
    const ts=Date.parse(`${value}+08:00`);
    if(Number.isFinite(ts)) select((ts-playback.start)/playback.interval);
  }
  function dateValue(ts:number) { return new Date(ts+8*3600000).toISOString().slice(0,16); }
  const metric = (value:number|null,suffix='') => value == null ? '—' : `${value}${suffix}`;
  onDestroy(pause);
</script>

<svelte:head><title>{playback.name}・歷史軌跡回放 | MountainLink</title></svelte:head>

<section class="replayPage">
  <header class="pageHeader">
    <div><a class="back" href={`/devices/${encodeURIComponent(playback.deviceId)}`}>← 返回裝置詳情</a>
      <p class="eyebrow">MOUNTAINLINK / HISTORY</p><h1>歷史軌跡回放</h1>
      <div class="identity"><strong>{playback.name}</strong><code>{playback.deviceId}</code><span class="rangeBadge">最近 3 天</span></div>
    </div>
    <div class="snapshot"><span>{playback.demo?'情境測試 / 示範軌跡':'歷史快照 / 實際回報'}</span><b>72 <small>小時</small> <i>／</i> 30 <small>分鐘一格</small></b><small>台灣時間 UTC+8 · 回放不跟隨即時更新</small></div>
  </header>

  <div class:demo={playback.demo} class="sourceNotice" role="note">
    <span class="sourceIcon" aria-hidden="true">{playback.demo?'◇':'◷'}</span>
    <div><b>{playback.demo?'示範資料，非真實事故紀錄':'依既有歷史回報取樣'}</b>
      <p>{playback.demo?'這是獨立的合歡山訓練情境；位置、心率、電量與 SOS 皆為模擬，不寫入即時監控、不觸發警示，路徑不可用於導航。':'每格保留該 30 分鐘區間最後一筆回報；空白區間不補值，短暫事件可能未出現在取樣中。'}</p>
    </div><span class="count">{reportCount} / {frames.length} 格有紀錄</span>
  </div>

  <div class="replayGrid">
    <section class="mapPanel" aria-label="歷史位置">
      <div class="panelHeading"><div><span class="sectionNumber">01</span><h2>位置回溯</h2></div><span class="historyTag">歷史回放</span></div>
      <div class="mapFrame"><PlaybackMap {frames} {index} onSelect={select} /></div>
      <div class="mapFoot"><span>{playbackTime(playback.start)} — {playbackTime(playback.end)}</span><span>可點擊地圖上的歷史點</span></div>
    </section>

    <aside class="statePanel" aria-label="選取時間的裝置狀態">
      <div class="panelHeading"><div><span class="sectionNumber">02</span><h2>當時狀態</h2></div><span class="historyTag">第 {index+1} / {frames.length} 格</span></div>
      <div class="selectedTime"><small>選取的回放時間</small><time datetime={new Date(point.ts).toISOString()}>{playbackTime(point.ts)}</time>
        <span class="stateBadge" style={`--state-color:${status.color}`}><i></i>{status.label}</span></div>
      <div class="metrics">
        <div><span>心率</span><strong>{metric(point.hr)}<small> bpm</small></strong></div>
        <div class:low={point.battery!=null && point.battery<=20}><span>電量</span><strong>{metric(point.battery)}<small> %</small></strong></div>
        <div><span>連線</span><strong class="word">{point.online===null?'未知':point.online?'在線':'離線'}</strong></div>
        <div class:sos={point.sos}><span>SOS</span><strong class="word">{point.sos===null?'未知':point.sos?'已啟動':'未啟動'}</strong></div>
      </div>
      <div class="positionCard"><div class="miniHeading"><b>{hasPosition(point)?'當時回報位置':'當時位置未知'}</b><span class:valid={hasPosition(point)} class="gpsBadge">{hasPosition(point)?'● 有定位':'○ 無定位'}</span></div>
        {#if hasPosition(point)}<code>{point.lat!.toFixed(6)}, {point.lon!.toFixed(6)}</code><span>海拔 {metric(point.alt,' m')}</span>
        {:else if known}<code>最後回報 {known.lat!.toFixed(6)}, {known.lon!.toFixed(6)}</code><span>位置時間 {playbackTime(known.sampleAt ?? known.ts)}</span>
        {:else}<span>此時間之前沒有有效位置。</span>{/if}
      </div>
      <div class="note"><b>{playback.demo?'情境說明':'取樣說明'}</b><p>{point.note}</p>
        <span>實際{playback.demo?'模擬':''}回報：{point.sampleAt?playbackTime(point.sampleAt):'無回報'}</span>
      </div>
    </aside>

    <section class="timelinePanel" aria-label="回放控制">
      <div class="timelineHeading"><div><span class="sectionNumber">03</span><h2>時間軸</h2><span>拖曳定位事故過程</span></div><span class="elapsed">已回放 {((point.ts-playback.start)/3600000).toFixed(1)} / 72 小時</span></div>
      <div class="timeStrip" aria-hidden="true">{#each frames as frame,i}<span class:active={i===index} style={`background:${playbackStatus(frame).color};opacity:${i<=index?1:0.3}`}></span>{/each}</div>
      <label class="srOnly" for="playback-range">回放時間，每格 30 分鐘</label>
      <input id="playback-range" class="scrubber" type="range" min="0" max={frames.length-1} step="1" value={index}
        aria-valuetext={`${playbackTime(point.ts)}，${status.label}`} style={`--progress:${progress}%`}
        on:input={(event)=>select(Number(event.currentTarget.value))} />
      <div class="dayMarks">{#each [0,48,96,144] as step,i}<button type="button" on:click={()=>select(step)}><span>{i===3?'回放終點':`第 ${i+1} 天`}</span><b>{playbackTime(frames[step].ts,true)}</b></button>{/each}</div>
      <div class="controls">
        <div class="transport"><button class="step" type="button" title="回到起點" aria-label="回到起點" disabled={index===0} on:click={()=>select(0)}>Ⅰ◀</button>
          <button class="step" type="button" aria-label="前 30 分鐘" disabled={index===0} on:click={()=>select(index-1)}>−30 分</button>
          <button class="playButton" type="button" on:click={play} aria-label={playing?'暫停回放':'播放回放'}><span aria-hidden="true">{playing?'Ⅱ':'▶'}</span>{playing?'暫停':'播放'}</button>
          <button class="step" type="button" aria-label="後 30 分鐘" disabled={index===frames.length-1} on:click={()=>select(index+1)}>+30 分</button>
          <button class="step" type="button" title="前往最後一格" aria-label="前往最後一格" disabled={index===frames.length-1} on:click={()=>select(frames.length-1)}>▶Ⅰ</button>
        </div>
        <div class="jumpControls"><label>速度 <select bind:value={speed} on:change={changeSpeed}><option value={1}>1 格／秒</option><option value={2}>2 格／秒</option><option value={4}>4 格／秒</option></select></label>
          <label>跳至時間 <input type="datetime-local" min={dateValue(playback.start)} max={dateValue(playback.end)} step="1800" value={dateValue(point.ts)} on:change={(e)=>jumpToTime(e.currentTarget.value)} /></label></div>
      </div>
      <p class="keyboardHint">時間條支援鍵盤方向鍵，每次前後 30 分鐘；拖曳或跳轉時會暫停播放。</p>
    </section>

    <section class="eventsPanel" aria-label="取樣狀態變化">
      <div class="panelHeading"><div><span class="sectionNumber">04</span><h2>取樣狀態變化</h2></div><span class="historyTag">點選事件跳轉</span></div>
      <div class="events">{#each events as event}<button type="button" class:selected={index===event.index} aria-pressed={index===event.index} on:click={()=>select(event.index)} style={`--event-color:${event.color}`}>
        <i></i><time>{playbackTime(event.ts,true)}</time><b>{event.index===0?'回放起點':event.label}</b><span>{event.note}</span><span class="eventArrow" aria-hidden="true">↗</span>
      </button>{/each}</div>
    </section>
  </div>
</section>

<style>
  .replayPage{max-width:1560px;margin:0 auto;padding:28px 24px 48px;color:#dfedf3;--muted:#90afc0;--line:#253b47;--teal:#20d6bd;--panel:#0a171f;font-family:inherit}
  .pageHeader{display:flex;justify-content:space-between;gap:26px;align-items:flex-end;margin-bottom:24px}.back{color:#9fbfce;font-size:13px;text-decoration:none}.back:hover{color:var(--teal)}
  .eyebrow{font-size:10px;letter-spacing:.2em;color:#41d5bf;margin:22px 0 8px;font-weight:700}h1{font-size:clamp(27px,3vw,38px);letter-spacing:-.04em;line-height:1.2;margin:0 0 14px;font-weight:800}
  .identity{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.identity strong{font-size:16px}.identity code{font-size:12px;color:var(--muted)}.rangeBadge,.historyTag{font-size:11px;border:1px solid var(--line);border-radius:30px;color:#b4cbd8;padding:5px 9px;white-space:nowrap}
  .snapshot{display:flex;flex-direction:column;gap:9px;text-align:right;flex-shrink:0}.snapshot>span{color:var(--teal);font-size:11px;letter-spacing:.08em}.snapshot>b{font-size:27px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.snapshot small{font-size:11px;color:var(--muted);font-weight:400}.snapshot i{font-style:normal;font-weight:300;color:#3e5a68;margin:0 9px}
  .sourceNotice{display:flex;align-items:center;gap:14px;background:#10222d;border:1px solid #244959;border-radius:12px;padding:14px 18px;margin-bottom:22px}.sourceNotice.demo{border-color:#655c35;background:#241f14}.sourceIcon{font-size:28px;color:#e8c267;flex-shrink:0}.sourceNotice b{font-size:13px}.sourceNotice p{font-size:12px;line-height:1.7;margin:4px 0 0;color:#c0c5bb}.count{margin-left:auto;font-size:11px;white-space:nowrap;color:#a5b8bf}
  .replayGrid{display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:18px}.mapPanel,.statePanel,.timelinePanel,.eventsPanel{border:1px solid var(--line);border-radius:18px;background:var(--panel);min-width:0}
  .mapPanel{padding:18px;display:flex;flex-direction:column}.panelHeading,.timelineHeading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.panelHeading>div,.timelineHeading>div{display:flex;align-items:center;gap:9px}.sectionNumber{font-size:10px;letter-spacing:.05em;color:#5d8294;font-variant-numeric:tabular-nums}h2{font-size:16px;margin:0;font-weight:700;letter-spacing:-.02em}
  .mapFrame{flex:1;min-height:430px}.mapFoot{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:10px;padding-top:13px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
  .statePanel{padding:18px}.selectedTime{padding-bottom:17px;border-bottom:1px solid var(--line)}.selectedTime>small{display:block;color:var(--muted);font-size:11px;margin-bottom:7px}.selectedTime>time{font-size:23px;font-weight:700;display:block;letter-spacing:-.04em;font-variant-numeric:tabular-nums}.stateBadge{color:var(--state-color);font-size:12px;font-weight:700;border:1px solid color-mix(in srgb,var(--state-color) 35%,transparent);background:color-mix(in srgb,var(--state-color) 8%,transparent);display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:30px;margin-top:11px}.stateBadge i{width:6px;height:6px;border-radius:50%;background:currentColor}
  .metrics{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);margin:17px 0;border:1px solid var(--line);border-radius:10px;overflow:hidden}.metrics>div{background:#0e1e28;padding:12px}.metrics span{color:var(--muted);font-size:11px;display:block;margin-bottom:7px}.metrics strong{font-size:25px;font-variant-numeric:tabular-nums;letter-spacing:-.04em}.metrics small{font-size:11px;color:var(--muted);font-weight:400}.metrics .word{font-size:17px;letter-spacing:0}.metrics .low strong{color:#fbbf24}.metrics .sos strong{color:#fb7185}
  .positionCard{padding:13px;background:#0b202a;border:1px solid #24424e;border-radius:10px;font-size:12px}.miniHeading{display:flex;justify-content:space-between;gap:6px;align-items:center;margin-bottom:9px}.positionCard code{font-size:11px;line-height:1.6;color:#d1e7ef;overflow-wrap:anywhere}.positionCard>span{display:block;margin-top:5px;color:var(--muted);font-size:11px}.gpsBadge{font-size:10px;color:#a5b4c2}.gpsBadge.valid{color:#5eead4}.note{margin-top:16px;font-size:11px;color:var(--muted)}.note b{color:#bdd0dd;font-weight:600}.note p{line-height:1.7;margin:6px 0 8px}.note>span{font-size:10px}
  .timelinePanel{grid-column:1/-1;padding:21px 24px}.timelineHeading{margin-bottom:20px}.timelineHeading>div>span:last-child{color:var(--muted);font-size:11px;margin-left:6px}.elapsed{font-size:12px;font-variant-numeric:tabular-nums;color:#a9c2cf}.timeStrip{display:flex;gap:2px;height:12px;align-items:center;padding:0 10px}.timeStrip span{flex:1;height:5px;border-radius:1px;min-width:1px}.timeStrip .active{height:12px;outline:1px solid #fff;outline-offset:2px}
  .scrubber{width:100%;margin:0;cursor:ew-resize;appearance:none;background:transparent;height:40px;touch-action:pan-y}.scrubber::-webkit-slider-runnable-track{height:5px;background:linear-gradient(to right,var(--teal) 0%,var(--teal) var(--progress),#2c414d var(--progress),#2c414d 100%);border-radius:5px}.scrubber::-webkit-slider-thumb{appearance:none;width:23px;height:23px;background:#d9fff6;border:4px solid #0f8d7f;border-radius:50%;margin-top:-9px;box-shadow:0 0 0 4px #0d2f32}.scrubber::-moz-range-track{height:5px;background:#2c414d;border-radius:5px}.scrubber::-moz-range-progress{height:5px;background:var(--teal)}.scrubber::-moz-range-thumb{width:17px;height:17px;background:#d9fff6;border:3px solid #0f8d7f;border-radius:50%}
  .dayMarks{display:grid;grid-template-columns:repeat(4,1fr);margin:0 0 19px}.dayMarks button{border:0;background:transparent;color:var(--muted);cursor:pointer;text-align:left;padding:4px 0;min-height:40px}.dayMarks button:nth-child(2),.dayMarks button:nth-child(3){text-align:center}.dayMarks button:last-child{text-align:right}.dayMarks span{font-size:10px;display:block;margin-bottom:4px}.dayMarks b{font-size:11px;font-weight:500;font-variant-numeric:tabular-nums}.dayMarks button:hover{color:var(--teal)}
  .controls{border-top:1px solid var(--line);padding-top:18px;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}.transport{display:flex;gap:7px;align-items:center}.step{padding:10px 12px;border:1px solid #2b4350;background:#0c202b;border-radius:9px;color:#bad0dd;font-size:12px;min-height:42px;cursor:pointer}.step:disabled{opacity:.35;cursor:default}.playButton{display:flex;align-items:center;justify-content:center;gap:10px;border:0;background:#25d4b5;color:#032c29;font-weight:800;min-width:100px;min-height:44px;border-radius:10px;cursor:pointer;font-size:13px}.playButton:hover{background:#5eead4}.playButton>span{font-size:16px}
  .jumpControls{display:flex;gap:14px;flex-wrap:wrap}.jumpControls label{display:flex;gap:7px;align-items:center;color:var(--muted);font-size:11px}.jumpControls select,.jumpControls input{background:#10232d;color:#d7e5eb;border:1px solid #2b4350;padding:9px 8px;border-radius:8px;font-size:11px;min-height:40px;color-scheme:dark}.keyboardHint{font-size:10px;color:#7193a6;margin:14px 0 0;line-height:1.6}
  .eventsPanel{grid-column:1/-1;padding:19px 22px}.events{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:9px}.events button{display:grid;grid-template-columns:7px 1fr 16px;text-align:left;gap:7px 10px;border:1px solid #263d49;background:#0e1f29;border-radius:10px;color:#d7e5eb;padding:13px;cursor:pointer;font:inherit;position:relative}.events button:hover,.events button.selected{border-color:var(--event-color);background:#142b35}.events i{width:6px;height:6px;background:var(--event-color);border-radius:50%;margin-top:4px;grid-row:1/3}.events time{font-size:10px;color:var(--muted);grid-column:2}.events b{font-size:12px;grid-column:2;font-weight:600}.events button>span:not(.eventArrow){font-size:10px;line-height:1.6;color:var(--muted);grid-column:2}.events .eventArrow{position:absolute;right:12px;top:12px;color:#6e9dba;font-size:14px}
  button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #5eead4;outline-offset:4px}.srOnly{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  @media(min-width:1450px){.mapFrame{min-height:470px}}@media(max-width:1050px){.replayGrid{grid-template-columns:minmax(0,1fr) 310px}.timelineHeading>div>span:last-child{display:none}.mapFrame{min-height:430px}.timelinePanel{padding:20px}.jumpControls{flex:1;justify-content:flex-end}}
  @media(max-width:760px){.replayPage{padding:20px 14px 30px}.pageHeader{align-items:flex-start;gap:16px}.snapshot{display:none}.identity{gap:8px}.identity strong{font-size:14px}.sourceNotice{padding:12px;gap:10px;align-items:flex-start}.sourceNotice .count{display:none}.sourceNotice p{font-size:11px}.replayGrid{grid-template-columns:1fr;gap:13px}.mapPanel,.statePanel{padding:14px}.mapFrame{min-height:350px}.statePanel{order:2;display:grid;grid-template-columns:1fr 1fr;gap:12px}.statePanel>.panelHeading{grid-column:1/-1;margin:0}.selectedTime{border-bottom:0;padding:4px 0}.selectedTime>time{font-size:20px}.metrics{margin:0;grid-row:span 2}.metrics>div{padding:10px}.positionCard{grid-column:1/-1}.note{margin:0;grid-column:1/-1}.note p{margin-bottom:4px}.timelinePanel,.eventsPanel{grid-column:1;padding:16px}.timelinePanel{order:1}.eventsPanel{order:3}.timelineHeading{gap:8px;flex-wrap:wrap;margin-bottom:14px}.elapsed{font-size:11px}.controls{justify-content:center;gap:14px}.transport{justify-content:center;width:100%;gap:6px}.step{padding:10px}.playButton{min-width:85px}.jumpControls{justify-content:center;gap:10px;width:100%}.jumpControls label{flex-wrap:wrap}.dayMarks b{font-size:10px}.dayMarks span{font-size:9px}.mapFoot span:last-child{display:none}.events{grid-template-columns:1fr 1fr}.events button{padding:11px;gap:6px 8px}.events time{font-size:9px}}
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style>
