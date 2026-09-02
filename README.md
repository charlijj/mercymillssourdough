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
3. Those buttons are **HMAC-signed links**. Opening one shows a review page with
   a "message to the customer" box — nothing is sent on that GET, so mail
   scanners that pre-fetch links cannot decide an order.
4. Submitting that page (`POST /api/decide`) emails the customer the
   confirmation or decline, including the owner's optional message.

Payment is **e-transfer only**, and an order is confirmed only once payment has
been received.

### Newsletter

The signup box posts to `POST /api/subscribe` on the same Worker: the subscriber
gets a welcome email and the owner is notified. There is no third-party signup
service. Campaigns are sent separately — from Gmail for a small list, or by
importing addresses into a tool like MailerLite. A ready-made, on-brand HTML
template lives in `email-templates/newsletter.html`.

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
├── public/images/                  # logo, hero, product photos
├── src/
│   ├── data/
│   │   ├── menu.js                 # ← products, prices, EN/中文 names, details
│   │   └── pickup.js               # ← pickup weekdays, lead time, blackout dates
│   ├── components/                 # Header, Hero, Reviews, Story, Process,
│   │                               #   Menu, PickupCalendar, OrderForm,
│   │                               #   Newsletter, Footer, T
│   ├── styles/global.css
│   └── pages/index.astro
├── worker/                         # Cloudflare Worker (order + email backend)
│   ├── src/index.js                # routes
│   ├── src/templates.js            # HTML email templates
│   └── wrangler.toml
└── docs/
    ├── HANDOFF.md                  # day-to-day owner's guide
    └── EMAIL_BACKEND.md            # Resend + Cloudflare setup
```

### Page sections

Hero → Reviews → Our Story → How It's Made → Menu → Order → Newsletter → Footer.
(There is no Gallery section; it was removed at the owner's request.)

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
