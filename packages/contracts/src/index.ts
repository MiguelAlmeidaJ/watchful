export type DataQuality = 'valid' | 'suspect' | 'missing';
export type RiskLevel = 'normal' | 'attention' | 'warning' | 'severe' | 'unknown';
export type AlertOrigin = 'official' | 'calculated' | 'manual';
export type Coordinates = { latitude: number; longitude: number };
export interface WeatherObservation { stationId: string; provider: string; observedAt: string; ingestedAt: string; precipitationMm: number | null; temperatureC: number | null; quality: DataQuality; precipitationQuality?: DataQuality | null }
export interface RiskAssessment { areaId: string; level: RiskLevel; evaluatedAt: string; ruleVersion: string; evidenceIds: string[] }

export type WeatherAvailability = 'available' | 'degraded' | 'stale' | 'unknown' | 'disabled';
export interface RainfallWindow { hours:number; endAt:string; receivedHours:number; measuredHours:number; suspectHours:number; missingHours:number; coverage:number; complete:boolean; totalMm:number|null; partialMm:number|null; }
export interface WeatherForecast { locationId:string; provider:string; fetchedAt:string; validAt:string; precipitationMm:number|null; precipitationProbabilityPct:number|null; temperatureC:number|null; humidityPct:number|null; windKmh:number|null; gustKmh:number|null; }

export type GeographicPosition=[longitude:number,latitude:number];
export type Hazard='landslide'|'flood'|'flash_flood'|'urban_flood'|'erosion'|'other';
export type TerritorialClassification='low'|'medium'|'high'|'very_high'|'unknown';
export type GeoLayer='municipalities'|'risk-areas'|'historical-risk-sectors'|'stations'|'forecast-locations'|'shelters'|'incidents'|'rivers';
export type IncidentStatus='reported'|'verified'|'resolved'|'dismissed';
export type ShelterStatus='unverified'|'available'|'unavailable'|'full';
export interface NearbyRiskArea { id:string; name:string; hazard:Hazard; classification:TerritorialClassification; source:string; inside:boolean; distance_meters:number; }

export type AlertStatus='draft'|'approved'|'published'|'cancelled'|'expired';
export type AlertSeverity='attention'|'warning'|'severe';
export interface AlertSummary { id:string; origin:AlertOrigin; severity:AlertSeverity; status:AlertStatus; title:string; message:string; source:string; starts_at:string; expires_at:string; }
