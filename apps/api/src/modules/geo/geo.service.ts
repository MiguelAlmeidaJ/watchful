import { Injectable,Inject,NotFoundException,ForbiddenException,BadRequestException,ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Database } from '../../common/database';
import type { Actor } from '../auth/auth.guard';
import { audit } from '../../common/audit';
export type Geometry=object;
@Injectable()
export class GeoService {
 constructor(@Inject(Database) readonly db:Database){}
 async scope(actor:Actor,municipalityId:string){
  const row=(await this.db.query('SELECT id,ibge_code,name,state,boundary IS NOT NULL AS has_boundary,boundary_source,boundary_version,boundary_updated_at FROM municipalities m WHERE id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM organization_municipalities om JOIN memberships ms ON ms.organization_id=om.organization_id WHERE om.municipality_id=m.id AND ms.user_id=$3))',[municipalityId,actor.platformAdmin,actor.id])).rows[0];
  if(!row)throw new NotFoundException();return row;
 }
 async operator(c:PoolClient,actor:Actor,org:string,municipality:string){
  const row=(await c.query("SELECT 1 FROM organization_municipalities om WHERE om.organization_id=$1 AND om.municipality_id=$2 AND ($3::boolean OR EXISTS(SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$4 AND role IN ('admin','operator')))",[org,municipality,actor.platformAdmin,actor.id])).rows[0];
  if(!row)throw new ForbiddenException();
 }
 async polygon(c:PoolClient,g:Geometry){
  const row=(await c.query("WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326) AS geom) SELECT ST_IsValid(geom) AS valid,ST_IsEmpty(geom) AS empty,ST_Area(geom::geography) AS area FROM g",[JSON.stringify(g)])).rows[0];
  if(!row?.valid||row.empty||!(Number(row.area)>0))throw new BadRequestException('Geometria poligonal inválida');
 }
 async within(c:PoolClient,municipality:string,g:Geometry){
  const row=(await c.query("SELECT boundary IS NOT NULL AS known, ST_Covers(boundary,ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326)) AS covered FROM municipalities WHERE id=$1 FOR SHARE",[municipality,JSON.stringify(g)])).rows[0];
  if(!row)throw new NotFoundException();
  if(!row.known)throw new ConflictException('Importe o limite municipal antes de cadastrar geometrias');
  if(!row.covered)throw new BadRequestException('Geometria fora do limite municipal');
 }
 async boundary(actor:Actor,id:string,g:Geometry,source:string,version:string){
  return this.db.transaction(async c=>{
   await this.polygon(c,g);
   const row=(await c.query("UPDATE municipalities SET boundary=ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326)),boundary_source=$3,boundary_version=$4,boundary_updated_at=now() WHERE id=$1 RETURNING id",[id,JSON.stringify(g),source,version])).rows[0];
   if(!row)throw new NotFoundException();
   const conflicts=(await c.query("SELECT EXISTS(SELECT 1 FROM risk_areas a JOIN municipalities m ON m.id=a.municipality_id WHERE a.municipality_id=$1 AND a.active AND NOT ST_Covers(m.boundary,a.boundary)) OR EXISTS(SELECT 1 FROM shelters s JOIN municipalities m ON m.id=s.municipality_id WHERE s.municipality_id=$1 AND NOT ST_Covers(m.boundary,s.location)) OR EXISTS(SELECT 1 FROM incidents i JOIN municipalities m ON m.id=i.municipality_id WHERE i.municipality_id=$1 AND NOT ST_Covers(m.boundary,i.location)) OR EXISTS(SELECT 1 FROM hydro_features h JOIN municipalities m ON m.id=h.municipality_id WHERE h.municipality_id=$1 AND NOT ST_Covers(m.boundary,h.geometry)) AS conflict",[id])).rows[0];
   if(conflicts?.conflict)throw new ConflictException('Novo limite conflita com geometrias cadastradas');
   await audit(c,actor.id,'geo.boundary.update',id,null,{source,version});return row;
  });
 }
 async importRisk(actor:Actor,input:{municipalityId:string;source:string;collection:{features:{geometry:Geometry;properties:{externalId:string;name:string;hazard:string;classification:string;sourceVersion?:string}}[]}}){
  return this.db.transaction(async c=>{
   const ids:string[]=[];
   for(const feature of input.collection.features){
    await this.polygon(c,feature.geometry);await this.within(c,input.municipalityId,feature.geometry);
    const p=feature.properties;
    const row=(await c.query(`INSERT INTO risk_areas(municipality_id,name,hazard,boundary,source,external_id,classification,source_version)
     VALUES($1,$2,$3,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4::text),4326)),$5,$6,$7,$8)
     ON CONFLICT(municipality_id,source,external_id) WHERE external_id IS NOT NULL DO UPDATE SET name=excluded.name,hazard=excluded.hazard,boundary=excluded.boundary,classification=excluded.classification,source_version=excluded.source_version,active=true,updated_at=now()
     WHERE risk_areas.name IS DISTINCT FROM excluded.name OR risk_areas.hazard IS DISTINCT FROM excluded.hazard OR risk_areas.classification IS DISTINCT FROM excluded.classification OR risk_areas.source_version IS DISTINCT FROM excluded.source_version OR NOT ST_Equals(risk_areas.boundary,excluded.boundary) OR NOT risk_areas.active
     RETURNING id`,[input.municipalityId,p.name,p.hazard,JSON.stringify(feature.geometry),input.source,p.externalId,p.classification,p.sourceVersion??null])).rows[0];
    if(row){await this.snapshot(c,row.id,actor.id);ids.push(row.id);}
   }
   await audit(c,actor.id,'geo.risk.import',input.municipalityId,null,{source:input.source,received:input.collection.features.length,changed:ids.length});
   return {received:input.collection.features.length,changed:ids.length,ids};
  });
 }
 async snapshot(c:PoolClient,id:string,actor:string){
  await c.query(`INSERT INTO risk_area_versions(area_id,version,snapshot,actor_id)
   SELECT a.id,COALESCE((SELECT max(version) FROM risk_area_versions WHERE area_id=a.id),0)+1,
   jsonb_build_object('name',a.name,'hazard',a.hazard,'classification',a.classification,'source',a.source,'sourceVersion',a.source_version,'active',a.active,'geometry',ST_AsGeoJSON(a.boundary)::jsonb),$2 FROM risk_areas a WHERE a.id=$1`,[id,actor]);
 }
}
