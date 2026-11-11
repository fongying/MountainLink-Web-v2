/** AI analysis window: records at least 21 days old are excluded, including SOS. */
export const AI_DEVICE_MAX_AGE_DAYS = 21;
export const AI_DEVICE_MAX_AGE_MS = AI_DEVICE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
export function filterAiDevices<T extends { updatedAt: number }>(devices: T[], now = Date.now()): T[] {
  return devices.filter(device => Number.isFinite(device.updatedAt) && device.updatedAt > 0 &&
    device.updatedAt <= now + 60_000 && now - device.updatedAt < AI_DEVICE_MAX_AGE_MS);
}
