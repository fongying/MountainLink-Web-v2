<script lang="ts">
  import type { TripApplication } from '$lib/server/trip-applications';

  type FormValues = {
    mainRoute?: string;
    subRoute?: string;
    totalDays?: string;
    startDate?: string;
    endDate?: string;
    entryArea?: string;
    exitArea?: string;
    itinerary?: string;
    satellitePhone?: string;
    radioFrequency?: string;
    partySize?: string;
    experienceLevel?: string;
    equipment?: string[];
    applicantName?: string;
    applicantMobile?: string;
    applicantEmail?: string;
    leaderName?: string;
    leaderMobile?: string;
    leaderEmail?: string;
    teamMembersText?: string;
    stayBehindName?: string;
    stayBehindPhone?: string;
    stayBehindMobile?: string;
    stayBehindEmail?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    meshtasticDeviceId?: string;
    notes?: string;
    agreementConfirmed?: boolean;
  };

  type FormState = {
    error?: string;
    values?: FormValues;
  };

  export let data: {
    user: { id: number; username: string; is_admin: number };
    mainRouteOptions: readonly string[];
    subRouteOptions: readonly string[];
    areaOptions: readonly string[];
    equipmentOptions: readonly string[];
    experienceLevels: readonly string[];
    recentTrips: TripApplication[];
  };
  export let form: FormState | undefined;

  let activeStep = form?.error ? 1 : 1;
  let applicantName = form?.values?.applicantName ?? '';
  let applicantMobile = form?.values?.applicantMobile ?? '';
  let applicantEmail = form?.values?.applicantEmail ?? '';
  let leaderName = form?.values?.leaderName ?? '';
  let leaderMobile = form?.values?.leaderMobile ?? '';
  let leaderEmail = form?.values?.leaderEmail ?? '';
  let stayBehindName = form?.values?.stayBehindName ?? '';
  let stayBehindMobile = form?.values?.stayBehindMobile ?? '';
  let stayBehindPhone = form?.values?.stayBehindPhone ?? '';
  let stayBehindEmail = form?.values?.stayBehindEmail ?? '';

  function copyApplicantToLeader() {
    leaderName = applicantName;
    leaderMobile = applicantMobile;
    leaderEmail = applicantEmail;
  }

  function copyApplicantToStayBehind() {
    stayBehindName = applicantName;
    stayBehindMobile = applicantMobile;
    stayBehindEmail = applicantEmail;
  }

  $: values = form?.values ?? {};
</script>

<section class="flowPage">
  <header class="pageHero">
    <div>
      <p class="eyebrow">Hiker Portal</p>
      <h1>登山申請</h1>
      <p>依台灣登山申請流程簡化為行程計畫、人員資料與安全整備三段。路線與入離山地點改用下拉選單，降低填寫錯誤。</p>
    </div>
    <div class="operatorCard">
      <span>目前帳號</span>
      <strong>{data.user.username}</strong>
    </div>
  </header>

  <div class="contentGrid">
    <form class="panel applyForm" method="POST" novalidate>
      {#if form?.error}
        <p class="error">{form.error}</p>
      {/if}

      <section class="formSection" class:isActive={activeStep === 1}>
        <button class="sectionToggle" type="button" aria-expanded={activeStep === 1} on:click={() => (activeStep = 1)}>
          <span class="stepNo">01</span>
          <span class="sectionTitle">
            <strong>行程計畫</strong>
            <small>選擇登山路線、次路線、入離山地點，並填寫簡易路線規劃。</small>
          </span>
          <span class="toggleMark">{activeStep === 1 ? '收合' : '展開'}</span>
        </button>

        <div class="stepBody" class:isCollapsed={activeStep !== 1}>
          <div class="formGrid">
          <label>
            登山主路線
            <select name="mainRoute" required>
              <option value="" selected={!values.mainRoute}>請選擇</option>
              {#each data.mainRouteOptions as route}
                <option value={route} selected={values.mainRoute === route}>{route}</option>
              {/each}
            </select>
          </label>

          <label>
            次路線
            <select name="subRoute" required>
              <option value="" selected={!values.subRoute}>請選擇</option>
              {#each data.subRouteOptions as route}
                <option value={route} selected={values.subRoute === route}>{route}</option>
              {/each}
            </select>
          </label>

          <label>
            登山總日數
            <input type="number" name="totalDays" min="1" max="30" required value={values.totalDays ?? ''} />
          </label>

          <label>
            入園日期
            <input type="date" name="startDate" required value={values.startDate ?? ''} />
          </label>

          <label>
            離園日期
            <input type="date" name="endDate" required value={values.endDate ?? ''} />
          </label>

          <label>
            入山地點
            <select name="entryArea" required>
              <option value="" selected={!values.entryArea}>請選擇</option>
              {#each data.areaOptions as area}
                <option value={area} selected={values.entryArea === area}>{area}</option>
              {/each}
            </select>
          </label>

          <label>
            離山地點
            <select name="exitArea" required>
              <option value="" selected={!values.exitArea}>請選擇</option>
              {#each data.areaOptions as area}
                <option value={area} selected={values.exitArea === area}>{area}</option>
              {/each}
            </select>
          </label>

          <label>
            衛星電話
            <input name="satellitePhone" placeholder="選填" value={values.satellitePhone ?? ''} />
          </label>

          <label>
            無線電頻率
            <input name="radioFrequency" placeholder="選填，例：145.00 MHz" value={values.radioFrequency ?? ''} />
          </label>

          <label class="wide">
            路線規劃
            <textarea name="itinerary" rows="4" required placeholder="例：D1 登山口至山屋，D2 攻頂後返回營地，D3 下山。">{values.itinerary ?? ''}</textarea>
          </label>
          </div>

          <div class="stepActions">
            <button class="nextButton" type="button" on:click={() => (activeStep = 2)}>下一步：人員資料</button>
          </div>
        </div>
      </section>

      <section class="formSection" class:isActive={activeStep === 2}>
        <button class="sectionToggle" type="button" aria-expanded={activeStep === 2} on:click={() => (activeStep = 2)}>
          <span class="stepNo">02</span>
          <span class="sectionTitle">
            <strong>人員資料</strong>
            <small>簡化收集申請人、領隊、留守人與緊急聯絡資訊。</small>
          </span>
          <span class="toggleMark">{activeStep === 2 ? '收合' : '展開'}</span>
        </button>

        <div class="stepBody" class:isCollapsed={activeStep !== 2}>
          <div class="formGrid">
          <label>
            隊伍人數
            <input type="number" name="partySize" min="1" max="12" required value={values.partySize ?? ''} />
          </label>

          <label>
            隊伍經驗
            <select name="experienceLevel" required>
              <option value="" selected={!values.experienceLevel}>請選擇</option>
              {#each data.experienceLevels as level}
                <option value={level} selected={values.experienceLevel === level}>{level}</option>
              {/each}
            </select>
          </label>

          <label>
            申請人姓名
            <input name="applicantName" required bind:value={applicantName} />
          </label>

          <label>
            申請人手機
            <input name="applicantMobile" required bind:value={applicantMobile} />
          </label>

          <label class="wide">
            申請人 Email
            <input type="email" name="applicantEmail" required bind:value={applicantEmail} />
          </label>

          <div class="groupHead wide">
            <h3>領隊資料</h3>
            <button class="copyButton" type="button" on:click={copyApplicantToLeader}>同申請人</button>
          </div>

          <label>
            領隊姓名
            <input name="leaderName" required bind:value={leaderName} />
          </label>

          <label>
            領隊手機
            <input name="leaderMobile" required bind:value={leaderMobile} />
          </label>

          <label class="wide">
            領隊 Email
            <input type="email" name="leaderEmail" required bind:value={leaderEmail} />
          </label>

          <label class="wide">
            隊員名單
            <textarea name="teamMembersText" rows="3" placeholder="選填。每行一位隊員，可填姓名、手機或 Email，系統會檢查留守人是否在名單中。">{values.teamMembersText ?? ''}</textarea>
          </label>

          <div class="groupHead wide">
            <h3>留守人資料</h3>
            <button class="copyButton" type="button" on:click={copyApplicantToStayBehind}>同申請人</button>
          </div>

          <label>
            留守人姓名
            <input name="stayBehindName" required bind:value={stayBehindName} />
          </label>

          <label>
            留守人手機
            <input name="stayBehindMobile" required bind:value={stayBehindMobile} />
          </label>

          <label>
            留守人電話
            <input name="stayBehindPhone" placeholder="選填" bind:value={stayBehindPhone} />
          </label>

          <label>
            留守人 Email
            <input type="email" name="stayBehindEmail" required bind:value={stayBehindEmail} />
          </label>

          <label>
            緊急聯絡人
            <input name="emergencyContactName" required value={values.emergencyContactName ?? ''} />
          </label>

          <label>
            緊急聯絡電話
            <input name="emergencyContactPhone" required value={values.emergencyContactPhone ?? ''} />
          </label>
          </div>

          <div class="stepActions">
            <button class="ghostStep" type="button" on:click={() => (activeStep = 1)}>上一步</button>
            <button class="nextButton" type="button" on:click={() => (activeStep = 3)}>下一步：安全整備</button>
          </div>
        </div>
      </section>

      <section class="formSection" class:isActive={activeStep === 3}>
        <button class="sectionToggle" type="button" aria-expanded={activeStep === 3} on:click={() => (activeStep = 3)}>
          <span class="stepNo">03</span>
          <span class="sectionTitle">
            <strong>安全整備</strong>
            <small>勾選裝備、通訊定位與安全承諾，作為後續風險評估依據。</small>
          </span>
          <span class="toggleMark">{activeStep === 3 ? '收合' : '展開'}</span>
        </button>

        <div class="stepBody" class:isCollapsed={activeStep !== 3}>
          <div class="formGrid">
          <label class="wide">
            Meshtastic 裝置 ID
            <input name="meshtasticDeviceId" placeholder="選填，若已有裝置可填 node id 或短名稱" value={values.meshtasticDeviceId ?? ''} />
          </label>

          <fieldset class="wide equipmentBox">
            <legend>安全整備項目</legend>
            <div class="equipmentGrid">
              {#each data.equipmentOptions as item}
                <label class="checkLabel">
                  <input type="checkbox" name="equipment" value={item} checked={values.equipment?.includes(item)} />
                  <span>{item}</span>
                </label>
              {/each}
            </div>
          </fieldset>

          <label class="wide">
            備註
            <textarea name="notes" rows="4" placeholder="可補充山屋、營地、交通、特殊隊員需求或管理者需注意事項。">{values.notes ?? ''}</textarea>
          </label>

          <label class="wide agreement">
            <input type="checkbox" name="agreementConfirmed" checked={values.agreementConfirmed} />
            <span>我確認隊伍會遵守登山安全注意事項、環境維護原則，並保持通訊或定位設備可用。</span>
          </label>
          </div>

          <div class="stepActions">
            <button class="ghostStep" type="button" on:click={() => (activeStep = 2)}>上一步</button>
          </div>
        </div>
      </section>

      <div class="formActions">
        <button class="primary" type="submit">送出登山申請</button>
        <a class="ghost" href="/dashboard">返回監控中心</a>
      </div>
    </form>

    <aside class="sideRail">
      <section class="panel accentPanel">
        <div class="panelHead compact">
          <span class="stepNo">清單</span>
          <h2>近期申請</h2>
        </div>
        {#if data.recentTrips.length === 0}
          <p class="empty">目前尚未建立登山申請。</p>
        {:else}
          <div class="tripList">
            {#each data.recentTrips as trip}
              <a class="tripItem" href={`/apply/${trip.id}`}>
                <strong>{trip.routeName}</strong>
                <span>{trip.startDate} - {trip.endDate} · {trip.partySize} 人</span>
              </a>
            {/each}
          </div>
        {/if}
      </section>

      <section class="panel noticePanel">
        <h2>簡化範圍</h2>
        <p>此版先不收身分證、生日、地址與完整隊員名冊，也不處理驗證碼、入園抽籤或各路線申請期限規則。</p>
      </section>
    </aside>
  </div>
</section>

<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

  .flowPage{
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

  .eyebrow{
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
  }

  h1{
    margin: 8px 0;
    font-size: 38px;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
    letter-spacing: 0;
  }

  .pageHero p{
    max-width: 780px;
    margin: 0;
    color: var(--muted);
    line-height: 1.75;
  }

  .operatorCard,
  .panel{
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 14px 34px rgba(10, 22, 26, 0.1);
  }

  .operatorCard{
    min-width: 190px;
    padding: 14px;
  }
  .operatorCard span{
    display: block;
    color: var(--muted);
    font-size: 12px;
  }
  .operatorCard strong{ display: block; margin-top: 4px; }

  .contentGrid{
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
    gap: 16px;
  }

  .panel{ padding: 18px; }
  .applyForm{ display: grid; gap: 20px; }
  .sideRail{ display: grid; align-content: start; gap: 16px; }
  .accentPanel{
    background: linear-gradient(145deg, rgba(255,255,255,0.94), rgba(229,246,241,0.94));
  }

  .noticePanel p{
    margin: 0;
    color: var(--muted);
    line-height: 1.7;
  }

  .formSection{
    display: grid;
    gap: 14px;
    border: 1px solid rgba(12, 40, 46, 0.12);
    border-radius: 8px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.62);
    transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
  }

  .formSection.isActive{
    border-color: rgba(29, 78, 216, 0.28);
    background: rgba(219, 234, 254, 0.5);
    box-shadow: inset 0 0 0 1px rgba(29, 78, 216, 0.08);
  }

  .sectionToggle{
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }

  .sectionTitle{
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .sectionTitle strong{
    font-size: 22px;
    line-height: 1.25;
  }

  .sectionTitle small{
    color: var(--muted);
    line-height: 1.55;
    font-size: 13px;
  }

  .toggleMark{
    border-radius: 999px;
    border: 1px solid rgba(12, 40, 46, 0.14);
    padding: 5px 9px;
    background: rgba(255, 255, 255, 0.72);
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .stepBody{
    display: grid;
    gap: 14px;
  }

  .stepBody.isCollapsed{
    display: none;
  }

  .stepActions{
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }

  .nextButton,
  .ghostStep{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    border-radius: 999px;
    padding: 8px 14px;
    border: 1px solid rgba(12, 40, 46, 0.18);
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .nextButton{
    background: #0f1a1c;
    color: #f2f6f6;
  }

  .ghostStep{
    background: rgba(255, 255, 255, 0.76);
    color: var(--ink);
  }

  .panelHead{
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .panelHead.compact{
    align-items: center;
    margin-bottom: 14px;
  }

  .stepNo{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 30px;
    border-radius: 999px;
    padding: 0 8px;
    background: #0f1a1c;
    color: #fff;
    font-weight: 800;
    font-size: 12px;
  }

  h2{ margin: 0; font-size: 22px; letter-spacing: 0; }

  .error,
  .empty{
    margin: 0;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 13px;
  }
  .error{
    color: #8a1322;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.24);
  }
  .empty{
    color: var(--muted);
    background: rgba(12, 40, 46, 0.06);
  }

  .formGrid{
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  label,
  fieldset{
    min-width: 0;
  }

  label{
    display: grid;
    gap: 6px;
    font-size: 13px;
    color: #2b3a3c;
    font-weight: 700;
  }

  .wide{ grid-column: 1 / -1; }

  .groupHead{
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid rgba(12, 40, 46, 0.1);
  }

  .groupHead h3{
    margin: 0;
    font-size: 16px;
    letter-spacing: 0;
  }

  .copyButton{
    border: 1px solid rgba(12, 40, 46, 0.16);
    border-radius: 999px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.82);
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }

  input,
  select,
  textarea{
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(12, 40, 46, 0.18);
    border-radius: 8px;
    padding: 10px 12px;
    background: #fff;
    color: var(--ink);
    font: inherit;
    font-weight: 400;
  }

  textarea{ resize: vertical; }

  input:focus,
  select:focus,
  textarea:focus{
    outline: 2px solid rgba(18, 166, 120, 0.28);
    border-color: rgba(18, 166, 120, 0.55);
  }

  .equipmentBox{
    margin: 0;
    border: 1px solid rgba(12, 40, 46, 0.14);
    border-radius: 8px;
    padding: 12px;
  }

  .equipmentBox legend{
    padding: 0 6px;
    font-size: 13px;
    font-weight: 700;
  }

  .equipmentGrid{
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .checkLabel,
  .agreement{
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    border-radius: 8px;
    padding: 7px 10px;
    background: rgba(255, 255, 255, 0.76);
    border: 1px solid rgba(12, 40, 46, 0.1);
    font-weight: 600;
  }

  .checkLabel input,
  .agreement input{
    width: auto;
  }

  .agreement{
    align-items: flex-start;
    line-height: 1.6;
  }

  .formActions{
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .primary,
  .ghost{
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
    cursor: pointer;
  }
  .ghost{
    color: var(--ink);
    background: rgba(255, 255, 255, 0.76);
  }

  .tripList{
    display: grid;
    gap: 10px;
  }

  .tripItem{
    display: grid;
    gap: 4px;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid rgba(12, 40, 46, 0.12);
    background: rgba(255,255,255,0.76);
    color: inherit;
    text-decoration: none;
  }

  .tripItem span{
    color: var(--muted);
    font-size: 13px;
  }

  @media (max-width: 980px){
    .contentGrid{
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px){
    .pageHero{
      flex-direction: column;
      align-items: stretch;
    }

    .formGrid,
    .equipmentGrid{
      grid-template-columns: 1fr;
    }
  }
</style>
