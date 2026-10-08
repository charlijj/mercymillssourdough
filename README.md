# Mercy Mill Sourdough

The public website for **Mercy Mill Sourdough** — a small-batch home bakery in
British Columbia. One scrolling page where customers read the story, browse the
menu, view ingredients, place an order for local pickup, and subscribe to the
newsletter. Fully bilingual (English / 中文).

Live domain: **https://mercymillsourdough.com**

---

## ⚠️ Name & domain spelling (read this first)

The brand is **Mercy Mill Sourdough** — "Mill", singular. This matches Sarah's
logo artwork and the registered domain. Do not "correct" it to "Mills".

| Thing | Value | Notes |
|-------|-------|-------|
| Business name | **Mercy Mill Sourdough** | Singular "Mill". Matches the logo and the domain. |
| Registered domain | **mercymillsourdough.com** | `mercymill` + `sourdough`. |
| GitHub repo | **mercymillssourdough** | Legacy double "s". Does not affect the live site. |

Some **infrastructure identifiers** still contain the old `mercy-mills-` spelling
and **must not be renamed** — doing so would break deployment:

- `.firebaserc` → Firebase project `mercy-mills-sourdough`
- `worker/wrangler.toml` → Worker `mercy-mills-orders`, which owns the live API
  URL that `PUBLIC_ORDER_API` points at

One customer review in `src/components/Reviews.astro` quotes the old spelling.
It is left verbatim because testimonials are quoted as written.

---

## Architecture

Two deployables, both on free tiers, no credit card required:

```
                    ┌───────────────────────────────┐
                    │        Visitor's browser       │
                    └───────────────┬───────────────┘
                                    │
             static HTML/CSS/JS/images over HTTPS
                                    │
                    ┌───────────────▼───────────────┐
                    │   Firebase Hosting (Spark)     │
                    │   free CDN · free SSL · ./dist │
                    └───────────────┬───────────────┘
                                    │  fetch() for orders + signups
                    ┌───────────────▼───────────────┐
                    │  Cloudflare Worker (free)      │
                    │  /api/order  /api/decide       │
                    │  /api/subscribe                │
                    └───────────────┬───────────────┘
                                    │  transactional email
                    ┌───────────────▼───────────────┐
                    │        Resend (free tier)      │
                    │  customer + owner emails       │
                    └───────────────────────────────┘
```

### The order lifecycle

1. Customer submits the order form → `POST /api/order` on the Worker.
2. The Worker emails the **customer** ("order received") and the **owner** (the
   full order plus **Accept** / **Decline** buttons).
3. Those buttons are **HMAC-signed links**, valid for 30 days. Opening one shows
   the order and an **"Email me a security code"** button — nothing is sent on
   that GET, so mail scanners that pre-fetch links cannot trigger anything.
4. Pressing it (`POST /api/decide/code`) emails a **one-time 6-digit code to
   `OWNER_EMAIL` only**, whoever pressed it. The code lasts 10 minutes, works
   once, and only for the action it was requested for.
5. Entering the code plus an optional message (`POST /api/decide`) emails the
   customer the confirmation or decline.

**Why the code.** The link travels inside an email, and emails get replied to
and forwarded with the original quoted underneath. A signed link only proves
someone has a copy of that email. The code proves they also have the owner's
inbox. So an Accept link quoted in a reply to the customer is useless on its
own: they can open the page, but the code goes to the owner, and guessing runs
out quickly. Each order allows 5 code emails and 10 wrong guesses in total, then
the buttons lock. That puts the odds of guessing in at about 1 in 100,000.

Two smaller things back this up:

- The owner email's **Reply goes to the owner, not the customer**. To write to
  the customer there is an **"Email <name>"** button that opens a fresh,
  unquoted message.
- Decision pages are sent `no-store`, `no-referrer`, unframeable and
  `noindex`, so the token in the URL is not cached, leaked to the website via
  `Referer`, or clickjacked.

The decision routes **fail closed**. Without the `ORDERS` KV binding,
`SIGNING_SECRET` or `OWNER_EMAIL` they return 503 instead of running
unprotected, and `GET /` prints a warning naming what is missing.

Payment is **e-transfer only**, and an order is confirmed only once payment has
been received.

### Newsletter

**Signup is paused for launch.** The section shows a "Coming Soon" badge
instead of the form. To turn it back on, set `SIGNUP_ENABLED = true` at the top
of `src/components/Newsletter.astro` — the form, its script and the Worker
route are all still in place and untouched.

When enabled, the signup box posts to `POST /api/subscribe` on the same Worker:
the subscriber gets a welcome email and the owner is notified. There is no
third-party signup service. Campaigns are sent separately — from Gmail for a
small list, or by importing addresses into a tool like MailerLite. A
ready-made, on-brand HTML template lives in `email-templates/newsletter.html`.

### Tests

```bash
npm test        # node --test worker/test/*.test.mjs
```

`worker/test/lifecycle.test.mjs` runs the real Worker in-process against a
fake KV, with `fetch` stubbed so the Resend calls are captured rather than
sent. It covers the whole order lifecycle and the things that are expensive to
get wrong: that the server recomputes the total rather than trusting the
browser, that `GET /api/decide` only renders a form (a mail scanner prefetching
the link must not decide an order), that deciding twice emails the customer
once, that forged or re-signed tokens are refused, and that the shape/flavour
the customer picked survives onto the owner's email.

### Bilingual (English / 中文)

Both languages are rendered into the HTML; a small script flips
`<html data-lang>` and CSS shows only the active one (remembered in
`localStorage`). Section copy uses `<T en="…" zh="…" />`
(`src/components/T.astro`); menu items carry `_zh` fields. No translation API,
no network call. **Chinese is Traditional throughout**, matching the owner's own
product labels.

### Tech stack

| Layer | Choice |
|-------|--------|
| Framework | [Astro](https://astro.build) — static HTML output |
| Styling | Hand-written CSS (warm farmers-market palette) |
| Hosting | Firebase Hosting (Spark/free) |
| Order + newsletter backend | Cloudflare Worker (free) |
| Email | Resend (free tier) |
| Fonts | Google Fonts — Fraunces, Inter, Noto Sans SC |

### Project layout

```
.
├── astro.config.mjs
├── firebase.json / .firebaserc     # Firebase Hosting (serves ./dist)
├── .env.example                    # PUBLIC_ORDER_API
├── email-templates/newsletter.html # paste into your email tool each issue
├── assets-source/                  # originals kept out of the build (see its README)
├── public/images/                  # logo, banner, product photos
├── src/
│   ├── data/
│   │   ├── menu.js                 # ← products, prices, EN/中文 names, details
│   │   └── pickup.js               # ← pickup weekdays, lead time, blackout dates
│   ├── components/                 # Header, Hero, Reviews, Story, Menu,
│   │                               #   PickupCalendar, OrderForm,
│   │                               #   Newsletter, Footer, T
│   ├── styles/global.css
│   └── pages/index.astro
├── worker/                         # Cloudflare Worker (order + email backend)
│   ├── src/index.js                # routes
│   ├── src/templates.js            # HTML email templates
│   └── wrangler.toml
└── docs/
    ├── HANDOFF.md                  # day-to-day owner's guide
    ├── EMAIL_BACKEND.md            # Resend + Cloudflare setup
    └── owner/                      # the owner's own content briefs, newest last
```

### Page sections

Hero → Reviews → Our Story → Menu → Order → Newsletter → Footer.
(There is no Gallery section, and no "How it's made" section; both were removed
at the owner's request.)

### Menu and Order are one flow

The menu card *is* the order row. Each card carries its own size, option and
quantity selects, so customers choose quantities while browsing instead of
meeting a second copy of all fifteen products further down the page.

That means the quantity controls live outside `<form id="order-form">`. The
form's script therefore collects rows with `document.querySelectorAll('.item-row')`
rather than querying inside the form, and reads their values directly from the
DOM — nothing depends on native form submission for those fields. The Order
section renders a read-only summary of what was picked, plus the running total,
the customer's details, the pickup calendar and the notes box.

Two things worth knowing if you edit this:

- `<option>` can only contain text, so `<T>` cannot be used inside one. Each
  translatable option carries `data-label` and `data-label-zh`, and a small
  observer in `Menu.astro` swaps the text when the language changes. The order
  summary reads those attributes directly rather than the rendered text, so it
  does not depend on which observer runs first.
- The summary rows are built in JavaScript, so they never receive Astro's
  scoping attribute. Their CSS lives in a `<style is:global>` block namespaced
  under `#order-summary`. Scoped rules would silently not apply.

### The banner, and why the hero repeats it

`public/images/banner.jpg` is the brand artwork, and the site's palette is
sampled from it (`--olive` is its button green, `--ivory` its background).

Everything the artwork *says*, though, is painted into the pixels: the tagline,
the five benefits along the bottom, and two buttons. Baked-in text cannot be
translated into 中文, is unreadable at phone width, and is invisible to search
engines and screen readers. So the crop in `public/` stops above the benefit
strip, and `Hero.astro` re-states all of it as real HTML underneath — heading,
tagline, buttons, and an icon strip — which is why the page appears to say
some things twice on a wide screen. The image is decorative; the text below it
is the actual content.

The artwork's own two painted-on buttons would otherwise be dead pixels that
look clickable, so two invisible links sit exactly on top of them. They are
positioned in percentages measured from the 1904×740 crop — re-measure them if
the banner is ever re-cropped.

---

## Local development

Requires Node.js 18+.

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output into ./dist
npm run preview    # preview the production build
```

### Configuration

Copy `.env.example` to `.env` **in the project root** (not `src/` — Astro only
reads the root) and set:

- `PUBLIC_ORDER_API` — the Cloudflare Worker base URL, e.g.
  `https://mercy-mills-orders.<subdomain>.workers.dev`. Powers both the order
  form and the newsletter signup.

Worker secrets (`RESEND_API_KEY`, `SIGNING_SECRET`, `OWNER_EMAIL`) are set with
`wrangler secret put` and never live in the repo — see `docs/EMAIL_BACKEND.md`.

---

## Deployment

```bash
npm run build && firebase deploy      # the website
cd worker && npx wrangler deploy      # the order/email backend
```

The two are independent: content and design changes need only the first.
