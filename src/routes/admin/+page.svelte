<script lang="ts">
  export let data: { user: { id: number; username: string; is_admin: number } };

  const queues = [
    { label: '高風險申請', value: '待接入' },
    { label: '裝備不足提醒', value: '待接入' },
    { label: '裝置斷線事件', value: '待接入' },
    { label: 'SOS 與互助廣播', value: '待接入' }
  ];
</script>

<section class="adminPage">
  <header class="pageHero">
    <div>
      <p class="eyebrow">Admin Portal</p>
      <h1>管理者入口</h1>
      <p>此頁作為管理者通知中心與決策支援入口，後續會整合高風險隊伍、裝備缺口、裝置異常與救援事件。</p>
    </div>
    <div class="heroActions">
      <div class="operatorCard">
        <span>管理者</span>
        <strong>{data.user.username}</strong>
      </div>
      <a class="primary" href="/dashboard">進入監控中心</a>
    </div>
  </header>

  <section class="queueGrid" aria-label="管理者待處理項目">
    {#each queues as item}
      <article class="queueCard">
        <span>{item.label}</span>
        <strong>{item.value}</strong>
      </article>
    {/each}
  </section>

  <section class="panel">
    <div>
      <p class="eyebrow">Next Build</p>
      <h2>後續接入內容</h2>
    </div>
    <p>建立通知資料表後，這裡會改為真正的管理者任務清單，支援已讀、處理中與已完成狀態。</p>
  </section>
</section>

<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

  .adminPage{
    --ink: #0b1b1e;
    --muted: #53656a;
    --line: rgba(12, 40, 46, 0.13);
    color: var(--ink);
    padding: 20px 0 44px;
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
  }

  .pageHero{
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
  }

  .heroActions{
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .operatorCard{
    min-width: 150px;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 12px;
    background: rgba(255,255,255,0.86);
  }

  .operatorCard span{
    display: block;
    color: var(--muted);
    font-size: 12px;
  }

  .operatorCard strong{
    display: block;
    margin-top: 3px;
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
    margin: 8px 0;
    font-size: 38px;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
  }

  .pageHero p,
  .panel p{
    max-width: 760px;
    margin: 0;
    color: var(--muted);
    line-height: 1.75;
  }

  .primary{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    border-radius: 999px;
    padding: 8px 16px;
    text-decoration: none;
    font-size: 14px;
    font-weight: 700;
    background: #0f1a1c;
    color: #f2f6f6;
    white-space: nowrap;
  }

  .queueGrid{
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .queueCard,
  .panel{
    border: 1px solid var(--line);
    border-radius: 14px;
    background: rgba(255,255,255,0.86);
    box-shadow: 0 14px 34px rgba(10, 22, 26, 0.1);
  }

  .queueCard{
    padding: 16px;
  }

  .queueCard span{
    display: block;
    color: var(--muted);
    font-size: 13px;
  }

  .queueCard strong{
    display: block;
    margin-top: 8px;
    font-size: 20px;
  }

  .panel{
    display: grid;
    gap: 10px;
    padding: 18px;
    background: linear-gradient(145deg, rgba(255,255,255,0.92), rgba(226,246,241,0.92));
  }

  h2{
    margin: 8px 0 0;
    font-size: 24px;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
  }

  @media (max-width: 900px){
    .pageHero{
      flex-direction: column;
      align-items: flex-start;
    }

    .heroActions{
      justify-content: flex-start;
    }

    .queueGrid{
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 580px){
    .queueGrid{
      grid-template-columns: 1fr;
    }
  }
</style>
