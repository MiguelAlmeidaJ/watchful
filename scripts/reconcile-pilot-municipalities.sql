\set ON_ERROR_STOP on
BEGIN;
-- Run during maintenance, with API and worker stopped.
LOCK TABLE organizations, municipalities, organization_municipalities, memberships,
 incidents, alerts, risk_rules, risk_areas, subscriptions IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
 old_org uuid := '43190f76-0bbf-4399-b30d-72fc1369d198';
 keep_city uuid := '5f6371fa-e24f-4d10-afb3-3fdb8c815279';
 move_city uuid := 'd3ea1027-f86e-4eaa-8255-c63f82d31918';
 new_org uuid;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM municipalities WHERE id=keep_city AND ibge_code='3101508')
 OR NOT EXISTS (SELECT 1 FROM municipalities WHERE id=move_city AND ibge_code='3138401')
 OR NOT EXISTS (SELECT 1 FROM organization_municipalities WHERE organization_id=old_org AND municipality_id=keep_city)
 THEN RAISE EXCEPTION 'Cadastro piloto diferente do esperado'; END IF;
 IF NOT EXISTS (SELECT 1 FROM organization_municipalities WHERE organization_id=old_org AND municipality_id=move_city)
 THEN
   IF EXISTS (SELECT 1 FROM organization_municipalities WHERE municipality_id=move_city AND organization_id<>old_org)
   THEN RAISE NOTICE 'Leopoldina ja possui organizacao independente'; RETURN; END IF;
   RAISE EXCEPTION 'Vinculo de Leopoldina ausente';
 END IF;
 IF (SELECT count(*) FROM organization_municipalities WHERE organization_id=old_org)<>2
 OR EXISTS (SELECT 1 FROM organization_municipalities WHERE municipality_id IN (keep_city,move_city) AND organization_id<>old_org)
 OR EXISTS (SELECT 1 FROM organizations WHERE lower(trim(name))='leopoldina')
 THEN RAISE EXCEPTION 'Vinculos ou organizacoes adicionais: revisar manualmente'; END IF;
 -- Do not silently transfer records, approvals, subscriptions or notification access.
 IF EXISTS (SELECT 1 FROM incidents WHERE organization_id=old_org AND municipality_id=move_city)
 OR EXISTS (SELECT 1 FROM alerts WHERE organization_id=old_org AND municipality_id=move_city)
 OR EXISTS (SELECT 1 FROM subscriptions WHERE organization_id=old_org AND municipality_id=move_city)
 OR EXISTS (SELECT 1 FROM risk_rules r JOIN risk_areas a ON a.id=r.area_id WHERE r.organization_id=old_org AND a.municipality_id=move_city)
 THEN RAISE EXCEPTION 'Leopoldina possui registros operacionais vinculados a organizacao antiga; revisar acessos antes de separar'; END IF;
 INSERT INTO organizations(name) VALUES ('Leopoldina') RETURNING id INTO new_org;
 UPDATE organization_municipalities SET organization_id=new_org WHERE organization_id=old_org AND municipality_id=move_city;
 INSERT INTO audit_logs(organization_id,action,target,details)
 VALUES (old_org,'municipality.reconcile',move_city::text,jsonb_build_object('newOrganizationId',new_org,'membershipsCopied',false)),
 (new_org,'municipality.reconcile',move_city::text,jsonb_build_object('previousOrganizationId',old_org,'membershipsCopied',false));
 RAISE NOTICE 'Leopoldina separada: %', new_org;
END $$;
COMMIT;
SELECT o.name AS organization,m.name AS municipality,m.ibge_code
FROM organization_municipalities om JOIN organizations o ON o.id=om.organization_id
JOIN municipalities m ON m.id=om.municipality_id ORDER BY m.name;
