// Live Nessie check and one-time setup. Fake money, real sandbox calls. Never prints the key.
//   NESSIE_API_KEY=... node src/server/nessie/live.ts setup          create the funding customer and account, print its id
//   NESSIE_API_KEY=... NESSIE_FUNDING_ACCOUNT_ID=... node src/server/nessie/live.ts pay   create a creator account and send $1
import { createNessieClient } from './client.ts';

const key = process.env.NESSIE_API_KEY;
if (!key) { console.error('Set NESSIE_API_KEY first.'); process.exit(2); }
const nessie = createNessieClient({ apiKey: key, baseUrl: process.env.NESSIE_BASE_URL || undefined });
const show = (label: string, r: { ok: boolean }) => console.log(label, JSON.stringify(r));
const need = <T,>(label: string, r: { ok: true; value: T } | { ok: false; message: string }) => {
  show(label, r);
  if (!r.ok) process.exit(1);
  return r.value;
};

const mode = process.argv[2];
if (mode === 'setup') {
  const customer = need('customer', await nessie.createCustomer('Breadcrumb', 'Bounties'));
  const account = need('account', await nessie.createAccount(customer, 'Breadcrumb bounty funding', 1000));
  console.log(`\nAdd to .env.local:\nNESSIE_FUNDING_ACCOUNT_ID=${account}\nBREADCRUMB_BOUNTIES=1`);
} else if (mode === 'pay') {
  const funding = process.env.NESSIE_FUNDING_ACCOUNT_ID;
  if (!funding) { console.error('Set NESSIE_FUNDING_ACCOUNT_ID first.'); process.exit(2); }
  const before = need('funding balance before', await nessie.getAccount(funding));
  const customer = need('creator customer', await nessie.createCustomer('Live', 'Check'));
  const creator = need('creator account', await nessie.createAccount(customer, 'Breadcrumb live check', 0));
  const t = await nessie.transfer(funding, creator, 1, 'Breadcrumb live check');
  show('transfer', t);
  if (!t.ok) {
    console.log('Transfer refused. Trying withdrawal plus deposit, which the service uses as its fallback.');
    need('withdrawal', await nessie.withdraw(funding, 1, 'Breadcrumb live check'));
    need('deposit', await nessie.deposit(creator, 1, 'Breadcrumb live check'));
  }
  const after = need('funding balance after', await nessie.getAccount(funding));
  const paid = need('creator balance after', await nessie.getAccount(creator));
  console.log(`\nfunding ${before.balance} -> ${after.balance}; creator ${paid.balance}. The sandbox may not update balances; the transaction ids above are the proof.`);
} else {
  console.error('Usage: node src/server/nessie/live.ts setup|pay');
  process.exit(2);
}
