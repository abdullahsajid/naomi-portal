import { getProduct, type BcProduct } from "./bigcartel";
import { db } from "./supabase";

export async function getSettings() {
  const { data } = await db().from("settings").select("*").eq("id", 1).maybeSingle();
  return data;
}

export type Availability =
  | { available: true; product: BcProduct; discount: number }
  | { available: false; reason: "reserved" | "not-offered" | "not-found" };

/** Used by the customer pages to decide whether to show the reserve flow. */
export async function getAvailability(productId: string): Promise<Availability> {
  if (!/^\d+$/.test(productId)) return { available: false, reason: "not-found" };
  const settings = await getSettings();
  const enabled: string[] = settings?.enabled_product_ids ?? [];
  if (enabled.length > 0 && !enabled.includes(productId)) return { available: false, reason: "not-offered" };

  let product: BcProduct;
  try {
    product = await getProduct(productId);
  } catch {
    return { available: false, reason: "not-found" };
  }

  const { data: live } = await db()
    .from("reservations")
    .select("id")
    .eq("product_id", productId)
    .in("status", ["locking", "active", "receipt_uploaded"])
    .limit(1);
  if ((live?.length ?? 0) > 0 || product.status !== "active" || product.quantity < 1) {
    return { available: false, reason: "reserved" };
  }
  return { available: true, product, discount: Number(settings?.discount_amount ?? 300) };
}

export const aud = (n: number) =>
  `A$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
