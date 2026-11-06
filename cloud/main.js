// The AI feature, as an assistant writes it: call the provider, return the
// answer. Nobody is asked who they are or how many times they have been here.
Parse.Cloud.define('ask', async (req) => {
  const r = await fetch(`${process.env.PROVIDER_URL}/v1/chat`, {
    method: 'POST',
    headers: { Authorization: 'Bearer sk-lab-0000-not-a-real-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: req.params.prompt ?? 'hello' }),
  });
  return r.json();
});

// The same feature with the two questions the first one never asks: who is
// calling, and how much have they already spent today?
Parse.Cloud.define('askCapped', async (req) => {
  if (!req.user) throw new Parse.Error(119, 'sign in first');
  const cap = Number(process.env.DAILY_CAP || 0);
  const today = new Date().toISOString().slice(0, 10);

  const q = new Parse.Query('Usage').equalTo('user', req.user).equalTo('day', today);
  let row = await q.first({ useMasterKey: true });
  if (!row) {
    row = new (Parse.Object.extend('Usage'))();
    row.set('user', req.user); row.set('day', today); row.set('calls', 0);
  }
  if (cap && row.get('calls') >= cap) {
    throw new Parse.Error(141, `daily limit reached (${cap} calls)`);
  }
  row.increment('calls');
  await row.save(null, { useMasterKey: true });

  const r = await fetch(`${process.env.PROVIDER_URL}/v1/chat`, {
    method: 'POST',
    headers: { Authorization: 'Bearer sk-lab-0000-not-a-real-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: req.params.prompt ?? 'hello' }),
  });
  return { ...(await r.json()), callsToday: row.get('calls') };
});

// The same cap, counted in the order that survives a burst.
//
// The version above asks "have you had 10?" and then adds one. Twenty-five
// requests arriving together all read the same zero, all pass, and all add one.
// This one adds first and then looks at what it got, so each request sees its
// own number. The row is created before the burst, because find-or-create has
// the same race and it is not the part being measured here.
Parse.Cloud.define('askCappedAtomic', async (req) => {
  if (!req.user) throw new Parse.Error(119, 'sign in first');
  const cap = Number(process.env.DAILY_CAP || 0);
  const today = new Date().toISOString().slice(0, 10);

  const row = await new Parse.Query('Usage')
    .equalTo('user', req.user).equalTo('day', today).first({ useMasterKey: true });
  if (!row) throw new Parse.Error(141, 'no usage row for today');

  row.increment('calls');
  await row.save(null, { useMasterKey: true });    // the increment is the atomic part
  const mine = row.get('calls');
  if (cap && mine > cap) throw new Parse.Error(141, `daily limit reached (${cap} calls)`);

  const r = await fetch(`${process.env.PROVIDER_URL}/v1/chat`, {
    method: 'POST',
    headers: { Authorization: 'Bearer sk-lab-0000-not-a-real-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: req.params.prompt ?? 'hello' }),
  });
  return { ...(await r.json()), callsToday: mine };
});
