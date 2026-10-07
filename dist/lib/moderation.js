import { createDetector } from './detector.js';
import { redact, validPublic } from './privacy.js';
// Reuse the public submission rules, preserving independent existing redactions.
export async function prepareModerationPayload(entry, extra = '') {
  if (!validPublic(entry)) throw new Error('This submission cannot be prepared. Check its stored representation.');
  const phrases = extra.split('\n').map(s => s.trim()).filter(Boolean);
  const segments = [];
  for (const segment of entry.segments) {
    if (segment.type === 'redaction') { segments.push({ ...segment }); continue; }
    const found = (await createDetector()(segment.text)).sensitive;
    const markers = segment.text.match(/\[(?:company|name|email|phone|address|redacted|removed)\]/gi) || [];
    segments.push(...redact(segment.text, [...found, ...markers, ...phrases.filter(s => segment.text.includes(s))]));
  }
  const result = { outcome: entry.outcome, days: entry.days, segments };
  if (!validPublic(result)) throw new Error('The public copy could not be prepared.');
  return result;
}
