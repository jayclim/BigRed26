# Nessie route bounties

Status: implemented and host-verified with fake fetch and a local fake Nessie server. Date: 2026-10-04.
Branch: feat/nessie-bounties. The integration owner merges.
**No live Nessie call has been made.** Live behavior is unverified until the lead runs the live check below.

## Behavior

A bounty asks for a route: title, details, reward in whole US dollars (Nessie sandbox money, not real money) and a poster name.
Status path: open, claimed, submitted, paying, paid. Open, claimed and submitted can also become cancelled. The poster can send a submitted route back to claimed.

- Board: `/bounties` lists open, in-progress and paid bounties, the funding account balance and the total paid out here. A "Post a bounty" form appears when payouts are enabled.
- Bounty page: `/bounties/<id>` has the claim form, the route submit form, the poster actions and the payout status with Nessie ids. A submitted route links to its live guide at `/follow/<routeId>?mode=stream`.
- `/routes` has a "Bounties" nav link. Its cards link "Camera check view" to `?mode=live` and "Live voice guide" to `?mode=stream`.
- Claim: the creator gives a name and either an existing Nessie account id (checked with a GET) or asks the server to open a Nessie customer and checking account. The first claim wins; concurrent claims cannot both win.
- Submit: the claimant picks an approved route. A draft is refused with NOT_APPROVED. One route can back only one non-cancelled bounty.
- Approve and pay: the poster clicks the button. The server re-checks that the route is still approved, then sends the reward from `NESSIE_FUNDING_ACCOUNT_ID` to the creator's account.
- Without `BREADCRUMB_BOUNTIES=1`, `NESSIE_API_KEY` and a valid `NESSIE_FUNDING_ACCOUNT_ID`, the board is read-only: GET works, and post, claim and pay return PROVIDER_UNAVAILABLE.

## Security and money safety (public, unauthenticated demo)

- Poster secret (`bps_...`) and claim secret (`bcs_...`) are 144 random bits, returned once, and stored only as SHA-256. Compared in constant time after hashing. The poster secret is required to pay, cancel and send back. The claim secret is required to submit. The browser keeps both in localStorage so users do not retype them.
- Reward is a whole number from $1 to `BREADCRUMB_BOUNTY_MAX` (default 50). Pay re-checks the cap.
- Rate limits per client (last `X-Forwarded-For` entry): post 2 per minute and 5 per hour, claim 3 and 10, secret actions 20 and 120. Post is also capped at 60 per hour for everyone. At most 100 active and 500 stored bounties. Bodies are capped at 2 KiB. Everything is zod-validated and strict.
- Ids are UUIDs checked by pattern and looked up in a Map, so `__proto__`, `constructor` and similar names are plain NOT_FOUND.
- Payment is idempotent. Before any Nessie money call the server saves `paying` and payout `inflight` to disk. Nessie ids are saved the moment they return. A double click or a retry after paid sends nothing. A second request during a payout gets CONFLICT.
- Nessie refuses the call (4xx): the bounty returns to submitted with payout `failed` and the message. A plain retry is allowed. It is never marked paid.
- Timeout, network error, 5xx or unreadable answer: the payout is `uncertain` and the bounty stays `paying`. The poster must tick a deliberate "Retry payout anyway" action, which the UI warns can pay twice. A restart during a payout also reads as uncertain.
- If the save before the call fails, no Nessie call is made.
- Account ids are masked to the last four characters in the public API. Secret hashes never leave the server. The key goes in the query string, so request URLs and thrown errors are never logged or returned.
- Limit: anyone can post and claim, and the poster is the only gate on payment. A creator can submit any approved route, including one they did not record. The poster judges that.

## Payout method

Official docs (see below) give one transfer call: `POST /accounts/{from}/transfers` with `medium: "balance"`, `payee_id`, `amount`, `transaction_date`, `description`.
Several hackathon projects report that the live sandbox refuses `payee_id` and `medium` on transfers and that balances do not update on their own. Treat that as unconfirmed.
So `NESSIE_PAYOUT_MODE` defaults to `auto`: try the transfer; if Nessie refuses it (4xx, so nothing moved), send a withdrawal from the funding account and then a deposit to the creator. The withdrawal id is saved before the deposit, so a retry only deposits. `transfer` and `ledger` force one method. The board shows the funding balance Nessie reports, which may not move in the sandbox. The "Paid out here" total comes from this app's own records.
Withdrawals and deposits send `status: "completed"`. That value is untested live.

## Environment variables

| Name | Default | Purpose |
|---|---|---|
| `BREADCRUMB_BOUNTIES` | unset | Must be `1` to enable posting, claiming and paying |
| `NESSIE_API_KEY` | unset | Nessie key. Server only. Never logged |
| `NESSIE_FUNDING_ACCOUNT_ID` | unset | Account the rewards are paid from |
| `NESSIE_BASE_URL` | `https://api.nessieisreal.com` | Override if the host changes |
| `NESSIE_PAYOUT_MODE` | `auto` | `auto`, `transfer` or `ledger` |
| `BREADCRUMB_BOUNTY_MAX` | `50` | Largest reward in dollars |
| `BREADCRUMB_BOUNTIES_FILE` | `bounties.json` next to `BREADCRUMB_DATA_FILE` | Bounty store |

Never commit the key. Put it in `.env.local`.

## Setup for a person with no key yet

1. Open http://api.nessieisreal.com/ and sign up for a free API key. Use the customer key, because the enterprise key is read-only.
2. Run `NESSIE_API_KEY=<key> node src/server/nessie/live.ts setup`. It creates a funding customer and a checking account with a 1000 sandbox balance. It prints `NESSIE_FUNDING_ACCOUNT_ID=...`.
3. Put `BREADCRUMB_BOUNTIES=1`, `NESSIE_API_KEY` and `NESSIE_FUNDING_ACCOUNT_ID` in `.env.local`, then restart the app.

Live check, which sends one $1 sandbox payment to a new throwaway creator account and prints Nessie ids and balances, never the key:

```
NESSIE_API_KEY=<key> NESSIE_FUNDING_ACCOUNT_ID=<id> node src/server/nessie/live.ts pay
```

If the transfer step prints a refusal, the script tries withdrawal plus deposit. Whichever works confirms the payout method for this sandbox.

## Research (read 2026-10-04)

- http://api.nessieisreal.com/ and http://api.reimaginebanking.com/documentation: not reachable from this worker (403 and no DNS). The official pages were not read.
- https://github.com/nessieisreal/api-demo-starter/wiki/Step-3:-POST-Transfer: transfer call is `POST http://api.reimaginebanking.com/accounts/{from}/transfers?key=<key>` with `medium: "balance"`, `payee_id`, `amount`, `transaction_date` (YYYY-MM-DD) and `description`. Evidence: official starter, older host name.
- Search results citing http://api.nessieisreal.com/ and the Orbit project's env file: base URL `https://api.nessieisreal.com`, key as `?key=`, POST answers carry `objectCreated._id`, customer body has `first_name`, `last_name` and `address`, account body has `type`, `nickname`, `rewards`, `balance`. Secondary sources.
- https://github.com/Ossccaarrtz/hackmty2026: reports that transfers reject `payee_id` and `medium`, that balances do not update automatically, that fresh keys need everything created by POST, and that `/docs` and `/swagger.json` return 403. Community report, unconfirmed.

## Checks run, 2026-10-04

- `npm run check`: pass, including new `nessie.check.ts` and `bounties.check.ts`.
- `npx tsc --noEmit`: pass. `npx next build --webpack`: pass, new routes `/bounties`, `/bounties/[id]` and `/api/bounties/**` listed.
- `node scripts/smoke-api.mjs`: pass (existing script, unchanged). `git diff --check`: clean.
- Fake Nessie HTTP server plus `next start` on port 3141 with a temp data dir: post, claim with account creation, draft route refused, approved route submitted, wrong secret 403, two simultaneous pay requests gave 200 and 409 with exactly one transfer call, a later pay returned paid with no new call.
- Headless Chrome at 390 and 1280 on `/bounties`, an open bounty, a paid bounty and `/routes`: no horizontal overflow (scrollWidth equals clientWidth).
- Fake-fetch tests cover request shapes, refused transfer, 5xx, timeout, network error, unreadable answer, id and path-injection checks, key never in results, secret checks, amount caps, rate limits, every status move, unapproved routes, inherited ids, store safe loading, double pay, withdrawal-then-deposit resume, restart during payout and save failure before payout.

## Limits and next action

- No live Nessie evidence. Run the live check. Confirm the transfer shape, the `completed` status on withdrawals and deposits, and whether balances move.
- Error codes `FORBIDDEN` and `CONFLICT` exist only in the `/api/bounties` envelope. `contracts/` is unchanged.
- State is one JSON file in one process, like the route store. Rate limits are in memory.
- Browsers keep secrets in localStorage. A user who loses a secret cannot pay or cancel that bounty.
- No browser click-through of the forms was run; the forms were checked by render and by the API calls above.
- Next action: lead runs the live check, then sets the real env and decides on a public URL.
