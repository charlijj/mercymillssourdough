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

function itemsTable(order) {
  const rows = order.items
    .map(
      (it) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid ${C.creamDeep};font-size:14px;color:${C.ink};">
        ${esc(it.name)} <span style="color:${C.muted};">&times; ${Number(it.qty)}</span>
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
    ${para(`This is <strong>pickup only</strong>. We'll confirm the pickup address and time, and payment is by <strong>cash or e-transfer</strong> once your order is confirmed.`)}
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
    ${para('Choose one — the customer will be emailed automatically:')}
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
export function customerConfirmed(order, siteUrl) {
  const body = `
    ${heading('Your order is confirmed 🎉')}
    ${para(`Hi ${esc(order.customer.name)}, good news — your order is confirmed and we'll have it ready for pickup.`)}
    ${itemsTable(order)}
    ${detailsBlock(order)}
    ${para(`<strong>Payment:</strong> cash or e-transfer. We'll follow up with the pickup address and time. See you soon!`)}
    ${para(`Order reference: <span style="color:${C.muted};">${esc(order.id)}</span>`)}
  `;
  return { subject: `Your order is confirmed — Mercy Mills Sourdough`, html: wrap('Your order is confirmed.', body, siteUrl) };
}

// ---- Customer: declined --------------------------------------------------
export function customerDeclined(order, siteUrl) {
  const body = `
    ${heading('About your recent order')}
    ${para(`Hi ${esc(order.customer.name)}, thank you for your interest. Unfortunately we're unable to fulfill this particular order right now.`)}
    ${itemsTable(order)}
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

// ---- Simple HTML pages shown to mom after clicking Accept/Decline --------
export function decisionPage(kind, order, siteUrl) {
  const accepted = kind === 'accept';
  const title = accepted ? 'Order accepted ✓' : 'Order declined';
  const msg = accepted
    ? `You've accepted the order from <strong>${esc(order.customer.name)}</strong>. A confirmation email has been sent to them.`
    : `You've declined the order from <strong>${esc(order.customer.name)}</strong>. They've been notified by email.`;
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
