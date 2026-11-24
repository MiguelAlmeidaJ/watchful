export type DataQuality = 'valid' | 'suspect' | 'missing';
export type RiskLevel = 'normal' | 'attention' | 'warning' | 'severe' | 'unknown';
export type AlertOrigin = 'official' | 'calculated' | 'manual';
export type Coordinates = { latitude: number; longitude: number };
export interface WeatherObservation { stationId: string; provider: string; observedAt: string; ingestedAt: string; precipitationMm: number | null; temperatureC: number | null; quality: DataQuality }
export interface RiskAssessment { areaId: string; level: RiskLevel; evaluatedAt: string; ruleVersion: string; evidenceIds: string[] }
