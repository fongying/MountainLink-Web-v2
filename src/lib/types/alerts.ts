export type HazardType = 'rain' | 'cold' | 'earthquake';
export type Severity = 'info' | 'watch' | 'warning' | 'critical';
export type AlertStatus = 'active' | 'ended';

export interface AlertItem {
  id: string;
  type: HazardType;
  status?: AlertStatus;
  title: string;
  summary: string;
  severity: Severity;
  issuedAt?: string;
  eventAt?: string;
  region?: string;
  source: 'CWA';
  raw?: unknown;
}
