import { dispatchHazardItems } from '$lib/server/hazard-dispatch';
import { getUnifiedHazardSnapshot } from '$lib/server/hazards';
import { broadcastSse } from '$lib/server/stream';

let loopStarted = false;
let loopTimer: ReturnType<typeof setInterval> | null = null;
let loopBusy = false;

async function tick(reason: string) {
  if (loopBusy) return;
  loopBusy = true;

  try {
    const { snapshot, changed } = await getUnifiedHazardSnapshot({
      force: false,
      reason
    });

    if (!changed) return;

    broadcastSse('hazard_update', snapshot);
    await dispatchHazardItems(snapshot.items, reason);
  } catch (error) {
    console.error('[hazard-monitor] tick failed:', error);
  } finally {
    loopBusy = false;
  }
}

export function ensureHazardMonitorLoop() {
  if (loopStarted) return;
  loopStarted = true;

  void tick('hazard_monitor_boot');

  loopTimer = setInterval(() => {
    void tick('hazard_monitor_refresh');
  }, 60_000);
}

export async function dispatchCurrentHazards(reason: string) {
  const { snapshot } = await getUnifiedHazardSnapshot({
    force: true,
    reason
  });

  broadcastSse('hazard_update', snapshot);
  return dispatchHazardItems(snapshot.items, reason);
}

export function stopHazardMonitorLoopForTests() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
  loopStarted = false;
}

