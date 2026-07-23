# Order Emails & Accept/Decline — Setup Guide

This sets up the full order flow, at **$0 and no credit card**:

1. Customer submits an order → gets an **"order received"** email.
2. Mom gets a **"new order"** email with **Accept** / **Decline** buttons.
3. Mom clicks one → the customer automatically gets a **confirmed** or **declined** email.

**Pieces:**
- **Cloudflare Worker** (`/worker`) — the backend. Free, no card.
- **Resend** — sends the emails. Free tier: 3,000/month, 100/day.
- **MailerLite** — separate, for the newsletter (see the bottom section).

Everything is already written. You just create two free accounts, set three
secrets, deploy, and paste one URL into the site's `.env`.

---

## Part 1 — Resend (sends the emails)

1. Create a free account at <https://resend.com>.
2. **Add your domain:** Resend → **Domains → Add Domain** → enter
   `mercymillsourdough.com` (or a subdomain like `send.mercymillsourdough.com`).
3. Resend shows a few **DNS records** (SPF/DKIM, usually `TXT` and `MX`/`CNAME`).
   Add them in **Namecheap → Advanced DNS** exactly as shown (Host is the part
   before your domain; use `@` for the root). This is the same place you added
   the Firebase records — you're just adding a few more.
4. Wait for Resend to show the domain as **Verified** (minutes to a few hours).
5. Create an **API key**: Resend → **API Keys → Create** → copy it (starts with
   `re_`). You'll paste it as a secret in Part 2.

> Until the domain is verified you can still test: Resend lets you send from
> `onboarding@resend.dev` to your own address. For production, use your verified
> domain so mail from `orders@mercymillsourdough.com` lands in inboxes.

---

## Part 2 — Cloudflare Worker (the backend)

From the `worker/` folder of the project:

```bash
cd worker
npm install
npx wrangler login          # opens a browser to sign in / create a free Cloudflare account
```

### 2a. (Recommended) Create the order log

Stores orders for 30 days and prevents a double accept/decline:

```bash
npx wrangler kv namespace create ORDERS
```

Copy the printed `id` into `worker/wrangler.toml` and uncomment the three
`kv_namespaces` lines.

### 2b. Set the three secrets

```bash
npx wrangler secret put RESEND_API_KEY     # paste the re_... key from Part 1
npx wrangler secret put SIGNING_SECRET     # paste any long random string (e.g. from a password generator)
npx wrangler secret put OWNER_EMAIL        # your mom's email address (where orders go)
```

The `SIGNING_SECRET` is what makes the Accept/Decline links tamper-proof — pick
something long and random, and don't share it.

### 2c. Check the config

In `worker/wrangler.toml`, confirm:
- `FROM_EMAIL` is on your Resend-verified domain (e.g. `orders@mercymillsourdough.com`).
- `SITE_URL` and `ALLOW_ORIGIN` are `https://mercymillsourdough.com`.

### 2d. Deploy

```bash
npx wrangler deploy
```

Wrangler prints your Worker URL, e.g.
`https://mercy-mills-orders.<your-subdomain>.workers.dev`. Copy it.

---

## Part 3 — Point the website at the Worker

In the **project root** `.env` (create it from `.env.example` if needed):

```
PUBLIC_ORDER_API=https://mercy-mills-orders.<your-subdomain>.workers.dev
```

Then rebuild and redeploy the site:

```bash
cd ..            # back to project root
npm run build
firebase deploy
```

Now the order form posts to the Worker. (If `PUBLIC_ORDER_API` is empty, the form
safely falls back to the old Web3Forms email, so the site never breaks.)

---

## Part 4 — Test the whole flow

1. On the live site, place a test order using **your own email** as the customer.
2. You should receive the **"order received"** email.
3. Mom's inbox gets the **"new order"** email with two buttons.
4. Click **Accept** → you (the customer) get the **confirmed** email, and mom
   sees a "Order accepted ✓" page. Try **Decline** on another test order.
5. First time, check spam and mark **"Not spam"**.

### Local testing (optional, before deploying)

```bash
cd worker
cp .dev.vars.example .dev.vars     # leave RESEND_API_KEY blank = dry-run (emails logged, not sent)
npx wrangler dev
```

With `RESEND_API_KEY` blank, emails are printed to the console instead of sent —
handy for checking the flow without spamming anyone.

---

## How the Accept/Decline links stay secure

The buttons in mom's email are **signed links**. The order details are encoded in
the link and signed with your `SIGNING_SECRET` (HMAC-SHA256). The Worker re-checks
the signature before doing anything, so nobody can forge a link or alter an order.
With the KV log enabled, each order can only be accepted or declined once.

---

## Part 5 — Newsletter

**Signups** go through the same Worker (`POST /api/subscribe`) — no extra
service. When someone subscribes:
- they get a **welcome email**, and
- you get a **"new newsletter signup"** email with their address.

It's already wired to `PUBLIC_ORDER_API`, so once Parts 2–3 are done, the signup
box works. Keep those addresses in a list (or a Google Sheet).

**Sending an issue** to your subscribers is a separate step you do when you have
news. Options:
- **Gmail:** Bcc your collected addresses. Fine for a small list.
- **MailerLite (optional):** import your addresses, then **Campaigns → Create →
  Custom HTML**, paste `email-templates/newsletter.html`, fill in the
  `[[ bracketed ]]` text, and **Schedule**. MailerLite adds the unsubscribe
  footer and handles opt-outs automatically — worth it as the list grows.

> Web3Forms is no longer used anywhere — the Worker handles both orders and
> newsletter signups.

---

## Quick reference

| Task | Command (in `worker/`) |
|------|------------------------|
| Log in to Cloudflare | `npx wrangler login` |
| Deploy the backend | `npx wrangler deploy` |
| Update a secret | `npx wrangler secret put NAME` |
| Local dry-run test | `npx wrangler dev` |
| View live logs | `npx wrangler tail` |
