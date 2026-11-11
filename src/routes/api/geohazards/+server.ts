import { json } from '@sveltejs/kit';
import { getGeohazardDataset } from '$lib/server/geohazards';
import { assessGeohazards } from '$lib/geohazards';
import { getDeviceState } from '$lib/server/device-telemetry';
export async function GET({locals,url}: {locals: App.Locals;url:URL}) {
  if(!locals.user) return json({error:'Unauthorized'},{status:401});
  const dataset=getGeohazardDataset();
  const id=url.searchParams.get('deviceId');
  if(id) {
    const device=await getDeviceState(id);
    if(!device) return json({error:'Device not found'},{status:404});
    return json(assessGeohazards(device,dataset),{headers:{'cache-control':'no-store'}});
  }
  if(!dataset) return json({error:'官方圖資暫時無法使用'},{status:503});
  return json(dataset,{headers:{'cache-control':'private, max-age=300'}});
}
