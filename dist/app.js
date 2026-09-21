import config from './config.js';
import { createRepository } from './lib/supabase.js';
import { createSubmissionService } from './lib/submission.js';
import { validateSubmission } from './lib/validation.js';

const repository = createRepository(config);
const submit = createSubmissionService(repository);
const $ = selector => document.querySelector(selector);
const form = $('#submission');
const button = $('.submit');
let sending = false;
let drawing = false;
let lastDrawId = null;
let drawVersion = 0;
if (!repository.configured) $('#latest').textContent = '— not connected yet';
async function refreshActivity() {
  if (!repository.configured) return;
  try {
    const value = await repository.latest();
    if (!value) { $('#latest').textContent = '— no contributions yet'; return; }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid timestamp');
    const time = document.createElement('time');
    time.dateTime = date.toISOString();
    const day = document.createElement('span');
    day.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
    const clock = document.createElement('span');
    clock.textContent = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
    time.title = `Your timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
    time.append(day, clock);
    $('#latest').replaceChildren(time);
  } catch { $('#latest').textContent = '— unavailable'; }
}
refreshActivity();
function clearError() {
  $('#error').textContent = '';
  $('#form-actions').before($('#error'));
  $('#response').removeAttribute('aria-invalid');
  $('#days').removeAttribute('aria-invalid');
}
function updateBranch() {
  const silence = form.elements.outcome.value === 'no_response';
  $('#reply-fields').hidden = silence;
  $('#silence-fields').hidden = !silence;
  $('#response').disabled = silence;
  $('#response').required = !silence;
  $('#days').disabled = !silence;
  $('#days').required = silence;
  $('#switch-outcome').textContent = silence ? 'Have a reply instead?' : 'Or, no response?';
  clearError();
}
function showCollector(focus = true) {
  leaveGenerator();
  $('#intro').hidden = true;
  $('#success').hidden = true;
  form.hidden = false;
  if (focus) {
    document.querySelector(form.elements.outcome.value === 'no_response' ? 'label[for=days]' : 'label[for=response]').focus();
    window.scrollTo(0, 0);
  }
}
function leaveGenerator() {
  drawVersion++;
  drawing = false;
  $('#generator').hidden = true;
  $('#generator').removeAttribute('aria-busy');
  $('#draw-again').disabled = false;
}
async function draw() {
  if (drawing) return;
  drawing = true;
  const version = ++drawVersion;
  $('#generator').setAttribute('aria-busy', 'true');
  $('#draw-again').disabled = true;
  $('#draw-again').textContent = 'Finding…';
  $('#generator-status').textContent = 'Finding a reply…';
  try {
    const result = await repository.draw(lastDrawId);
    if (version !== drawVersion) return;
    if (!result) {
      $('#generator-result').hidden = true;
      $('#generator-status').textContent = 'Nothing’s ready to share yet. Yours could be next.';
      $('#draw-again').textContent = 'Try again ↗';
      return;
    }
    lastDrawId = result.id;
    $('#generated-response').textContent = result.outcome === 'no_response'
      ? `[no response for ${result.days} ${result.days === 1 ? 'day' : 'days'} after sending the email]`
      : result.response;
    $('#generated-context').textContent = result.career_context || '';
    $('#generated-context').hidden = !result.career_context;
    $('#generator-result').hidden = false;
    $('#generator-status').textContent = '';
    $('#draw-again').textContent = 'Another ↗';
    $('#generator-result').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch {
    if (version !== drawVersion) return;
    $('#generator-status').textContent = 'Couldn’t reach the collection. Try again in a moment.';
    $('#draw-again').textContent = 'Try again ↗';
  } finally {
    if (version === drawVersion) {
      drawing = false;
      $('#draw-again').disabled = false;
      $('#generator').removeAttribute('aria-busy');
    }
  }
}
function showGenerator() {
  $('#intro').hidden = true;
  form.hidden = true;
  $('#success').hidden = true;
  $('#generator').hidden = false;
  $('#generator-title').focus();
  window.scrollTo(0, 0);
  draw();
}
$('#hear').addEventListener('click', showGenerator);
$('#success-hear').addEventListener('click', showGenerator);
$('#draw-again').addEventListener('click', draw);
$('#contribute').addEventListener('click', () => showCollector());
$('#generator-back').addEventListener('click', () => {
  leaveGenerator();
  $('#intro').hidden = false;
  $('#hear').focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
$('#begin').addEventListener('click', () => showCollector());
$('#back').addEventListener('click', () => {
  form.hidden = true;
  $('#intro').hidden = false;
  $('#begin').focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
$('#switch-outcome').addEventListener('click', () => {
  form.elements.outcome.value = form.elements.outcome.value === 'rejection' ? 'no_response' : 'rejection';
  updateBranch();
  document.querySelector(form.elements.outcome.value === 'no_response' ? 'label[for=days]' : 'label[for=response]').focus();
});
form.addEventListener('focusin', event => {
  if (event.target.matches('#response, #days')) $('#reuse-note').hidden = false;
});
form.addEventListener('input', () => {
  clearError();
  $('#reuse-note').hidden = false;
  $('#response-limit').hidden = $('#response').value.length < 2800;
});
async function send(input) {
  if (sending) throw new Error('Already sending this one.');
  showCollector(false);
  $('#reuse-note').hidden = false;
  clearError();
  try { validateSubmission(input); }
  catch (error) {
    $('#error').textContent = error.message;
    const field = input.outcome === 'no_response' ? $('#days') : $('#response');
    (input.outcome === 'no_response' ? $('.days-line') : field).after($('#error'));
    field.setAttribute('aria-invalid', 'true');
    field.focus();
    throw error;
  }
  sending = true;
  button.disabled = true;
  $('#back').disabled = true;
  $('#entry-fields').disabled = true;
  form.setAttribute('aria-busy', 'true');
  button.textContent = 'Sending…';
  try {
    await submit(input);
    form.hidden = true;
    $('#success').hidden = false;
    $('#success').focus();
    refreshActivity();
    return { status: 'pending' };
  } catch (error) {
    $('#error').textContent = error.message;
    throw error;
  } finally {
    sending = false;
    button.disabled = false;
    $('#back').disabled = false;
    $('#entry-fields').disabled = false;
    form.removeAttribute('aria-busy');
    button.textContent = 'Submit ↗';
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  send(Object.fromEntries(new FormData(form))).catch(() => {});
});
$('#again').addEventListener('click', () => {
  form.reset();
  $('#reply-example').open = false;
  form.elements.outcome.value = 'rejection';
  updateBranch();
  $('#response-limit').hidden = true;
  $('#reuse-note').hidden = true;
  showCollector();
});
document.querySelectorAll('[data-dialog]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.dialog}`).showModal()));
document.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

if (document.modelContext?.registerTool) {
  Promise.resolve(document.modelContext.registerTool({
    name: 'submit_outcome',
    description: 'Contribute a verbatim cold-outreach rejection or days without a reply for review and future use in the rejection simulator. Remove identifying details first. Submissions cannot be withdrawn.',
    inputSchema: { type: 'object', properties: { outcome: { type: 'string', enum: ['rejection', 'no_response'] }, response: { type: 'string', maxLength: 3000 }, days: { type: 'integer', minimum: 1, maximum: 2147483647 } }, required: ['outcome'], additionalProperties: false },
    execute: send,
  })).catch(() => {});
}
