import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { preparePreview } from '../dist/lib/privacy.js';
test('only reviewed copies are public; anonymous callers cannot approve or read drafts',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon; create role authenticated; create role service_role;');
 await db.exec(await readFile('supabase/schema.sql','utf8'));const sql=await readFile('supabase/migrations/202610050001_mailbox.sql','utf8');await db.exec(sql);await db.exec(sql);await db.exec(await readFile('supabase/migrations/202610050002_close_legacy.sql','utf8'));
 const {entry,id}=await preparePreview({outcome:'rejection',response:'Hi Alex, thank you for applying to Acme. We cannot proceed.'});
 await db.exec('set role anon');
 for(let i=0;i<2;i++)assert.deepEqual((await db.query('select public.submit_mailbox_entry($1,$2) as r',[id,JSON.stringify(entry)])).rows[0].r,{status:'received'});
 const collection=async()=>(await db.query('select public.mailbox_collection() as r')).rows[0].r;
 assert.deepEqual(await collection(),[]);
 await assert.rejects(db.query('select * from public.mailbox_entries'));
 await assert.rejects(db.query('update public.mailbox_entries set approved_at=now()'));
 await assert.rejects(db.query('select public.submit_mailbox_entry($1,$2)',[crypto.randomUUID(),JSON.stringify({...entry,approved_at:new Date().toISOString()})]));
 await assert.rejects(db.query('select public.submit_rejection($1,$2)',['{}',crypto.randomUUID()]));
 await assert.rejects(db.query('select public.draw_rejection(null)'));
 await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int as n from public.mailbox_entries')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int as n from public.submissions')).rows[0].n,0);
 await db.query('update public.mailbox_entries set approved_at=now() where id=$1',[id]);
 await db.exec('set role anon');const published=await collection();assert.equal(published.length,1);assert.ok(!JSON.stringify(published).includes('Alex'));assert.deepEqual(published[0].segments,entry.segments);
 await db.exec('reset role');
 await db.query("update public.mailbox_entries set payload=jsonb_set(payload,'{segments}', $2::jsonb) where id=$1",[id,JSON.stringify([{type:'text',text:'A revised safe copy.'}])]);
 await db.exec('set role anon');assert.deepEqual(await collection(),[]);
 await db.exec('reset role');
 for(const bad of [null,{}, {...entry,raw:'Alex'},{...entry,segments:[{type:'redaction',width:4,text:'Alex'}]}])await assert.rejects(db.query('select public.submit_mailbox_entry($1,$2)',[crypto.randomUUID(),JSON.stringify(bad)]));
 }finally{await db.close();}
});
