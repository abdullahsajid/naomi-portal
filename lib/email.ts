// Resend over plain fetch, no extra dependency. Email failures never block a reservation.
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] RESEND_API_KEY not set, skipping "${subject}" to ${to}`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
    });
    console.log(`[email] "${subject}" to ${to} -> ${res.status}`);
  } catch (e) {
    console.error("[email] failed", e);
  }
}
