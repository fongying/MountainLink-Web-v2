export type HazardType = 'rain' | 'cold' | 'earthquake';
export type Severity = 'info' | 'watch' | 'warning' | 'critical';

export interface AlertItem {
  id: string;
  type: HazardType;
  title: string;
  summary: string;
  severity: Severity;
  issuedAt?: string;
  eventAt?: string;
  region?: string;
  source: 'CWA';
  raw?: unknown;
}
