// Local PostgreSQL/WASM execution of the same rollback-only SQL used on Supabase.
// Install @electric-sql/pglite outside the repository, then set PGLITE_MODULE_PATH
// to its dist/index.cjs (or make the package available to Node normally).
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
async function main(){
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth;
   create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as
   $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to authenticated;
   grant execute on function auth.uid() to authenticated;
   alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
  `);
  // gen_random_uuid is built into PostgreSQL; no pgcrypto calls are used here.
  await db.exec(fs.readFileSync(path.join(root,'supabase/schema.sql'),'utf8').replace('create extension if not exists pgcrypto;',''));
  for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()){
   await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
  }
  const result=await db.exec(fs.readFileSync(path.join(__dirname,'r03-database.sql'),'utf8'));
  const tests=result.flatMap(r=>r.rows||[]).filter(r=>r.result==='PASS');
  assert.ok(tests.length>=25,'Expected full R-03 database suite');
  const scan=await db.query(fs.readFileSync(path.join(root,'supabase/diagnostics/historical-reassignment.sql'),'utf8'));
  assert.equal(Number(scan.rows[0].anomaly_count),0);
  const cleanup=await db.query("select count(*)::int as count from auth.users where id::text like '93000000-%'");
  assert.equal(cleanup.rows[0].count,0);
  for(const row of tests)console.log('PASS '+row.test);
  console.log(`${tests.length} database checks passed; 0 anomalies; fixtures rolled back.`);
 }finally{await db.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
