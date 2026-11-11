import { db } from '$lib/server/db';
import { makeDemoPlayback, PLAYBACK_DEMO_ID, PLAYBACK_STEP, playbackRange, samplePlaybackRows,
  type PlaybackData, type PlaybackRow } from '$lib/playback';
export async function getDevicePlayback(deviceId: string, name: string): Promise<PlaybackData> {
  if (deviceId === PLAYBACK_DEMO_ID) return makeDemoPlayback();
  const { start, end } = playbackRange();
  // Keep reads bounded to 145 rows with the existing (device_id,ts) index.
  // Each bucket ends at the slider timestamp; no future report is shown early.
  const rows = await new Promise<PlaybackRow[]>((resolve, reject) => db.all(`
    SELECT ts,lat,lon,alt,hr,battery,sos,gps_valid FROM (
      SELECT ts,lat,lon,alt,hr,battery,sos,json_extract(raw_json,'$.gps_valid') AS gps_valid,
        ROW_NUMBER() OVER (PARTITION BY CAST((ts-?+?-1)/? AS INTEGER) ORDER BY ts DESC,id DESC) AS n
      FROM telemetry_history WHERE device_id=? AND ts>=? AND ts<=?
        AND COALESCE(json_extract(raw_json,'$.data_source'),'real')!='mock'
    ) WHERE n=1 ORDER BY ts`, [start,PLAYBACK_STEP,PLAYBACK_STEP,deviceId,start,end],
    (err, rows) => err ? reject(err) : resolve(rows as PlaybackRow[])));
  return { deviceId, name, demo: false, start, end, interval: PLAYBACK_STEP,
    frames: samplePlaybackRows(rows,start,end) };
}
