import { BcError, getProduct, type BcProduct } from "./bigcartel";
import { expireDueForProduct } from "./reservations";
import { countLive, countTaken, isHeldByUs } from "./stock";
import { db } from "./supabase";

export async function getSettings() {
  const { data } = await db().from("settings").select("*").eq("id", 1).maybeSingle();
  return data;
}

export type Availability =
  | { available: true; product: BcProduct; discount: number; unitsLeft: number }
  | { available: false; reason: "reserved" | "unavailable" | "not-offered" | "not-found" | "error" };

/** Used by the customer pages to decide whether to show the reserve flow. */
export async function getAvailability(productId: string): Promise<Availability> {
  if (!/^\d+$/.test(productId)) return { available: false, reason: "not-found" };
  const settings = await getSettings();
  const enabled: string[] = settings?.enabled_product_ids ?? [];
  if (enabled.length > 0 && !enabled.includes(productId)) return { available: false, reason: "not-offered" };

  await expireDueForProduct(productId);

  let product: BcProduct;
  try {
    product = await getProduct(productId);
  } catch (e) {
    // 404 = no such artwork. Anything else (timeout, Big Cartel down, bad credentials) is on our side.
    return { available: false, reason: e instanceof BcError && e.status === 404 ? "not-found" : "error" };
  }

  // Hidden: ours (every unit is held) or the owner's.
  if (product.status === "hidden") {
    return { available: false, reason: (await isHeldByUs(productId)) ? "reserved" : "unavailable" };
  }
  // Sold elsewhere, or not on sale yet.
  if (product.status !== "active" || product.quantity < 1) return { available: false, reason: "unavailable" };

  // Units left = Big Cartel's stock minus the units we are holding or have sold but not yet taken off the stock.
  const taken = await countTaken(productId);
  if (taken >= product.quantity) {
    return { available: false, reason: (await countLive(productId)) > 0 ? "reserved" : "unavailable" };
  }
  return { available: true, product, discount: Number(settings?.discount_amount ?? 300), unitsLeft: product.quantity - taken };
}

export const aud = (n: number) =>
  `A$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
