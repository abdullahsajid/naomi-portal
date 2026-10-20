import { randomInt } from "node:crypto";
import { BcError, getProduct, setProductStatus } from "./bigcartel";
import { sendEmail } from "./email";
import { reservationExpiredEmail, reservationStartedEmail } from "./email-templates";
import { reservationMinutes } from "./env";
import { db } from "./supabase";

export type ReserveInput = {
  productId: string;
  name: string;
  email: string;
  phone: string; // E.164-style, e.g. +61412345678
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
  terms: boolean;
};

/** One-line-per-part address used for emails, the admin page and shipping. */
export const formatAddress = (i: Pick<ReserveInput, "street" | "suburb" | "state" | "postcode" | "country">) =>
  `${i.street}
${i.suburb}, ${i.state} ${i.postcode}
${i.country}`;

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

const clean = (v: unknown, max = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max + 1);

/** Validates the customer details form (all fields mandatory). */
export function validateReserve(
  body: any,
): { ok: true; value: ReserveInput } | { ok: false; error: string } {
  const productId = clean(body?.productId, 30);
  const name = clean(body?.name);
  const email = clean(body?.email, 320).toLowerCase();
  const phone = clean(body?.phone, 30).replace(/[\s\-().]/g, "");
  const street = clean(body?.street);
  const suburb = clean(body?.suburb);
  const state = clean(body?.state);
  const postcode = clean(body?.postcode, 12);
  const country = clean(body?.country);

  if (!/^\d+$/.test(productId)) return { ok: false, error: "Invalid artwork." };
  if (name.length < 2 || name.length > 200) return { ok: false, error: "Please enter your full name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320)
    return { ok: false, error: "Please enter a valid email address." };
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    return { ok: false, error: "Please enter your mobile number including the country code, e.g. +61 412 345 678." };
  if (street.length < 3 || street.length > 200) return { ok: false, error: "Please enter your street address." };
  if (suburb.length < 2 || suburb.length > 100) return { ok: false, error: "Please enter your suburb or city." };
  if (state.length < 2 || state.length > 100) return { ok: false, error: "Please enter your state or province." };
  if (!/^[A-Za-z0-9][A-Za-z0-9 \-]{1,10}$/.test(postcode)) return { ok: false, error: "Please enter your postcode or ZIP code." };
  if (country.length < 2 || country.length > 100) return { ok: false, error: "Please enter your country." };
  if (body?.terms !== true) return { ok: false, error: "Please accept the terms." };
  return { ok: true, value: { productId, name, email, phone, street, suburb, state, postcode, country, terms: true } };
}

async function markFailed(id: string) {
  await db()
    .from("reservations")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** Race-safe reserve flow. The unique partial index is the lock. */
export async function reserve(input: ReserveInput, ipHash: string | null = null): Promise<ReserveResult> {
  const supabase = db();

  const [{ data: settings }] = await Promise.all([
    supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
    expireDueForProduct(input.productId), // free a timed-out hold on this artwork first
  ]);
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
        phone: input.phone,
        street: input.street,
        suburb: input.suburb,
        state: input.state,
        postcode: input.postcode,
        country: input.country,
        shipping_address: formatAddress(input),
        ip_hash: ipHash,
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
    return { ok: false, status: 409, error: "This artwork isn't available right now." };
  }
  // Hiding is all-or-nothing, so it is only safe for single-unit artworks (see docs/ARCHITECTURE.md).
  if (product.quantity > 1) {
    await markFailed(row.id);
    return { ok: false, status: 409, error: "Bank transfer isn't available for this artwork." };
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
  await sendEmail(
    input.email,
    reservationStartedEmail({ name: input.name, product: product.name, reference: row.reference, minutes, id: row.id }),
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
    } catch (e) {
      if (e instanceof BcError && e.status === 404) {
        console.log(`[close] product ${r.product_id} no longer exists on Big Cartel; closing ${id} anyway`);
      } else {
        // Row stays live so the cron retries; DB and Big Cartel never drift.
        console.error(`[close] could not restore ${r.product_id}; leaving ${id} live`);
        return false;
      }
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

async function expireRow(r: any): Promise<boolean> {
  if (!(await closeReservation(r.id, "expired"))) return false;
  await sendEmail(
    r.customer_email,
    reservationExpiredEmail({ name: r.customer_name, product: r.product_name, reference: r.reference }),
  );
  return true;
}

/**
 * Lazy expiry: if a timed-out reservation still holds this artwork (cron late or down), close it now.
 * Runs before availability checks and before the lock insert, so the cron is a backup, not a dependency.
 */
export async function expireDueForProduct(productId: string): Promise<void> {
  const { data: due } = await db()
    .from("reservations")
    .select("*")
    .eq("product_id", productId)
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString());
  for (const r of due ?? []) await expireRow(r);
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
  for (const r of due ?? []) if (await expireRow(r)) out.expired++;

  // Pending verification rows hold customer details, so don't keep them around.
  await supabase
    .from("email_verifications")
    .delete()
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());

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
