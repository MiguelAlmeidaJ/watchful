import { z } from 'zod';
import { uuid } from '../../common/validation';
export const position=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90)]);
const ring=z.array(position).min(4).max(10000).refine(a=>a[0]![0]===a[a.length-1]![0]&&a[0]![1]===a[a.length-1]![1],'Anel deve ser fechado');
const polygon=z.array(ring).min(1).max(100);
export const areaGeometry=z.discriminatedUnion('type',[z.object({type:z.literal('Polygon'),coordinates:polygon}).strict(),z.object({type:z.literal('MultiPolygon'),coordinates:z.array(polygon).min(1).max(100)}).strict()]).refine(g=>(g.type==='Polygon'?[g.coordinates]:g.coordinates).reduce((n,p)=>n+p.reduce((s,r)=>s+r.length,0),0)<=30000,'Limite de vértices excedido');
const line=z.array(position).min(2).max(10000);
export const hydroGeometry=z.discriminatedUnion('type',[z.object({type:z.literal('LineString'),coordinates:line}).strict(),z.object({type:z.literal('MultiLineString'),coordinates:z.array(line).min(1).max(100)}).strict()]).refine(g=>(g.type==='LineString'?[g.coordinates]:g.coordinates).reduce((n,l)=>n+l.length,0)<=30000);
export const hazard=z.enum(['landslide','flood','flash_flood','urban_flood','erosion','other']);
export const classification=z.enum(['low','medium','high','very_high','unknown']);
export const source=z.string().trim().min(1).max(150);
export const featureId=z.string().trim().min(1).max(150);
export const riskProperties=z.object({externalId:featureId,name:z.string().trim().min(1).max(150),hazard,classification,sourceVersion:featureId.optional()}).strict();
export const riskImport=z.object({municipalityId:uuid,source,collection:z.object({type:z.literal('FeatureCollection'),features:z.array(z.object({type:z.literal('Feature'),geometry:areaGeometry,properties:riskProperties}).strict()).min(1).max(50)}).strict()}).strict().refine(v=>new Set(v.collection.features.map(f=>f.properties.externalId)).size===v.collection.features.length,'IDs duplicados no lote');
const historicalSectorProperties = z.object({
 externalId: featureId,
 name: source,
 sourceHazard: z.string().trim().min(1).max(300),
 sourceClassification: source,
 surveyDate: z.string().date().refine(value => Date.parse(value) <= Date.now(), 'Data de levantamento futura')
}).strict();

export const historicalSectorImport = z.object({
 municipalityId: uuid,
 source,
 sourceUrl: z.string().max(500).url().startsWith('https://'),
 sourceVersion: featureId,
 collection: z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.object({ type: z.literal('Feature'), geometry: areaGeometry, properties: historicalSectorProperties }).strict()).min(1).max(50)
 }).strict()
}).strict().refine(value => new Set(value.collection.features.map(feature => feature.properties.externalId)).size === value.collection.features.length,
 'IDs duplicados no lote');
export type HistoricalSectorImport = z.infer<typeof historicalSectorImport>;
export const bbox=z.string().transform(v=>v.split(',').map(Number)).pipe(z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90),z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90)])).refine(b=>b[0]<b[2]&&b[1]<b[3]&&b[2]-b[0]<=10&&b[3]-b[1]<=10,'BBox inválida ou maior que 10 graus');
export const pointQuery=z.object({municipalityId:uuid,longitude:z.coerce.number().finite().min(-180).max(180),latitude:z.coerce.number().finite().min(-90).max(90),radiusMeters:z.coerce.number().int().min(1).max(50000).default(1000),limit:z.coerce.number().int().min(1).max(100).default(25)});
