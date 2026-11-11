const NARRATIVE_FIELDS = ['title','globalSummary','reasoningSummary','teamSituationSummary','physiologySummary','terrainSummary','operatorRecommendation','recommendedAction','meshtasticDraft','message'] as const;
export function recommendationLanguageErrors(value: unknown): string[] {
  if(!value || typeof value !== 'object') return []; // Schema validation handles missing fields.
  const object=value as Record<string,unknown>;
  return NARRATIVE_FIELDS.filter(field=>{
    const text=object[field];
    if(typeof text !== 'string' || !text.trim()) return false;
    const clean=text.replace(/https?:\/\/\S+/gu,'').replace(/\b[\w.-]*\d[\w.-]*\b/gu,'').replace(/\b(?:GPS|SOS|RSSI|SNR|LoRa|Meshtastic|MountainLink|CWA|Ollama|bpm|mmHg|HTTP)\b/giu,'');
    const chinese=(clean.match(/\p{Script=Han}/gu)||[]).length;
    const latin=(clean.match(/[A-Za-z]/gu)||[]).length;
    return chinese===0 || latin>Math.max(12,chinese*2) || /风险|设备|建议|预报|队员|队伍|紧急|气温|体温|血压|离线|状态|确认|强风/u.test(clean);
  }).map(field=>`${field} 未符合繁體中文敘述要求`);
}
export class AiLanguageError extends Error {}
export async function generateChineseRecommendation<T extends {json:unknown}>(generate:(feedback:string)=>Promise<T>):Promise<T> {
  let result=await generate('');
  let errors=recommendationLanguageErrors(result.json);
  if(!errors.length) return result;
  result=await generate(`前次回覆語言不符：${errors.join('、')}。請重新產生完整JSON。所有敘述必須使用臺灣繁體中文，禁止英文段落及簡體中文；保留JSON欄位名稱、ID與專有名詞原文，不得新增證據。`);
  errors=recommendationLanguageErrors(result.json);
  if(errors.length) throw new AiLanguageError(`已重試一次，AI回覆仍未符合繁體中文要求：${errors.join('、')}`);
  return result;
}
