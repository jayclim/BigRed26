// Capital One "Nessie" hackathon banking sandbox client. Fake money only. Used for bounty payouts.
// Docs: http://api.nessieisreal.com/ (key as ?key=). Payout shapes follow the official transfer example
// (POST /accounts/{from}/transfers with medium "balance", payee_id, amount, transaction_date, description).
// The API key rides in the query string, so request URLs never go into errors, logs or results.
// ponytail: one fetch per call, no retries. A retry could pay twice, so the caller decides what to do with an ambiguous failure.

export const DEFAULT_NESSIE_URL = 'https://api.nessieisreal.com';
export const DEFAULT_TIMEOUT_MS = 15_000; // the sandbox can be slow
const MAX_RESPONSE_CHARS = 64_000;
const ID = /^[A-Za-z0-9_-]{6,64}$/;
export const isNessieId = (s: unknown): s is string => typeof s === 'string' && ID.test(s);

/** rejected: Nessie answered with an error, so nothing was applied. ambiguous: timeout, network error, 5xx or an unreadable answer, so the call may have been applied. */
export type NessieFailure = { ok: false; kind: 'rejected' | 'ambiguous'; status: number | null; message: string };
export type NessieResult<T> = { ok: true; value: T } | NessieFailure;
export interface NessieAccount { id: string; nickname: string | null; type: string | null; balance: number | null }
export interface NessieConfig { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number; now?: () => Date }

const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200) : '');
const day = (d: Date) => d.toISOString().slice(0, 10);

export function createNessieClient(config: NessieConfig) {
  const base = (config.baseUrl ?? DEFAULT_NESSIE_URL).replace(/\/+$/, '');
  const doFetch = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const today = () => day((config.now ?? (() => new Date()))());

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<NessieResult<Record<string, unknown>>> {
    const url = `${base}${path}?key=${encodeURIComponent(config.apiKey)}`;
    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const timedOut = (e as { name?: string })?.name === 'TimeoutError' || (e as { name?: string })?.name === 'AbortError';
      // The thrown error can carry the URL (and so the key). Say only what happened.
      return { ok: false, kind: 'ambiguous', status: null, message: timedOut ? 'Nessie did not answer in time.' : "Can't reach Nessie." };
    }
    let text: string;
    try { text = (await res.text()).slice(0, MAX_RESPONSE_CHARS); } catch { text = ''; }
    let json: unknown;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    const obj = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
    const detail = clean(obj?.message);
    const bodyCode = typeof obj?.code === 'number' ? obj.code : null;
    if (res.status >= 500) return { ok: false, kind: 'ambiguous', status: res.status, message: `Nessie failed (HTTP ${res.status}).${detail ? ` ${detail}` : ''}` };
    if (!res.ok || (bodyCode !== null && bodyCode >= 400)) {
      const status = !res.ok ? res.status : bodyCode;
      return { ok: false, kind: 'rejected', status, message: `Nessie refused the request (HTTP ${status}).${detail ? ` ${detail}` : ''}` };
    }
    if (!obj) return { ok: false, kind: 'ambiguous', status: res.status, message: 'Nessie sent an unreadable answer.' };
    return { ok: true, value: obj };
  }

  // POST answers carry the new record in objectCreated. Transfers report `_id` on POST and `id` on GET, so accept both.
  const created = (r: NessieResult<Record<string, unknown>>): NessieResult<string> => {
    if (!r.ok) return r;
    const o = r.value.objectCreated;
    const id = o && typeof o === 'object' ? ((o as Record<string, unknown>)._id ?? (o as Record<string, unknown>).id) : undefined;
    return isNessieId(id) ? { ok: true, value: id } : { ok: false, kind: 'ambiguous', status: null, message: 'Nessie did not return an id for the new record.' };
  };
  const seg = (id: string) => encodeURIComponent(id);
  const bad = (what: string): NessieFailure => ({ ok: false, kind: 'rejected', status: null, message: `${what} is not a valid Nessie id.` });
  const money = { medium: 'balance' } as const;

  return {
    async getAccount(id: string): Promise<NessieResult<NessieAccount>> {
      if (!isNessieId(id)) return bad('Account id');
      const r = await call('GET', `/accounts/${seg(id)}`);
      if (!r.ok) return r;
      const v = r.value;
      const aid = v._id ?? v.id;
      if (!isNessieId(aid)) return { ok: false, kind: 'ambiguous', status: null, message: 'Nessie sent an unreadable account.' };
      return { ok: true, value: {
        id: aid, nickname: typeof v.nickname === 'string' ? clean(v.nickname) : null,
        type: typeof v.type === 'string' ? clean(v.type) : null,
        balance: typeof v.balance === 'number' && Number.isFinite(v.balance) ? v.balance : null,
      } };
    },
    createCustomer: (first: string, last: string) => call('POST', '/customers', {
      first_name: first, last_name: last,
      address: { street_number: '1', street_name: 'Breadcrumb Way', city: 'Ithaca', state: 'NY', zip: '14850' },
    }).then(created),
    async createAccount(customerId: string, nickname: string, openingBalance = 0): Promise<NessieResult<string>> {
      if (!isNessieId(customerId)) return bad('Customer id');
      return created(await call('POST', `/customers/${seg(customerId)}/accounts`, { type: 'Checking', nickname, rewards: 0, balance: openingBalance }));
    },
    /** Official shape: money moves from `fromId` to `payeeId`. Whole dollars only. */
    async transfer(fromId: string, payeeId: string, amountUsd: number, description: string): Promise<NessieResult<string>> {
      if (!isNessieId(fromId)) return bad('Funding account id');
      if (!isNessieId(payeeId)) return bad('Payee account id');
      return created(await call('POST', `/accounts/${seg(fromId)}/transfers`, { ...money, payee_id: payeeId, amount: amountUsd, transaction_date: today(), description }));
    },
    // Fallback pair for sandboxes whose transfers endpoint refuses payee_id: a withdrawal, then a deposit.
    async withdraw(accountId: string, amountUsd: number, description: string): Promise<NessieResult<string>> {
      if (!isNessieId(accountId)) return bad('Account id');
      return created(await call('POST', `/accounts/${seg(accountId)}/withdrawals`, { ...money, status: 'completed', transaction_date: today(), amount: amountUsd, description }));
    },
    async deposit(accountId: string, amountUsd: number, description: string): Promise<NessieResult<string>> {
      if (!isNessieId(accountId)) return bad('Account id');
      return created(await call('POST', `/accounts/${seg(accountId)}/deposits`, { ...money, status: 'completed', transaction_date: today(), amount: amountUsd, description }));
    },
  };
}
export type NessieClient = ReturnType<typeof createNessieClient>;
