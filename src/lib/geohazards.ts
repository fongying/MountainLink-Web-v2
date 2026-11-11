export type Position = [number, number];
export type GeoFeature = {
  type: 'Feature'; id: string;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Position[][] | Position[][][] };
  properties: { officialId: string; kind: 'potential' | 'impact'; name: string; county: string; town: string; village: string; risk: string; dataset: string; year: number };
};
export type GeoDataset = { type: 'FeatureCollection'; metadata: { year: number; source: string; license: string; retrievedAt: string; sources: unknown[] }; features: GeoFeature[] };
export type GeoAssessment = {
  status: 'ok' | 'no_location' | 'stale' | 'invalid_gps' | 'unavailable';
  summary: string; positionTime?: number; accuracyKnown: boolean;
  year?: number; retrievedAt?: string;
  matches: Array<GeoFeature['properties'] & { relation: 'inside' | 'boundary' | 'outside'; distanceMeters: number }>;
};
const R = 6371000;
const rad = Math.PI / 180;
// Local tangent-plane distance to a short polygon edge, in metres. Not a route distance.
export function edgeDistance(p: Position, a: Position, b: Position) {
  const scaleX = R * rad * Math.cos(p[1] * rad), scaleY = R * rad;
  const ax = (a[0]-p[0])*scaleX, ay = (a[1]-p[1])*scaleY;
  const bx = (b[0]-p[0])*scaleX, by = (b[1]-p[1])*scaleY;
  const dx=bx-ax, dy=by-ay, len=dx*dx+dy*dy;
  const t = len ? Math.max(0,Math.min(1,-(ax*dx+ay*dy)/len)) : 0;
  return Math.hypot(ax+t*dx,ay+t*dy);
}
function inRing(p: Position, ring: Position[]) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i], b=ring[j];
    if ((a[1]>p[1]) !== (b[1]>p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
export function locate(p: Position, geometry: GeoFeature['geometry']) {
  const polygons = geometry.type==='Polygon' ? [geometry.coordinates as Position[][]] : geometry.coordinates as Position[][][];
  let inside=false, distance=Infinity;
  for(const rings of polygons) {
    if(inRing(p,rings[0]) && !rings.slice(1).some(r=>inRing(p,r))) inside=true;
    for(const ring of rings) for(let i=0,j=ring.length-1;i<ring.length;j=i++) distance=Math.min(distance,edgeDistance(p,ring[j],ring[i]));
  }
  return {relation: distance<0.01 ? 'boundary' as const : inside ? 'inside' as const : 'outside' as const, distanceMeters:Math.round(distance)};
}
export function assessGeohazards(device: {lat?:number;lon?:number;updatedAt:number;mx2PositionTs?:number;mx2GpsValid?:boolean}, dataset:GeoDataset|null, now=Date.now()): GeoAssessment {
  const base={accuracyKnown:false,matches:[],year:dataset?.metadata.year,retrievedAt:dataset?.metadata.retrievedAt};
  if(!dataset) return {...base,status:'unavailable',summary:'官方崩塌圖資暫時無法使用，無法判斷。'};
  if(!Number.isFinite(device.lat)||!Number.isFinite(device.lon)||Math.abs(device.lat!)>90||Math.abs(device.lon!)>180) return {...base,status:'no_location',summary:'無有效座標，尚未比對官方崩塌圖資。'};
  const positionTime=device.mx2PositionTs ?? device.updatedAt;
  if(device.mx2GpsValid===false) return {...base,positionTime,status:'invalid_gps',summary:'GPS 無效，保留位置不能視為目前位置，未進行崩塌範圍判定。'};
  if(!Number.isFinite(positionTime)||now-positionTime>600000||positionTime>now+60000) return {...base,positionTime,status:'stale',summary:'定位已超過 10 分鐘或時間異常，未以舊位置判定目前崩塌潛勢。'};
  const results=dataset.features.map(f=>({...f.properties,...locate([device.lon!,device.lat!],f.geometry)}));
  const matches=results.filter(r=>r.relation!=='outside');
  if(!matches.length) for(const kind of ['potential','impact']) {
    const nearest=results.filter(r=>r.kind===kind).sort((a,b)=>a.distanceMeters-b.distanceMeters)[0];
    if(nearest) matches.push(nearest);
  }
  const hits=matches.filter(r=>r.relation!=='outside');
  const summary=hits.length ? hits.map(r=>`${r.officialId}：${r.relation==='boundary'?'位於圖資邊界，需確認':'位於'}${r.kind==='potential'?'大規模崩塌潛勢區':'大規模崩塌影響範圍'}`).join('；') : '座標未落入本版大規模崩塌潛勢區及影響範圍，不代表無其他災害風險。';
  return {...base,positionTime,status:'ok',matches,summary:summary+'；未提供 GPS 水平精度，邊界附近需人工確認。'};
}
