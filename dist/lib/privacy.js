import { validateSubmission } from './validation.js';
import { createDetector } from './detector.js';
const patterns = [
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,
  /(?:https?:\/\/|www\.)[^\s<>]+/giu,
  /\b(?:[a-z0-9-]+\.)+(?:com|org|net|edu|io|co|ai|gov|uk|cn|de|fr)(?:\/[^\s<>]*)?\b/giu,
  /(?:\+?\d[\d ().-]{6,}\d)/g,
  /@[\p{L}\p{N}_][\p{L}\p{N}_.-]*/gu,
];
export function redact(text, sensitive) {
  if (!Array.isArray(sensitive) || sensitive.some(s => typeof s !== 'string' || !s || !text.includes(s))) throw new Error('The preview could not be prepared. Please try again.');
  const spans = [];
  for (const pattern of patterns) for (const m of text.matchAll(pattern)) spans.push([m.index, m.index + m[0].length]);
  for (const value of sensitive) {
    let from = 0;
    while (true) { const start = text.indexOf(value, from); if (start < 0) break; spans.push([start, start + value.length]); from = start + value.length; }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  const segments = []; let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ type: 'text', text: text.slice(cursor, start) });
    // Split long redactions into bounded widths. No original text/labels survive.
    let width = [...text.slice(start, end)].length;
    while (width > 0) { segments.push({ type: 'redaction', width: Math.min(32, width) }); width -= 32; }
    cursor = end;
  }
  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) });
  return segments;
}
export function validPublic(value) {
  if (!value || !['rejection', 'no_response'].includes(value.outcome) || !Array.isArray(value.segments)) return false;
  if (value.outcome === 'no_response') return value.segments.length === 0 && Number.isInteger(value.days) && value.days >= 1 && value.days <= 2147483647;
  if (value.days !== null || value.segments.length < 1 || value.segments.length > 3000) return false;
  let length = 0;
  for (const s of value.segments) {
    if (!s || typeof s !== 'object') return false;
    if (s.type === 'text' && Object.keys(s).sort().join() === 'text,type' && typeof s.text === 'string' && s.text.length > 0) length += s.text.length;
    else if (s.type === 'redaction' && Object.keys(s).sort().join() === 'type,width' && Number.isInteger(s.width) && s.width > 0 && s.width <= 32) length += s.width;
    else return false;
  }
  return length <= 3000;
}

export async function preparePreview(input) {
  const data = validateSubmission(input);
  const segments = data.outcome === 'rejection'
    ? redact(data.response, (await createDetector()(data.response)).sensitive) : [];
  const entry = { outcome: data.outcome, days: data.days, segments };
  if (!validPublic(entry)) throw new Error('The preview could not be prepared. Please try again.');
  return { entry, id: crypto.randomUUID(), expires: Date.now() + 30 * 60 * 1000 };
}
