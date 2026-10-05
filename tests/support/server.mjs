// Local-only integration server. Real SQL and browser rules; synthetic records only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { preparePreview } from '../../dist/lib/privacy.js';
const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec(await readFile('supabase/schema.sql', 'utf8'));
await db.exec(await readFile('supabase/migrations/202610050001_mailbox.sql', 'utf8'));
await db.exec(await readFile('supabase/migrations/202610050002_close_legacy.sql', 'utf8'));
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
 await db.exec('update public.mailbox_entries set approved_at=now()');
}
await seed();
createServer(async(req,res)=>{
 try {
  const path=new URL(req.url,'http://127.0.0.1:5178').pathname;
  const respond=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))};
  if(path==='/__test/reset'){await db.exec('truncate public.mailbox_entries');scenario='normal';return respond({ok:true});}
  if(path==='/__test/seed'){await seed();return respond({ok:true});}
  if(path==='/__test/approve'){await db.exec('update public.mailbox_entries set approved_at=now()');return respond({ok:true});}
  if(path==='/__test/scenario'){scenario=new URL(req.url,'http://localhost').searchParams.get('value');return respond({ok:true});}
  if(path==='/__test/state')return respond({rows:(await db.query('select * from public.mailbox_entries')).rows,originals:(await db.query('select count(*)::int as count from public.submissions')).rows[0].count});
  if(path==='/dist/config.js'){res.setHeader('Content-Type','text/javascript');return res.end("export default {url:'http://127.0.0.1:5178',key:'test-only'};");}
  if(path.startsWith('/rest/v1/rpc/')) {
   if(scenario==='collection-offline'||scenario==='rate-limit'){res.statusCode=503;return respond({});}
   const name=path.split('/').at(-1);
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
    if (!file.startsWith(resolve('.') + '/') || !(relative === 'index.html' || relative === 'submit.html' || relative.startsWith('dist/'))) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 500; res.end('Test server request failed'); }
}).listen(5178, '127.0.0.1', () => console.log('Local fixture integration server: http://127.0.0.1:5178'));
