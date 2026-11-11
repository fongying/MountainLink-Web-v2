import { json } from '@sveltejs/kit';
import { isIngestAuthorized } from '$lib/server/device-telemetry';
import { acceptChatDelivery } from '$lib/server/chat';
export const POST=async({request}:any)=>{
 if(!isIngestAuthorized(request,false))return new Response('Unauthorized',{status:401});
 let body;try{const raw=await request.text();if(raw.length>4096)return json({ok:false},{status:413});body=JSON.parse(raw);}catch{return json({ok:false},{status:400});}
 return await acceptChatDelivery(body)?json({ok:true}):json({ok:false},{status:400});
};
