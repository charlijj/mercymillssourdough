# Mercy Mills Sourdough — Setup, Deployment & Owner's Guide

This guide has two audiences:

- **Part A–D**: one-time technical setup (services, Firebase, domain, launch).
- **Part E**: the day-to-day owner's guide — how to update the menu, read
  orders, and send newsletters. No coding required for most of it.

---

## Part A — Connect the order email (Web3Forms)

Orders are emailed straight to a Gmail inbox. No backend, free forever.

1. Go to <https://web3forms.com>.
2. Enter **Mom's Gmail address** and click to create an Access Key. Confirm via
   the email they send.
3. Copy the **Access Key** (looks like `a1b2c3d4-....`).
4. In the project, copy `.env.example` to `.env` and set:
   ```
   PUBLIC_WEB3FORMS_KEY=your-access-key-here
   ```
   (Or paste it directly into `src/components/OrderForm.astro` where it says
   `YOUR_WEB3FORMS_ACCESS_KEY`.)
5. Rebuild (`npm run build`) and submit a test order — it should arrive in the
   Gmail inbox within a minute. Check the spam folder the first time and mark it
   "not spam" so future orders land in the inbox.

> Web3Forms is the recommended free option. Formspree works the same way if you
> prefer it — just swap the form `action` URL and key.

---

## Part B — Newsletter signups

Newsletter signups are collected the same simple way as orders: the signup box
emails each new subscriber's address to the bakery inbox using the **same
Web3Forms key from Part A** (the email subject says "New newsletter signup").
So once Part A is done, the newsletter box already works — no extra service to
set up.

- Each signup arrives as an email; keep a list (or a Google Sheet) of addresses.
- Test it: enter an email in the signup box on the live site and confirm the
  "New newsletter signup" email lands in the inbox.

**Sending the actual newsletter** to that list is a separate step you do when you
have something to announce. Two easy options:

- **Gmail:** paste the collected addresses into the **Bcc** field and send. Fine
  for a small list.
- **A free email tool (optional, for scheduling + unsubscribe links):** create a
  free account at <https://www.mailerlite.com>, import your collected addresses,
  and use **Campaigns → Create campaign → Schedule** for weekly/monthly sends.
  Recommended once the list grows, since it handles unsubscribes automatically.

---

## Part C — Firebase Hosting (step by step)

This is the core of the "host it on Firebase, free" plan. Do these once.

### C1. Install the tools (on your own computer)

```bash
# Requires Node.js 18+ (https://nodejs.org)
npm install -g firebase-tools
firebase --version        # confirm it installed
```

### C2. Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with the Google
   account you want to own the site.
2. Click **Add project**, name it (e.g. `mercy-mills-sourdough`), and finish.
   You can **disable Google Analytics** — it's not needed.
3. You'll stay on the **Spark (free)** plan. Do **not** upgrade to Blaze; this
   site never needs it.

### C3. Point the local project at your Firebase project

```bash
firebase login            # opens a browser to authorize your Google account
```

Then edit `.firebaserc` and replace the project id with the one you created:

```json
{
  "projects": { "default": "your-firebase-project-id" }
}
```

> You can find the exact project id in the Firebase console (Project settings →
> Project ID). `firebase.json` is already configured to serve the `dist/` folder,
> so you don't need to run `firebase init` — but if you do, choose **Hosting**,
> set the public directory to **`dist`**, and answer **No** to "configure as a
> single-page app" and **No** to overwriting `dist/index.html`.

### C4. Build and deploy

```bash
npm install               # first time only
npm run build             # produces ./dist
firebase deploy           # uploads ./dist to Firebase Hosting
```

When it finishes, the console prints a **Hosting URL** like
`https://your-project-id.web.app`. Open it — the live site is up on the free
`.web.app` domain. Every future update is just `npm run build && firebase deploy`.

---

## Part D — Point mercymillsourdough.com at Firebase (Namecheap)

The domain is registered at Namecheap; Firebase provides free SSL for it.

1. In the Firebase console: **Hosting → Add custom domain**.
2. Enter `mercymillsourdough.com` and follow the wizard. Also add
   `www.mercymillsourdough.com` and set it to redirect to the root (the wizard
   offers this).
3. Firebase shows **DNS records** to add — usually:
   - A **TXT** record (to verify you own the domain), and then
   - Two **A** records pointing to Firebase's IP addresses.
4. In **Namecheap → Domain List → Manage → Advanced DNS**:
   - Remove any default "parking" records.
   - Add the TXT record Firebase gave you (Host `@`).
   - Add the two A records (Host `@`) with Firebase's IPs.
   - For `www`, add a **CNAME** (or A records) exactly as Firebase instructs.
5. Save. DNS changes can take from a few minutes up to 24–48 hours to
   propagate. Firebase automatically provisions a free SSL certificate once it
   detects the records — the domain will show "Connected" in the console.
6. Visit <https://mercymillsourdough.com> — you should see the site over HTTPS.

> Double-check the spelling when typing the domain into Firebase: it's
> `mercymillsourdough.com` (single "s"). See the note in the README.

---

## Part E — Owner's guide (day to day)

You mostly won't touch code. Here's what changes and how.

### Update the menu, prices, or descriptions
1. Open `src/data/menu.js`.
2. Edit an item's `name`, `price`, `unit`, or `description`. Each item also has
   Mandarin fields (`name_zh`, `unit_zh`, `description_zh`) — update those too so
   the Chinese version stays in sync. To add an item, copy an existing block; to
   remove one, delete its block. Keep the commas.
3. Save, then run `npm run build && firebase deploy`.

### Add real photos
1. Put photo files in `public/images/` (JPG or WebP; aim for ~1600px wide,
   under ~400 KB each so pages stay fast).
2. In `src/data/menu.js`, set each item's `image` to `/images/your-file.jpg`.
3. For the gallery, edit the `photos` list in
   `src/components/Gallery.astro`.
4. For the big hero photo, follow the comment in `src/components/Hero.astro`
   (set a `background-image` on `.hero-bg`).
5. Build and deploy.

### Read and fulfill orders
- Orders arrive as emails in the Gmail inbox (from Web3Forms). Each email lists
  the items and quantities, customer contact, preferred pickup date, and notes.
  Ordering is **pickup only** — reply to the customer's email to confirm the
  total, the pickup address, and the time.

### Send a newsletter
- New signups arrive as "New newsletter signup" emails — keep those addresses in
  a list. To send an update, either Bcc the list from Gmail, or use a free tool
  like MailerLite (import the list, then Campaigns → Create → Schedule). See
  Part B.

### Edit the Mandarin translation
- Every visitor-facing phrase is bilingual. Section text lives in the
  components as `<T en="…" zh="…" />` — edit the `zh="…"` value to change the
  Chinese. Menu items use the `_zh` fields in `src/data/menu.js`.
- The 中文 / EN button in the header toggles languages; the choice is remembered
  in the visitor's browser.

### Update contact info / social links
- Edit the `site` object at the bottom of `src/data/menu.js` (email, Instagram,
  Facebook, tagline, location). Build and deploy.

---

## Quick reference

| Task | Command |
|------|---------|
| Run locally | `npm run dev` |
| Build for production | `npm run build` |
| Deploy to Firebase | `firebase deploy` |
| Build + deploy in one go | `npm run build && firebase deploy` |

Free-tier limits (plenty for ~50 customers): Firebase Hosting ~10 GB storage &
~360 MB/day transfer; Web3Forms free submissions (orders + newsletter signups);
MailerLite (optional, for sending campaigns) up to ~1,000 subscribers.
