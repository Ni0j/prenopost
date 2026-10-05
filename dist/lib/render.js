export function renderEntry(container, entry) {
  container.replaceChildren();
  if (entry.outcome === 'no_response') {
    container.textContent = `[no response for ${entry.days} ${entry.days === 1 ? 'day' : 'days'} after sending the email]`;
    return;
  }
  for (const segment of entry.segments) {
    if (segment.type === 'text') container.append(document.createTextNode(segment.text));
    else if (segment.type === 'redaction') {
      const block = document.createElement('span');
      block.className = 'redaction';
      block.style.width = `${segment.width}ch`;
      block.setAttribute('role', 'img'); block.setAttribute('aria-label', 'redacted');
      container.append(block);
    }
  }
}
