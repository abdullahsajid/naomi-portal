import { BcError, getProduct, setProductStatus } from "./bigcartel";
import { db } from "./supabase";

/**
 * Stock model. Big Cartel's API cannot change quantities, so for each artwork:
 *   taken     = reservations that hold a unit (locking, active, receipt_uploaded)
 *               + units sold by bank transfer whose stock the owner has not yet lowered in Big Cartel
 *   available = Big Cartel quantity - taken
 * The artwork is hidden on the store only while available <= 0 (every unit is spoken for), and the
 * original status is put back as soon as a unit frees up. `held_products` remembers that WE hid it,
 * so an artwork the owner hid by hand is never un-hidden by us.
 */

export const LIVE = ["locking", "active", "receipt_uploaded"];
const TAKEN_FILTER = "status.in.(locking,active,receipt_uploaded),and(status.eq.sold,stock_synced.eq.false)";

export async function countTaken(productId: string): Promise<number> {
  const { count } = await db()
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .or(TAKEN_FILTER);
  return count ?? 0;
}

export async function countLive(productId: string): Promise<number> {
  const { count } = await db()
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .in("status", LIVE);
  return count ?? 0;
}

export async function isHeldByUs(productId: string): Promise<boolean> {
  const { data } = await db().from("held_products").select("product_id").eq("product_id", productId).maybeSingle();
  return !!data;
}

/** Hide the artwork because its last unit was just taken. Records first, so a crash can still be undone. */
export async function holdProduct(productId: string, originalStatus: string): Promise<void> {
  await db()
    .from("held_products")
    .upsert({ product_id: productId, original_status: originalStatus }, { onConflict: "product_id", ignoreDuplicates: true });
  await setProductStatus(productId, "hidden");
}

/**
 * Make Big Cartel match the database for one artwork. Safe to call any time and as often as you like.
 * Throws if Big Cartel cannot be reached; the every-minute cron repairs it then.
 */
export async function reconcileProduct(productId: string): Promise<void> {
  const supabase = db();
  for (let pass = 0; pass < 2; pass++) {
    const [taken, { data: held }] = await Promise.all([
      countTaken(productId),
      supabase.from("held_products").select("*").eq("product_id", productId).maybeSingle(),
    ]);

    let product;
    try {
      product = await getProduct(productId);
    } catch (e) {
      if (e instanceof BcError && e.status === 404) {
        await supabase.from("held_products").delete().eq("product_id", productId); // artwork was deleted
        return;
      }
      throw e;
    }

    const mustHide = product.quantity > 0 && taken >= product.quantity;
    if (mustHide) {
      if (product.status === "active") await holdProduct(productId, "active");
      return;
    }
    if (!held) return; // nothing of ours to undo
    if (product.status === "hidden") await setProductStatus(productId, held.original_status);
    await supabase.from("held_products").delete().eq("product_id", productId);
    // A reservation may have landed while we were restoring: check once more and re-hide if so.
  }
}

/** Reconcile, but never throw: used right after a state change that must still succeed. */
export async function reconcileQuietly(productId: string): Promise<void> {
  try {
    await reconcileProduct(productId);
  } catch (e) {
    console.error(`[stock] could not reconcile ${productId}; the cron will retry`, (e as Error).message);
  }
}

/** Cron: repair every artwork that has holds, unsynced sales, or a hide we are responsible for. */
export async function reconcileAll(): Promise<number> {
  const supabase = db();
  const [{ data: held }, { data: taken }] = await Promise.all([
    supabase.from("held_products").select("product_id"),
    supabase.from("reservations").select("product_id").or(TAKEN_FILTER),
  ]);
  const ids = new Set<string>([...(held ?? []), ...(taken ?? [])].map((r: any) => r.product_id));
  let n = 0;
  for (const id of ids) {
    await reconcileQuietly(id);
    n++;
  }
  return n;
}
