// src/lib/client/gmaps.ts
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

let inited = false;

/**
 * ✅ 全專案只初始化一次 Google Maps
 * - 3D maps 需要 v=beta，所以這裡統一用 beta
 */
export function initGmapsOnce() {
  if (inited) return;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) throw new Error('缺少 VITE_GOOGLE_MAPS_API_KEY');

  setOptions({
    key: apiKey,
    v: 'beta' // ✅ 3D Maps 需要 beta
  });

  inited = true;
}

/**
 * ✅ 封裝 importLibrary，確保 init 先做完
 */
export async function importGmapsLibrary(name: string) {
  initGmapsOnce();
  return importLibrary(name as any);
}
