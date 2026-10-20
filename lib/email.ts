import type { Mail } from "./email-templates";

// Resend over plain fetch, no extra dependency. Email failures never block a reservation.
// Sends HTML plus a plain-text alternative. Only the subject is logged, never the body.
export async function sendEmail(to: string, mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] RESEND_API_KEY not set, skipping "${mail.subject}" to ${to}`);
    return;
  }
  if (!to) {
    console.log(`[email] no recipient, skipping "${mail.subject}"`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject: mail.subject, text: mail.text, html: mail.html }),
    });
    console.log(`[email] "${mail.subject}" to ${to} -> ${res.status}`);
  } catch (e) {
    console.error("[email] failed", e);
  }
}
