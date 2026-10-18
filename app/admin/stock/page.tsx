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
    return <p className="text-accent">Could not load products from Big Cartel. Check the Big Cartel password in the environment settings.</p>;
  }
  const { data: live } = await db()
    .from("reservations")
    .select("product_id, reference")
    .in("status", ["locking", "active", "receipt_uploaded"]);
  const reservedBy = new Map((live ?? []).map((r) => [r.product_id, r.reference]));

  return (
    <>
      <h1 className="font-heading text-2xl mb-2">Stock</h1>
      <p className="text-sm text-muted mb-5 max-w-2xl">
        Big Cartel can’t change stock levels from here, so an artwork is held by hiding it on the store. “Hidden”
        products can’t be bought or viewed by customers. Artworks with a live reservation are managed from the
        reservation instead.
      </p>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              {["Artwork", "Price", "Quantity", "Status", ""].map((h) => (
                <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const ref = reservedBy.get(p.id);
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
                  <td className="px-3 py-2.5">
                    <Badge value={p.status === "active" ? "active" : p.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {ref ? (
                      <span className="text-xs text-muted">Reserved ({ref})</span>
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
