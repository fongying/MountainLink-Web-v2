import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GeoDataset } from '$lib/geohazards';
let cached: GeoDataset | null=null;
let stamp=-1;
export function getGeohazardDataset(): GeoDataset | null {
  try {
    const path=resolve('data/geohazards/landslides-115.geojson');
    const mtime=statSync(path).mtimeMs;
    if(cached && stamp===mtime) return cached;
    const parsed=JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')) as GeoDataset;
    if(parsed.type!=='FeatureCollection'||parsed.features.length!==188||parsed.metadata.year!==115) throw Error('Unexpected geohazard dataset');
    if(parsed.features.some(f=>!['Polygon','MultiPolygon'].includes(f.geometry.type)||!f.properties.officialId)) throw Error('Invalid geohazard geometry');
    cached=parsed;stamp=mtime;return cached;
  } catch { return null; } // Fail closed: never substitute old geometry after a failed update.
}
