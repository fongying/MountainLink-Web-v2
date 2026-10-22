import type { DeviceTelemetry } from '$lib/types';

export function formatBattery(d: DeviceTelemetry) {
  if (d.mx2BatteryRaw === 101) return '外部供電';
  if (d.mx2BatteryRaw === 255) return '未知';
  return d.battery == null ? '未知' : `${d.battery}%${d.mx2SampleTs == null && d.charging ? ' 充電中' : ''}`;
}

export function powerStatus(d: DeviceTelemetry) {
  if (d.mx2SampleTs == null) return d.charging ? '充電中' : '一般供電';
  if (d.mx2BatteryRaw === 101) return '外部供電，未提供百分比';
  if (d.mx2BatteryRaw != null && d.mx2BatteryRaw <= 100) return '無線電電量';
  return '供電狀態未知';
}
