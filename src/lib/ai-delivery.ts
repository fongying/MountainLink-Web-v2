export const DELIVERY_RANK = {
  webhook_accepted: 0, queued: 1, sending: 2, radio_api_accepted: 3,
  ack_timeout: 4, radio_nak: 5, uncertain: 5, expired: 5, mapping_blocked: 5, radio_ack: 6
} as const;
export type DeliveryStage = keyof typeof DELIVERY_RANK;
export type AiDeliveryState = {
  destination: string; stage: DeliveryStage; packetId?: number; updatedAt?: number;
};
export function deliveryText(d?: AiDeliveryState) {
  if (!d) return '下行狀態未追蹤';
  const labels: Record<DeliveryStage, string> = {
    webhook_accepted: '已提交下行，待 Gateway 回報', queued: 'Gateway 已收件，等待發送',
    sending: 'Gateway 正在提交無線電', radio_api_accepted: '無線電已接受，等待 ACK',
    radio_ack: '已收到目的無線電 ACK（不代表已讀）', radio_nak: '無線電回報傳送失敗',
    ack_timeout: '尚未收到 ACK，送達未確認', uncertain: '提交結果不明，未自動重送',
    expired: '訊息已過期，未發送', mapping_blocked: '節點對照已過期或改變，未發送'
  };
  return `私訊 ${d.destination}：${labels[d.stage]}`;
}
