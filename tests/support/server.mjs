// Local-only integration server. Real SQL and browser rules; synthetic records only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { preparePreview } from '../../dist/lib/privacy.js';
const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec(await readFile('tests/support/auth.sql','utf8'));
await db.exec(await readFile('supabase/schema.sql', 'utf8'));
await db.exec(await readFile('supabase/migrations/202610050001_mailbox.sql', 'utf8'));
await db.exec(await readFile('supabase/migrations/202610050002_close_legacy.sql', 'utf8'));
await db.exec(await readFile('supabase/migrations/202610060001_moderation.sql','utf8'));
await db.exec("insert into public.mailbox_moderators values('11111111-1111-4111-8111-111111111111')");
async function approveFixtures(){await db.exec("select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)");const rows=(await db.query("select id,version,payload from public.mailbox_queue where status='pending'")).rows;for(const r of rows)await db.query("select public.moderate_mailbox($1,$2,'approve',$3)",[r.id,r.version,JSON.stringify(r.payload)]);}
let scenario = 'normal';
const samples = [
  'Thank you for your application. Unfortunately we cannot move forward at this time.',
  'Thank you for your interest. We have decided to move forward with another candidate.',
  'We appreciate the time you spent with us. Unfortunately we cannot offer you a position.',
  'Thank you for reaching out. We are unable to take on new collaborations at this time.',
  'We enjoyed hearing about your work. Unfortunately this is not the right fit for us.',
  'Thank you for applying. We wish you the best with your search.',
  'We appreciate your interest. Unfortunately we have no openings at this time.',
  'Hi Alex, thank you for your application to Acme. We cannot proceed.',
];

async function seed() {
 for(const response of samples) {
  const {entry,id}=await preparePreview({outcome:'rejection',response});
  await db.query('select public.submit_mailbox_entry($1,$2)',[id,JSON.stringify(entry)]);
 }
 await approveFixtures();
}
await seed();
createServer(async(req,res)=>{
 try {
  const path=new URL(req.url,'http://127.0.0.1:5178').pathname;
  const respond=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))};
  if(path==='/__test/reset'){await db.exec('truncate public.mailbox_entries,public.mailbox_queue');scenario='normal';return respond({ok:true});}
  if(path==='/__test/seed'){await seed();return respond({ok:true});}
  if(path==='/__test/approve'){await approveFixtures();return respond({ok:true});}
  if(path==='/__test/scenario'){scenario=new URL(req.url,'http://localhost').searchParams.get('value');return respond({ok:true});}
  if(path==='/__test/state')return respond({rows:(await db.query('select *,null::timestamptz as approved_at from public.mailbox_queue')).rows,originals:(await db.query('select count(*)::int as count from public.submissions')).rows[0].count});
  if(path==='/dist/config.js'){res.setHeader('Content-Type','text/javascript');return res.end("export default {url:'http://127.0.0.1:5178',key:'test-only'};");}
  if(path==='/auth/v1/token') {
   const chunks=[];for await(const c of req)chunks.push(c);const credentials=JSON.parse(Buffer.concat(chunks).toString());
   if(credentials.password!=='fixture-password'){res.statusCode=400;return respond({});}
   return respond({access_token:credentials.email==='admin@example.test'?'fixture-admin':'fixture-user',expires_in:3600});
  }
  if(path==='/auth/v1/logout'){res.statusCode=204;return res.end();}
  if(path.startsWith('/rest/v1/rpc/')) {
   if(scenario==='collection-offline'||scenario==='rate-limit'){res.statusCode=503;return respond({});}
   const name=path.split('/').at(-1);
   if(['is_mailbox_moderator','moderation_list','moderate_mailbox'].includes(name)){
    const bearer=req.headers.authorization;
    if(!['Bearer fixture-admin','Bearer fixture-user'].includes(bearer)){res.statusCode=401;return respond({});}
    const subject=bearer==='Bearer fixture-admin'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222';
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[subject]);
    const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
    try{
     const query=name==='is_mailbox_moderator'?'select public.is_mailbox_moderator() as r':name==='moderation_list'?'select public.moderation_list($1,$2) as r':'select public.moderate_mailbox($1,$2,$3,$4) as r';
     const args=name==='is_mailbox_moderator'?[]:name==='moderation_list'?[body.review_status,body.page_offset]:[body.queue_id,body.expected_version,body.decision,JSON.stringify(body.public_payload)];
     return respond((await db.query(query,args)).rows[0].r);
    }catch(error){res.statusCode=error.code==='42501'?403:409;return respond({code:error.code});}
   }
   if(name==='submit_mailbox_entry'){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString());
    const result=(await db.query('select public.submit_mailbox_entry($1,$2) as r',[body.entry_id,JSON.stringify(body.payload)])).rows[0].r;
    if(scenario==='save-uncertain'){scenario='normal';res.statusCode=503;return respond({});}
    return respond(result);
   }
   if(!['mailbox_collection','latest_submission'].includes(name)){res.statusCode=403;return respond({});}
   return respond((await db.query(`select public.${name}() as result`)).rows[0].result);
  }
    const relative = path === '/' ? 'index.html' : path.slice(1);
    const file = resolve(relative);
    if (!file.startsWith(resolve('.') + '/') || !(relative === 'index.html' || relative === 'submit.html' || relative === 'admin.html' || relative.startsWith('dist/'))) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 500; res.end('Test server request failed'); }
}).listen(5178, '127.0.0.1', () => console.log('Local fixture integration server: http://127.0.0.1:5178'));
