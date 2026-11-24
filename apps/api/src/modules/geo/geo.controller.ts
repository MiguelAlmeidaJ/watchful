import { Body,Controller,Get,Put,Post,Patch,Query,Param,Req,UseGuards,Inject,NotFoundException,BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { parse,uuid } from '../../common/validation';
import { audit } from '../../common/audit';
import { AuthGuard,requirePlatform,type AuthRequest } from '../auth/auth.guard';
import { GeoService } from './geo.service';
import { areaGeometry,hydroGeometry,position,riskImport,source,featureId,hazard,bbox,pointQuery } from './geo.schemas';
const layer=z.enum(['municipalities','risk-areas','stations','forecast-locations','shelters','incidents','rivers']);
const point=(coordinates:[number,number])=>({type:'Point',coordinates});
const name=z.string().trim().min(1).max(150);
@Controller('geo')
@UseGuards(AuthGuard)
export class GeoController{
 constructor(@Inject(GeoService) private readonly geo:GeoService){}
 @Put('municipalities/:id/boundary') async boundary(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({geometry:areaGeometry,source,version:featureId}).strict(),body);
  return this.geo.boundary(req.actor,parse(uuid,id),v.geometry,v.source,v.version);
 }
 @Post('risk-areas/import') importRisk(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);return this.geo.importRisk(req.actor,parse(riskImport,body));
 }
 @Patch('risk-areas/:id/archive') async archive(@Req() req:AuthRequest,@Param('id') raw:string){
  requirePlatform(req.actor);const id=parse(uuid,raw);
  return this.geo.db.transaction(async c=>{
   const row=(await c.query('UPDATE risk_areas SET active=false,updated_at=now() WHERE id=$1 AND active RETURNING id',[id])).rows[0];
   if(!row)throw new NotFoundException();await this.geo.snapshot(c,id,req.actor.id);await audit(c,req.actor.id,'geo.risk.archive',id);return row;
  });
 }
 @Get('risk-areas/:id/versions') async versions(@Req() req:AuthRequest,@Param('id') raw:string){
  const id=parse(uuid,raw);const a=(await this.geo.db.query('SELECT municipality_id FROM risk_areas WHERE id=$1',[id])).rows[0];if(!a)throw new NotFoundException();await this.geo.scope(req.actor,a.municipality_id);
  return (await this.geo.db.query('SELECT version,snapshot,created_at FROM risk_area_versions WHERE area_id=$1 ORDER BY version DESC LIMIT 50',[id])).rows;
 }
 @Get('layers/:layer') async layers(@Req() req:AuthRequest,@Param('layer') raw:string,@Query() query:unknown){
  const l=parse(layer,raw),q=parse(z.object({municipalityId:uuid,bbox,limit:z.coerce.number().int().min(1).max(200).default(100)}),query);
  const municipality=await this.geo.scope(req.actor,q.municipalityId);
  const specs={
   municipalities:{table:'municipalities',geom:'boundary',where:'t.id=$1',props:"jsonb_build_object('name',t.name,'ibgeCode',t.ibge_code,'source',t.boundary_source)"},
   'risk-areas':{table:'risk_areas',geom:'boundary',where:'t.municipality_id=$1 AND t.active',props:"jsonb_build_object('name',t.name,'hazard',t.hazard,'classification',t.classification,'source',t.source)"},
   stations:{table:'stations',geom:'location',where:'t.municipality_id=$1',props:"jsonb_build_object('name',t.name,'provider',t.provider,'enabled',t.enabled,'lastSuccessAt',t.last_success_at)"},
   'forecast-locations':{table:'forecast_locations',geom:'location',where:'t.municipality_id=$1',props:"jsonb_build_object('name',t.name,'enabled',t.enabled)"},
   shelters:{table:'shelters',geom:'location',where:'t.municipality_id=$1',props:"jsonb_build_object('name',t.name,'status',t.status,'verifiedAt',t.verified_at,'source',t.source)"},
   incidents:{table:'incidents',geom:'location',where:'t.municipality_id=$1 AND ($7::boolean OR EXISTS(SELECT 1 FROM memberships ms WHERE ms.organization_id=t.organization_id AND ms.user_id=$8))',props:"jsonb_build_object('hazard',t.hazard,'status',t.status,'occurredAt',t.occurred_at)"},
   rivers:{table:'hydro_features',geom:'geometry',where:'t.municipality_id=$1',props:"jsonb_build_object('name',t.name,'source',t.source)"}
  } as const;
  const s=specs[l];
  const params:unknown[]=[q.municipalityId,...q.bbox,q.limit+1];if(l==='incidents')params.push(req.actor.platformAdmin,req.actor.id);
  const rows=(await this.geo.db.query(`SELECT t.id,ST_AsGeoJSON(t.${s.geom})::jsonb AS geometry,${s.props} AS properties FROM ${s.table} t WHERE ${s.where} AND ST_Intersects(t.${s.geom},ST_MakeEnvelope($2,$3,$4,$5,4326)) ORDER BY t.id LIMIT $6`,params)).rows;
  return {type:'FeatureCollection',features:rows.slice(0,q.limit).map(r=>({type:'Feature',id:r.id,geometry:r.geometry,properties:r.properties})),truncated:rows.length>q.limit,municipalityBoundaryKnown:municipality.has_boundary};
 }
 @Get('risk-areas/nearby') async nearby(@Req() req:AuthRequest,@Query() query:unknown){
  const q=parse(pointQuery,query);const m=await this.geo.scope(req.actor,q.municipalityId);
  const rows=(await this.geo.db.query(`WITH p AS (SELECT ST_SetSRID(ST_MakePoint($2,$3),4326) AS g)
   SELECT a.id,a.name,a.hazard,a.classification,a.source,ST_Covers(a.boundary,p.g) AS inside,ST_Distance(a.boundary::geography,p.g::geography) AS distance_meters
   FROM risk_areas a CROSS JOIN p WHERE a.municipality_id=$1 AND a.active AND ST_DWithin(a.boundary::geography,p.g::geography,$4) ORDER BY distance_meters,a.id LIMIT $5`,[q.municipalityId,q.longitude,q.latitude,q.radiusMeters,q.limit+1])).rows;
  return {data:rows.slice(0,q.limit),truncated:rows.length>q.limit,boundaryKnown:m.has_boundary,coverage:'not_assessed',disclaimer:'Ausência de áreas cadastradas não significa ausência de risco.'};
 }
 @Get('stations/nearby') async stations(@Req() req:AuthRequest,@Query() query:unknown){
  const q=parse(pointQuery,query);await this.geo.scope(req.actor,q.municipalityId);
  const rows=(await this.geo.db.query(`WITH p AS (SELECT ST_SetSRID(ST_MakePoint($2,$3),4326)::geography AS g)
   SELECT s.id,s.name,s.provider,s.last_success_at,ST_Distance(s.location::geography,p.g) AS distance_meters FROM stations s CROSS JOIN p WHERE s.municipality_id=$1 AND s.enabled AND ST_DWithin(s.location::geography,p.g,$4) ORDER BY distance_meters,s.id LIMIT $5`,[q.municipalityId,q.longitude,q.latitude,q.radiusMeters,q.limit+1])).rows;
  return {data:rows.slice(0,q.limit),truncated:rows.length>q.limit,representativeness:'not_assessed'};
 }
 @Post('shelters') async shelter(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,name,coordinates:position,address:z.string().trim().max(300).optional(),capacity:z.number().int().min(0).max(100000).optional(),source}).strict(),body);
  return this.geo.db.transaction(async c=>{const g=point(v.coordinates);await this.geo.within(c,v.municipalityId,g);
   const row=(await c.query('INSERT INTO shelters(municipality_id,name,location,address,capacity,source) VALUES($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326),$4,$5,$6) RETURNING id,status',[v.municipalityId,v.name,JSON.stringify(g),v.address??null,v.capacity??null,v.source])).rows[0]!;await audit(c,req.actor.id,'geo.shelter.create',row.id);return row;});
 }
 @Patch('shelters/:id/status') async shelterStatus(@Req() req:AuthRequest,@Param('id') raw:string,@Body() body:unknown){
  requirePlatform(req.actor);const id=parse(uuid,raw),v=parse(z.object({status:z.enum(['unverified','available','unavailable','full'])}).strict(),body);
  return this.geo.db.transaction(async c=>{const row=(await c.query("UPDATE shelters SET status=$2,verified_at=CASE WHEN $2='unverified' THEN NULL ELSE now() END,updated_at=now() WHERE id=$1 RETURNING id,status,verified_at",[id,v.status])).rows[0];if(!row)throw new NotFoundException();await audit(c,req.actor.id,'geo.shelter.status',id,null,{status:v.status});return row;});
 }
 @Get('shelters/nearby') async shelters(@Req() req:AuthRequest,@Query() query:unknown){
  const q=parse(pointQuery,query);await this.geo.scope(req.actor,q.municipalityId);
  const rows=(await this.geo.db.query(`WITH p AS (SELECT ST_SetSRID(ST_MakePoint($2,$3),4326)::geography AS g)
   SELECT s.id,s.name,s.address,s.status,s.capacity,s.verified_at,ST_Distance(s.location::geography,p.g) AS distance_meters FROM shelters s CROSS JOIN p WHERE s.municipality_id=$1 AND ST_DWithin(s.location::geography,p.g,$4) ORDER BY distance_meters,s.id LIMIT $5`,[q.municipalityId,q.longitude,q.latitude,q.radiusMeters,q.limit+1])).rows;
  return {data:rows.slice(0,q.limit),truncated:rows.length>q.limit,disclaimer:'Confirme disponibilidade e acesso com a autoridade responsável; distância não representa rota segura.'};
 }
 @Post('incidents') async incident(@Req() req:AuthRequest,@Body() body:unknown){
  const v=parse(z.object({municipalityId:uuid,organizationId:uuid,hazard,description:z.string().trim().min(1).max(2000),coordinates:position,occurredAt:z.string().datetime({offset:true})}).strict(),body);
  if(Date.parse(v.occurredAt)>Date.now())throw new BadRequestException('Data futura');
  return this.geo.db.transaction(async c=>{await this.geo.operator(c,req.actor,v.organizationId,v.municipalityId);const g=point(v.coordinates);await this.geo.within(c,v.municipalityId,g);
   const row=(await c.query('INSERT INTO incidents(municipality_id,organization_id,reported_by,hazard,description,location,occurred_at) VALUES($1,$2,$3,$4,$5,ST_SetSRID(ST_GeomFromGeoJSON($6),4326),$7) RETURNING id,status',[v.municipalityId,v.organizationId,req.actor.id,v.hazard,v.description,JSON.stringify(g),v.occurredAt])).rows[0]!;await audit(c,req.actor.id,'geo.incident.create',row.id,v.organizationId);return row;});
 }
 @Patch('incidents/:id/status') async incidentStatus(@Req() req:AuthRequest,@Param('id') raw:string,@Body() body:unknown){
  const id=parse(uuid,raw),v=parse(z.object({status:z.enum(['verified','resolved','dismissed'])}).strict(),body);
  return this.geo.db.transaction(async c=>{const current=(await c.query('SELECT organization_id,municipality_id,status FROM incidents WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!current)throw new NotFoundException();await this.geo.operator(c,req.actor,current.organization_id,current.municipality_id);
   if(!((current.status==='reported'&&['verified','dismissed'].includes(v.status))||(current.status==='verified'&&v.status==='resolved')))throw new BadRequestException('Transição inválida');
   const row=(await c.query('UPDATE incidents SET status=$2,updated_at=now() WHERE id=$1 RETURNING id,status',[id,v.status])).rows[0];await audit(c,req.actor.id,'geo.incident.status',id,current.organization_id,{status:v.status});return row;});
 }
 @Post('rivers') async river(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,name,source,externalId:featureId,geometry:hydroGeometry}).strict(),body);
  return this.geo.db.transaction(async c=>{await this.geo.within(c,v.municipalityId,v.geometry);
   const row=(await c.query('INSERT INTO hydro_features(municipality_id,name,source,external_id,geometry) VALUES($1,$2,$3,$4,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5),4326))) ON CONFLICT(municipality_id,source,external_id) DO UPDATE SET name=excluded.name,geometry=excluded.geometry,updated_at=now() RETURNING id',[v.municipalityId,v.name,v.source,v.externalId,JSON.stringify(v.geometry)])).rows[0]!;await audit(c,req.actor.id,'geo.river.upsert',row.id);return row;});
 }
}
