import { oauthConfigured, verifySignature } from "@/lib/bigcartel-oauth";
import { sendEmail } from "@/lib/email";
import { adminBigCartelProblemEmail } from "@/lib/email-templates";
import { db } from "@/lib/supabase";

/**
 * Big Cartel calls this when the owner removes the app's access or closes the store (`account.deauthorized`).
 * Every request is checked against the HMAC signature before anything happens.
 */
export async function POST(request: Request) {
  // Only meaningful once a Big Cartel OAuth app exists; otherwise there is nothing to verify against.
  if (!oauthConfigured()) return Response.json({ error: "Not found" }, { status: 404 });
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-webhook-signature"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; account_id?: string } = {};
  try {
    event = JSON.parse(raw);
  } catch {}

  if (event.type === "account.deauthorized") {
    const detail = "Big Cartel access was removed or the store was closed";
    const { error } = await db()
      .from("alerts")
      .insert({ bigcartel_order_id: `system:bigcartel-deauthorized:${Date.now()}`, message: `${detail} (account.deauthorized).` });
    if (!error) await sendEmail(process.env.ADMIN_EMAIL ?? "", adminBigCartelProblemEmail({ detail }));
  }
  return Response.json({ ok: true }); // 2xx tells Big Cartel it was received
}
