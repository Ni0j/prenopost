export function createRepository(config, fetcher = fetch) {
  const configured = Boolean(config.url && config.key);
  async function rpc(name, body = {}) {
    if (!configured) throw new Error('Submissions are not connected yet. Your words have not been sent.');
    let response;
    try {
      response = await fetcher(`${config.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { throw new Error('Could not reach the collection. Your text is still here; please try again.'); }
    if (!response.ok) throw new Error('The request could not be completed. Please try again later.');
    // This SQL function returns void; a successful response can have no body.
    if (name === 'submit_rejection') return;
    return response.json();
  }
  return {
    configured,
    latest: () => rpc('latest_submission'),
    submit: (data, token) => rpc('submit_rejection', { payload: data, request_id: token }),
  };
}
