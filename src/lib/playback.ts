export const PLAYBACK_STEP = 30 * 60 * 1000;
export const PLAYBACK_WINDOW = 3 * 24 * 60 * 60 * 1000;
export const PLAYBACK_DEMO_ID = 'NT-DEMO-002';
export type PlaybackFrame = {
  ts: number; sampleAt: number | null; lat: number | null; lon: number | null; alt: number | null;
  hr: number | null; battery: number | null; online: boolean | null; sos: boolean | null;
  gpsValid: boolean | null; source: 'demo' | 'recorded' | 'missing'; note: string;
};
export type PlaybackData = {
  deviceId: string; name: string; demo: boolean; start: number; end: number;
  interval: number; frames: PlaybackFrame[];
};
export type PlaybackRow = {
  ts: number; lat: number | null; lon: number | null; alt: number | null;
  hr: number | null; battery: number | null; sos: number | boolean | null;
  gps_valid: number | boolean | null;
};
export const playbackTime = (ts: number, short = false) => new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23', ...(short ? {} : { year: 'numeric' as const })
}).format(ts);
export function playbackRange(now = Date.now()) {
  const end = Math.floor(now / PLAYBACK_STEP) * PLAYBACK_STEP;
  return { start: end - PLAYBACK_WINDOW, end };
}
export function hasPosition(p: PlaybackFrame) {
  return p.gpsValid !== false && p.lat != null && p.lon != null && Number.isFinite(p.lat) && Number.isFinite(p.lon)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
}
export function playbackStatus(p: PlaybackFrame): { key: string; label: string; color: string } {
  if (p.source === 'missing') return { key: 'missing', label: '無回報', color: '#64748b' };
  if (p.sos) return { key: 'sos', label: p.online === false ? 'SOS・離線' : 'SOS', color: '#fb7185' };
  if (p.online === false) return { key: 'offline', label: '離線', color: '#94a3b8' };
  if (p.hr != null && (p.hr < 60 || p.hr > 100)) return { key: 'risk', label: '心率超出 60–100', color: '#fbbf24' };
  if (p.battery != null && p.battery <= 20) return { key: 'battery', label: '低電量', color: '#fbbf24' };
  return { key: 'normal', label: '正常', color: '#34d399' };
}
export function lastPosition(frames: PlaybackFrame[], index: number) {
  for (let i = Math.min(index, frames.length - 1); i >= 0; i--) if (hasPosition(frames[i])) return frames[i];
  return null;
}
export function routeSegments(frames: PlaybackFrame[], endIndex = frames.length - 1) {
  const segments: { lat: number; lng: number }[][] = [];
  let current: { lat: number; lng: number }[] = [];
  for (const p of frames.slice(0, endIndex + 1)) {
    if (!hasPosition(p)) { if (current.length) segments.push(current); current = []; }
    else current.push({ lat: p.lat!, lng: p.lon! });
  }
  if (current.length) segments.push(current);
  return segments;
}
export function playbackEvents(frames: PlaybackFrame[]) {
  return frames.flatMap((p, index) => index === 0 || playbackStatus(p).key !== playbackStatus(frames[index-1]).key
    || p.online !== frames[index-1].online
    ? [{ index, ts: p.ts, ...playbackStatus(p), note: p.note }] : []);
}
// Fictional training scenario only. Never persist to telemetry or feed live alert/AI pipelines.
export function makeDemoPlayback(now = Date.now()): PlaybackData {
  const { start, end } = playbackRange(now);
  const anchors = [
    [0,24.1371,121.2756,3150], [22,24.1456,121.2842,3250], [47,24.1462,121.2850,3260],
    [70,24.1571,121.2872,3370], [95,24.1580,121.2882,3350],
    [110,24.1638,121.2897,3410], [124,24.1648,121.2901,3420], [144,24.1648,121.2901,3420]
  ];
  const frames = Array.from({ length: 145 }, (_, i): PlaybackFrame => {
    const a = anchors.findIndex((x, n) => n < anchors.length - 1 && i >= x[0] && i <= anchors[n+1][0]);
    const left = anchors[Math.max(a, 0)], right = anchors[Math.max(a, 0)+1];
    const fraction = (i-left[0])/(right[0]-left[0]);
    const offline = i >= 125 && i <= 130;
    const sos = i >= 120;
    const rest = (i >= 25 && i <= 47) || (i >= 75 && i <= 95);
    const ts = start + i * PLAYBACK_STEP;
    return { ts, sampleAt: offline ? null : ts,
      lat: offline ? null : Number((left[1]+(right[1]-left[1])*fraction).toFixed(6)),
      lon: offline ? null : Number((left[2]+(right[2]-left[2])*fraction).toFixed(6)),
      alt: offline ? null : Math.round(left[3]+(right[3]-left[3])*fraction),
      hr: offline ? null : i >= 116 ? 118 + i%4 : rest ? 68 + i%5 : 82 + i%13,
      battery: offline ? null : Math.max(12, 96-Math.floor(i*0.59)),
      online: !offline, sos, gpsValid: !offline, source: 'demo',
      note: offline ? '模擬通訊中斷；此時位置與生理讀值未知，不補造軌跡。'
        : i >= 131 ? '模擬重新取得通訊；SOS 仍持續，等待後續處置。'
        : sos ? '模擬 SOS 已啟動，隊伍停留待援。'
        : i >= 116 ? '模擬心率升高與電量下降。'
        : rest ? '模擬紮營休息。' : '模擬隊伍行進與正常回報。' };
  });
  return { deviceId: PLAYBACK_DEMO_ID, name: '合歡山 SOS 示範隊', demo: true,
    start, end, interval: PLAYBACK_STEP, frames };
}
export function samplePlaybackRows(rows: PlaybackRow[], start: number, end: number): PlaybackFrame[] {
  const byBucket = new Map<number, PlaybackRow>();
  for (const row of rows) {
    if (!Number.isFinite(row.ts) || row.ts < start || row.ts > end) continue;
    const bucket = Math.ceil((row.ts-start)/PLAYBACK_STEP);
    const old = byBucket.get(bucket);
    if (!old || row.ts > old.ts) byBucket.set(bucket,row);
  }
  return Array.from({ length: Math.floor((end-start)/PLAYBACK_STEP)+1 }, (_, i) => {
    const ts = start + i*PLAYBACK_STEP, row = byBucket.get(i);
    if (!row) return { ts, sampleAt: null, lat: null, lon: null, alt: null, hr: null, battery: null,
      online: null, sos: null, gpsValid: null, source: 'missing' as const, note: '此 30 分鐘區間沒有歷史回報，不補值或推定當時位置。' };
    const valid = row.gps_valid == null ? null : Boolean(row.gps_valid);
    return { ts, sampleAt: row.ts, lat: valid === false ? null : row.lat, lon: valid === false ? null : row.lon,
      alt: valid === false ? null : row.alt, hr: row.hr, battery: row.battery,
      online: ts-row.ts < 600_000, sos: row.sos == null ? null : Boolean(row.sos), gpsValid: valid,
      source: 'recorded' as const, note: ts-row.ts >= 600_000 ? '以此時間格判斷，已超過 10 分鐘未回報；數值為區間內最後一次紀錄。' : '本時間格內最後一筆實際回報。' };
  });
}
