// A paid provider that bills per call, so "no limit" has a number attached.
import { createServer } from 'node:http';
export const meter = { calls: 0, cents: 0 };
const PER_CALL_CENTS = 2;                     // a plausible per-request price

export function startProvider(port = 1345) {
  const s = createServer((req, res) => {
    meter.calls += 1;
    meter.cents += PER_CALL_CENTS;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ answer: 'hello' }));
  });
  return new Promise((r) => s.listen(port, '0.0.0.0', () => r(s)));
}
export const money = (c) => `$${(c / 100).toFixed(2)}`;
