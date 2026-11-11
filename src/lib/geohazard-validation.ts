import type {GeoAssessment} from './geohazards';
// Conservative guard for affirmative area claims. General precautionary reminders are allowed.
export function validateGeohazardClaims(texts: string[], assessment: GeoAssessment) {
 const hasMatch=assessment.status==='ok' && assessment.matches.some(m=>m.relation!=='outside');
 if(hasMatch) return [];
 const affirmative=texts.some(text=>text.split(/[。；;\n]/u).some(sentence=>
   !/(未落入|未命中|不在|未位於|不代表|無法判定|不能判定|未以舊位置|尚未確認|無法確認)/u.test(sentence) &&
   /(?:位於|處於|落入|落在|附近|存在|有).{0,24}(?:崩塌潛勢|崩塌影響|潛勢區)|(?:崩塌潛勢區|崩塌影響範圍)內/u.test(sentence)
 ));
 return affirmative ? ['AI 宣稱所在地有崩塌潛勢，但有效官方圖資比對未支持此結論，需人工確認。'] : [];
}
