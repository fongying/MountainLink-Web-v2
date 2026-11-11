import type { GeoAssessment } from './geohazards';
// UI proximity cue only: neither an official warning threshold nor GPS accuracy.
export const GEO_PANEL_NEAR_METERS = 100;
type Match = GeoAssessment['matches'][number];
export type GeoPanelView = { mode: 'quiet' | 'inside' | 'boundary' | 'near'; label: string; highlighted: Match[] };
export function geohazardPresentation(result: GeoAssessment | null): GeoPanelView {
  const quiet = (label: string): GeoPanelView => ({ mode: 'quiet', label, highlighted: [] });
  if (!result) return quiet('正在比對圖資');
  if (result.status !== 'ok') {
    const labels = { no_location: '尚無有效座標', invalid_gps: 'GPS 無效，暫不判定',
      stale: '定位已過期，暫不判定', unavailable: '比對暫時無法使用' };
    return quiet(labels[result.status]);
  }
  const inside = result.matches.filter(m=>m.relation==='inside');
  const boundary = result.matches.filter(m=>m.relation==='boundary');
  if (boundary.length) return { mode: 'boundary', label: '崩塌圖資邊界 · 位置需確認', highlighted: [...boundary,...inside] };
  if (inside.length) return { mode: 'inside', label: '位置落入崩塌圖資範圍', highlighted: inside };
  const near = result.matches.filter(m=>m.relation==='outside' && Number.isFinite(m.distanceMeters)
    && m.distanceMeters>=0 && m.distanceMeters<=GEO_PANEL_NEAR_METERS);
  if (near.length) return { mode: 'near', label: '接近崩塌圖資邊界 · 位置需確認', highlighted: near };
  return quiet('未落入本版圖資範圍');
}
export function geohazardDistance(meters: number) {
  if (!Number.isFinite(meters) || meters<0) return '未提供';
  return meters>=1000 ? `${(meters/1000).toLocaleString('zh-TW',{maximumFractionDigits:1})} km`
    : `${Math.round(meters).toLocaleString('zh-TW')} m`;
}
