export function createRepository(config, fetcher = fetch) {
  const configured = Boolean(config.url && config.key);
  async function request(path, body) {
    if (!configured) throw new Error('The mailbox is not connected yet. Your words have not been sent.');
    let response;
    try {
      response = await fetcher(`${config.url.replace(/\/$/, '')}${path}`, {
        method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(40000),
      });
    } catch { throw new Error('Could not reach the mailbox. Your text is still here; please try again.'); }
    let result; try { result = await response.json(); } catch { throw new Error('The mailbox returned an incomplete response. Please try again.'); }
    if (!response.ok) {
      // Only the mailbox function emits user-facing errors; never expose DB details.
      const error = new Error(path.startsWith('/functions/') && typeof result?.error === 'string' ? result.error : 'Couldn’t reach the collection. Please try again.');
      error.status = response.status; throw error;
    }
    return result;
  }
  return {
    configured,
    latest: () => request('/rest/v1/rpc/latest_submission', {}),
    collection: () => request('/rest/v1/rpc/mailbox_collection', {}),
    submit: (entry, id) => request('/rest/v1/rpc/submit_mailbox_entry', { payload: entry, entry_id: id }),
  };
}
