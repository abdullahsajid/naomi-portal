import { sendEmail } from "./email";
import { db } from "./supabase";

// Netlify functions cap request bodies at ~6MB (less after base64), so stay under that.
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export type ReceiptResult = { ok: true } | { ok: false; status: number; error: string };

export async function submitReceipt(id: string, file: File | null): Promise<ReceiptResult> {
  const supabase = db();
  if (!file || typeof file === "string" || file.size === 0) {
    return { ok: false, status: 400, error: "Please choose a file." };
  }
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, status: 400, error: "Please upload an image (JPG, PNG, WEBP, HEIC) or a PDF." };
  if (file.size > MAX_RECEIPT_BYTES) {
    return { ok: false, status: 413, error: `That file is too large. Please keep it under ${MAX_RECEIPT_BYTES / 1024 / 1024}MB.` };
  }

  const { data: r } = await supabase.from("reservations").select("*").eq("id", id).maybeSingle();
  if (!r) return { ok: false, status: 404, error: "Reservation not found." };
  if (r.status !== "active" || !r.expires_at || new Date(r.expires_at) <= new Date()) {
    return { ok: false, status: 409, error: "This reservation is no longer active." };
  }

  const path = `${id}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("receipts")
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("[receipt] storage upload failed", upErr);
    return { ok: false, status: 500, error: "Upload failed. Please try again." };
  }

  // Atomic: only succeeds if the reservation is still active and unexpired right now.
  const { data: updated, error: dbErr } = await supabase
    .from("reservations")
    .update({ status: "receipt_uploaded", expires_at: null, receipt_path: path, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .select("id");
  if (dbErr || !updated?.length) {
    await supabase.storage.from("receipts").remove([path]);
    return { ok: false, status: 409, error: "This reservation expired before the upload finished." };
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  await Promise.all([
    sendEmail(
      r.customer_email,
      `Receipt received – ${r.reference}`,
      `Hi ${r.customer_name},\n\nThanks, we've received your payment receipt for ${r.product_name}. Your artwork is held for you while we verify the payment.\nReference: ${r.reference}\n\nNaomi Katz Art`,
    ),
    sendEmail(
      process.env.ADMIN_EMAIL ?? "",
      `New receipt – ${r.reference} (${r.product_name})`,
      `${r.customer_name} (${r.customer_email}) uploaded a receipt for ${r.product_name}.\nReference: ${r.reference}\n\nReview it: ${base}/admin/reservations/${r.id}`,
    ),
  ]);
  return { ok: true };
}
