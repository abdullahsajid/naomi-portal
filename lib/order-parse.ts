export type OrderSummary = { id: string; createdAt: string | null; productIds: string[] };

/** Pure parser for GET /orders?include=items. Order line items carry `product_id` (changelog 2024-04-30). */
export function parseOrders(json: any): OrderSummary[] {
  const included: any[] = json?.included ?? [];
  const items = new Map<string, any>(included.filter((i) => i.type === "order_line_items").map((i) => [String(i.id), i]));
  return ((json?.data ?? []) as any[]).map((o) => {
    const ids = ((o.relationships?.items?.data ?? []) as any[])
      .map((ref) => items.get(String(ref.id))?.attributes?.product_id)
      .filter((p) => p != null)
      .map(String);
    return {
      id: String(o.id),
      createdAt: o.attributes?.created_at ?? o.attributes?.completed_at ?? null,
      productIds: [...new Set(ids)],
    };
  });
}
