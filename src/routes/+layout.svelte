<script lang="ts">
  import { page } from '$app/stores';

  export let data: { user: { id: number; username: string; is_admin: number } | null };

  $: isDashboard = $page.url.pathname === '/dashboard';
</script>

<div class:dashboardShell={isDashboard} class="appShell">
  <nav class="topbar">
    <div class="brand">
      <a href="/" class="brandLink">MountainLink</a>
      <span class="brandTag">山域安全</span>
    </div>

    <div class="navLinks">
      <a href="/apply" class="navLink">登山申請</a>
      <a href="/dashboard" class="navLink">監控中心</a>
      {#if data.user}
        <a href="/devices" class="navLink">裝置列表</a>
      {/if}
      {#if data.user?.is_admin}
        <a href="/admin" class="navLink">管理者入口</a>
        <a href="/register" class="navLink">註冊帳號</a>
      {/if}
    </div>

    <div class="userBox">
      {#if data.user}
        <span class="userName">{data.user.username}{data.user.is_admin ? '（Admin）' : ''}</span>
        <form method="POST" action="/logout">
          <button class="ghost" type="submit">登出</button>
        </form>
      {:else}
        <a href="/login" class="ghost">登入</a>
      {/if}
    </div>
  </nav>

  <main class="content">
    <slot />
  </main>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

  .appShell{
    --ink: #0b1b1e;
    --muted: #53656a;
    --accent: #ff6b4a;
    --accent-2: #18b7a4;
    --stroke: rgba(12, 40, 46, 0.12);
    --panel: rgba(255, 255, 255, 0.9);
    min-height: 100vh;
    background:
      radial-gradient(1200px 340px at -10% -20%, rgba(24, 183, 164, 0.08), transparent 60%),
      radial-gradient(900px 300px at 110% 0%, rgba(255, 107, 74, 0.08), transparent 55%),
      linear-gradient(180deg, #f7fbfb 0%, #eef3f2 100%);
    color: var(--ink);
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
  }

  .topbar{
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 14px 22px;
    border-bottom: 1px solid var(--stroke);
    background: var(--panel);
    backdrop-filter: blur(12px);
  }

  .brand{
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
  }

  .brandLink{
    text-decoration: none;
    color: var(--ink);
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .brandTag{
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .navLinks{
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .navLink{
    text-decoration: none;
    color: var(--ink);
    font-size: 14px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid transparent;
  }

  .navLink:hover{
    border-color: var(--stroke);
    background: rgba(255, 255, 255, 0.7);
  }

  .userBox{
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }

  .userName{
    color: var(--muted);
  }

  .ghost{
    border: 1px solid var(--stroke);
    background: rgba(255, 255, 255, 0.7);
    color: var(--ink);
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 13px;
    text-decoration: none;
    cursor: pointer;
  }

  .content{
    padding: 18px 22px 40px;
  }

  .dashboardShell{
    background: #050c10;
  }

  .dashboardShell .topbar{
    position: fixed;
    right: 0;
    left: 0;
    transform: translateY(calc(-100% + 8px));
    transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
  }

  .dashboardShell .topbar::after{
    content: "";
    position: absolute;
    right: 0;
    bottom: -8px;
    left: 0;
    height: 8px;
    background: linear-gradient(90deg, rgba(16, 185, 129, 0.8), rgba(96, 165, 250, 0.75), rgba(245, 158, 11, 0.75));
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
  }

  .dashboardShell .topbar:hover,
  .dashboardShell .topbar:focus-within{
    transform: translateY(0);
    box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
  }

  .dashboardShell .content{
    padding: 12px 22px;
  }

  @media (max-width: 720px){
    .topbar{
      flex-wrap: wrap;
      gap: 10px;
    }
    .navLinks{
      width: 100%;
      order: 3;
      flex-wrap: wrap;
    }
    .userBox{
      width: 100%;
      justify-content: space-between;
      order: 4;
    }
  }
</style>
