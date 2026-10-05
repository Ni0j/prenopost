import { preparePreview } from './privacy.js';
import { validateSubmission } from './validation.js';
export function createSubmissionService(repository, prepare = preparePreview) {
  let revision = 0;
  let preview = null;
  let sending = false;
  return {
    invalidate() { revision++; preview = null; },
    async prepare(input) {
      const current = ++revision; preview = null;
      const data = validateSubmission(input);
      const result = await prepare(data);
      if (current !== revision) return null;
      if (!result?.entry || typeof result.id !== 'string' || !Number.isFinite(result.expires)) throw new Error('Incomplete preview. Please try again.');
      preview = { ...result, signature: JSON.stringify(data) };
      return result;
    },
    async confirm(input) {
      if (sending) throw new Error('Your submission is already being sent.');
      if (!preview || preview.signature !== JSON.stringify(validateSubmission(input)) || preview.expires <= Date.now()) {
        preview = null; const error = new Error('Please preview your current text again before submitting.'); error.status = 409; throw error;
      }
      const current = preview;
      sending = true;
      try {
        const result = await repository.submit(current.entry, current.id);
        if (result?.status !== 'received') throw new Error('Submission was not confirmed. Please try again.');
        preview = null;
        return result;
      } catch (error) {
        if (error.status === 409) preview = null;
        throw error;
      } finally { sending = false; }
    },
  };
}
