<script lang="ts">
  export let data: { user: { id: number; username: string; is_admin?: number } | null };

  const signedIn = Boolean(data.user);
  const primaryHref = signedIn ? '/dashboard' : '/login';
</script>

<section class="homePage">
  <div class="heroGrid">
    <div class="heroCopy">
      <p class="eyebrow">MountainLink</p>
      <h1>MountainLink 智慧山域安全管理系統</h1>
      <p class="subtitle">
        以登山申請、AI 風險評估、Meshtastic 通訊節點、天氣警示與即時監控，建立山域行動安全管理入口。
      </p>

      <div class="actions">
        <a class="primary" href={primaryHref}>{signedIn ? '進入監控中心' : '登入系統'}</a>
        {#if signedIn}
          <form method="POST" action="/logout">
            <button class="ghost" type="submit">登出</button>
          </form>
        {:else}
          <a class="ghost" href="/register">註冊帳號</a>
        {/if}
      </div>

      {#if data.user}
        <p class="welcome">已登入：<strong>{data.user.username}</strong>{data.user.is_admin ? '（管理者）' : ''}</p>
      {/if}
    </div>

    <div class="signalPanel" aria-label="山域安全系統概覽">
      <div class="panelTop">
        <span>Live Command</span>
        <strong>山域安全網</strong>
      </div>
      <div class="mountainScene">
        <div class="ridge ridgeBack"></div>
        <div class="ridge ridgeFront"></div>
        <span class="node node-a">AI</span>
        <span class="node node-b">WX</span>
        <span class="node node-c">SOS</span>
        <span class="node node-d">Mesh</span>
        <span class="routeLine routeOne"></span>
        <span class="routeLine routeTwo"></span>
      </div>
      <div class="statusStrip">
        <span>隊伍風險</span>
        <strong>即時判讀</strong>
      </div>
    </div>
  </div>

  <div class="entryGrid" aria-label="使用者入口">
    <article class="entryCard">
      <span class="entryIndex">01</span>
      <h2>登山者入口</h2>
      <p>申請登山、檢查裝備、接收路線與天候建議，後續可綁定 Meshtastic 裝置。</p>
      <a href="/apply">進入登山者流程</a>
    </article>

    <article class="entryCard">
      <span class="entryIndex">02</span>
      <h2>管理者入口</h2>
      <p>查看高風險隊伍、裝置異常、天氣警示與需要介入的通知事件。</p>
      <a href="/admin">進入管理視圖</a>
    </article>

    <article class="entryCard entryStrong">
      <span class="entryIndex">03</span>
      <h2>監控中心</h2>
      <p>整合 2D / 3D 地圖、即時裝置、生理資料、SOS 與山域災害警示。</p>
      <a href="/dashboard">進入即時監控</a>
    </article>
  </div>

  <section class="capabilityBand" aria-label="五大核心功能">
    <div class="sectionHead">
      <p class="eyebrow">Core Modules</p>
      <h2>五大核心功能</h2>
    </div>

    <div class="featureGrid">
      <article>
        <span class="featureNo">1</span>
        <h3>風險評估代理</h3>
        <p>依路線、天候、隊伍經驗與裝備狀態，提前標記高風險隊伍。</p>
      </article>
      <article>
        <span class="featureNo">2</span>
        <h3>即時天氣與生理監測</h3>
        <p>整合定位、心率、血氧、體溫、電量與連線狀態，異常時即時警示。</p>
      </article>
      <article>
        <span class="featureNo">3</span>
        <h3>智慧互助廣播</h3>
        <p>遇到 SOS 或失聯事件時，協助管理者召集附近隊伍支援。</p>
      </article>
      <article>
        <span class="featureNo">4</span>
        <h3>登山申請與建議</h3>
        <p>申請時提供裝備清單、路線風險、建議撤退條件與注意事項。</p>
      </article>
      <article>
        <span class="featureNo">5</span>
        <h3>管理者通知機制</h3>
        <p>彙整裝備不足、天氣惡化、裝置斷線、生理異常與救援事件。</p>
      </article>
    </div>
  </section>
</section>

<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

  .homePage{
    --ink: #0b1b1e;
    --muted: #53656a;
    --line: rgba(12, 40, 46, 0.13);
    --panel: rgba(255, 255, 255, 0.84);
    --green: #12a678;
    --orange: #f97316;
    --blue: #1d4ed8;
    color: var(--ink);
    padding: 24px 0 44px;
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
  }

  .heroGrid{
    min-height: calc(100vh - 210px);
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.95fr);
    align-items: center;
    gap: 28px;
  }

  .heroCopy{
    max-width: 760px;
  }

  .eyebrow{
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--muted);
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
  }

  h1{
    margin: 10px 0 12px;
    max-width: 780px;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
    font-size: 54px;
    line-height: 1.08;
    letter-spacing: 0;
  }

  .subtitle{
    max-width: 660px;
    margin: 0;
    font-size: 18px;
    line-height: 1.8;
    color: var(--muted);
  }

  .actions{
    margin-top: 24px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .primary,
  .ghost,
  .entryCard a{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    border-radius: 999px;
    padding: 8px 16px;
    text-decoration: none;
    font-size: 14px;
    font-weight: 700;
    border: 1px solid rgba(12, 40, 46, 0.18);
  }

  .primary{
    background: #0f1a1c;
    color: #f2f6f6;
  }

  .ghost{
    background: rgba(255, 255, 255, 0.8);
    color: var(--ink);
  }

  button.ghost{
    cursor: pointer;
  }

  .welcome{
    margin: 14px 0 0;
    font-size: 14px;
    color: var(--muted);
  }
  .welcome strong{ color: var(--ink); }

  .signalPanel{
    position: relative;
    min-height: 430px;
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 18px;
    overflow: hidden;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.86), rgba(230, 244, 241, 0.9)),
      repeating-linear-gradient(90deg, rgba(12,40,46,0.04) 0 1px, transparent 1px 24px);
    box-shadow: 0 26px 60px rgba(10, 22, 26, 0.16);
  }

  .panelTop,
  .statusStrip{
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    position: relative;
    z-index: 2;
    color: var(--muted);
    font-size: 13px;
  }

  .panelTop strong,
  .statusStrip strong{
    color: var(--ink);
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
  }

  .mountainScene{
    position: absolute;
    inset: 62px 18px 62px;
    border-radius: 14px;
    overflow: hidden;
    background:
      radial-gradient(circle at 18% 20%, rgba(18, 166, 120, 0.18), transparent 28%),
      radial-gradient(circle at 78% 22%, rgba(29, 78, 216, 0.16), transparent 30%),
      linear-gradient(180deg, #eef8f6 0%, #d7e9e5 100%);
  }

  .ridge{
    position: absolute;
    left: -8%;
    right: -8%;
    bottom: 0;
    height: 62%;
    clip-path: polygon(0 90%, 12% 58%, 22% 76%, 34% 35%, 48% 78%, 61% 42%, 74% 70%, 87% 28%, 100% 82%, 100% 100%, 0 100%);
  }

  .ridgeBack{
    bottom: 42px;
    background: rgba(23, 87, 104, 0.22);
  }

  .ridgeFront{
    background: linear-gradient(180deg, rgba(19, 75, 64, 0.72), rgba(12, 40, 46, 0.92));
  }

  .node{
    position: absolute;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 58px;
    height: 58px;
    border-radius: 50%;
    color: #fff;
    font-size: 12px;
    font-weight: 800;
    box-shadow: 0 14px 28px rgba(12, 24, 28, 0.24);
  }

  .node-a{ left: 14%; top: 24%; background: var(--blue); }
  .node-b{ right: 18%; top: 18%; background: var(--green); }
  .node-c{ right: 22%; bottom: 20%; background: #dc2626; }
  .node-d{ left: 22%; bottom: 22%; background: var(--orange); }

  .routeLine{
    position: absolute;
    z-index: 2;
    height: 2px;
    border-top: 2px dashed rgba(255, 255, 255, 0.76);
    transform-origin: left center;
  }

  .routeOne{
    width: 52%;
    left: 23%;
    top: 38%;
    transform: rotate(13deg);
  }

  .routeTwo{
    width: 42%;
    left: 32%;
    bottom: 34%;
    transform: rotate(-18deg);
  }

  .statusStrip{
    position: absolute;
    left: 18px;
    right: 18px;
    bottom: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }

  .entryGrid{
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 18px;
  }

  .entryCard{
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 18px;
    background: var(--panel);
    box-shadow: 0 14px 34px rgba(10, 22, 26, 0.1);
  }

  .entryStrong{
    border-color: rgba(18, 166, 120, 0.34);
    background: linear-gradient(145deg, rgba(255,255,255,0.9), rgba(226, 246, 241, 0.92));
  }

  .entryIndex{
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
    font-weight: 800;
    color: var(--green);
  }

  .entryCard h2{
    margin: 8px 0 6px;
    font-size: 22px;
  }

  .entryCard p{
    min-height: 74px;
    margin: 0 0 14px;
    color: var(--muted);
    line-height: 1.65;
  }

  .entryCard a{
    color: var(--ink);
    background: rgba(255, 255, 255, 0.76);
  }

  .capabilityBand{
    margin-top: 28px;
    padding-top: 24px;
    border-top: 1px solid var(--line);
  }

  .sectionHead{
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 14px;
  }

  .sectionHead h2{
    margin: 0;
    font-size: 28px;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
  }

  .featureGrid{
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
  }

  .featureGrid article{
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 14px;
    background: rgba(255, 255, 255, 0.72);
  }

  .featureNo{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #0f1a1c;
    color: #fff;
    font-weight: 800;
    font-size: 12px;
  }

  .featureGrid h3{
    margin: 10px 0 6px;
    font-size: 16px;
  }

  .featureGrid p{
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.6;
  }

  @media (max-width: 1080px){
    .heroGrid{
      grid-template-columns: 1fr;
      min-height: auto;
    }

    .signalPanel{
      min-height: 360px;
    }

    .featureGrid{
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px){
    .homePage{ padding-top: 8px; }
    h1{ font-size: 34px; }
    .subtitle{ font-size: 16px; }
    .entryGrid,
    .featureGrid{
      grid-template-columns: 1fr;
    }

    .entryCard p{
      min-height: auto;
    }
  }
</style>
