export type DataQuality = 'valid' | 'suspect' | 'missing';
export type RiskLevel = 'normal' | 'attention' | 'warning' | 'severe' | 'unknown';
export type AlertOrigin = 'official' | 'calculated' | 'manual';
export type Coordinates = { latitude: number; longitude: number };
export interface WeatherObservation { stationId: string; provider: string; observedAt: string; ingestedAt: string; precipitationMm: number | null; temperatureC: number | null; quality: DataQuality }
export interface RiskAssessment { areaId: string; level: RiskLevel; evaluatedAt: string; ruleVersion: string; evidenceIds: string[] }

export type WeatherAvailability = 'available' | 'degraded' | 'stale' | 'unknown' | 'disabled';
export interface RainfallWindow { hours:number; endAt:string; receivedHours:number; measuredHours:number; coverage:number; complete:boolean; totalMm:number|null; partialMm:number|null; }
export interface WeatherForecast { locationId:string; provider:string; fetchedAt:string; validAt:string; precipitationMm:number|null; precipitationProbabilityPct:number|null; temperatureC:number|null; humidityPct:number|null; windKmh:number|null; gustKmh:number|null; }
