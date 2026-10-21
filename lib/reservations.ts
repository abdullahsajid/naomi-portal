import { randomInt } from "node:crypto";
import { getProduct } from "./bigcartel";
import { sendEmail } from "./email";
import { reservationExpiredEmail, reservationStartedEmail } from "./email-templates";
import { reservationMinutes } from "./env";
import { holdProduct, isHeldByUs, isShownAsTaken, LIVE, reconcileAll, reconcileQuietly } from "./stock";
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

type ClosingStatus = "expired" | "released" | "failed" | "sold";

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const newReference = () =>
  "BT-" + Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join("");

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

/**
 * Race-safe reserve flow for artworks with one or more units in stock.
 * The database function `reserve_unit` counts the units already taken and inserts under a per-artwork
 * lock, so two customers can never take more units than exist. The artwork is hidden on Big Cartel
 * only when this reservation takes the last free unit.
 */
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

  // 1. Read the artwork. Its stock is the capacity for the lock below.
  let product;
  try {
    product = await getProduct(input.productId);
  } catch {
    return { ok: false, status: 500, error: "Could not check the artwork. Please try again." };
  }
  if (product.status !== "active" || product.quantity < 1 || !product.optionId) {
    const held = isShownAsTaken(product.status) && (await isHeldByUs(input.productId));
    return {
      ok: false,
      status: 409,
      error: held ? "This artwork is currently reserved." : "This artwork isn't available right now.",
    };
  }

  // 2. Take one unit atomically. null = every unit is already taken.
  let row: { id: string; reference: string; taken: number } | null = null;
  for (let attempt = 0; attempt < 5 && !row; attempt++) {
    const { data, error } = await supabase.rpc("reserve_unit", {
      p_product_id: input.productId,
      p_capacity: product.quantity,
      p_row: {
        reference: newReference(),
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
      },
    });
    if (error) {
      if (error.code === "23505") continue; // reference collision: try a new one
      console.error("[reserve] reserve_unit failed", error);
      return { ok: false, status: 500, error: "Something went wrong. Please try again." };
    }
    if (data == null) return { ok: false, status: 409, error: "This artwork is currently reserved." };
    row = data as { id: string; reference: string; taken: number };
  }
  if (!row) return { ok: false, status: 500, error: "Something went wrong. Please try again." };

  // 3. Record the details first, so crash cleanup knows what happened.
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

  // 4. Last free unit taken: show the artwork as sold out + reserved (the API cannot change stock).
  if (row.taken >= product.quantity) {
    try {
      await holdProduct(input.productId, { status: product.status, onSale: product.onSale }, true);
    } catch {
      await markFailed(row.id);
      await reconcileQuietly(input.productId);
      return { ok: false, status: 500, error: "Could not reserve the artwork. Please try again." };
    }
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
 * The single place a reservation leaves the live states. The database is the source of truth: once
 * the row is closed, Big Cartel is brought into line (a unit freed up -> show the artwork again).
 * If Big Cartel cannot be reached right now, the every-minute cron repairs it.
 * `sold` keeps counting against the artwork until the owner lowers the stock (see markStockSynced).
 */
export async function closeReservation(id: string, to: ClosingStatus): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: updated } = await db()
    .from("reservations")
    .update(to === "sold" ? { status: "sold", stock_synced: false, updated_at: now } : { status: to, updated_at: now })
    .eq("id", id)
    .in("status", LIVE)
    .select("product_id");
  if (!updated?.length) return false;
  await reconcileQuietly(updated[0].product_id);
  return true;
}

/** The owner has lowered the stock in Big Cartel for this sold artwork: stop counting it. */
export async function markStockSynced(id: string): Promise<boolean> {
  const { data } = await db()
    .from("reservations")
    .update({ stock_synced: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "sold")
    .eq("stock_synced", false)
    .select("product_id");
  if (!data?.length) return false;
  await reconcileQuietly(data[0].product_id);
  return true;
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

  // Repair Big Cartel for every artwork we hold or hid (also notices card purchases lowering the stock).
  const reconciled = await reconcileAll();
  return { ...out, reconciled };
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
