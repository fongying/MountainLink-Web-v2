import { json } from '@sveltejs/kit';
import type { AlertItem } from '$lib/types/alerts';
import { dispatchHazardItems } from '$lib/server/hazard-dispatch';

export const POST = async ({ locals }: any) => {
  if (!locals?.user) return new Response('Unauthorized', { status: 401 });
  if (!locals.user.is_admin) return new Response('Forbidden', { status: 403 });

  const now = new Date();
  const item: AlertItem = {
    id: `hazard-test-${Date.now()}`,
    type: 'earthquake',
    status: 'active',
    title: 'Meshtastic 測試通報',
    summary: '南投山區警示鏈路測試',
    severity: 'warning',
    issuedAt: now.toISOString(),
    eventAt: now.toISOString(),
    region: '南投縣、仁愛鄉',
    source: 'CWA'
  };

  const dispatched = await dispatchHazardItems([item], 'manual_test_dispatch');

  return json({
    ok: true,
    count: dispatched.length,
    message:
      dispatched[0]?.message ??
      '未送出測試通報，請確認 MLINK_ALERT_WEBHOOK_URL 是否已設定。'
  });
};

