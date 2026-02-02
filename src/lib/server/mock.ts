// src/lib/server/mock.ts
import type { DeviceTelemetry } from '$lib/types';

const unitOverrides = new Map<string, string>();
const userBindings = new Map<string, number | null>();

export function setMockDeviceUnit(deviceId: string, unit: string) {
  unitOverrides.set(deviceId, unit);
}

export function getMockDeviceUnit(deviceId: string) {
  return unitOverrides.get(deviceId);
}

export function setMockDeviceBinding(deviceId: string, userId: number | null) {
  userBindings.set(deviceId, userId);
}

export function getMockDeviceBinding(deviceId: string) {
  return userBindings.get(deviceId) ?? null;
}

export function getMockDevices(): DeviceTelemetry[] {
  const now = Date.now();
  const devices: DeviceTelemetry[] = [
    {
      deviceId: 'ML-001',
      online: true,
      battery: 86,
      hr: 78,
      lat: 23.565,
      lon: 119.58,
      alt: 45,
      updatedAt: now - 5_000,
      sos: false,
      rssi: -82,
      snr: 9
    },
    {
      deviceId: 'ML-002',
      online: false,
      battery: 41,
      updatedAt: now - 1000 * 60 * 15,
      sos: false
    },
    {
      deviceId: 'ML-003',
      online: true,
      battery: 12,
      hr: 112,
      lat: 23.57,
      lon: 119.59,
      alt: 120,
      updatedAt: now - 2_000,
      sos: true,
      rssi: -101,
      snr: 2
    }
  ];
  return devices.map((d) => ({
    ...d,
    unit: unitOverrides.get(d.deviceId)
  }));
}
