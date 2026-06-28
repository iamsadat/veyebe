-- RLS smoke tests for local Supabase (run via: supabase test db)
begin;
select plan(4);

select has_table('public', 'scan_snapshots');
select has_table('public', 'features');
select policies_are('public', 'scan_snapshots', ARRAY['members manage scans']);
select policies_are('public', 'features', ARRAY['members manage features']);

select finish();
rollback;
