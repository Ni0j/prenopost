export function validateSubmission(input) {
  if (!['rejection', 'no_response'].includes(input.outcome)) throw new Error('Choose a rejection or no response.');
  if (input.outcome === 'rejection') {
    if (typeof input.response !== 'string' || !input.response.trim()) throw new Error('Paste the rejection reply first.');
    if (input.response.length > 3000) throw new Error('The reply must be 3,000 characters or fewer.');
    // Check emptiness without rewriting, trimming, or normalizing the original reply.
    return { outcome: 'rejection', response: input.response, days: null };
  }
  if (!['string', 'number'].includes(typeof input.days) || !/^\d+$/.test(String(input.days))) throw new Error('Enter the number of days without a reply.');
  const days = Number(input.days);
  if (!Number.isInteger(days) || days < 1 || days > 2147483647) throw new Error('Enter a whole number of days, at least 1.');
  return { outcome: 'no_response', response: '', days };
}
