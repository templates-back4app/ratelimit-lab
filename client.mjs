// Two ways to talk to the backend: as a stranger holding nothing but the app id
// that ships inside every front-end bundle, and as the owner holding the master
// key. Almost every question below is asked as the stranger, because that is
// the question.
export const APP = { base: 'http://127.0.0.1:1344/parse', appId: 'spend', master: 'spend-master-key' };

export async function call(method, path, { body, master = false, session, app = APP } = {}) {
  const headers = { 'X-Parse-Application-Id': app.appId };
  if (body) headers['Content-Type'] = 'application/json';
  if (master) headers['X-Parse-Master-Key'] = app.master;
  if (session) headers['X-Parse-Session-Token'] = session;
  const r = await fetch(app.base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, ok: r.ok, json, text };
}

// what anyone holding your app id can do
export const anon = {
  get:  (p, o) => call('GET', p, o),
  post: (p, b, o) => call('POST', p, { ...o, body: b }),
  put:  (p, b, o) => call('PUT', p, { ...o, body: b }),
  del:  (p, o) => call('DELETE', p, o),
};
// what you can do
export const owner = {
  get:  (p, o) => call('GET', p, { ...o, master: true }),
  post: (p, b, o) => call('POST', p, { ...o, master: true, body: b }),
  put:  (p, b, o) => call('PUT', p, { ...o, master: true, body: b }),
  del:  (p, o) => call('DELETE', p, { ...o, master: true }),
};

export const where = (o) => encodeURIComponent(JSON.stringify(o));

export async function waitUp(seconds = 90) {
  for (let i = 0; i < seconds * 2; i++) {
    try { if ((await call('GET', '/serverInfo', { master: true })).status === 200) return true; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('backend never came up');
}
