begin;
select plan(10);
select is((select count(*) from app_private.training_pilot_catalog where pilot->>'sourceCatalogVersion'='3.1.0-pilot.1'),15::bigint,'old pilot revisions remain');
select is((select count(*) from app_private.training_pilot_catalog where pilot->>'sourceCatalogVersion'='4.0.0-unified.1'),674::bigint,'old expanded revisions remain');
select is((select count(*) from app_private.training_pilot_catalog where pilot->>'sourceCatalogVersion'='4.1.0-coverage.1'),109::bigint,'new representable revisions are added');
select is((select count(*) from app_private.training_pilot_catalog where source_id='DB_034'),2::bigint,'same stable ID keeps both old and current versions');
select is((select pilot#>>'{performance,countingDecision}' from app_private.training_pilot_catalog where source_id='DB_034' and source_version='1.3.0'),'MAX_PER_ARM_2026_10_23','new version retains explicit per-arm overlay');
select is((select count(*) from app_private.training_pilot_catalog where source_id='COVL_014'),0::bigint,'unsupported new load convention is not made selectable');
select ok((select bool_and(source_version=pilot->>'sourceVersion' and app_private.training_pilot_valid(pilot)) from app_private.training_pilot_catalog),'every revision satisfies the strict contract');
select ok(not has_table_privilege('authenticated','app_private.training_pilot_catalog','SELECT,INSERT,UPDATE,DELETE'),'version support does not grant browser catalog access');
create temp table coverage_count as select count(*) as n from app_private.training_pilot_catalog;
insert into app_private.training_pilot_catalog(source_id,pilot,default_unit)
select source_id,pilot,default_unit from app_private.training_pilot_catalog where pilot->>'sourceCatalogVersion'='4.1.0-coverage.1'
on conflict(source_id,source_version) do nothing;
select is((select count(*) from app_private.training_pilot_catalog),(select n from coverage_count),'identical repeated inserts create no duplicates');
select throws_ok($$insert into app_private.training_pilot_catalog(source_id,pilot,default_unit)
select source_id,pilot,default_unit from app_private.training_pilot_catalog where source_id='DB_034' and source_version='1.3.0'$$,
'23505',null,'duplicate stable ID/version cannot overwrite an existing revision');
select * from finish();
rollback;
