# ratelimit-lab

[![Deploy on Back4app](https://img.shields.io/badge/Deploy%20on-Back4app-1568B8?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDJMMiA3djEwbDEwIDUgMTAtNVY3eiIvPjwvc3ZnPg==)](https://www.back4app.com/signup?utm_source=github&utm_medium=repo&utm_campaign=ratelimit-lab)

One paid endpoint, one loop, and a provider that bills two cents a call. It
measures what a burst from a caller with no account costs, then adds the limits
and measures the same burst again.

**Measured on Parse Server 7.4.0 with MongoDB 7, Docker 29.4.3. First run
29 October 2026, re-measured from a clean clone on 6 November. The cap figures
are nine sets of five runs, reported as ranges because a race has no single
answer; only the last row gave the same number every time.**

> **Read the article:** [How to Rate Limit an API Before the Bill Arrives: What an Unthrottled Burst Actually Costs](https://www.back4app.com/blog/rate-limit-an-api-before-the-bill-arrives?utm_source=github&utm_medium=repo&utm_campaign=ratelimit-lab)

## Run it

```
./run.sh
```

Needs Docker and Node 22. The backend is destroyed and rebuilt every run.

## What it found

```
requests the backend accepted:                200 of 200
calls that reached the paid provider:         200
what that cost:                               $4.00 in 0.3s
the rate it sustained:                        769 paid calls per second, from one laptop
bot accounts created in one burst:            50 of 50 in 0.8s
```

| how the limit is written | calls through | spent per run |
| --- | --- | --- |
| no limit at all | 200 of 200 | $4.00 in 0.3s |
| look up the row, check it, add one | **23 – 50** | $0.75 |
| the same code, row already there | 10 – 23 | $0.41 |
| add one first, then check the number | **exactly 10** | $0.20 |

The cap was ten in every one of those rows.

### Why the usual cap does not hold

```js
const row = await q.first({ useMasterKey: true });
if (row.get('calls') >= cap) throw new Parse.Error(141, 'daily limit reached');
row.increment('calls');
await row.save(null, { useMasterKey: true });
```

Twenty-five requests arriving together all read the same count, all pass the
comparison, and only then does any of them write. When no counting row exists
yet, they also each create one, so the burst counts against several independent
counters — which is the difference between the 23–50 row and the 10–23 row.

Note the bottom of that second range: ten is the cap, so some runs enforced it
exactly. The broken version is right often enough to pass a test you run once.

Increment first, then read the number you were given:

```js
row.increment('calls');
await row.save(null, { useMasterKey: true });
if (row.get('calls') > cap) throw new Parse.Error(141, 'daily limit reached');
```

### The server's own rate limit needs a config file

`PARSE_SERVER_RATE_LIMIT` does not work in 7.4.0: the env-var parser for array
options splits the value on commas, so the JSON arrives as fragments and the
server refuses to start with `rateLimit must be an array of objects`. See
`parse-config.json` and `compose.ratelimit.yml`.

## The pieces

| file | what it does |
| --- | --- |
| `cloud/main.js` | the paid feature, uncapped and capped two ways |
| `provider.mjs` | a provider that bills per call, so "no limit" has a number |
| `run.mjs` | the burst, and the three cap conditions |
| `parse-config.json` | the server rate limit, which only a config file can set |
