import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePreview, redact, validPublic } from '../dist/lib/privacy.js';
import { createSubmissionService } from '../dist/lib/submission.js';
import { createRepository } from '../dist/lib/supabase.js';
const input = {outcome:'rejection',response:'Hi Alex, thank you for applying to Acme. Unfortunately we cannot proceed. Contact alex@example.com.'};
test('preview contains independent blocks, never original values or labels',async()=>{
 const result=await preparePreview(input); const serialized=JSON.stringify(result);
 for(const value of ['Alex','Acme','alex@example.com']) assert.ok(!serialized.includes(value));
 assert.equal(result.entry.segments.filter(s=>s.type==='redaction').length,3);
 assert.ok(validPublic(result.entry));
 assert.deepEqual(redact('Hi Alex Smith.', ['Alex','Alex Smith']),[{type:'text',text:'Hi '},{type:'redaction',width:10},{type:'text',text:'.'}]);
});
test('preparing preview makes no network request; no-response discards stale reply',async()=>{
 const fetcher=globalThis.fetch; globalThis.fetch=()=>{throw Error('Unexpected network')};
 try {await preparePreview(input);const r=await preparePreview({outcome:'no_response',days:14,response:'Private Name'});assert.deepEqual(r.entry,{outcome:'no_response',days:14,segments:[]});}finally{globalThis.fetch=fetcher;}
});
test('editing and stale async preparation invalidate confirmation',async()=>{
 let release;const service=createSubmissionService({submit:()=>{throw Error('must not send')}},()=>new Promise(r=>{release=r}));
 const pending=service.prepare(input); service.invalidate();release(await preparePreview(input));assert.equal(await pending,null);
 await assert.rejects(service.confirm(input),/preview/);
 const regular=createSubmissionService({submit:()=>{throw Error('must not send')}});await regular.prepare(input);await assert.rejects(regular.confirm({...input,response:'changed'}),/preview/);
});
test('retries keep identity; double click sends once; response means received not public',async()=>{
 const ids=[];let release;
 const service=createSubmissionService({submit:async(entry,id)=>{ids.push(id);assert.ok(!JSON.stringify(entry).includes('Alex'));if(ids.length===1)throw Error('network');await new Promise(r=>release=r);return {status:'received'};}});
 await service.prepare(input);await assert.rejects(service.confirm(input),/network/);const retry=service.confirm(input);await assert.rejects(service.confirm(input),/already/);release();assert.deepEqual(await retry,{status:'received'});assert.equal(ids[0],ids[1]);
});
test('repository sends processed payload only, no raw or approval fields',async()=>{
 let body;const repo=createRepository({url:'https://example.com',key:'public'},async(url,options)=>{assert.ok(url.endsWith('/rpc/submit_mailbox_entry'));body=JSON.parse(options.body);return Response.json({status:'received'});});
 const preview=await preparePreview(input);await repo.submit(preview.entry,preview.id);assert.deepEqual(body,{payload:preview.entry,entry_id:preview.id});assert.ok(!JSON.stringify(body).includes('Alex'));
});
