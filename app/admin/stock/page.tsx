import { Badge, btnDark, btnLight } from "@/components/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { listProducts } from "@/lib/bigcartel";
import { db } from "@/lib/supabase";
import { setStatus } from "../actions";

export default async function StockPage() {
  await requireAdmin();
  let products;
  try {
    products = await listProducts();
  } catch {
    return <p className="text-accent-strong">Could not load products from Big Cartel. Check the Big Cartel password in the environment settings.</p>;
  }

  const [{ data: taken }, { data: held }] = await Promise.all([
    db()
      .from("reservations")
      .select("product_id, status")
      .or("status.in.(locking,active,receipt_uploaded),and(status.eq.sold,stock_synced.eq.false)"),
    db().from("held_products").select("product_id"),
  ]);
  const holds = new Map<string, number>();
  const toSync = new Map<string, number>();
  for (const r of taken ?? []) {
    const m = r.status === "sold" ? toSync : holds;
    m.set(r.product_id, (m.get(r.product_id) ?? 0) + 1);
  }
  const hiddenByUs = new Set((held ?? []).map((h) => h.product_id));
  const needsSync = [...toSync.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <h1 className="font-heading text-2xl mb-2">Stock</h1>
      <p className="text-sm text-muted mb-5 max-w-2xl">
        Big Cartel can’t change stock levels from here. Each reservation holds one unit. An artwork is only hidden on
        the store once <strong>every</strong> unit is held or sold. “Left to sell” is the Big Cartel stock minus what is
        held here.
      </p>
      {needsSync > 0 && (
        <p className="mb-5 rounded-xl bg-accent-soft px-4 py-3 text-sm max-w-2xl">
          <strong>{needsSync}</strong> sold {needsSync === 1 ? "artwork needs its" : "artworks need their"} stock lowered
          in Big Cartel. Open the sold reservation and press “I’ve updated the stock” once it’s done.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              {["Artwork", "Price", "Stock in Big Cartel", "Held now", "Sold, stock to update", "Left to sell", "Status", ""].map((h) => (
                <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const h = holds.get(p.id) ?? 0;
              const s = toSync.get(p.id) ?? 0;
              const managed = h + s > 0 || hiddenByUs.has(p.id);
              const next = p.status === "active" ? "hidden" : "active";
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      {p.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="h-10 w-10 rounded object-cover" />
                      )}
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted">#{p.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">A${p.price.toFixed(2)}</td>
                  <td className="px-3 py-2.5">{p.quantity}</td>
                  <td className="px-3 py-2.5">{h}</td>
                  <td className="px-3 py-2.5">{s}</td>
                  <td className="px-3 py-2.5 font-semibold">{Math.max(0, p.quantity - h - s)}</td>
                  <td className="px-3 py-2.5">
                    <Badge value={p.status} />
                    {hiddenByUs.has(p.id) && <div className="text-xs text-muted mt-1">hidden: all units held</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {managed ? (
                      <span className="text-xs text-muted">Managed by reservations</span>
                    ) : (
                      <form action={setStatus}>
                        <input type="hidden" name="productId" value={p.id} />
                        <input type="hidden" name="status" value={next} />
                        <button className={next === "hidden" ? btnLight : btnDark}>
                          {next === "hidden" ? "Hide" : "Show (set active)"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
