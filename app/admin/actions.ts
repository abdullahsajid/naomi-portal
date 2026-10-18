"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPassword, endSession, requireAdmin, startSession } from "@/lib/admin-auth";
import { setProductStatus } from "@/lib/bigcartel";
import { sendEmail } from "@/lib/email";
import { closeReservation } from "@/lib/reservations";
import { db } from "@/lib/supabase";

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const ok = checkPassword(String(form.get("password") ?? ""));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return { error: "Wrong password." };
  }
  await startSession();
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}

export async function markSold(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  // `sold` keeps the product hidden on Big Cartel (TBC with client: maybe show as sold instead).
  if (await closeReservation(id, "sold")) {
    const { data: r } = await db().from("reservations").select("*").eq("id", id).maybeSingle();
    if (r) {
      await sendEmail(
        r.customer_email,
        `Payment confirmed – ${r.reference}`,
        `Hi ${r.customer_name},\n\nWe've confirmed your payment for ${r.product_name}. Thank you! We'll be in touch about shipping.\nReference: ${r.reference}\n\nNaomi Katz Art`,
      );
    }
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/reservations/${id}`);
}

export async function releaseReservation(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  await closeReservation(id, "released");
  revalidatePath("/admin", "layout");
  redirect(`/admin/reservations/${id}`);
}

export async function saveNotes(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  await db()
    .from("reservations")
    .update({ admin_notes: String(form.get("notes") ?? ""), updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath(`/admin/reservations/${id}`);
}

/** Manual stock toggle. Refused while a live reservation owns the product, so DB and store can't drift. */
export async function setStatus(form: FormData) {
  await requireAdmin();
  const productId = String(form.get("productId"));
  const status = String(form.get("status"));
  if (status !== "active" && status !== "hidden") return;
  const { data: live } = await db()
    .from("reservations")
    .select("id")
    .eq("product_id", productId)
    .in("status", ["locking", "active", "receipt_uploaded"])
    .limit(1);
  if (live?.length) return;
  await setProductStatus(productId, status);
  revalidatePath("/admin/stock");
}

export async function saveSettings(form: FormData) {
  await requireAdmin();
  const text = (k: string) => String(form.get(k) ?? "").trim() || null;
  const discount = Number(form.get("discount_amount"));
  await db()
    .from("settings")
    .upsert({
      id: 1,
      bank_name: text("bank_name"),
      account_name: text("account_name"),
      account_number: text("account_number"),
      bsb: text("bsb"),
      swift_code: text("swift_code"),
      payment_instructions: text("payment_instructions"),
      discount_amount: Number.isFinite(discount) && discount >= 0 ? discount : 300,
      enabled_product_ids: form.getAll("enabled").map(String),
      updated_at: new Date().toISOString(),
    });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}
