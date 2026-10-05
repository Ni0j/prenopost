import config from './config.js';
import { createRepository } from './lib/supabase.js';
import { createSubmissionService } from './lib/submission.js';
import { renderEntry } from './lib/render.js';
import { createSpace } from './space.js';
const repository = createRepository(config);
const $ = selector => document.querySelector(selector);
document.querySelectorAll('[data-dialog]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.dialog}`).showModal()));
document.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

if (document.body.dataset.page === 'collection') {
  let entries = []; let index = -1;
  const space = createSpace($('#particles'), entry => openEntry(entry));
  function openEntry(entry) {
    index = entries.findIndex(e => e.id === entry.id);
    $('#reading-label').textContent = 'from the collection';
    renderEntry($('#reading-text'), entry);
    $('#reading').hidden = false;
    $('#reading-text').focus({ preventScroll: true });
  }
  function next() { if (entries.length) openEntry(entries[(index + 1) % entries.length]); }
  $('#hear').addEventListener('click', next);
  $('#another').addEventListener('click', next);
  $('#reading-close').addEventListener('click', () => { $('#reading').hidden = true; $('#hear').focus(); });
  $('#motion').addEventListener('click', () => {
    const paused = $('#motion').getAttribute('aria-pressed') !== 'true';
    $('#motion').setAttribute('aria-pressed', String(paused));
    $('#motion').textContent = paused ? 'resume movement' : 'pause movement'; space.pause(paused);
  });
  async function activity() {
    try {
      const value = await repository.latest();
      if (!value) { $('#latest').textContent = 'no submissions yet'; return; }
      const date = new Date(value); if (Number.isNaN(date.getTime())) throw 0;
      const time = document.createElement('time'); time.dateTime = date.toISOString();
      time.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
      $('#latest').replaceChildren(time);
    } catch { $('#latest').textContent = 'unavailable'; }
  }
  async function load() {
    $('#retry').hidden = true; $('#collection-status').textContent = 'opening the mailbox…';
    try {
      const result = await repository.collection();
      if (!Array.isArray(result)) throw 0;
      entries = result; space.set(entries);
      $('#collection-status').textContent = entries.length ? '' : 'nothing here yet.\nyours can be the first.';
      $('#hear').hidden = $('#motion').hidden = !entries.length;
    } catch { $('#collection-status').textContent = 'the collection could not be reached.'; $('#retry').hidden = false; }
  }
  $('#retry').addEventListener('click', () => { load(); activity(); });
  activity(); load();
} else {
  const service = createSubmissionService(repository);
  const form = $('#submission'); let busy = false;
  const input = () => ({ outcome: form.elements.outcome.value, response: $('#response').value, days: $('#days').value });
  function invalidate() { service.invalidate(); $('#preview').hidden = true; $('#error').textContent = ''; $('#form-status').textContent = ''; }
  form.addEventListener('input', invalidate);
  function choose(outcome) {
    if (busy) return;
    invalidate(); form.elements.outcome.value = outcome;
    const silence = outcome === 'no_response';
    $('#reply-fields').hidden = silence; $('#silence-fields').hidden = !silence;
    $('#response').disabled = silence; $('#response').required = !silence;
    $('#days').disabled = !silence; $('#days').required = silence;
    $('#processing-note').hidden = silence;
    $('#reply-outcome').setAttribute('aria-pressed', String(!silence));
    $('#silence-outcome').setAttribute('aria-pressed', String(silence));
  }
  $('#reply-outcome').addEventListener('click', () => choose('rejection'));
  $('#silence-outcome').addEventListener('click', () => choose('no_response'));
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; busy = true;
    $('#error').textContent = ''; $('#form-status').textContent = 'preparing your public version…';
    $('#preview-button').disabled = true; $('#preview-button').textContent = 'detecting…';
    form.setAttribute('aria-busy', 'true');
    try {
      const result = await service.prepare(input());
      if (!result) return;
      renderEntry($('#preview-text'), result.entry);
      form.hidden = true; $('#preview').hidden = false; $('#preview-title').focus();
    } catch (error) { $('#error').textContent = error.message; }
    finally { busy = false; $('#form-status').textContent = ''; $('#preview-button').disabled = false; $('#preview-button').textContent = 'preview what will be shared ↗'; form.removeAttribute('aria-busy'); }
  });
  $('#edit').addEventListener('click', () => {
    if (busy) return; invalidate(); form.hidden = false;
    $('#confirm-error').textContent = ''; (input().outcome === 'rejection' ? $('#response') : $('#days')).focus();
  });
  $('#confirm').addEventListener('click', async () => {
    if (busy) return; busy = true; $('#confirm-error').textContent = '';
    $('#confirm').disabled = $('#edit').disabled = true; $('#confirm').textContent = 'sending…';
    try {
      await service.confirm(input());
      // Clear the only original-text copy after confirmed storage.
      form.reset(); $('#preview-text').replaceChildren();
      $('#preview').hidden = true; $('#success').hidden = false; $('#success').focus();
    } catch (error) {
      if (error.status === 409) {
        invalidate(); form.hidden = false; $('#error').textContent = error.message; $('#preview-button').focus();
      } else $('#confirm-error').textContent = error.message;
    }
    finally { busy = false; $('#confirm').disabled = $('#edit').disabled = false; $('#confirm').textContent = 'submit this version ↗'; }
  });
  $('#again').addEventListener('click', () => { $('#success').hidden = true; choose('rejection'); form.hidden = false; $('#response').focus(); });
}
