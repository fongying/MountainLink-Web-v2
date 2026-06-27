<script lang="ts">
  import type { RiskAssessment, RiskLevel } from '$lib/server/risk-assessments';
  import type { TripApplication } from '$lib/server/trip-applications';

  export let data: {
    user: { id: number; username: string; is_admin: number };
    trip: TripApplication;
    assessment: RiskAssessment;
  };

  $: trip = data.trip;
  $: assessment = data.assessment;

  const levelLabels: Record<RiskLevel, string> = {
    low: '低風險',
    medium: '中風險',
    high: '高風險',
    critical: '極高風險'
  };
</script>

<section class="detailPage">
  <header class="pageHero">
    <div>
      <p class="eyebrow">Application Review</p>
      <h1>{trip.routeName}</h1>
      <p>{trip.startDate} - {trip.endDate} · {trip.totalDays || '-'} 天 · {trip.partySize} 人 · {trip.experienceLevel}</p>
    </div>
    <div class="statusCard">
      <span>申請狀態</span>
      <strong>{trip.status === 'submitted' ? '已送出' : trip.status}</strong>
    </div>
  </header>

  <div class="detailGrid">
    <section class="panel riskPanel spanTwo" class:levelLow={assessment.level === 'low'} class:levelMedium={assessment.level === 'medium'} class:levelHigh={assessment.level === 'high'} class:levelCritical={assessment.level === 'critical'}>
      <div class="riskHeader">
        <div>
          <p class="eyebrow">Risk Agent</p>
          <h2>AI 風險評估</h2>
          <p>規則型代理依申請資料產生初版風險判斷，後續可再接天氣、裝置定位與生理資料。</p>
        </div>
        <div class="riskScore">
          <span>{levelLabels[assessment.level]}</span>
          <strong>{assessment.score}</strong>
          <small>風險分數</small>
        </div>
      </div>

      <div class="riskGrid">
        <div>
          <h3>主要風險因子</h3>
          {#if assessment.factors.length === 0}
            <p class="mutedText">目前沒有明顯風險因子。</p>
          {:else}
            <div class="factorList">
              {#each assessment.factors as factor}
                <article class:danger={factor.severity === 'danger'} class:warning={factor.severity === 'warning'}>
                  <span>{factor.category}</span>
                  <strong>{factor.label}</strong>
                  <small>+{factor.score}</small>
                </article>
              {/each}
            </div>
          {/if}
        </div>

        <div>
          <h3>系統建議</h3>
          <ul class="recommendations">
            {#each assessment.recommendations as item}
              <li>{item}</li>
            {/each}
          </ul>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>行程計畫</h2>
      <dl class="kv">
        <div>
          <dt>登山主路線</dt>
          <dd>{trip.mainRoute}</dd>
        </div>
        <div>
          <dt>次路線</dt>
          <dd>{trip.subRoute || '未填寫'}</dd>
        </div>
        <div>
          <dt>入園 / 離園</dt>
          <dd>{trip.startDate} - {trip.endDate}</dd>
        </div>
        <div>
          <dt>入山地點</dt>
          <dd>{trip.entryArea || '未填寫'}</dd>
        </div>
        <div>
          <dt>離山地點</dt>
          <dd>{trip.exitArea || '未填寫'}</dd>
        </div>
        <div>
          <dt>衛星電話</dt>
          <dd>{trip.satellitePhone || '未填寫'}</dd>
        </div>
        <div>
          <dt>無線電頻率</dt>
          <dd>{trip.radioFrequency || '未填寫'}</dd>
        </div>
      </dl>

      <div class="textBlock">
        <h3>路線規劃</h3>
        <p>{trip.itinerary || '未填寫'}</p>
      </div>
    </section>

    <section class="panel">
      <h2>人員資料</h2>
      <dl class="kv">
        <div>
          <dt>申請人</dt>
          <dd>{trip.applicantName || '未填寫'} · {trip.applicantMobile || '未填寫'}</dd>
        </div>
        <div>
          <dt>申請人 Email</dt>
          <dd>{trip.applicantEmail || '未填寫'}</dd>
        </div>
        <div>
          <dt>領隊</dt>
          <dd>{trip.leaderName || '未填寫'} · {trip.leaderMobile || '未填寫'}</dd>
        </div>
        <div>
          <dt>領隊 Email</dt>
          <dd>{trip.leaderEmail || '未填寫'}</dd>
        </div>
        <div>
          <dt>隊員名單</dt>
          <dd>{trip.teamMembersText || '未填寫'}</dd>
        </div>
        <div>
          <dt>留守人</dt>
          <dd>{trip.stayBehindName || '未填寫'} · {trip.stayBehindMobile || '未填寫'}</dd>
        </div>
        <div>
          <dt>留守人電話</dt>
          <dd>{trip.stayBehindPhone || '未填寫'}</dd>
        </div>
        <div>
          <dt>留守人 Email</dt>
          <dd>{trip.stayBehindEmail || '未填寫'}</dd>
        </div>
        <div>
          <dt>緊急聯絡人</dt>
          <dd>{trip.emergencyContactName} · {trip.emergencyContactPhone}</dd>
        </div>
      </dl>
    </section>

    <section class="panel spanTwo">
      <h2>安全整備</h2>
      <dl class="kv compactKv">
        <div>
          <dt>Meshtastic 裝置</dt>
          <dd>{trip.meshtasticDeviceId || '尚未綁定'}</dd>
        </div>
        <div>
          <dt>安全承諾</dt>
          <dd>{trip.agreementConfirmed ? '已確認' : '未確認'}</dd>
        </div>
      </dl>

      <div class="equipmentList">
        {#each trip.equipment as item}
          <span>{item}</span>
        {/each}
      </div>

      {#if trip.notes}
        <div class="textBlock">
          <h3>備註</h3>
          <p>{trip.notes}</p>
        </div>
      {/if}
    </section>
  </div>

  <div class="actions">
    <a class="primary" href="/apply">建立另一筆申請</a>
    <a class="ghost" href="/dashboard">返回監控中心</a>
  </div>
</section>

<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

  .detailPage{
    --ink: #0b1b1e;
    --muted: #53656a;
    --line: rgba(12, 40, 46, 0.13);
    color: var(--ink);
    padding: 20px 0 44px;
    font-family: "IBM Plex Sans", "Noto Sans TC", sans-serif;
  }

  .pageHero{
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
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
    margin: 0;
    color: var(--muted);
  }

  .statusCard,
  .panel{
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgba(255,255,255,0.9);
    box-shadow: 0 14px 34px rgba(10, 22, 26, 0.1);
  }

  .statusCard{
    min-width: 160px;
    padding: 14px;
  }
  .statusCard span{
    display: block;
    color: var(--muted);
    font-size: 12px;
  }
  .statusCard strong{
    display: block;
    margin-top: 4px;
  }

  .detailGrid{
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 0.8fr);
    gap: 16px;
  }

  .panel{
    padding: 18px;
  }

  .spanTwo{
    grid-column: 1 / -1;
  }

  .riskPanel{
    border-color: rgba(29, 78, 216, 0.2);
    background: linear-gradient(145deg, rgba(255,255,255,0.95), rgba(232,242,255,0.9));
  }

  .riskPanel.levelLow{
    border-color: rgba(18, 166, 120, 0.32);
  }

  .riskPanel.levelMedium{
    border-color: rgba(245, 158, 11, 0.38);
  }

  .riskPanel.levelHigh,
  .riskPanel.levelCritical{
    border-color: rgba(220, 38, 38, 0.34);
  }

  .riskHeader{
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
    margin-bottom: 16px;
  }

  .riskHeader h2{
    margin-bottom: 6px;
  }

  .riskHeader p:not(.eyebrow){
    margin: 0;
    color: var(--muted);
    line-height: 1.7;
  }

  .riskScore{
    min-width: 138px;
    border-radius: 8px;
    padding: 14px;
    background: #0f1a1c;
    color: #f2f6f6;
    text-align: center;
  }

  .riskScore span,
  .riskScore small{
    display: block;
    font-size: 12px;
    color: rgba(242, 246, 246, 0.76);
  }

  .riskScore strong{
    display: block;
    margin: 4px 0;
    font-size: 42px;
    line-height: 1;
    font-family: "Space Grotesk", "Noto Sans TC", sans-serif;
  }

  .riskGrid{
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 0.8fr);
    gap: 16px;
  }

  .factorList{
    display: grid;
    gap: 8px;
  }

  .factorList article{
    display: grid;
    grid-template-columns: 74px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    border: 1px solid rgba(12, 40, 46, 0.1);
    border-radius: 8px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.76);
  }

  .factorList article.warning{
    border-color: rgba(245, 158, 11, 0.3);
  }

  .factorList article.danger{
    border-color: rgba(220, 38, 38, 0.28);
  }

  .factorList span,
  .factorList small{
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }

  .factorList strong{
    min-width: 0;
    font-size: 13px;
    line-height: 1.55;
  }

  .recommendations{
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 8px;
    color: var(--muted);
    line-height: 1.65;
  }

  .mutedText{
    margin: 0;
    color: var(--muted);
    line-height: 1.7;
  }

  h2{
    margin: 0 0 14px;
    font-size: 22px;
    letter-spacing: 0;
  }

  .kv{
    margin: 0;
    display: grid;
    gap: 10px;
  }

  .kv div{
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid rgba(12, 40, 46, 0.08);
  }

  .compactKv{
    margin-bottom: 14px;
  }

  dt{
    color: var(--muted);
    font-size: 13px;
  }

  dd{
    margin: 0;
    font-weight: 700;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .equipmentList{
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .equipmentList span{
    border-radius: 999px;
    padding: 6px 10px;
    border: 1px solid rgba(12, 40, 46, 0.12);
    background: rgba(255,255,255,0.76);
    font-size: 13px;
    font-weight: 700;
  }

  .textBlock{
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid rgba(12, 40, 46, 0.1);
  }

  h3{
    margin: 0 0 8px;
    font-size: 16px;
  }

  .textBlock p{
    margin: 0;
    color: var(--muted);
    line-height: 1.7;
    white-space: pre-wrap;
  }

  .actions{
    margin-top: 16px;
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
  }
  .ghost{
    color: var(--ink);
    background: rgba(255,255,255,0.76);
  }

  @media (max-width: 860px){
    .pageHero{
      flex-direction: column;
      align-items: stretch;
    }

    .detailGrid{
      grid-template-columns: 1fr;
    }

    .riskHeader,
    .riskGrid{
      grid-template-columns: 1fr;
      display: grid;
    }

    .riskScore{
      min-width: 0;
    }

    .kv div{
      grid-template-columns: 1fr;
    }

    .factorList article{
      grid-template-columns: 1fr;
    }
  }
</style>
