import { BcError, getProduct, updateProduct } from "./bigcartel";
import { db } from "./supabase";

/**
 * Stock model. Big Cartel's API cannot change quantities, so for each artwork:
 *   taken     = reservations that hold a unit (locking, active, receipt_uploaded)
 *               + units sold by bank transfer whose stock the owner has not yet lowered in Big Cartel
 *   available = Big Cartel quantity - taken
 * While available <= 0 (every unit is spoken for) the artwork is set to "sold_out" on Big Cartel: it stays
 * visible on the store, and Big Cartel itself removes every purchase button. While a customer still holds
 * a unit that may come back, the artwork is also flagged "on sale"; the store theme reads that
 * combination (sold out + on sale) and shows TEMPORARILY RESERVED instead of "Sold out". A real sold-out
 * artwork is never on sale, so the two cannot be mixed up.
 * `held_products` remembers that WE changed the artwork and what to put back (status and on_sale), so
 * an artwork the owner changed by hand is never touched by us.
 */

export const LIVE = ["locking", "active", "receipt_uploaded"];
const TAKEN_FILTER = "status.in.(locking,active,receipt_uploaded),and(status.eq.sold,stock_synced.eq.false)";
const SHOWN_AS_TAKEN = ["sold_out", "hidden"]; // "hidden" = holds made before artworks stayed visible

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

export const isShownAsTaken = (status: string) => SHOWN_AS_TAKEN.includes(status);

/**
 * Show the artwork as taken because its last unit was just reserved. Records first, so a crash can still be
 * undone. `reserved` = a live reservation exists, so the "on sale" flag (reserved marker) is switched on.
 */
export async function holdProduct(
  productId: string,
  original: { status: string; onSale: boolean },
  reserved: boolean,
): Promise<void> {
  await db()
    .from("held_products")
    .upsert(
      { product_id: productId, original_status: original.status, original_on_sale: original.onSale },
      { onConflict: "product_id", ignoreDuplicates: true },
    );
  await updateProduct(productId, { status: "sold_out", on_sale: reserved ? true : original.onSale });
}

/**
 * Make Big Cartel match the database for one artwork. Safe to call any time and as often as you like.
 * Throws if Big Cartel cannot be reached; the every-minute cron repairs it then.
 */
export async function reconcileProduct(productId: string): Promise<void> {
  const supabase = db();
  for (let pass = 0; pass < 2; pass++) {
    const [taken, live, { data: held }] = await Promise.all([
      countTaken(productId),
      countLive(productId),
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

    // Every unit is spoken for: keep the artwork visible but not purchasable.
    if (product.quantity > 0 && taken >= product.quantity) {
      if (product.status === "active") {
        await holdProduct(productId, { status: "active", onSale: product.onSale }, live > 0);
      } else if (held && isShownAsTaken(product.status)) {
        // Marker on only while a customer still holds a unit that may come back (not for sold units).
        const wantOnSale = live > 0 ? true : held.original_on_sale;
        if (product.status !== "sold_out" || product.onSale !== wantOnSale) {
          await updateProduct(productId, { status: "sold_out", on_sale: wantOnSale });
        }
      }
      return;
    }

    if (!held) return; // nothing of ours to undo
    if (product.quantity <= 0) {
      // Sold elsewhere (e.g. a card order took the last unit): never bring it back on sale.
      // Only drop our marker; keep the record while we still hold the status, so a restock restores it.
      if (product.onSale !== held.original_on_sale) {
        await updateProduct(productId, { on_sale: held.original_on_sale });
      }
      if (!isShownAsTaken(product.status)) {
        await supabase.from("held_products").delete().eq("product_id", productId);
      }
      return;
    }
    if (isShownAsTaken(product.status)) {
      await updateProduct(productId, { status: held.original_status, on_sale: held.original_on_sale });
    } else if (product.onSale !== held.original_on_sale) {
      await updateProduct(productId, { on_sale: held.original_on_sale });
    }
    await supabase.from("held_products").delete().eq("product_id", productId);
    // A reservation may have landed while we were restoring: check once more and take it again if so.
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

/** Cron: repair every artwork that has holds, unsynced sales, or a change we are responsible for. */
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
