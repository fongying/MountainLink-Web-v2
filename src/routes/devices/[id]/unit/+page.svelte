<script lang="ts">
  export let data: {
    deviceId: string;
    unit: string;
    units: string[];
    users: { id: number; username: string; is_admin: number }[];
    boundUserId: number | null;
  };
</script>

<section class="unitPage">
  <div class="card">
    <p class="eyebrow">Device Unit</p>
    <h1>裝置單位設定</h1>
    <p class="subtitle">調整指定裝置的單位分類</p>

    <div class="deviceId">
      裝置 ID：<strong>{data.deviceId}</strong>
    </div>

    <form class="form" method="POST">
      <label>
        單位
        <select name="unit" bind:value={data.unit}>
          {#each data.units as u}
            <option value={u}>{u}</option>
          {/each}
        </select>
      </label>

      <label>
        綁定帳號
        <select name="bindUserId" bind:value={data.boundUserId}>
          <option value="">未綁定</option>
          {#each data.users as u}
            <option value={u.id}>{u.username}</option>
          {/each}
        </select>
      </label>

      <button class="primary" type="submit">儲存</button>
    </form>

    <p class="hint">儲存後會回到裝置詳情頁</p>
  </div>
</section>

<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

  .unitPage{
    min-height: 70vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px 40px;
    text-align: center;
  }

  .card{
    width: min(520px, 100%);
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

  .deviceId{
    margin: 6px 0 14px;
    font-size: 14px;
    color: #2b3a3c;
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
  }

  .form{
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

  select{
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(12, 40, 46, 0.18);
    background: #fff;
    font-size: 14px;
  }

  select:focus{
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

  .hint{
    margin: 14px 0 0;
    font-size: 13px;
    color: #53656a;
  }
</style>
