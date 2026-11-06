// How much can someone with no account spend, and how fast?
import { anon, owner, waitUp } from './client.mjs';
import { startProvider, meter, money } from './provider.mjs';

const BURST = Number(process.env.BURST || 200);
const server = await startProvider();
await waitUp();

const line = (q, a) => console.log(`    ${q.padEnd(46)}${a}`);
const reset = () => { meter.calls = 0; meter.cents = 0; };

// Fire a burst at a function, the way a script does: no pauses, a few dozen in
// flight at a time. A request the socket refuses is counted as "dropped" rather
// than quietly treated as a refusal, because those are different results.
const IN_FLIGHT = 25;
async function burst(fn, opts = {}) {
  const started = Date.now();
  const rs = [];
  for (let i = 0; i < BURST; i += IN_FLIGHT) {
    const batch = Array.from({ length: Math.min(IN_FLIGHT, BURST - i) }, async () => {
      try { return await anon.post(`/functions/${fn}`, { prompt: 'hello' }, opts); }
      catch { return { ok: false, text: 'dropped', dropped: true }; }
    });
    rs.push(...await Promise.all(batch));
  }
  const seconds = (Date.now() - started) / 1000;
  const ok = rs.filter((r) => r.ok).length;
  const limited = rs.filter((r) => !r.ok && /too many|limit/i.test(r.text)).length;
  const dropped = rs.filter((r) => r.dropped).length;
  return { ok, limited, dropped, refused: rs.length - ok - limited - dropped,
           seconds: seconds.toFixed(1), rate: (ok / seconds).toFixed(0) };
}

console.log('');
console.log(`  ${BURST} requests, sent by nobody, as fast as they will go`);
console.log('');
const stage = process.argv[2] ?? 'open';

if (stage === 'open') {
  reset();
  const r = await burst('ask');
  line('requests the backend accepted:', `${r.ok} of ${BURST}`);
  line('calls that reached the paid provider:', String(meter.calls));
  line('what that cost:', `${money(meter.cents)} in ${r.seconds}s`);
  line('the rate it sustained:', `${r.rate} paid calls per second, from one laptop`);

  // and the other unlimited door
  const started = Date.now();
  const signups = await Promise.all(Array.from({ length: 50 }, (_, i) =>
    anon.post('/users', { username: `bot${Date.now()}x${i}`, password: 'correct-horse-0' })));
  line('bot accounts created in one burst:', `${signups.filter((s) => s.ok).length} of 50 in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (stage === 'limited') {
  reset();
  const r = await burst('ask');
  line('requests the backend accepted:', `${r.ok} of ${BURST}`);
  line('requests the backend refused:', `${r.limited} (too many requests)`);
  line('calls that reached the paid provider:', String(meter.calls));
  line('what that cost:', `${money(meter.cents)} in ${r.seconds}s`);
}

if (stage === 'capped') {
  const cap = process.env.DAILY_CAP || '10';
  const today = new Date().toISOString().slice(0, 10);
  // A new person each time, so nobody inherits another run's counter. `prepare`
  // decides whether today's counting row already exists, which turns out to be
  // the whole difference.
  const fresh = async (prepare) => {
    const name = `ana${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const u = await anon.post('/users', { username: name, password: 'correct-horse-1' });
    if (prepare) await owner.post('/classes/Usage', { day: today, calls: 0,
      user: { __type: 'Pointer', className: '_User', objectId: u.json.objectId } });
    return u.json.sessionToken;
  };
  line('the cap, in both versions:', `${cap} calls per person per day`);
  console.log('');

  // A race does not fail the same way twice, which is exactly why it survives
  // testing. Each version is run five times and reported as a range.
  const RUNS = 5;
  const budget = money(Number(cap) * 2);
  for (const [fn, prepare, label] of [
    ['askCapped',       false, 'as written: look up the row, check it, add one'],
    ['askCapped',       true,  "the same code, with today's row already there"],
    ['askCappedAtomic', true,  'add one first, then look at the number you got'],
  ]) {
    const got = [];
    let spent = 0;
    for (let i = 0; i < RUNS; i++) {
      const session = await fresh(prepare);
      reset();
      got.push((await burst(fn, { session })).ok);
      spent += meter.cents;
    }
    const lo = Math.min(...got), hi = Math.max(...got);
    const range = lo === hi ? `exactly ${lo}` : `between ${lo} and ${hi}`;
    console.log(`      ${label}`);
    console.log(`        ${range} calls got through, over ${RUNS} runs   —   ${money(spent / RUNS)} per run against a budget of ${budget}`);
  }

  console.log('');
  const anonTry = await anon.post('/functions/askCappedAtomic', { prompt: 'hello' });
  line('either version, called by nobody:', anonTry.ok ? 'accepted' : `refused — ${anonTry.json.error}`);
}
console.log('');
server.close();
