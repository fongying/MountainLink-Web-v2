<script lang="ts">
  export let form: { error?: string } | undefined;
</script>

<section class="authPage">
  <div class="authCard">
    <p class="eyebrow">Mountain Link</p>
    <h1>登入</h1>
    <p class="subtitle">使用你的帳號登入系統</p>

    <form class="authForm" method="POST">
      <label>
        使用者名稱
        <input name="username" autocomplete="username" required />
      </label>

      <label>
        密碼
        <input type="password" name="password" autocomplete="current-password" required />
      </label>

      <button class="primary" type="submit">登入</button>
    </form>

    {#if form?.error}
      <p class="error">{form.error}</p>
    {/if}

    <p class="hint">沒有帳號？<a href="/register">前往註冊</a></p>
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
    width: min(420px, 100%);
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

  .authForm{
    display: grid;
    gap: 12px;
    text-align: left;
  }

  label{
    display: grid;
    gap: 6px;
    font-size: 13px;
    color: #2b3a3c;
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
  }

  input{
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(12, 40, 46, 0.18);
    background: #fff;
    font-size: 14px;
  }

  input:focus{
    outline: 2px solid rgba(24, 183, 164, 0.4);
    border-color: rgba(24, 183, 164, 0.5);
  }

  .primary{
    margin-top: 4px;
    border-radius: 999px;
    padding: 10px 14px;
    border: 1px solid rgba(12, 40, 46, 0.2);
    background: #0f1a1c;
    color: #f2f6f6;
    font-size: 14px;
    cursor: pointer;
  }

  .error{
    margin: 10px 0 0;
    color: #b00020;
    font-size: 13px;
  }

  .hint{
    margin: 14px 0 0;
    font-size: 13px;
    color: #53656a;
  }

  .hint a{
    color: #0b1b1e;
    text-decoration: none;
    font-weight: 600;
  }
</style>
