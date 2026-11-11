import { error,redirect } from '@sveltejs/kit';
import { getDeviceState } from '$lib/server/device-telemetry';
import { getDeviceLabel } from '$lib/server/device-labels';
import { canAccessChat,listChat } from '$lib/server/chat';
export const load=async({locals,params}:any)=>{
 if(!locals.user)throw redirect(303,'/login');
 if(!await canAccessChat(locals.user,params.id))throw error(403,'沒有此裝置的私訊權限');
 const device=await getDeviceState(params.id);if(!device)throw error(404,'找不到裝置');
 return {deviceId:params.id,name:(await getDeviceLabel(params.id))||device.displayName||params.id,...await listChat(params.id)};
};
