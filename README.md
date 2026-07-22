# Mercy Mills Sourdough

The public website for **Mercy Mills Sourdough** — a small-batch sourdough
business. It's a single-page, modern "farmers-market" style site where customers
can read about the bakery, browse the menu and prices, view a photo catalog,
place an order, and subscribe to a newsletter.

Live domain: **https://mercymillsourdough.com**

---

## ⚠️ Name & domain spelling (read this first)

Three names are involved and they are **intentionally spelled differently** — do
not "correct" one to match another:

| Thing | Value | Notes |
|-------|-------|-------|
| Business name | **Mercy Mills Sourdough** | Three words, "Mills" with a double-L and trailing **s**. |
| Registered domain | **mercymillsourdough.com** | Registered via Namecheap. Note the **single "s"** joining `mill` + `sourdough` (i.e. `mercymill` + `sourdough`). |
| GitHub repo | **mercymillssourdough** | The repo name has a **double "s"** (`mills` + `sourdough`). |

The domain (`mercymillsourdough.com`, one "s") is the source of truth for the
live site and is what all site config points to. The repository name keeping the
double "s" is harmless — GitHub repo names don't affect the deployed site.

> If the single-"s" domain is ever discovered to be a typo and the real
> registered domain is `mercymillssourdough.com`, update `site` in
> `astro.config.mjs`, `src/data/menu.js`, `public/robots.txt`, and the DNS
> instructions in `docs/HANDOFF.md`.

---

## Architecture

This site is deliberately architected to be **$0/month to run**, require **no
server or database**, and stay **simple to maintain**, while still delivering the
three business goals: take orders, send newsletters, and present information.

### High-level design

```
                    ┌─────────────────────────────┐
                    │        Visitor's browser      │
                    │   (loads one static HTML page)│
                    └───────────────┬───────────────┘
                                    │
             static files (HTML/CSS/JS/images) over HTTPS
                                    │
                    ┌───────────────▼───────────────┐
                    │      Firebase Hosting (Spark)   │
                    │   free tier · global CDN · SSL  │
                    │   serves the pre-built ./dist   │
                    └───────────────┬───────────────┘
                                    │
        the page talks directly to third-party services from the browser:
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       │                            │                            │
┌──────▼───────┐          ┌─────────▼─────────┐        ┌─────────▼─────────┐
│  Web3Forms    │          │  MailerLite       │        │  Google Fonts     │
│ order form +  │          │  (optional) for   │        │ (Fraunces/Inter/  │
│ newsletter →  │          │  sending campaign │        │  Noto Sans SC)    │
│ Gmail inbox   │          │  emails to a list │        │                   │
└──────────────┘          └───────────────────┘        └───────────────────┘
```

**Key architectural decision — no backend.** Modern Firebase requires the paid
(Blaze) plan to run server-side Cloud Functions. To guarantee the site stays
free with no credit card, we avoid a backend entirely. Everything server-like is
delegated to free third-party services that the static page calls directly from
the browser. At ~50 customers this comfortably fits inside every free tier.

### The three business functions

1. **Information (story, menu, prices, photo catalog)** — Pure static content.
   The menu, prices, and descriptions live in a single data file
   (`src/data/menu.js`); Astro renders them into the page at build time. Updating
   the menu means editing that one file and re-deploying.

2. **Ordering** — The order form (`src/components/OrderForm.astro`) submits
   directly to **[Web3Forms](https://web3forms.com)**, a free form-to-email
   relay. Each submission is emailed to the bakery's Gmail inbox. A public access
   key (not a secret) identifies which inbox to deliver to. There is no order
   database — orders arrive as emails and are handled by replying. A honeypot
   field and required-field validation reduce spam and empty orders.

3. **Newsletter** — The signup box (`src/components/Newsletter.astro`) collects
   subscriber emails through the **same Web3Forms key** used for orders, so each
   signup is emailed to the bakery inbox with no extra service to set up. The
   owner keeps that list and sends campaigns when ready — from Gmail (Bcc) for a
   small list, or optionally a free tool like
   **[MailerLite](https://mailerlite.com)** for scheduled sends and automatic
   unsubscribe handling as the list grows.

### Bilingual (English / Mandarin)

The whole site is bilingual with a header toggle (中文 / EN). Both languages are
rendered into the HTML; a tiny script flips `<html data-lang>` and CSS shows only
the active language (choice remembered in `localStorage`). Section copy uses a
small `<T en="…" zh="…" />` helper (`src/components/T.astro`); menu items carry
`_zh` fields in `src/data/menu.js`. No translation API or network call is
involved — it works offline and adds virtually no page weight.

### Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **[Astro](https://astro.build)** | Builds to plain static HTML (perfect for free hosting), component-based, near-zero client JS, automatic asset handling for large photos. |
| Styling | Hand-written modern CSS | Warm farmers-market palette, big display type (Fraunces) + clean body type (Inter). No CSS framework needed. |
| Hosting | **Firebase Hosting** (Spark/free) | Free global CDN, free SSL, free custom domain, generous free bandwidth. |
| Orders | **Web3Forms** (free) | Form → email, no backend. |
| Newsletter | **Web3Forms** (free) | Signups emailed to the inbox; MailerLite optional for sending. |
| i18n | Custom CSS/JS toggle | English ⇄ Mandarin, no external service. |
| Fonts | Google Fonts | Fraunces + Inter, loaded via `<link>`. |

### Project layout

```
.
├── astro.config.mjs         # Astro + site URL config
├── firebase.json            # Firebase Hosting config (serves ./dist)
├── .firebaserc              # Firebase project id (replace with yours)
├── .env.example             # Public keys for the form + newsletter services
├── public/                  # Static assets copied as-is
│   ├── images/              # Photos (placeholders until real ones are added)
│   ├── favicon.svg
│   └── robots.txt
├── src/
│   ├── data/menu.js         # ← EDIT THIS to change menu items, prices, contact
│   ├── layouts/Base.astro   # <head>, fonts, SEO meta
│   ├── components/          # Header, Hero, Process, Menu, Gallery, OrderForm,
│   │                        #   Newsletter, Footer
│   ├── styles/global.css    # Design system (colors, type, buttons)
│   └── pages/index.astro    # The single page — composes the components
└── docs/HANDOFF.md          # Non-technical guide: edit menu, send newsletters,
                             #   read orders, add photos
```

### Data flow at a glance

- **Build time:** `menu.js` + components → Astro → static HTML/CSS/JS in `dist/`.
- **Deploy:** `dist/` is uploaded to Firebase Hosting.
- **Runtime:** visitor loads static page; order submissions POST to Web3Forms;
  newsletter signups POST to MailerLite. No server of ours is involved.

---

## Local development

Requires Node.js 18+.

```bash
npm install        # install dependencies
npm run dev        # local dev server at http://localhost:4321
npm run build      # production build into ./dist
npm run preview    # preview the production build locally
```

### Configuration

Copy `.env.example` to `.env` and fill in:

- `PUBLIC_WEB3FORMS_KEY` — free key from web3forms.com. Both the order form and
  the newsletter signup email to this inbox.

This is a public identifier, not a secret, so committing built output is fine.

---

## Deployment

See **[docs/HANDOFF.md](docs/HANDOFF.md)** for the full step-by-step, including
the first-time Firebase setup and pointing the Namecheap domain at Firebase.
Quick version once set up:

```bash
npm run build
firebase deploy
```
