import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSubmission } from '../dist/lib/validation.js';
import { createSubmissionService } from '../dist/lib/submission.js';
import { createRepository } from '../dist/lib/supabase.js';

const reply = '  Thank you.\nUnfortunately, we cannot proceed.\n谢谢。  ';
const input = { outcome: 'rejection', response: reply };

test('rejection preserves the literal reply and excludes unrelated/private fields', () => {
  assert.deepEqual(validateSubmission({ ...input, name: 'Not collected', days: 14, expectation: 'Not collected' }), {
    outcome: 'rejection', response: reply, days: null,
  });
});
test('rejects blank or oversized replies, non-text, positive and legacy outcomes', () => {
  for (const invalid of [{}, { outcome: 'better', response: reply }, { outcome: 'positive', response: reply },
    ...['', ' \n\t ', 'x'.repeat(3001), 12, null].map(response => ({ outcome: 'rejection', response }))]) {
    assert.throws(() => validateSubmission(invalid));
  }
  assert.equal(validateSubmission({ ...input, response: 'x'.repeat(3000) }).response.length, 3000);
});
test('silence stores whole days without stale rejection text', () => {
  for (const days of ['14', 14]) {
    assert.deepEqual(validateSubmission({ outcome: 'no_response', days, response: reply }), {
      outcome: 'no_response', response: '', days: 14,
    });
  }
});
test('silence rejects missing, fractional, negative, boolean and overflowing days', () => {
  for (const days of [undefined, null, '', ' ', '0', '-1', '1.5', '14 days', '1e2', true, [], 2147483648]) {
    assert.throws(() => validateSubmission({ outcome: 'no_response', days }));
  }
});
test('retry reuses its internal identity after network uncertainty without exposing a code', async () => {
  const tokens = [];
  const send = createSubmissionService({ submit: async (_, token) => {
    tokens.push(token);
    if (tokens.length === 1) throw new Error('network');
  } });
  await assert.rejects(send(input));
  assert.deepEqual(await send(input), { status: 'pending' });
  assert.equal(tokens[0], tokens[1]);
  await send(input);
  assert.notEqual(tokens[1], tokens[2]);
});
test('changed contributions use a new retry identity', async () => {
  const tokens = [];
  const send = createSubmissionService({ submit: async (_, token) => { tokens.push(token); throw new Error('network'); } });
  await assert.rejects(send(input));
  await assert.rejects(send({ outcome: 'no_response', days: 14 }));
  assert.notEqual(tokens[0], tokens[1]);
});
test('concurrent submissions cannot create a second request', async () => {
  let release;
  let calls = 0;
  const send = createSubmissionService({ submit: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const first = send(input);
  await assert.rejects(send(input), /already/);
  assert.equal(calls, 1);
  release();
  await first;
});
test('invalid input never reaches storage', async () => {
  let calls = 0;
  const send = createSubmissionService({ submit: async () => { calls++; } });
  await assert.rejects(send({ outcome: 'rejection', response: '' }));
  assert.equal(calls, 0);
});
test('unconfigured and failed requests never report success', async () => {
  const repo = createRepository({});
  assert.equal(repo.configured, false);
  await assert.rejects(repo.submit({}, 'token'), /not connected/);
  const failed = createRepository({ url: 'https://example.supabase.co', key: 'public' }, async () => ({ ok: false }));
  await assert.rejects(failed.submit({}, 'token'), /could not be completed/);
  const offline = createRepository({ url: 'https://example.supabase.co', key: 'public' }, async () => { throw new Error('offline'); });
  await assert.rejects(offline.submit({}, 'token'), /text is still here/);
});
test('repository sends the new contract, exposes only real activity, and has no remove method', async () => {
  const requests = [];
  const repo = createRepository({ url: 'https://example.supabase.co/', key: 'public' }, async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => null };
  });
  assert.equal(await repo.latest(), null);
  assert.equal(requests[0].url, 'https://example.supabase.co/rest/v1/rpc/latest_submission');
  await repo.submit(validateSubmission(input), 'retry-id');
  assert.deepEqual(requests[1], {
    url: 'https://example.supabase.co/rest/v1/rpc/submit_rejection',
    body: { payload: { outcome: 'rejection', response: reply, days: null }, request_id: 'retry-id' },
  });
  assert.equal(repo.remove, undefined);
});
