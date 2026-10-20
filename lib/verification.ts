import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getAvailability } from "./availability";
import { sendEmail } from "./email";
import { verificationCodeEmail } from "./email-templates";
import { env } from "./env";
import { reserve, validateReserve, type ReserveInput } from "./reservations";
import { db } from "./supabase";

/**
 * Email verification gate. Nothing is held until a code is confirmed:
 *   start   -> validate + rate-limit + store the form + email a 6-digit code (artwork untouched)
 *   confirm -> correct code -> run the normal reserve flow (lock, hide, start the 15-minute timer)
 */

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const LIMITS = {
  codesPerEmail: { max: 3, windowMin: 30 },
  codesPerIp: { max: 8, windowMin: 60 },
  unfinishedPer24h: 3, // expired reservations from the same email or device in 24h
};

export type StartResult =
  | { ok: true; verificationId: string }
  | { ok: false; status: number; error: string };
export type ConfirmResult =
  | { ok: true; id: string; reference: string }
  | { ok: false; status: number; error: string };

const hmac = (v: string) => createHmac("sha256", env("SESSION_SECRET")).update(v).digest("hex");
export const hashCode = (id: string, code: string) => hmac(`code:${id}:${code}`);
export const hashIp = (ip: string) => hmac(`ip:${ip}`).slice(0, 32);

/** Netlify sets x-nf-client-connection-ip itself; x-forwarded-for is the fallback. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-nf-client-connection-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

async function count(table: string, filters: (q: any) => any): Promise<number> {
  const { count: n } = await filters(db().from(table).select("id", { count: "exact", head: true }));
  return n ?? 0;
}

export async function startVerification(body: any, ip: string): Promise<StartResult> {
  // Honeypot: a hidden field real people never fill. Pretend success so bots learn nothing.
  if (String(body?.website ?? "").trim() !== "") return { ok: true, verificationId: randomUUID() };

  const v = validateReserve(body);
  if (!v.ok) return { ok: false, status: 400, error: v.error };
  const input = v.value;
  const ipHash = hashIp(ip);

  // Rate limiting (database counts, no extra service).
  const byEmail = await count("email_verifications", (q) =>
    q.eq("email", input.email).gt("created_at", minutesAgo(LIMITS.codesPerEmail.windowMin)));
  const byIp = await count("email_verifications", (q) =>
    q.eq("ip_hash", ipHash).gt("created_at", minutesAgo(LIMITS.codesPerIp.windowMin)));
  if (byEmail >= LIMITS.codesPerEmail.max || byIp >= LIMITS.codesPerIp.max) {
    return { ok: false, status: 429, error: "Too many attempts. Please wait a little while and try again." };
  }
  const dayAgo = minutesAgo(24 * 60);
  const unfinished =
    (await count("reservations", (q) => q.eq("customer_email", input.email).eq("status", "expired").gt("created_at", dayAgo))) +
    (await count("reservations", (q) => q.eq("ip_hash", ipHash).eq("status", "expired").gt("created_at", dayAgo)));
  if (unfinished >= LIMITS.unfinishedPer24h) {
    return { ok: false, status: 429, error: "Too many unfinished reservations. Please try again tomorrow." };
  }

  // Don't send a code for an artwork nobody can reserve.
  const a = await getAvailability(input.productId);
  if (!a.available) {
    const reply = {
      reserved: { status: 409, error: "This artwork is currently reserved." },
      "not-offered": { status: 409, error: "Bank transfer isn't available for this artwork." },
      "not-found": { status: 404, error: "We couldn't find that artwork." },
      error: { status: 503, error: "We couldn't reach the store just now. Nothing was reserved. Please try again in a minute." },
    }[a.reason];
    return { ok: false, ...reply };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = randomUUID();
  const { error } = await db()
    .from("email_verifications")
    .insert({
      id,
      email: input.email,
      ip_hash: ipHash,
      product_id: input.productId,
      payload: input,
      code_hash: hashCode(id, code),
      expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
    });
  if (error) {
    console.error("[verify] insert failed", error);
    return { ok: false, status: 500, error: "Something went wrong. Please try again." };
  }

  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") {
    console.log(`[verify] DEV ONLY, code for ${input.email}: ${code}`);
  }
  await sendEmail(input.email, verificationCodeEmail({ name: input.name, code, ttlMin: CODE_TTL_MIN }));
  return { ok: true, verificationId: id };
}

export async function confirmVerification(id: string, code: string): Promise<ConfirmResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{6}$/.test(code)) {
    return { ok: false, status: 400, error: "Please enter the 6-digit code." };
  }
  const supabase = db();
  const { data: row } = await supabase.from("email_verifications").select("*").eq("id", id).maybeSingle();
  if (!row || row.consumed || new Date(row.expires_at) < new Date()) {
    return { ok: false, status: 400, error: "That code has expired. Please request a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: "Too many incorrect attempts. Please request a new code." };
  }

  // Count the attempt first, and only if nobody else counted it at the same moment, so parallel
  // guesses can't get more than MAX_ATTEMPTS tries.
  const { data: counted } = await supabase
    .from("email_verifications")
    .update({ attempts: row.attempts + 1 })
    .eq("id", id)
    .eq("attempts", row.attempts)
    .select("id");
  if (!counted?.length) return { ok: false, status: 429, error: "Please try again in a moment." };

  const expected = Buffer.from(row.code_hash, "hex");
  const given = Buffer.from(hashCode(id, code), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    const left = MAX_ATTEMPTS - (row.attempts + 1);
    return {
      ok: false,
      status: 400,
      error: left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many incorrect attempts. Please request a new code.",
    };
  }

  // One code, one reservation attempt.
  const { data: used } = await supabase
    .from("email_verifications")
    .update({ consumed: true })
    .eq("id", id)
    .eq("consumed", false)
    .select("id");
  if (!used?.length) return { ok: false, status: 400, error: "That code has already been used." };

  return reserve(row.payload as ReserveInput, row.ip_hash);
}
