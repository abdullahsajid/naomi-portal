// Branded HTML emails (table layout + inline styles so Gmail/Outlook/Apple Mail all render them).
// Every template returns { subject, text, html }; the plain-text part is sent too.

export type Mail = { subject: string; text: string; html: string };

const C = {
  bg: "#fcf6fb",
  card: "#ffffff",
  line: "#ecdcec",
  ink: "#1c1c1f",
  muted: "#5d5d63",
  pink: "#d64fe7",
  pinkSoft: "#ead1ea",
  pinkStrong: "#8a1c9b",
};
// Nixie One is the store's heading font. Gmail ignores web fonts, so Georgia is the real fallback there.
const HEADING = "'Nixie One', Georgia, 'Times New Roman', serif";
const BODY = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

type Row = [label: string, value: string];

function layout(o: {
  preheader: string;
  heading: string;
  intro: string; // HTML
  rows?: Row[];
  code?: string;
  button?: { label: string; href: string };
  outro?: string; // HTML
}) {
  const rows = o.rows?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border:1px solid ${C.line};border-radius:12px;border-collapse:separate;">
${o.rows
  .map(
    ([k, v], i) => `<tr>
<td style="padding:12px 16px;font:14px/1.4 ${BODY};color:${C.muted};width:38%;${i ? `border-top:1px solid ${C.line};` : ""}">${esc(k)}</td>
<td style="padding:12px 16px;font:600 15px/1.4 ${BODY};color:${C.ink};${i ? `border-top:1px solid ${C.line};` : ""}">${esc(v)}</td>
</tr>`,
  )
  .join("\n")}
</table>`
    : "";
  const code = o.code
    ? `<div style="margin:24px 0 0;padding:22px 12px;background:${C.pinkSoft};border-radius:12px;text-align:center;font:700 38px/1 ${BODY};letter-spacing:12px;color:${C.ink};">${esc(o.code)}</div>`
    : "";
  const button = o.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0;"><tr><td style="border-radius:10px;background:${C.ink};">
<a href="${esc(o.button.href)}" style="display:inline-block;padding:14px 26px;font:600 15px/1 ${BODY};color:#ffffff;text-decoration:none;border-radius:10px;">${esc(o.button.label)} &rarr;</a>
</td></tr></table>`
    : "";
  const outro = o.outro
    ? `<p style="margin:24px 0 0;font:14px/1.6 ${BODY};color:${C.muted};">${o.outro}</p>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Nixie+One&display=swap" rel="stylesheet">
<title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td align="center" style="padding:0 0 20px;font:400 15px/1.2 ${BODY};letter-spacing:6px;color:${C.ink};">NAOMI KATZ<div style="margin-top:6px;font-size:11px;letter-spacing:8px;">ART</div></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:32px 28px;">
<h1 style="margin:0 0 14px;font:400 30px/1.2 ${HEADING};color:${C.ink};">${esc(o.heading)}</h1>
<div style="font:16px/1.6 ${BODY};color:${C.ink};">${o.intro}</div>
${code}${rows}${button}${outro}
</td></tr>
<tr><td align="center" style="padding:20px 8px 0;font:12px/1.6 ${BODY};color:${C.muted};">Naomi Katz Art &middot; naomikatzart.com<br>You&rsquo;re receiving this because of a bank transfer reservation on our store.</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (s: string) => `<p style="margin:0 0 12px;">${s}</p>`;

export function verificationCodeEmail(o: { name: string; code: string; ttlMin: number }): Mail {
  return {
    subject: "Your Naomi Katz Art verification code",
    text: `Hi ${o.name},\n\nYour verification code is ${o.code}\n\nIt's valid for ${o.ttlMin} minutes. Once you enter it, your artwork is reserved for you for 15 minutes.\n\nIf you didn't request this, you can ignore this email. Nothing has been reserved.\n\nNaomi Katz Art`,
    html: layout({
      preheader: `Your code is ${o.code}`,
      heading: "Confirm your email",
      intro: p(`Hi ${esc(o.name)},`) + p("Enter this 6-digit code to reserve your artwork."),
      code: o.code,
      outro: `This code is valid for ${o.ttlMin} minutes. Once you enter it, your artwork is reserved for you for 15 minutes.<br><br>Didn&rsquo;t request this? You can ignore this email, nothing has been reserved.`,
    }),
  };
}

export function reservationStartedEmail(o: { name: string; product: string; reference: string; minutes: number; id: string }): Mail {
  const url = siteUrl() ? `${siteUrl()}/reservation/${o.id}` : "";
  return {
    subject: `Your reservation ${o.reference} – ${o.product}`,
    text: `Hi ${o.name},\n\n${o.product} is reserved for you for ${o.minutes} minutes.\nReference: ${o.reference}\n\nComplete your payment and upload your receipt here:\n${url}\n\nPlease pay in AUD only and cover all transfer fees.\n\nNaomi Katz Art`,
    html: layout({
      preheader: `${o.product} is reserved for ${o.minutes} minutes`,
      heading: "Your artwork is reserved",
      intro: p(`Hi ${esc(o.name)},`) + p(`<strong>${esc(o.product)}</strong> is reserved for you. Please transfer the payment and upload your receipt within <strong>${o.minutes} minutes</strong>.`),
      rows: [
        ["Artwork", o.product],
        ["Payment reference", o.reference],
        ["Time to upload receipt", `${o.minutes} minutes`],
      ],
      button: url ? { label: "View bank details & upload receipt", href: url } : undefined,
      outro: "Please pay in <strong>AUD only</strong> and cover all transfer fees so the full amount is received. Your payment doesn&rsquo;t need to arrive within the timer, only the receipt upload does.",
    }),
  };
}

export function receiptReceivedEmail(o: { name: string; product: string; reference: string }): Mail {
  return {
    subject: `Receipt received – ${o.reference}`,
    text: `Hi ${o.name},\n\nThanks, we've received your payment receipt for ${o.product}. Your artwork is held for you while we verify the payment.\nReference: ${o.reference}\n\nNaomi Katz Art`,
    html: layout({
      preheader: "We've received your receipt",
      heading: "Receipt received",
      intro: p(`Hi ${esc(o.name)},`) + p(`Thank you, we&rsquo;ve received your payment receipt for <strong>${esc(o.product)}</strong>. Your artwork is held for you while we verify the payment.`),
      rows: [
        ["Artwork", o.product],
        ["Payment reference", o.reference],
      ],
      outro: "We&rsquo;ll email you as soon as the payment is confirmed.",
    }),
  };
}

export function paymentConfirmedEmail(o: { name: string; product: string; reference: string }): Mail {
  return {
    subject: `Payment confirmed – ${o.reference}`,
    text: `Hi ${o.name},\n\nWe've confirmed your payment for ${o.product}. Thank you! We'll be in touch about shipping.\nReference: ${o.reference}\n\nNaomi Katz Art`,
    html: layout({
      preheader: "Your payment is confirmed",
      heading: "Payment confirmed",
      intro: p(`Hi ${esc(o.name)},`) + p(`We&rsquo;ve confirmed your payment for <strong>${esc(o.product)}</strong>. Thank you!`),
      rows: [
        ["Artwork", o.product],
        ["Payment reference", o.reference],
      ],
      outro: "We&rsquo;ll be in touch about shipping.",
    }),
  };
}

export function reservationExpiredEmail(o: { name: string; product: string; reference: string }): Mail {
  return {
    subject: `Reservation ${o.reference} expired`,
    text: `Hi ${o.name},\n\nYour reservation for ${o.product} expired because we did not receive a receipt in time. The artwork is available again.\n\nNaomi Katz Art`,
    html: layout({
      preheader: "Your reservation has ended",
      heading: "Your reservation has expired",
      intro: p(`Hi ${esc(o.name)},`) + p(`We didn&rsquo;t receive a receipt for <strong>${esc(o.product)}</strong> in time, so the artwork has been released and is available again.`),
      rows: [["Payment reference", o.reference]],
      outro: "If you still want it and it&rsquo;s available, you&rsquo;re welcome to reserve it again from the store.",
    }),
  };
}

export function adminNewReceiptEmail(o: { customer: string; email: string; product: string; reference: string; id: string }): Mail {
  const url = siteUrl() ? `${siteUrl()}/admin/reservations/${o.id}` : "";
  return {
    subject: `New receipt – ${o.reference} (${o.product})`,
    text: `${o.customer} (${o.email}) uploaded a receipt for ${o.product}.\nReference: ${o.reference}\n\nReview it: ${url}`,
    html: layout({
      preheader: `${o.customer} uploaded a receipt for ${o.product}`,
      heading: "New receipt to review",
      intro: p(`<strong>${esc(o.customer)}</strong> uploaded a payment receipt. Check it against your bank account, then mark it as sold or release it.`),
      rows: [
        ["Artwork", o.product],
        ["Customer", `${o.customer} (${o.email})`],
        ["Payment reference", o.reference],
      ],
      button: url ? { label: "Review receipt", href: url } : undefined,
    }),
  };
}

export function adminConflictEmail(o: { message: string; reference: string }): Mail {
  const url = siteUrl() ? `${siteUrl()}/admin/alerts` : "";
  return {
    subject: `Conflict: card order for reserved artwork (${o.reference})`,
    text: `${o.message}\n\n${url}`,
    html: layout({
      preheader: "A card order came in for an artwork reserved by bank transfer",
      heading: "Card order for a reserved artwork",
      intro: p(esc(o.message)),
      rows: [["Payment reference", o.reference]],
      button: url ? { label: "Open alerts", href: url } : undefined,
      outro: "Decide which payment to honour and refund the other.",
    }),
  };
}

export function adminBigCartelProblemEmail(o: { detail: string }): Mail {
  const url = siteUrl() ? `${siteUrl()}/admin/stock` : "";
  return {
    subject: "Action needed: the portal can't log in to Big Cartel",
    text: `The portal could not log in to Big Cartel (${o.detail}). Customers cannot reserve artworks until this is fixed.\n\nThe usual cause is a changed Big Cartel password. Update BIGCARTEL_PASSWORD in Netlify (Site configuration > Environment variables) and redeploy.\n\n${url}`,
    html: layout({
      preheader: "Customers can't reserve artworks until this is fixed",
      heading: "The portal can't reach Big Cartel",
      intro:
        p(`The portal could not log in to Big Cartel (${esc(o.detail)}). Until this is fixed, customers can&rsquo;t reserve artworks and expired reservations can&rsquo;t be released.`) +
        p("The usual cause is a changed Big Cartel password."),
      button: url ? { label: "Check the stock page", href: url } : undefined,
      outro: "To fix it: update <strong>BIGCARTEL_PASSWORD</strong> in Netlify (Site configuration, Environment variables), then redeploy.",
    }),
  };
}
