import Link from "next/link";
import { fmtDate } from "@/components/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/supabase";

export default async function AlertsPage() {
  await requireAdmin();
  const { data: alerts } = await db()
    .from("alerts")
    .select("*, reservations(reference)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <h1 className="font-heading text-2xl mb-2">Alerts</h1>
      <p className="text-sm text-muted mb-5 max-w-2xl">
        A card order came through the Big Cartel checkout for an artwork that was reserved by bank transfer. Decide
        which payment to honour and refund the other.
      </p>
      {!alerts?.length ? (
        <p className="text-muted">No alerts.</p>
      ) : (
        <ul className="space-y-3">
          {alerts.map((a: any) => (
            <li key={a.id} className="rounded-xl border border-line bg-card p-4 text-sm">
              <div className="text-xs text-muted mb-1">{fmtDate(a.created_at)}</div>
              <p>{a.message}</p>
              {a.reservation_id && (
                <Link href={`/admin/reservations/${a.reservation_id}`} className="mt-2 inline-block text-accent underline">
                  View reservation {a.reservations?.reference}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
