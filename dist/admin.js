import config from './config.js';
import { renderEntry } from './lib/render.js';
import { prepareModerationPayload } from './lib/moderation.js';
const $ = s => document.querySelector(s);
let token = null, expiry = null, generation = 0, items = [], selected = null, preview = null, offset = 0, busy = false;
function clearPrivate() {
  generation++; token = null; clearTimeout(expiry); items = []; selected = preview = null;
  $('#queue').replaceChildren(); $('#incoming').replaceChildren(); $('#processed').replaceChildren(); $('#extra').value = ''; $('#password').value = '';
  $('#review').hidden = $('#public-preview').hidden = $('#workspace').hidden = true; $('#login').hidden = false;
}
async function rpc(name, body = {}) {
  if (!token) throw new Error('Sign in again.');
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20000), headers: { apikey: config.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) { clearPrivate(); throw new Error('Your session expired. Sign in again.'); }
    if (response.status === 403) { clearPrivate(); throw new Error('This account does not have moderator access.'); }
    if (data.code === '40001') throw new Error('This item changed in another session. Refresh before reviewing it again.');
    throw new Error('The review could not be saved. Refresh and try again.');
  }
  return data;
}
function setBusy(value) { busy = value; $('#workspace').querySelectorAll('button,select,textarea').forEach(el => el.disabled = value); if(!value){$('#previous').disabled=offset===0;$('#next').disabled=items.length<50;} }
function choose(item) {
  selected = item; preview = null; $('#public-preview').hidden = $('#reject-confirm').hidden = true;
  $('#extra').value = ''; $('#processed').replaceChildren(); $('#review').hidden = false;
  $('#item-meta').textContent = `${new Date(item.created_at).toLocaleString()} · ${item.source === 'legacy' ? 'existing collection' : 'mailbox'}${item.previously_reviewed ? ' · previously reviewed' : ''}`;
  renderEntry($('#incoming'), item.payload);
  $('#queue').querySelectorAll('button').forEach(b => b.setAttribute('aria-current', String(b.dataset.id === item.id)));
  $('#item-title').focus({ preventScroll: true });
}
async function load() {
  const current = generation;
  selected = preview = null; $('#review').hidden = true; $('#queue').replaceChildren();
  items = await rpc('moderation_list', { review_status: $('#filter').value, page_offset: offset });
  if (current !== generation || !token) { items=[]; return; }
  for (const item of items) {
    const button = document.createElement('button'); button.dataset.id = item.id;
    button.textContent = new Date(item.created_at).toLocaleString(); button.addEventListener('click', () => { if(!busy) choose(item); }); $('#queue').append(button);
  }
  $('#notice').textContent = items.length ? `${items.length} submissions on this page.` : 'No submissions here.';
  $('#previous').disabled = offset === 0; $('#next').disabled = items.length < 50;
}
async function run(action) {
  if (busy) return; setBusy(true); $('#admin-error').textContent = '';
  try { await action(); } catch(error) { $('#admin-error').textContent = error.message || 'Could not reach the mailbox. Try again.'; }
  finally { setBusy(false); }
}
$('#login').addEventListener('submit', async event => {
  event.preventDefault(); if(busy)return; busy=true; $('#login button').disabled=true; $('#admin-error').textContent='';
  try {
    const response=await fetch(`${config.url}/auth/v1/token?grant_type=password`,{method:'POST',cache:'no-store',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({email:$('#email').value.trim(),password:$('#password').value})});
    $('#password').value='';const data=await response.json();if(!response.ok||!data.access_token)throw new Error('Could not sign in. Check your email and password.');
    token=data.access_token;generation++;const current=generation;
    if(!await rpc('is_mailbox_moderator')){clearPrivate();throw new Error('This account does not have moderator access.');}
    if(current!==generation)return;
    expiry=setTimeout(()=>{clearPrivate();$('#notice').textContent='Session ended. Sign in again.';},Math.max(0,(data.expires_at*1000||Date.now()+data.expires_in*1000)-Date.now()));
    $('#login').hidden=true;$('#workspace').hidden=false;offset=0;await load();
  }catch(error){clearPrivate();$('#admin-error').textContent=error.message;}finally{busy=false;$('#login button').disabled=false;}
});
$('#logout').addEventListener('click',()=>{const previous=token;clearPrivate();$('#notice').textContent='Signed out.';if(previous)fetch(`${config.url}/auth/v1/logout`,{method:'POST',headers:{apikey:config.key,Authorization:`Bearer ${previous}`}}).catch(()=>{});});
$('#extra').addEventListener('input',()=>{preview=null;$('#public-preview').hidden=true;$('#processed').replaceChildren();});
$('#prepare').addEventListener('click',()=>run(async()=>{if(!selected)return;const item=selected,current=generation;const result=await prepareModerationPayload(item.payload,$('#extra').value);if(current!==generation||selected!==item)return;preview=result;renderEntry($('#processed'),preview);$('#public-preview').hidden=false;}));
async function decide(decision) {
  if(!selected || (decision==='approve'&&!preview))return;
  const current=generation;
  await rpc('moderate_mailbox',{queue_id:selected.id,expected_version:selected.version,decision,public_payload:decision==='approve'?preview:null});
  if(current!==generation||!token)return;
  await load();
  $('#notice').textContent = (decision === 'approve' ? 'Approved and published. ' : 'Rejected; not public. ') + $('#notice').textContent;
}
$('#approve').addEventListener('click',()=>run(()=>decide('approve')));
$('#reject').addEventListener('click',()=>{$('#reject-confirm').hidden=false;});
$('#reject-no').addEventListener('click',()=>{$('#reject-confirm').hidden=true;});
$('#reject-yes').addEventListener('click',()=>run(()=>decide('reject')));
$('#reload').addEventListener('click',()=>run(load));
$('#filter').addEventListener('change',()=>run(async()=>{offset=0;await load();}));
$('#previous').addEventListener('click',()=>run(async()=>{offset=Math.max(0,offset-50);await load();}));
$('#next').addEventListener('click',()=>run(async()=>{offset+=50;await load();}));
// No session or private submission data is written to browser storage.
window.addEventListener('pagehide',clearPrivate);
