import { validateSubmission } from './validation.js';

export function createSubmissionService(repository) {
  let inFlight = false;
  let pending;
  return async input => {
    if (inFlight) throw new Error('Your submission is already being sent.');
    const data = validateSubmission(input);
    const signature = JSON.stringify(data);
    if (!pending || pending.signature !== signature) pending = { signature, token: crypto.randomUUID() };
    inFlight = true;
    try {
      await repository.submit(data, pending.token);
      pending = undefined;
      return { status: 'pending' };
    } finally { inFlight = false; }
  };
}
