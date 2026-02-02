<script lang="ts">
  export let data: { user: { id: number; username: string; is_admin: number } };
</script>

<section class="authPage">
  <div class="authCard">
    <p class="eyebrow">Device</p>
    <h1>裝置登入</h1>
    <p class="subtitle">此頁面僅供管理員操作，已使用目前帳號驗證</p>

    <div class="status">
      已登入：<strong>{data.user.username}</strong>（Admin）
    </div>

    <div class="actions">
      <a class="primary" href="/dashboard">回到 Dashboard</a>
    </div>

    <p class="hint">請至裝置詳情頁調整單位設定</p>
  </div>
</section>

<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

  .authPage{
    min-height: 70vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px 40px;
    text-align: center;
  }

  .authCard{
    width: min(460px, 100%);
    padding: 22px;
    border-radius: 16px;
    border: 1px solid rgba(12, 40, 46, 0.12);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 16px 40px rgba(12, 20, 22, 0.12);
  }

  .eyebrow{
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: #53656a;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
  }

  h1{
    margin: 8px 0 6px;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
    font-size: 30px;
    color: #0b1b1e;
  }

  .subtitle{
    margin: 0 0 16px;
    font-size: 14px;
    color: #53656a;
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
  }

  .status{
    font-size: 14px;
    color: #2b3a3c;
    margin: 10px 0 18px;
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
  }

  .actions{
    display: inline-flex;
    gap: 10px;
    align-items: center;
    justify-content: center;
  }

  .primary{
    border-radius: 999px;
    padding: 10px 14px;
    border: 1px solid rgba(12, 40, 46, 0.2);
    background: #0f1a1c;
    color: #f2f6f6;
    font-size: 14px;
    text-decoration: none;
  }

  .hint{
    margin: 14px 0 0;
    font-size: 13px;
    color: #53656a;
  }
</style>
