import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

let inited = false;

export function initGmapsOnce() {
  if (inited) return;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) throw new Error('缺少 VITE_GOOGLE_MAPS_API_KEY');

  setOptions({
    key: apiKey,
    v: 'beta'
  });

  inited = true;
}

export async function importGmapsLibrary(name: string) {
  initGmapsOnce();
  return importLibrary(name as any);
}
