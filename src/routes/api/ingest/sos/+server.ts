import {timingSafeEqual} from 'node:crypto';
import {env} from '$env/dynamic/private';
import {json} from '@sveltejs/kit';
import {createSosStore,SosError} from '$lib/server/sos-ingest';
import {getDeviceState} from '$lib/server/device-telemetry';
import {broadcastSse} from '$lib/server/stream';
let store:ReturnType<typeof createSosStore>|undefined;
export const POST=async({request}:any)=>{
 const expected=Buffer.from(env.MLINK_MX2_API_KEY?.trim()||''),given=Buffer.from(request.headers.get('X-MLINK-MX2-KEY')?.trim()||'');
 if(!expected.length||expected.length!==given.length||!timingSafeEqual(expected,given))return new Response('Unauthorized',{status:401});
 try{
  const raw=await request.text();if(raw.length>4096)return new Response('Too large',{status:413});
  let body;try{body=JSON.parse(raw)}catch{return new Response('Invalid JSON',{status:400})}
  store??=createSosStore();const ack=await store.ingest(body);
  if(ack.applied){try{const d=await getDeviceState(ack.node_id);if(d)broadcastSse('telemetry',{type:'telemetry',devices:[d]});}catch{console.error('SOS committed; SSE notification failed')}}
  return json(ack);
 }catch(e){return json({error:e instanceof SosError?e.message:'SOS ingest failed'},{status:e instanceof SosError?e.status:500})}
};
