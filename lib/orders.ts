import { bcGet, getProduct } from "./bigcartel";
import { parseOrders } from "./order-parse";
import { sendEmail } from "./email";
import { adminConflictEmail } from "./email-templates";
import { countTaken } from "./stock";
import { db } from "./supabase";

/**
 * Cron: a Big Cartel checkout for an artwork we hold means a customer paid by card while someone else
 * reserved it. Record one alert per order and tell the admin.
 */
export async function checkOrders() {
  const json = await bcGet("/orders?sort=-created_at&include=items&page[size]=25");
  const orders = parseOrders(json);
  const supabase = db();

  const { data: live } = await supabase
    .from("reservations")
    .select("id, reference, product_id, product_name, customer_name, created_at")
    .in("status", ["active", "receipt_uploaded"]);

  let created = 0;
  for (const order of orders) {
    // Only orders placed after the reservation started can conflict with it.
    const hit = (live ?? []).find(
      (r) =>
        order.productIds.includes(r.product_id) &&
        (!order.createdAt || new Date(order.createdAt) >= new Date(r.created_at)),
    );
    if (!hit) continue;

    // With several units, a card order is only a problem when we now hold more units than still exist
    // (Big Cartel's stock already dropped by the card order; our holds are not in it).
    const [product, taken] = await Promise.all([getProduct(hit.product_id), countTaken(hit.product_id)]);
    if (taken <= product.quantity) continue;

    const message = `Big Cartel order #${order.id} includes "${hit.product_name}", which is reserved by ${hit.customer_name} (${hit.reference}), but there are not enough units left for every reservation. Decide who gets it and refund the other payment.`;
    const { error } = await supabase
      .from("alerts")
      .insert({ reservation_id: hit.id, bigcartel_order_id: order.id, message });
    if (error) {
      if (error.code !== "23505") console.error("[orders] alert insert failed", error);
      continue; // already alerted for this order
    }
    created++;
    await sendEmail(process.env.ADMIN_EMAIL ?? "", adminConflictEmail({ message, reference: hit.reference }));
  }
  return { checked: orders.length, alerts: created };
}
