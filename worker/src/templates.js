// ============================================================================
//  Email templates — styled to match the Mercy Mills Sourdough website.
//  Email HTML must be table-based with inline styles for broad client support.
// ============================================================================

const C = {
  cream: '#faf4ea',
  creamDeep: '#f2e8d5',
  crust: '#3a2a1e',
  crustSoft: '#5b4636',
  amber: '#c8862d',
  amberDeep: '#a86a1c',
  wheat: '#e6c98f',
  sage: '#5f6b50',
  ink: '#2b2018',
  muted: '#7a6a5a',
};

const money = (n) => (Number.isInteger(n) ? `$${n}` : `$${Number(n).toFixed(2)}`);
const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Shared shell around every email.
function wrap(preheader, bodyHtml, siteUrl) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${C.creamDeep};font-family:Helvetica,Arial,sans-serif;color:${C.ink};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.creamDeep};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;">
  <tr><td style="background:${C.crust};border-radius:14px 14px 0 0;padding:22px 28px;">
    <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:bold;color:${C.wheat};">Mercy Mills Sourdough</span>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px 28px;">
    ${bodyHtml}
  </td></tr>
  <tr><td style="background:${C.crust};border-radius:0 0 14px 14px;padding:18px 28px;">
    <span style="font-size:12px;color:rgba(250,244,234,0.6);">
      Mercy Mills Sourdough &middot; <a href="${siteUrl}" style="color:${C.wheat};text-decoration:none;">mercymillsourdough.com</a><br>
      FOODSAFE Level 1 Certified &middot; British Columbia
    </span>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function heading(text) {
  return `<h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2;color:${C.crust};">${esc(text)}</h1>`;
}
function para(text) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.crustSoft};">${text}</p>`;
}

// "Size: 12 bagels · Flavour: Sesame" — only when the item has choices.
function itemChoices(it) {
  const parts = [];
  if (it.size) parts.push(esc(it.size));
  if (it.options) {
    for (const [k, v] of Object.entries(it.options)) {
      if (v) parts.push(`${esc(k)}: ${esc(v)}`);
    }
  }
  if (!parts.length) return '';
  return `<br><span style="color:${C.muted};font-size:13px;">${parts.join(' &middot; ')}</span>`;
}

function itemsTable(order) {
  const rows = order.items
    .map(
      (it) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid ${C.creamDeep};font-size:14px;color:${C.ink};">
        ${esc(it.name)} <span style="color:${C.muted};">&times; ${Number(it.qty)}</span>${itemChoices(it)}
      </td>
      <td align="right" style="padding:8px 0;border-bottom:1px solid ${C.creamDeep};font-size:14px;color:${C.ink};white-space:nowrap;">
        ${money(Number(it.price) * Number(it.qty))}
      </td></tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;">
    ${rows}
    <tr>
      <td style="padding:12px 0 0;font-size:16px;font-weight:bold;color:${C.crust};">Total</td>
      <td align="right" style="padding:12px 0 0;font-size:18px;font-weight:bold;color:${C.amberDeep};">${money(order.total)}</td>
    </tr>
  </table>`;
}

function detailsBlock(order) {
  const d = [];
  if (order.pickupDate) d.push(`<strong>Preferred pickup:</strong> ${esc(order.pickupDate)}`);
  if (order.customer?.phone) d.push(`<strong>Phone:</strong> ${esc(order.customer.phone)}`);
  if (order.notes) d.push(`<strong>Notes / allergies:</strong> ${esc(order.notes)}`);
  if (!d.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:${C.cream};border-radius:10px;">
    <tr><td style="padding:14px 16px;font-size:14px;line-height:1.7;color:${C.crustSoft};">${d.join('<br>')}</td></tr>
  </table>`;
}

// Optional personal note from the bakery, shown in the customer's email.
function messageBlock(message) {
  if (!message) return '';
  const safe = esc(message).replace(/\r?\n/g, '<br>');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:${C.cream};border-left:4px solid ${C.amber};border-radius:8px;">
    <tr><td style="padding:16px 18px;">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${C.amberDeep};font-weight:bold;margin-bottom:6px;">A note from us</div>
      <div style="font-size:15px;line-height:1.6;color:${C.crustSoft};">${safe}</div>
    </td></tr>
  </table>`;
}

function button(label, url, bg) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-block;"><tr>
    <td style="border-radius:999px;background:${bg};">
      <a href="${url}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)}</a>
    </td></tr></table>`;
}

// ---- Customer: order received -------------------------------------------
export function customerReceived(order, siteUrl) {
  const body = `
    ${heading('Thanks for your order!')}
    ${para(`Hi ${esc(order.customer.name)}, we've received your request and will confirm it shortly. <strong>Your order isn't final until we confirm it by email.</strong>`)}
    ${itemsTable(order)}
    ${detailsBlock(order)}
    ${para(`This is <strong>pickup only</strong>. We'll reply with your total and <strong>e-transfer</strong> details — your order is confirmed once your e-transfer has been received.`)}
    ${para(`Order reference: <span style="color:${C.muted};">${esc(order.id)}</span>`)}
  `;
  return { subject: `We got your order — Mercy Mills Sourdough`, html: wrap('We received your order and will confirm shortly.', body, siteUrl) };
}

// ---- Owner (mom): new order with Accept / Decline ------------------------
export function ownerNewOrder(order, acceptUrl, declineUrl, siteUrl) {
  const body = `
    ${heading('New order received')}
    ${para(`<strong>${esc(order.customer.name)}</strong> &lt;${esc(order.customer.email)}&gt; placed an order.`)}
    ${itemsTable(order)}
    ${detailsBlock(order)}
    ${para('Choose one — you can add a message to the customer on the next screen:')}
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px;">${button('✓ Accept order', acceptUrl, C.sage)}</td>
      <td>${button('✕ Decline order', declineUrl, '#a23b2e')}</td>
    </tr></table>
    <p style="margin:18px 0 0;font-size:12px;color:${C.muted};">Order ${esc(order.id)}. If the buttons don't work, reply to this email.</p>
  `;
  return {
    subject: `New order from ${order.customer.name} — ${money(order.total)}`,
    html: wrap(`New order from ${order.customer.name}`, body, siteUrl),
    replyTo: order.customer.email,
  };
}

// ---- Customer: confirmed -------------------------------------------------
export function customerConfirmed(order, siteUrl, message) {
  const body = `
    ${heading('Your order is confirmed 🎉')}
    ${para(`Hi ${esc(order.customer.name)}, good news — your order is confirmed and we'll have it ready for pickup.`)}
    ${itemsTable(order)}
    ${detailsBlock(order)}
    ${messageBlock(message)}
    ${para(`<strong>Payment received — thank you!</strong> We'll follow up with the pickup address and time. See you soon!`)}
    ${para(`Order reference: <span style="color:${C.muted};">${esc(order.id)}</span>`)}
  `;
  return { subject: `Your order is confirmed — Mercy Mills Sourdough`, html: wrap('Your order is confirmed.', body, siteUrl) };
}

// ---- Customer: declined --------------------------------------------------
export function customerDeclined(order, siteUrl, message) {
  const body = `
    ${heading('About your recent order')}
    ${para(`Hi ${esc(order.customer.name)}, thank you for your interest. Unfortunately we're unable to fulfill this particular order right now.`)}
    ${itemsTable(order)}
    ${messageBlock(message)}
    ${para(`This can happen when we're fully booked or an item has sold out. Please feel free to reach out or try again for another date — we'd love to bake for you.`)}
    ${para(`Order reference: <span style="color:${C.muted};">${esc(order.id)}</span>`)}
  `;
  return { subject: `Update on your order — Mercy Mills Sourdough`, html: wrap('An update on your recent order.', body, siteUrl) };
}

// ---- Subscriber: welcome -------------------------------------------------
export function subscriberWelcome(email, siteUrl) {
  const body = `
    ${heading("You're on the list 🍞")}
    ${para(`Thanks for subscribing to Mercy Mills Sourdough! About once a month we'll share new menu items, seasonal specials, and the occasional baking tip.`)}
    ${para(`Hungry now? <a href="${siteUrl}/#order" style="color:${C.amberDeep};font-weight:bold;text-decoration:none;">Place an order &rarr;</a>`)}
  `;
  return { subject: 'Welcome to Mercy Mills Sourdough', html: wrap('Thanks for subscribing!', body, siteUrl) };
}

// ---- Owner: new subscriber ----------------------------------------------
export function ownerNewSubscriber(email, siteUrl) {
  const body = `
    ${heading('New newsletter signup')}
    ${para('Someone just joined your newsletter:')}
    ${para(`<strong>${esc(email)}</strong>`)}
    ${para(`<span style="color:${C.muted};font-size:13px;">Add them to your MailerLite list (or however you send updates).</span>`)}
  `;
  return { subject: `New newsletter signup — ${esc(email)}`, html: wrap('New newsletter signup', body, siteUrl) };
}

// ---- Page shown when mom clicks Accept/Decline: review + optional message --
export function decisionForm(action, order, token, siteUrl) {
  const accepted = action === 'accept';
  const title = accepted ? 'Confirm this order?' : 'Decline this order?';
  const cta = accepted ? 'Payment received — confirm order' : 'Decline & notify customer';
  const btnColor = accepted ? C.sage : '#a23b2e';
  const hint = accepted
    ? 'Only confirm once the e-transfer has arrived. Add a note — pickup address, time, or anything else. (Optional)'
    : 'Let the customer know why, or suggest another date. (Optional)';
  const placeholder = accepted
    ? 'e.g. Ready Saturday after 10am — pickup at 123 Main St. See you then!'
    : "e.g. So sorry — we're fully booked that weekend. Could we do the following Saturday?";

  const rows = order.items
    .map(
      (it) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid ${C.creamDeep};font-size:14px;">${esc(it.name)} <span style="color:${C.muted};">&times; ${Number(it.qty)}</span></td>
         <td align="right" style="padding:6px 0;border-bottom:1px solid ${C.creamDeep};font-size:14px;white-space:nowrap;">${money(Number(it.price) * Number(it.qty))}</td></tr>`
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:${C.creamDeep};color:${C.ink};}
  .card{max-width:560px;margin:5vh auto;background:#fff;border-radius:14px;padding:28px 26px 32px;box-shadow:0 10px 40px rgba(58,42,30,.12);}
  h1{font-family:Georgia,serif;font-size:24px;color:${C.crust};margin:0 0 6px;}
  .sub{color:${C.muted};font-size:14px;margin:0 0 18px;}
  .summary{background:${C.cream};border-radius:10px;padding:14px 16px;margin-bottom:18px;}
  table{width:100%;border-collapse:collapse;}
  .total{font-weight:700;font-size:16px;color:${C.crust};padding-top:10px;}
  .amt{font-weight:700;font-size:18px;color:${C.amberDeep};padding-top:10px;}
  label{display:block;font-weight:600;font-size:14px;margin:0 0 6px;color:${C.crustSoft};}
  .hint{font-size:13px;color:${C.muted};margin:0 0 8px;}
  textarea{width:100%;box-sizing:border-box;font:inherit;font-size:15px;padding:12px;border:1.5px solid rgba(58,42,30,.15);border-radius:10px;resize:vertical;}
  textarea:focus{outline:none;border-color:${C.amber};box-shadow:0 0 0 3px rgba(200,134,45,.15);}
  button{width:100%;margin-top:16px;padding:14px;font:inherit;font-size:16px;font-weight:700;color:#fff;background:${btnColor};border:none;border-radius:999px;cursor:pointer;}
  button:hover{opacity:.92;}
  .meta{font-size:12px;color:${C.muted};text-align:center;margin-top:14px;}
</style></head>
<body>
  <div class="card">
    <h1>${esc(title)}</h1>
    <p class="sub">From <strong>${esc(order.customer.name)}</strong> &lt;${esc(order.customer.email)}&gt;</p>
    <div class="summary">
      <table>${rows}
        <tr><td class="total">Total</td><td align="right" class="amt">${money(order.total)}</td></tr>
      </table>
      ${order.pickupDate ? `<div style="margin-top:10px;font-size:14px;color:${C.crustSoft};"><strong>Preferred pickup:</strong> ${esc(order.pickupDate)}</div>` : ''}
      ${order.notes ? `<div style="margin-top:6px;font-size:14px;color:${C.crustSoft};"><strong>Notes:</strong> ${esc(order.notes)}</div>` : ''}
    </div>
    <form method="POST" action="/api/decide">
      <input type="hidden" name="token" value="${esc(token)}">
      <label for="message">Message to the customer</label>
      <p class="hint">${esc(hint)}</p>
      <textarea id="message" name="message" rows="5" placeholder="${esc(placeholder)}"></textarea>
      <button type="submit">${esc(cta)}</button>
    </form>
    <p class="meta">Order ${esc(order.id)} &middot; nothing is sent until you press the button</p>
  </div>
</body></html>`;
}

// ---- Simple HTML pages shown to mom after clicking Accept/Decline --------
export function decisionPage(kind, order, siteUrl, message) {
  const accepted = kind === 'accept';
  const title = accepted ? 'Order accepted ✓' : 'Order declined';
  const withNote = message ? ' Your message was included.' : '';
  const msg = accepted
    ? `You've accepted the order from <strong>${esc(order.customer.name)}</strong>. A confirmation email has been sent to them.${withNote}`
    : `You've declined the order from <strong>${esc(order.customer.name)}</strong>. They've been notified by email.${withNote}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="margin:0;font-family:Helvetica,Arial,sans-serif;background:${C.creamDeep};color:${C.ink};">
    <div style="max-width:520px;margin:8% auto;background:#fff;border-radius:14px;padding:36px 30px;text-align:center;">
      <div style="font-size:40px;">${accepted ? '🎉' : '📋'}</div>
      <h1 style="font-family:Georgia,serif;color:${C.crust};">${title}</h1>
      <p style="color:${C.crustSoft};line-height:1.6;">${msg}</p>
      <p style="color:${C.muted};font-size:13px;">Order ${esc(order.id)} &middot; ${money(order.total)}</p>
      <a href="${siteUrl}" style="display:inline-block;margin-top:12px;color:${C.amberDeep};text-decoration:none;font-weight:bold;">← Back to the website</a>
    </div>
  </body></html>`;
}

export function messagePage(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
  <body style="margin:0;font-family:Helvetica,Arial,sans-serif;background:${C.creamDeep};color:${C.ink};">
    <div style="max-width:520px;margin:8% auto;background:#fff;border-radius:14px;padding:36px 30px;text-align:center;">
      <h1 style="font-family:Georgia,serif;color:${C.crust};">${esc(title)}</h1>
      <p style="color:${C.crustSoft};line-height:1.6;">${esc(message)}</p>
    </div>
  </body></html>`;
}
