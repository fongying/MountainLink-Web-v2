<script lang="ts">
  export let data: { user: { id: number; username: string } | null };
</script>

<section class="homeHero">
  <div class="heroInner">
    <p class="eyebrow">Mountain Link</p>
    <h1>MountainLink Web v2</h1>
    <p class="subtitle">裝置監控與即時地圖管理</p>

    {#if data.user}
      <p class="welcome">已登入：<strong>{data.user.username}</strong></p>
      <div class="actions">
        <a class="primary" href="/dashboard">進入 Dashboard</a>
        <form method="POST" action="/logout">
          <button class="ghost" type="submit">登出</button>
        </form>
      </div>
    {:else}
      <div class="actions">
        <a class="primary" href="/login">登入</a>
        <a class="ghost" href="/register">註冊</a>
      </div>
    {/if}
  </div>
</section>

<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

  .homeHero{
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
    padding: 24px 16px 40px;
  }

  .heroInner{
    max-width: 620px;
  }

  .eyebrow{
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: #53656a;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
  }

  h1{
    margin: 8px 0 6px;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
    font-size: 36px;
    letter-spacing: -0.02em;
    color: #0b1b1e;
  }

  .subtitle{
    margin: 0 0 16px;
    font-size: 16px;
    color: #53656a;
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
  }

  .welcome{
    margin: 12px 0 0;
    font-size: 14px;
    color: #0b1b1e;
  }
  .welcome strong{ font-weight: 700; }

  .actions{
    margin-top: 18px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .primary,
  .ghost{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 8px 16px;
    text-decoration: none;
    font-size: 14px;
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
    border: 1px solid rgba(12, 40, 46, 0.18);
  }

  .primary{
    background: #0f1a1c;
    color: #f2f6f6;
  }

  .ghost{
    background: rgba(255, 255, 255, 0.8);
    color: #0b1b1e;
  }

  button.ghost{
    cursor: pointer;
  }

  @media (max-width: 640px){
    h1{ font-size: 30px; }
  }
</style>
