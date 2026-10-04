// Run with `npm run check`. Fake fetch only: no network, no real key.
import assert from 'node:assert/strict';
import { createNessieClient, isNessieId } from './client.ts';

const KEY = 'nessie-test-key-DO-NOT-LEAK';
const A = 'a'.repeat(24), B = 'b'.repeat(24);
type Call = { url: string; init: RequestInit };
const make = (respond: (call: Call) => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => { const c = { url, init }; calls.push(c); return respond(c); }) as unknown as typeof fetch;
  return { calls, nessie: createNessieClient({ apiKey: KEY, baseUrl: 'https://nessie.test/', fetchImpl, now: () => new Date('2026-10-04T12:00:00Z'), timeoutMs: 50 }) };
};
const created = (id: string) => Response.json({ code: 201, message: 'Created', objectCreated: { _id: id } }, { status: 201 });
const noKey = (x: unknown) => assert.ok(!JSON.stringify(x).includes(KEY), 'the key must never appear in a result');

// Request shapes: base URL, ?key=, JSON body, medium balance, whole dollars, no redirects.
{
  const { calls, nessie } = make(() => created(B));
  const r = await nessie.transfer(A, B, 12, 'Bounty');
  assert.deepEqual(r, { ok: true, value: B });
  assert.equal(calls[0].url, `https://nessie.test/accounts/${A}/transfers?key=${KEY}`);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { medium: 'balance', payee_id: B, amount: 12, transaction_date: '2026-10-04', description: 'Bounty' });
  assert.equal((calls[0].init.headers as Record<string, string>)['content-type'], 'application/json');
  assert.equal(calls[0].init.redirect, 'error');
}
{
  const { calls, nessie } = make(() => created(B));
  await nessie.withdraw(A, 5, 'w'); await nessie.deposit(B, 5, 'd');
  assert.match(calls[0].url, new RegExp(`/accounts/${A}/withdrawals\\?key=`));
  assert.match(calls[1].url, new RegExp(`/accounts/${B}/deposits\\?key=`));
  assert.deepEqual(JSON.parse(calls[1].init.body as string), { medium: 'balance', status: 'completed', transaction_date: '2026-10-04', amount: 5, description: 'd' });
}
{
  const { calls, nessie } = make((c) => c.url.includes('/customers/') ? created(A) : created(B));
  const cust = await nessie.createCustomer('Ada', 'Lovelace');
  assert.deepEqual(cust, { ok: true, value: B });
  const body = JSON.parse(calls[0].init.body as string);
  assert.equal(body.first_name, 'Ada'); assert.equal(body.last_name, 'Lovelace'); assert.ok(body.address.zip);
  const acct = await nessie.createAccount(A, 'Payouts');
  assert.deepEqual(acct, { ok: true, value: A });
  assert.equal(calls[1].url, `https://nessie.test/customers/${A}/accounts?key=${KEY}`);
  assert.deepEqual(JSON.parse(calls[1].init.body as string), { type: 'Checking', nickname: 'Payouts', rewards: 0, balance: 0 });
}
// POST id may be `_id` or `id`; GET account parses the balance.
{
  const { nessie } = make(() => Response.json({ objectCreated: { id: A } }));
  assert.deepEqual(await nessie.transfer(A, B, 1, 'x'), { ok: true, value: A });
}
{
  const { calls, nessie } = make(() => Response.json({ _id: A, type: 'Checking', nickname: 'Fund', balance: 987.5 }));
  assert.deepEqual(await nessie.getAccount(A), { ok: true, value: { id: A, nickname: 'Fund', type: 'Checking', balance: 987.5 } });
  assert.equal(calls[0].init.method, 'GET'); assert.equal(calls[0].init.body, undefined);
}
// Failure classes. 4xx = rejected (nothing applied); timeout, network, 5xx, garbage, missing id = ambiguous.
{
  const { nessie } = make(() => Response.json({ code: 400, message: 'payee_id is not allowed' }, { status: 400 }));
  const r = await nessie.transfer(A, B, 1, 'x');
  assert.equal(r.ok, false); if (!r.ok) { assert.equal(r.kind, 'rejected'); assert.equal(r.status, 400); assert.match(r.message, /payee_id is not allowed/); }
  noKey(r);
}
{
  const { nessie } = make(() => Response.json({ code: 404, message: 'x' }, { status: 200 })); // error code inside a 200
  const r = await nessie.getAccount(A); assert.equal(r.ok === false && r.kind, 'rejected');
}
{
  const { nessie } = make(() => new Response('upstream broke', { status: 502 }));
  const r = await nessie.transfer(A, B, 1, 'x'); assert.equal(r.ok === false && r.kind, 'ambiguous'); noKey(r);
}
{
  const { nessie } = make(() => { throw new TypeError(`fetch failed for https://nessie.test/accounts?key=${KEY}`); });
  const r = await nessie.transfer(A, B, 1, 'x'); assert.equal(r.ok === false && r.kind, 'ambiguous'); noKey(r); // error text with the URL is dropped
}
{
  const { nessie } = make((c) => new Promise<Response>((_res, rej) => c.init.signal!.addEventListener('abort', () => rej(c.init.signal!.reason))));
  const keepAlive = setInterval(() => {}, 10); // AbortSignal.timeout's timer is unref'd, so hold the loop open here
  const r = await nessie.transfer(A, B, 1, 'x');
  clearInterval(keepAlive);
  assert.equal(r.ok, false); if (!r.ok) { assert.equal(r.kind, 'ambiguous'); assert.match(r.message, /in time/); }
}
{
  const { nessie } = make(() => new Response('<html>', { status: 200 }));
  const r = await nessie.transfer(A, B, 1, 'x'); assert.equal(r.ok === false && r.kind, 'ambiguous');
  const { nessie: n2 } = make(() => Response.json({ code: 201, objectCreated: {} }));
  const r2 = await n2.transfer(A, B, 1, 'x'); assert.equal(r2.ok === false && r2.kind, 'ambiguous');
}
// Ids are validated before any request, so a crafted id cannot add path segments.
{
  const { calls, nessie } = make(() => created(A));
  for (const bad of ['../customers', 'a/b', '', 'a b', 'x'.repeat(65), '..%2f..%2fx']) {
    const r = await nessie.getAccount(bad); assert.equal(r.ok === false && r.kind, 'rejected', bad);
    assert.equal((await nessie.transfer(A, bad, 1, 'x')).ok, false);
  }
  assert.equal(calls.length, 0);
  assert.ok(isNessieId(A) && !isNessieId(5) && !isNessieId('abc'));
}
// Long error text is cut and control characters removed.
{
  const { nessie } = make(() => Response.json({ message: `bad\u0000${'z'.repeat(1000)}` }, { status: 400 }));
  const r = await nessie.getAccount(A); assert.ok(!r.ok && r.message.length < 300 && !/\u0000/.test(r.message));
}
console.log('nessie client checks passed');
