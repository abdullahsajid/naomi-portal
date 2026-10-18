import Link from "next/link";
import { Badge, fmtDate, money, timeLeft } from "@/components/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/supabase";

const FILTERS = ["all", "active", "receipt_uploaded", "sold", "expired", "released", "failed"] as const;

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const { status } = await searchParams;
  const filter = typeof status === "string" && FILTERS.includes(status as never) ? status : "all";

  let q = db().from("reservations").select("*").order("created_at", { ascending: false }).limit(200);
  if (filter !== "all") q = q.eq("status", filter);
  const { data: rows } = await q;

  return (
    <>
      <h1 className="font-heading text-2xl mb-4">Reservations</h1>
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/admin" : `/admin?status=${f}`}
            className={`rounded-full px-3 py-1 text-sm border ${f === filter ? "bg-ink text-white border-ink" : "border-line bg-white"}`}
          >
            {f.replace("_", " ")}
          </Link>
        ))}
      </div>

      {!rows?.length ? (
        <p className="text-muted">No reservations{filter !== "all" ? ` with status “${filter.replace("_", " ")}”` : ""}.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                {["Reference", "Artwork", "Customer", "Amount", "Status", "Time left", "Created"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-accent-soft/30">
                  <td className="px-3 py-2.5 font-semibold whitespace-nowrap">
                    <Link href={`/admin/reservations/${r.id}`} className="text-accent underline">
                      {r.reference}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{r.product_name ?? "–"}</td>
                  <td className="px-3 py-2.5">
                    {r.customer_name}
                    <div className="text-xs text-muted">{r.customer_email}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{money(r.amount)}</td>
                  <td className="px-3 py-2.5">
                    <Badge value={r.status} />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{timeLeft(r.expires_at, r.status)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted">{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
