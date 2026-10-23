import { json } from '@sveltejs/kit';
import { canAccessChat,listChat,sendChat,ChatError } from '$lib/server/chat';
export const GET=async({locals,params}:any)=>{
 if(!await canAccessChat(locals.user,params.id))return json({error:'沒有此裝置的私訊權限'},{status:locals.user?403:401});
 return json(await listChat(params.id),{headers:{'Cache-Control':'private, no-store'}});
};
export const POST=async({locals,params,request,url}:any)=>{
 if(!await canAccessChat(locals.user,params.id))return json({error:'沒有此裝置的私訊權限'},{status:locals.user?403:401});
 if(request.headers.get('origin')!==url.origin)return json({error:'來源不符'},{status:403});
 try {const raw=await request.text();if(raw.length>2048)throw new ChatError('訊息太長',413);
  return json({message:await sendChat(params.id,locals.user,JSON.parse(raw))});
 }catch(e){return json({error:e instanceof ChatError?e.message:'無法提交訊息'},{status:e instanceof ChatError?e.status:400});}
};
