import { randomInt } from "node:crypto";
import { getProduct, setProductStatus } from "./bigcartel";
import { sendEmail } from "./email";
import { reservationMinutes } from "./env";
import { db } from "./supabase";

export type ReserveInput = {
  productId: string;
  name: string;
  email: string;
  address: string;
  terms: boolean;
};

export type ReserveResult =
  | { ok: true; id: string; reference: string }
  | { ok: false; status: number; error: string };

const LIVE = ["locking", "active", "receipt_uploaded"];
type ClosingStatus = "expired" | "released" | "failed" | "sold";

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const newReference = () =>
  "BT-" + Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join("");

const isUnique = (e: { code?: string } | null) => e?.code === "23505";
const isLiveIndex = (e: { message?: string } | null) =>
  !!e?.message?.includes("one_live_reservation_per_product");

export function validateReserve(
  body: any,
): { ok: true; value: ReserveInput } | { ok: false; error: string } {
  const productId = String(body?.productId ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const address = String(body?.address ?? "").trim();
  if (!/^\d+$/.test(productId)) return { ok: false, error: "Invalid artwork." };
  if (name.length < 2 || name.length > 200) return { ok: false, error: "Please enter your full name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320)
    return { ok: false, error: "Please enter a valid email." };
  if (address.length < 10 || address.length > 1000)
    return { ok: false, error: "Please enter your full shipping address." };
  if (body?.terms !== true) return { ok: false, error: "Please accept the terms." };
  return { ok: true, value: { productId, name, email, address, terms: true } };
}

async function markFailed(id: string) {
  await db()
    .from("reservations")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** Race-safe reserve flow. The unique partial index is the lock. */
export async function reserve(input: ReserveInput): Promise<ReserveResult> {
  const supabase = db();

  const { data: settings } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  const enabled: string[] = settings?.enabled_product_ids ?? [];
  if (enabled.length > 0 && !enabled.includes(input.productId)) {
    return { ok: false, status: 404, error: "Bank transfer is not available for this artwork." };
  }
  const discount = Number(settings?.discount_amount ?? 300);

  // 2. INSERT with status=locking. Unique index violation on product_id = someone else has it.
  let row: { id: string; reference: string } | null = null;
  for (let attempt = 0; attempt < 5 && !row; attempt++) {
    const { data, error } = await supabase
      .from("reservations")
      .insert({
        reference: newReference(),
        product_id: input.productId,
        customer_name: input.name,
        customer_email: input.email,
        shipping_address: input.address,
        status: "locking",
      })
      .select("id, reference")
      .single();
    if (data) row = data as { id: string; reference: string };
    else if (isUnique(error) && isLiveIndex(error)) {
      return { ok: false, status: 409, error: "This artwork is currently reserved." };
    } else if (!isUnique(error)) {
      console.error("[reserve] insert failed", error);
      return { ok: false, status: 500, error: "Something went wrong. Please try again." };
    } // else: reference collision, retry with a new one
  }
  if (!row) return { ok: false, status: 500, error: "Something went wrong. Please try again." };

  // 3. Fetch the product. It must be purchasable (active, in stock).
  let product;
  try {
    product = await getProduct(input.productId);
  } catch {
    await markFailed(row.id);
    return { ok: false, status: 500, error: "Could not check the artwork. Please try again." };
  }
  if (product.status !== "active" || product.quantity < 1 || !product.optionId) {
    await markFailed(row.id);
    return { ok: false, status: 409, error: "This artwork is currently reserved." };
  }

  // Record what we are about to change BEFORE changing it, so crash cleanup can restore it.
  await supabase
    .from("reservations")
    .update({
      option_id: product.optionId,
      product_name: product.name,
      product_image: product.imageUrl,
      original_status: product.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  // 4. Hide the product on Big Cartel (the API cannot change stock).
  try {
    await setProductStatus(input.productId, "hidden");
  } catch {
    await markFailed(row.id);
    return { ok: false, status: 500, error: "Could not reserve the artwork. Please try again." };
  }

  // 5. Go live.
  const minutes = reservationMinutes();
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const { error: upErr } = await supabase
    .from("reservations")
    .update({
      status: "active",
      expires_at: expiresAt,
      amount: Math.max(0, product.price - discount),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (upErr) {
    console.error("[reserve] activate failed", upErr);
    await closeReservation(row.id, "failed");
    return { ok: false, status: 500, error: "Could not reserve the artwork. Please try again." };
  }

  // 6. Email (never blocks).
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  await sendEmail(
    input.email,
    `Your reservation ${row.reference} - ${product.name}`,
    `Hi ${input.name},\n\n${product.name} is reserved for you for ${minutes} minutes.\nReference: ${row.reference}\n\nComplete your payment and upload your receipt here:\n${base}/reservation/${row.id}\n\nNaomi Katz Art`,
  );
  return { ok: true, id: row.id, reference: row.reference };
}

/**
 * The single place a reservation leaves the live states.
 * Restores the product's ORIGINAL Big Cartel status (except `sold`, which stays hidden).
 * Idempotent: only acts on rows that are still live.
 */
export async function closeReservation(id: string, to: ClosingStatus): Promise<boolean> {
  const supabase = db();
  const { data: r } = await supabase.from("reservations").select("*").eq("id", id).maybeSingle();
  if (!r || !LIVE.includes(r.status)) return false;

  if (to !== "sold" && r.original_status) {
    try {
      await setProductStatus(r.product_id, r.original_status);
    } catch {
      // Row stays live so the cron retries; DB and Big Cartel never drift.
      console.error(`[close] could not restore ${r.product_id}; leaving ${id} live`);
      return false;
    }
  }
  const { data: updated } = await supabase
    .from("reservations")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", LIVE)
    .select("id");
  return (updated?.length ?? 0) > 0;
}

/** Cron: expire timed-out reservations and clean up crashed `locking` rows. */
export async function expireReservations() {
  const supabase = db();
  const out = { expired: 0, cleaned: 0 };

  const { data: due } = await supabase
    .from("reservations")
    .select("*")
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString());
  for (const r of due ?? []) {
    if (await closeReservation(r.id, "expired")) {
      out.expired++;
      await sendEmail(
        r.customer_email,
        `Reservation ${r.reference} expired`,
        `Hi ${r.customer_name},\n\nYour reservation for ${r.product_name} expired because we did not receive a receipt in time. The artwork is available again.\n\nNaomi Katz Art`,
      );
    }
  }

  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: stuck } = await supabase
    .from("reservations")
    .select("id")
    .eq("status", "locking")
    .lt("created_at", cutoff);
  for (const r of stuck ?? []) if (await closeReservation(r.id, "failed")) out.cleaned++;
  return out;
}

export async function getReservationView(id: string) {
  const supabase = db();
  const { data: r } = await supabase.from("reservations").select("*").eq("id", id).maybeSingle();
  if (!r) return null;
  const timedOut = r.status === "active" && r.expires_at && new Date(r.expires_at) < new Date();
  const status = timedOut ? "expired" : r.status;
  const view: Record<string, unknown> = {
    id: r.id,
    reference: r.reference,
    status,
    productName: r.product_name,
    productImage: r.product_image,
    amount: r.amount,
    expiresAt: r.status === "active" ? r.expires_at : null,
    storeUrl: `https://${process.env.BIGCARTEL_SUBDOMAIN}.bigcartel.com`,
    serverNow: new Date().toISOString(), // lets the client countdown ignore a wrong device clock
  };
  // Bank details only once the reservation is fully active (step 5 succeeded).
  if (status === "active" || status === "receipt_uploaded") {
    const { data: s } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
    view.bank = s && {
      bankName: s.bank_name,
      accountName: s.account_name,
      accountNumber: s.account_number,
      swiftCode: s.swift_code,
      bsb: s.bsb,
      instructions: s.payment_instructions,
    };
  }
  return view;
}
