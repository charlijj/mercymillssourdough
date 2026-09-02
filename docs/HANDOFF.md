# Mercy Mills Sourdough — Owner's Guide

Everything you'll need day to day. Nothing here requires writing code — you're
editing text in one or two files and running two commands.

For first-time setup of the email/order backend, see
**[EMAIL_BACKEND.md](EMAIL_BACKEND.md)**.

---

## The two commands

From the project folder:

```bash
npm run build && firebase deploy      # publish website changes
```

```bash
cd worker && npx wrangler deploy      # publish email-wording changes
```

Website content (menu, prices, photos, text, pickup days) only needs the
**first**. The second is only for changes to the emails customers receive.

---

## Update the menu, prices, or descriptions

Open **`src/data/menu.js`**. Each product is a block like this:

```js
{
  id: 'artisan-loaf',              // never change once orders exist
  name: 'Artisan Regular Loaf',
  name_zh: '原味酸種歐包',           // Chinese name
  price: 11,
  unit: 'loaf',
  unit_zh: '個',
  description: '...',
  description_zh: '...',
  image: '/images/artisan-loaf.jpg',
  tags: ['Bestseller'],            // or [] , or ['Sweet']
  details: { ... },                // see "Ingredients & allergens" below
  options: [shapeOption],          // optional
},
```

- **Change a price:** edit `price`.
- **Add a product:** copy a whole block, change the values, give it a new `id`.
- **Remove one:** delete its block (keep the commas tidy).
- Always update **both** the English and the `_zh` Chinese fields.

### Products with choices

- **`options`** — a choice that does *not* change the price. The loaves use
  `shapeOption` (Boule / Sandwich). Bagels add a flavour choice.
- **`sizes`** — a choice that *does* change the price, e.g. bagels:

```js
sizes: [
  { id: '6',  label: '6 bagels',  label_zh: '6 個',  price: 15 },
  { id: '12', label: '12 bagels', label_zh: '12 個', price: 28 },
],
```

The order form and the total update automatically, and the customer's choice
appears in the order email.

### Ingredients & allergens (the product popup)

Clicking a product opens a popup. Fill in its `details` block as information
becomes available:

```js
details: {
  ingredients: 'Unbleached flour, water, salt, sourdough starter',
  ingredients_zh: '無漂白麵粉、水、鹽、酸種酵種',
  allergens: 'Contains wheat and gluten',
  allergens_zh: '含小麥與麩質',
  netWeight: '800 g',
  about: '', about_zh: '',          // optional longer description
},
```

Any field left as `''` shows a polite "coming soon" note instead — so it is
safe to fill these in gradually. **Do not guess allergen information.**

---

## Change the pickup days

Open **`src/data/pickup.js`**:

```js
availableWeekdays: [2, 3, 4],   // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
minLeadDays: 3,                 // how far ahead orders must be placed
monthsAhead: 3,                 // how far ahead customers can book
blackoutDates: ['2026-12-24'],  // holidays / vacation, 'YYYY-MM-DD'
```

Every other day is automatically greyed out in the customer's calendar.

---

## Add or change photos

1. Put the image in **`public/images/`** (JPG; roughly 1200px on the long side
   keeps pages fast).
2. Point the product's `image:` at it, e.g. `'/images/my-photo.jpg'`.
3. Build and deploy.

- **Hero banner:** replace `public/images/hero-bread.jpg` (keep the name).
- **Our Story photo:** `public/images/story-boules.jpg`.
- **Behind-the-scenes photos:** add a block to `progressPhotos` at the top of
  `src/components/Process.astro`; they appear in the "In the kitchen" strip.
- **Logo:** replace `public/images/logo.svg` (a PNG works too — change the
  extension in the `<img src>` in `src/components/Header.astro`).

---

## Read and fulfil orders

1. An order email arrives with the items, chosen options, total, customer
   contact, requested pickup date and any allergy notes.
2. Reply with the total and your **e-transfer** details.
3. **When the e-transfer arrives**, open that same order email and press
   **"Accept"**. A page opens showing the order with a **message box** — add a
   note (pickup address and time, say), then press
   **"Payment received — confirm order"**. The customer is emailed
   automatically.
4. To turn an order down, press **"Decline"** instead and optionally explain
   why; the customer is emailed that too.

Nothing is sent to the customer until you press the button on that page.

---

## Newsletter

- New signups arrive as **"New newsletter signup"** emails. Keep those
  addresses in a list or a spreadsheet.
- To send an issue, use `email-templates/newsletter.html`: paste it into your
  email tool (Gmail, or a free service like MailerLite), replace only the text
  inside `[[ double brackets ]]`, and send. The design stays the same each time.

---

## Change the email address orders go to

```bash
cd worker
npx wrangler secret put OWNER_EMAIL     # type the new address when prompted
```

Takes effect immediately — no rebuild or deploy needed.

---

## Update contact details

Edit the `site` block at the bottom of `src/data/menu.js` — business name,
public email, Instagram and Facebook links, and the "Baked fresh" line. Leaving
a social link as `''` simply hides it.

---

## Editing the Chinese

The site is bilingual and the Chinese is **Traditional**. Section text lives in
the components as `<T en="…" zh="…" />` — edit the `zh` value. Menu items use
the `_zh` fields in `src/data/menu.js`. The 中文 / EN button in the header
switches languages and remembers the visitor's choice.

---

## Quick reference

| Task | Where |
|------|-------|
| Prices, products, Chinese names, ingredients | `src/data/menu.js` |
| Pickup days, lead time, holidays | `src/data/pickup.js` |
| Behind-the-scenes photos | `src/components/Process.astro` |
| Photos | `public/images/` |
| Wording of customer emails | `worker/src/templates.js` |
| Newsletter design | `email-templates/newsletter.html` |
| Publish the website | `npm run build && firebase deploy` |
| Publish email changes | `cd worker && npx wrangler deploy` |

Free-tier limits, all comfortable at this scale: Firebase Hosting ~10 GB storage
and ~360 MB/day transfer; Cloudflare Workers 100,000 requests/day; Resend 3,000
emails/month (100/day).
