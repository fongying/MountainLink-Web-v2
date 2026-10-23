/** Bound background detail before sending a structured AI snapshot. Never slice raw JSON. */
export function compactRecommendationPrompt(prompt:string,maxBytes:number) {
 let data:any;
 try {data=JSON.parse(prompt);} catch {return prompt;}
 if(!Array.isArray(data.teamRiskContext)||!Array.isArray(data.evidenceCatalog)) return prompt;
 const size=()=>Buffer.byteLength(JSON.stringify(data),'utf8');
 const originalForecasts=Array.isArray(data.mountainForecast72h)?data.mountainForecast72h.length:0;
 const originalTeams=data.teamRiskContext.length;
 data.contextCoverage={originalForecasts,originalRiskTeams:originalTeams,detailedForecastsOmitted:0,riskTeamDetailsOmitted:0,note:'部分背景細節可能省略；不得補造未提供資料或將未列出的地區視為無風險。'};
 for(const forecast of data.mountainForecast72h ?? []) {
   const periods=forecast.periods ?? [];
   forecast.periods=(periods.length>2?[periods[0],periods[periods.length-1]]:periods).map(({description,...rest}:any)=>rest);
 }
 while(size()>maxBytes && (data.mountainForecast72h?.length ?? 0)>0) {
   data.mountainForecast72h.pop();data.contextCoverage.detailedForecastsOmitted++;
 }
 for(const length of [110,60,0]) {
   if(size()<=maxBytes) break;
   for(const evidence of data.evidenceCatalog) if(evidence.source==='forecast' && typeof evidence.detail==='string') {
     if(length) evidence.detail=evidence.detail.slice(0,length);else delete evidence.detail;
   }
 }
 while(size()>maxBytes && data.teamRiskContext.length>1) {
   data.teamRiskContext.pop();data.contextCoverage.riskTeamDetailsOmitted++;
 }
 if(size()>maxBytes) throw new Error('AI核心證據超過輸入預算，停止分析以免模型截斷資料。');
 return JSON.stringify(data);
}
export const CHINESE_OUTPUT_REMINDER='資料結束。請只輸出完整JSON。所有敘述值一律使用臺灣繁體中文，禁止英文段落及簡體中文。JSON欄位名稱、列舉值、裝置ID、證據ID與單位保留原文。不得補造資料。';
