export type ChatMessage = {
  id: string; deviceId: string | null; direction: 'in' | 'out'; origin: 'human' | 'radio' | 'ai';
  text: string; radioNode: string; actor: string; createdAt: number; stage: string;
  packetId?: number; error?: string;
};
export const CHAT_MAX_BYTES = 228;
export function chatBytes(text: string) { return new TextEncoder().encode(text.trim()).length; }
export function chatStage(stage: string) {
  const labels: Record<string,string> = { submitting:'正在提交',webhook_accepted:'已提交，待 Gateway 收件',
    queued:'Gateway 已收件，等待發送',sending:'正在提交無線電',radio_api_accepted:'無線電已接受，等待 ACK',
    radio_ack:'目的無線電已確認（非已讀）',radio_nak:'無線電回報失敗',ack_timeout:'ACK 逾時，送達未確認',
    uncertain:'提交結果不明，未自動重送',expired:'訊息過期，未發送',mapping_blocked:'身分對照改變或過期，未發送',
    received:'Gateway 已收到回覆' };
  return labels[stage] || '狀態未確認';
}

export function createChatId() {
 const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const h=Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
