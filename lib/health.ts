import { BcError } from "./bigcartel";
import { sendEmail } from "./email";
import { adminBigCartelProblemEmail } from "./email-templates";
import { db } from "./supabase";

/**
 * If Big Cartel rejects our login (a changed password or removed access), email the owner, at most once an hour.
 * The `alerts` table dedupes: bigcartel_order_id is unique, so one row per hour = one email per hour.
 */
export async function reportBigCartelProblem(e: unknown): Promise<void> {
  if (!(e instanceof BcError) || (e.status !== 401 && e.status !== 403)) return;
  const hour = new Date().toISOString().slice(0, 13); // 2026-10-21T15
  const detail = `Big Cartel answered ${e.status}`;
  const { error } = await db()
    .from("alerts")
    .insert({ bigcartel_order_id: `system:bigcartel-login:${hour}`, message: `${detail}. Reconnect Big Cartel (or check BIGCARTEL_PASSWORD).` });
  if (error) return; // already reported this hour (or the table is unreachable)
  await sendEmail(process.env.ADMIN_EMAIL ?? "", adminBigCartelProblemEmail({ detail }));
}
