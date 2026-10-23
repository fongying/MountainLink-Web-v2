import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { ingestChat,ChatError } from '$lib/server/chat';
export const POST=async({request}:any)=>{
 const expected=Buffer.from(env.MLINK_MX2_API_KEY?.trim()||''),given=Buffer.from(request.headers.get('X-MLINK-MX2-KEY')?.trim()||'');
 if(!expected.length||expected.length!==given.length||!timingSafeEqual(expected,given))return new Response('Unauthorized',{status:401});
 try{const raw=await request.text();if(raw.length>4096)return new Response('Too large',{status:413});return json(await ingestChat(JSON.parse(raw)));}
 catch(e){return json({error:e instanceof ChatError?e.message:'私訊入庫失敗'},{status:e instanceof ChatError?e.status:400});}
};
