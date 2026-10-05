// Words are particles. Shared words approach a shared location, then settle.
// Screen-space type stays at .75rem; depth never changes the reading size.
function hash(text) { let n = 2166136261; for (const c of text) n = Math.imul(n ^ c.codePointAt(0), 16777619); return (n >>> 0) / 4294967295; }
export function createSpace(container, select) {
  let particles = []; let words = []; let paused = false; let elapsed = 0; let previous = 0; let frame = 0;
  let width = 0; let height = 0; let capacity = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function paint() {
    const t = reduced.matches ? 1 : 1 - Math.exp(-elapsed / 11000);
    for (const p of particles) {
      const blend = p.related ? t : 0;
      const drift = p.related && !reduced.matches ? Math.sin(elapsed / 4000 + p.seed * 6) * 4 * (1 - t) : 0;
      const x = (p.x + (p.tx - p.x) * blend) * width + drift;
      const y = (p.y + (p.ty - p.y) * blend) * height + drift * .4;
      const maxX = Math.max(0, width - p.element.offsetWidth);
      p.element.style.transform = `translate3d(${Math.min(maxX, Math.max(0,x)).toFixed(2)}px,${Math.min(height - 16,Math.max(0,y)).toFixed(2)}px,0)`;
    }
  }
  function tick(time) {
    frame = 0;
    if (paused || reduced.matches || document.hidden || elapsed > 65000) { previous = 0; return; }
    if (previous) elapsed += Math.min(50, time - previous);
    previous = time; paint(); frame = requestAnimationFrame(tick);
  }
  function start() { if (!frame && !paused && !reduced.matches && !document.hidden && particles.length && elapsed <= 65000) frame = requestAnimationFrame(tick); }
  function build() {
    cancelAnimationFrame(frame); frame = 0; particles = []; container.replaceChildren();
    // Adapt density to available space, retaining an evenly distributed real sample.
    // Full replies remain available through the reading control, without sampling.
    capacity = Math.max(24, Math.min(240, Math.floor(width * height / 2600)));
    const limit = Math.min(capacity, words.length);
    const sampled = Array.from({ length: limit }, (_, i) => words[Math.floor(i * words.length / limit)]);
    const counts = new Map(); for (const w of sampled) if (w.key) counts.set(w.key, (counts.get(w.key) || 0) + 1);
    const keys = [...counts.keys()].sort((a, b) => hash(a) - hash(b));
    const columns = Math.max(2, Math.floor(width / 145));
    const rows = Math.max(1, Math.ceil(keys.length / columns));
    const used = new Map();
    sampled.forEach((word, i) => {
      const element = document.createElement('span'); element.className = 'particle';
      if (word.key === null) { const block = document.createElement('span'); block.className = 'redaction'; block.style.width = `${word.width}ch`; element.append(block); }
      else element.textContent = word.text;
      element.addEventListener('click', () => select(word.entry));
      const seed = hash(`${word.entry.id}:${i}`); const group = hash(word.key || `redaction:${i}`);
      const occurrence = used.get(word.key) || 0; used.set(word.key, occurrence + 1);
      const x = .07 + hash(`${i}:x:${word.entry.id}`) * .8;
      const y = .12 + hash(`${i}:y:${word.entry.id}`) * .65 + (x - .5) * -.16;
      const slot = keys.indexOf(word.key);
      const tx = .07 + (slot % columns) * (.79 / columns) + (occurrence % 3) * .006;
      const ty = .12 + Math.floor(slot / columns) * (.66 / rows) + (Math.floor(occurrence / 3) % 3) * .012;
      element.style.opacity = word.key === null ? '1' : String(.6 + seed * .4);
      particles.push({ element, x, y, tx, ty, related: word.key !== null && counts.get(word.key) > 1, seed: group });
      container.append(element);
    });
    paint(); start();
  }
  const resize = new ResizeObserver(() => {
    width = container.clientWidth; height = container.clientHeight;
    const next = Math.max(24, Math.min(240, Math.floor(width * height / 2600)));
    if (next !== capacity && words.length) build(); else paint();
  }); resize.observe(container);
  reduced.addEventListener('change', () => { paint(); start(); });
  document.addEventListener('visibilitychange', start);
  return {
    pause(value) { paused = value; if (!value) start(); },
    set(entries) {
      elapsed = previous = 0; words = [];
      for (const entry of entries) {
        const segments = entry.outcome === 'no_response' ? [{ type: 'text', text: `no response ${entry.days} days` }] : entry.segments;
        for (const segment of segments) {
          if (segment.type === 'redaction') words.push({ entry, width: segment.width, key: null });
          else {
            const tokens = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(segment.text)].filter(s => s.isWordLike).map(s => s.segment) : segment.text.match(/\S+/gu) || [];
            for (const text of tokens) words.push({ entry, text, key: text.normalize('NFKC').toLocaleLowerCase() });
          }
        }
      }
      width = container.clientWidth; height = container.clientHeight; build();
    },
  };
}
