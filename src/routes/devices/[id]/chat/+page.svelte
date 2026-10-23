<script lang="ts">
  import { onMount,tick } from 'svelte';
  import { chatBytes,chatStage,createChatId,type ChatMessage } from '$lib/chat';
  import type { PrivateDelivery } from '$lib/ai-private-route';
  export let data:{deviceId:string;name:string;messages:ChatMessage[];route:{delivery:PrivateDelivery|null;error:string}};
  let activeDevice=data.deviceId;
  $: if(activeDevice!==data.deviceId){activeDevice=data.deviceId;messages=data.messages;route=data.route;draft='';requestId='';requestText='';latestKey='';error='';}
  let messages=data.messages;
  let route=data.route;
  let draft='',error='',pollError='',sending=false;
  let requestId='',requestText='',latestKey='';
  let scroller:HTMLDivElement;
  let connected=true;
  let disposed=false;
  let refreshing=false;
  $: bytes=chatBytes(draft);
  const time=(stamp:number)=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(stamp);
  async function refresh(initial=false) {
    if(refreshing||disposed)return;refreshing=true;
    const deviceId=data.deviceId;
    const nearBottom=!scroller||scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<100;
    try {
      const response=await fetch(`/api/chat/${encodeURIComponent(data.deviceId)}`,{cache:'no-store'});
      if(!response.ok)throw Error(response.status===403?'沒有此對話的權限':'讀取對話失敗');
      const body=await response.json();if(disposed||deviceId!==data.deviceId)return;
      const key=body.messages.map((m:ChatMessage)=>`${m.id}:${m.stage}`).join('|');
      messages=body.messages;route=body.route;connected=true;pollError='';
      if(key!==latestKey||initial){latestKey=key;await tick();if(scroller&&(nearBottom||initial))scroller.scrollTop=scroller.scrollHeight;}
    }catch(e){if(!disposed){connected=false;pollError=e instanceof Error?e.message:'讀取對話失敗';}}
    finally{refreshing=false;}
  }
  async function send() {
    if(sending||!draft.trim()||bytes>228||!route.delivery)return;
    error='';sending=true;
    if(!requestId||requestText!==draft.trim()){requestId=createChatId();requestText=draft.trim();}
    try {
      const response=await fetch(`/api/chat/${encodeURIComponent(data.deviceId)}`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:requestId,text:requestText}),signal:AbortSignal.timeout(15000)});
      const body=await response.json();if(!response.ok)throw Error(body.error||'訊息未提交');
      draft='';requestId='';requestText='';await refresh();await tick();if(scroller)scroller.scrollTop=scroller.scrollHeight;
    }catch(e){error=e instanceof Error?e.message:'提交結果不明；保留原訊息識別碼，請先確認對話紀錄。';}
    finally{sending=false;}
  }
  onMount(()=>{disposed=false;refresh(true);const timer=setInterval(()=>refresh(),3000);return()=>{disposed=true;clearInterval(timer);};});
</script>

<svelte:head><title>{data.name}・私訊聊天 | MountainLink</title></svelte:head>
<section class="chatPage">
  <header class="chatHeader"><div><a class="back" href={`/devices/${encodeURIComponent(data.deviceId)}`}>← 返回裝置詳情</a><p class="eyebrow">MOUNTAINLINK / DIRECT MESSAGE</p><h1>私訊聊天</h1><div class="identity"><b>{data.name}</b><code>{data.deviceId}</code><span>Radio Companion</span></div></div>
    <div class="routeStatus"><span class:online={connected}><i></i>{connected?'對話已連線':'讀取中斷'}</span><b>{route.delivery?.destination||'尚無可靠無線電對照'}</b><small>Gateway !c0c31f54 · LoRa 私訊</small></div></header>
  <div class="chatLayout">
    <main class="conversation" aria-label="私訊對話">
      <div class="conversationTop"><div><span class="lock" aria-hidden="true">↔</span><b>裝置私訊</b><small>僅此裝置的雙向對話</small></div><button type="button" class="ghost" on:click={()=>refresh()}>重新整理</button></div>
      {#if pollError}<div class="readError" role="status">{pollError}，會自動重新讀取。</div>{/if}
      <div class="messageList" bind:this={scroller} aria-label="訊息紀錄" aria-live="polite" aria-relevant="additions text">
        <div class="historyNote">顯示最近 100 則 · 台灣時間 UTC+8 · ACK 不代表人員已讀</div>
        {#if !messages.length}<div class="empty"><span aria-hidden="true">↔</span><h2>開始與裝置對話</h2><p>在下方發送私訊。手機請在 Radio Companion<br />開啟 Gateway「Meshtastic Client2」的私訊對話並回覆。</p></div>{/if}
        {#each messages as message (message.id)}
          <article class:outbound={message.direction==='out'} class:ai={message.origin==='ai'} class="message">
            <div class="messageMeta"><b>{message.origin==='ai'?'AI 建議':message.direction==='in'?'Radio Companion':message.actor}</b><span>{time(message.createdAt)}</span></div>
            <p>{message.text}</p><div class="delivery"><span class:confirmed={message.stage==='radio_ack'||message.stage==='received'}>{chatStage(message.stage)}</span>{#if message.packetId}<code>#{message.packetId}</code>{/if}</div>
            {#if message.error}<small class="messageError">{message.error}</small>{/if}
          </article>
        {/each}
      </div>
      <form class="composer" on:submit|preventDefault={send}>
        {#if !route.delivery}<div class="sendBlocked" role="status">{route.error}。對話仍可查看，私訊不會改發廣播。</div>{/if}
        <label class="srOnly" for="chat-draft">私訊內容</label><textarea id="chat-draft" bind:value={draft} placeholder="輸入給裝置的私訊…" rows="3" maxlength="1024" disabled={sending} on:keydown={(event)=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();send();}}}></textarea>
        <div class="composeFooter"><div><span class:tooLong={bytes>228}>{bytes} / 228 UTF-8 bytes</span><small>Ctrl + Enter 發送 · 每 20 秒一則</small></div><button class="sendButton" type="submit" disabled={sending||!route.delivery||!draft.trim()||bytes>228}>{sending?'提交中…':'發送私訊'} <span aria-hidden="true">↗</span></button></div>
        {#if error}<p class="sendError" role="alert">{error}</p>{/if}
      </form>
    </main>
  </div>
</section>
<style>
  .chatPage{max-width:1440px;margin:0 auto;background:radial-gradient(700px 260px at 0 0,#0e394048,transparent 70%),#020617;border-radius:18px;padding:26px;color:#e2edf4;font-family:"Fira Sans","Noto Sans TC",sans-serif;--muted:#91acbc;--line:#253d49;--teal:#2dd4bf}
  .chatHeader{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:25px}.back{font-size:12px;color:#a5c2d0;text-decoration:none}.eyebrow{font-size:10px;letter-spacing:.16em;color:#48d7c1;margin:20px 0 9px}h1{font-size:34px;letter-spacing:-.04em;margin:0 0 12px}.identity{display:flex;gap:11px;align-items:center;flex-wrap:wrap}.identity b{font-size:15px}.identity code{font-size:12px;color:var(--muted)}.identity>span{font-size:10px;padding:5px 9px;border:1px solid var(--line);border-radius:20px;color:#a8c9d7}.routeStatus{text-align:right;display:flex;flex-direction:column;gap:9px}.routeStatus>span{color:#fbbf24;font-size:11px;display:flex;gap:7px;align-items:center;justify-content:flex-end}.routeStatus>span.online{color:#5eead4}.routeStatus i{width:6px;height:6px;border-radius:50%;background:currentColor}.routeStatus>b{font-size:15px}.routeStatus small{font-size:10px;color:var(--muted)}
  .chatLayout{display:grid;grid-template-columns:minmax(0,1fr)}.conversation{border:1px solid var(--line);border-radius:16px;background:#091820;overflow:hidden;min-width:0;display:flex;flex-direction:column}.conversationTop{border-bottom:1px solid var(--line);padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:10px}.conversationTop>div{display:flex;align-items:center;gap:10px}.conversationTop b{font-size:13px}.conversationTop small{font-size:11px;color:var(--muted)}.lock{font-size:20px;color:var(--teal)}.ghost{color:#b9d2df;background:#102630;border:1px solid #294653;border-radius:8px;min-height:36px;padding:7px 10px;font-size:11px;cursor:pointer}
  .messageList{height:480px;overflow-y:auto;overscroll-behavior:contain;padding:18px;display:flex;flex-direction:column;gap:14px;scrollbar-color:#3b5664 #0a1b24}.historyNote{align-self:center;font-size:10px;color:#7698a9;margin-bottom:5px;text-align:center}.empty{margin:auto;text-align:center;color:var(--muted);padding:30px 8px}.empty>span{font-size:38px;color:#3d7e84}.empty h2{font-size:18px;color:#bdd3df;font-weight:600}.empty p{font-size:12px;line-height:1.9}.message{max-width:min(82%,700px);border:1px solid #2a4350;border-radius:3px 14px 14px 14px;background:#112733;padding:12px 14px;align-self:flex-start;min-width:180px}.message.outbound{align-self:flex-end;border-radius:14px 3px 14px 14px;border-color:#23534f;background:#0e302e}.message.ai{background:#1c253a;border-color:#3c4f75}.messageMeta{display:flex;gap:17px;align-items:center;justify-content:space-between}.messageMeta b{font-size:10px;color:#adcad8}.messageMeta>span{font-size:9px;color:#7fa1b3;font-variant-numeric:tabular-nums}.message p{margin:9px 0 11px;line-height:1.75;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.delivery{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:9px;color:#8cabb8}.delivery .confirmed{color:#70dbc4}.delivery code{font-size:9px}.messageError{font-size:10px;color:#fda4af;display:block;margin-top:6px}
  .composer{padding:16px 18px;border-top:1px solid var(--line);background:#0b1c25}.composer textarea{display:block;box-sizing:border-box;resize:vertical;max-height:170px;min-height:77px;width:100%;background:#071720;border:1px solid #2c4d5d;color:#edf7fa;border-radius:10px;padding:12px;font:inherit;font-size:13px;line-height:1.65}.composer textarea::placeholder{color:#688b9e}.composeFooter{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:11px}.composeFooter>div{display:flex;flex-direction:column;gap:5px}.composeFooter>div>span{font-size:10px;color:#aac4d3;font-variant-numeric:tabular-nums}.composeFooter small{font-size:9px;color:#718f9f}.composeFooter .tooLong{color:#fb7185}.sendButton{border:0;background:#24cdb3;color:#032c28;font-size:12px;font-weight:800;border-radius:9px;min-height:43px;min-width:125px;padding:10px 15px;display:flex;justify-content:space-between;gap:15px;align-items:center;cursor:pointer}.sendButton:disabled{opacity:.4;cursor:default}.sendButton>span{font-size:18px}.sendBlocked,.readError{font-size:11px;line-height:1.7;color:#e5c16a;margin-bottom:10px}.readError{padding:10px 18px;background:#292315;margin:0}.sendError{margin:10px 0 0;color:#fda4af;font-size:12px;line-height:1.7}
  button:focus-visible,a:focus-visible,textarea:focus-visible{outline:3px solid #5eead4;outline-offset:3px}.srOnly{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  @media(max-width:900px){.chatLayout{grid-template-columns:minmax(0,1fr)}.messageList{height:450px}}@media(max-width:600px){.chatPage{padding:18px 12px}.chatHeader{gap:12px;align-items:flex-start}.routeStatus{max-width:145px;margin-top:35px}.routeStatus>b{font-size:11px;overflow-wrap:anywhere}.routeStatus small{font-size:9px}.routeStatus>span{font-size:10px}h1{font-size:27px}.identity{gap:7px}.identity b{font-size:13px}.identity code{font-size:10px}.eyebrow{font-size:8px}.conversationTop{padding:12px}.conversationTop small{display:none}.messageList{height:420px;padding:12px}.message{max-width:88%;min-width:130px;padding:11px}.message p{font-size:13px}.composer{padding:12px}.composeFooter small{font-size:8px}.sendButton{min-width:106px;font-size:11px}.historyNote{font-size:9px}}
</style>
