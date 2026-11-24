import { InmetProvider } from './inmet.provider';
import { OpenMeteoProvider } from './open-meteo.provider';
import type { ObservationProvider,ForecastProvider } from './types';
export const observations=new Map<string,ObservationProvider>([['inmet',new InmetProvider()]]);
export const forecasts=new Map<string,ForecastProvider>([['open-meteo',new OpenMeteoProvider()]]);
