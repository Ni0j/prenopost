import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {prepareModerationPayload} from '../dist/lib/moderation.js';
const admin='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
test('review pipeline reruns redaction, preserves blocks, and accepts reviewer additions',async()=>{
 const payload={outcome:'rejection',days:null,segments:[{type:'text',text:'Hi Alex, thank you for applying to Acme. [company] cannot proceed. Reference bluebird.'},{type:'redaction',width:8}]};
 const result=await prepareModerationPayload(payload,'bluebird');const value=JSON.stringify(result);
 for(const s of ['Alex','Acme','[company]','bluebird'])assert.ok(!value.includes(s));assert.deepEqual(result.segments.at(-1),{type:'redaction',width:8});assert.ok(JSON.stringify(payload).includes('Alex'));
});
test('moderation authorizes explicit users, copies only approved payload, rejects atomically and prevents stale overwrites',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;');await db.exec(await readFile('tests/support/auth.sql','utf8'));
 for(const f of ['supabase/schema.sql','supabase/migrations/202610050001_mailbox.sql','supabase/migrations/202610050002_close_legacy.sql'])await db.exec(await readFile(f,'utf8'));
 await db.query("insert into public.submissions(outcome,response,request_hash,public_response,approved_at) values('rejection','Legacy Private Name','test','Hi Alex, [company] cannot proceed.',now())");
 const migration=await readFile('supabase/migrations/202610060001_moderation.sql','utf8');await db.exec(migration);await db.exec(migration);
 await db.query('insert into public.mailbox_moderators values($1)',[admin]);
 const id=crypto.randomUUID(),payload={outcome:'rejection',days:null,segments:[{type:'text',text:'Hi Alex, we cannot proceed at Acme.'}]};
 await db.exec('set role anon');await db.query('select public.submit_mailbox_entry($1,$2)',[id,JSON.stringify(payload)]);
 assert.deepEqual((await db.query('select public.mailbox_collection() as r')).rows[0].r,[]);
 await assert.rejects(db.query('select public.moderation_list()'));
 await assert.rejects(db.query("select public.moderate_mailbox($1,0,'reject',null)",[id]));
 await assert.rejects(db.query('select * from public.mailbox_queue'));
 await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
 await assert.rejects(db.query('select public.moderation_list()'),/Moderator/);
 await assert.rejects(db.query('insert into public.mailbox_moderators values($1)',[other]));
 await assert.rejects(db.query("select public.moderate_mailbox($1,0,'reject',null)",[id]),/Moderator/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 const list=(await db.query('select public.moderation_list() as r')).rows[0].r;assert.equal(list.length,2);assert.ok(list.some(i=>i.source==='legacy'&&i.previously_reviewed));assert.ok(!JSON.stringify(list).includes('Legacy Private Name'));
 const copy=await prepareModerationPayload(payload);
 await db.query("select public.moderate_mailbox($1,0,'approve',$2)",[id,JSON.stringify(copy)]);
 let publicRows=(await db.query('select public.mailbox_collection() as r')).rows[0].r;assert.equal(publicRows.length,1);assert.ok(!JSON.stringify(publicRows).includes('Alex'));assert.deepEqual(publicRows[0].segments,copy.segments);
 await assert.rejects(db.query("select public.moderate_mailbox($1,0,'reject',null)",[id]),/changed/);
 await db.query("select public.moderate_mailbox($1,1,'reject',null)",[id]);assert.deepEqual((await db.query('select public.mailbox_collection() as r')).rows[0].r,[]);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from public.mailbox_entries')).rows[0].n,0);assert.equal((await db.query('select status from public.mailbox_queue where id=$1',[id])).rows[0].status,'rejected');
 // Revoking an allowlist entry also revokes access for an otherwise valid session.
 await db.query('delete from public.mailbox_moderators where user_id=$1',[admin]);await db.exec('set role authenticated');await assert.rejects(db.query('select public.moderation_list()'),/Moderator/);
 }finally{await db.close();}
});
