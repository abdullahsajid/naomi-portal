import type { Mail } from "./email-templates";

export type EmailResult = "sent" | "skipped" | "failed";

// Resend over plain fetch, no extra dependency. Callers that can live without the email ignore the
// result; the verification step checks it, because a code that never arrives locks the customer out.
// Only the subject is logged, never the body.
export async function sendEmail(to: string, mail: Mail): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] RESEND_API_KEY not set, skipping "${mail.subject}" to ${to}`);
    return "skipped";
  }
  if (!to) {
    console.log(`[email] no recipient, skipping "${mail.subject}"`);
    return "skipped";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(8000),
    });
    console.log(`[email] "${mail.subject}" to ${to} -> ${res.status}`);
    return res.ok ? "sent" : "failed";
  } catch (e) {
    console.error("[email] failed", e);
    return "failed";
  }
}
