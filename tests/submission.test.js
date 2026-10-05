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
