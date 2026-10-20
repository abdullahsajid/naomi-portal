import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, btnDark, btnLight, fmtDate, input, money, timeLeft } from "@/components/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/supabase";
import { confirmStockUpdated, markSold, releaseReservation, saveNotes } from "../../actions";

export default async function ReservationDetail({ params }: PageProps<"/admin/reservations/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: r } = await db().from("reservations").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();

  let receiptUrl: string | null = null;
  if (r.receipt_path) {
    const { data } = await db().storage.from("receipts").createSignedUrl(r.receipt_path, 300);
    receiptUrl = data?.signedUrl ?? null;
  }
  const isPdf = r.receipt_path?.endsWith(".pdf");
  const live = ["active", "receipt_uploaded"].includes(r.status);

  const rows: [string, React.ReactNode][] = [
    ["Reference", r.reference],
    ["Status", <Badge key="s" value={r.status} />],
    ["Time left", timeLeft(r.expires_at, r.status)],
    ["Artwork", `${r.product_name ?? "–"} (Big Cartel #${r.product_id})`],
    ["Amount", money(r.amount)],
    ["Customer", r.customer_name],
    ["Email", <a key="e" className="text-accent-strong underline" href={`mailto:${r.customer_email}`}>{r.customer_email}</a>],
    ["Mobile", r.phone ?? "–"],
    ["Shipping address", <span key="a" className="whitespace-pre-line">{r.shipping_address}</span>],
    ["Created", fmtDate(r.created_at)],
  ];

  return (
    <>
      <Link href="/admin" className="text-sm text-muted hover:text-accent">
        ← All reservations
      </Link>
      <h1 className="font-heading text-2xl mt-2 mb-5">{r.reference}</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-card p-4">
          <dl className="space-y-2.5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          {live && (
            <div className="mt-5 flex flex-wrap gap-3">
              <form action={markSold}>
                <input type="hidden" name="id" value={r.id} />
                <button className={btnDark}>Mark as sold</button>
              </form>
              <form action={releaseReservation}>
                <input type="hidden" name="id" value={r.id} />
                <button className={btnLight}>Release</button>
              </form>
            </div>
          )}
          {live && (
            <p className="mt-3 text-xs text-muted">
              Mark as sold counts this unit as sold. Release gives the unit back so someone else can reserve it.
            </p>
          )}
          {r.status === "sold" && r.stock_synced === false && (
            <div className="mt-5 rounded-xl bg-accent-soft p-4 text-sm leading-relaxed">
              <p className="font-semibold">One more step: update the stock in Big Cartel</p>
              <p className="mt-1">
                Lower the stock of <strong>{r.product_name}</strong> by 1 in Big Cartel (Products, open the artwork,
                Stock). Big Cartel can&rsquo;t be changed from here. Then press the button, so the portal stops
                counting this sale. Until you do, this unit stays unavailable.
              </p>
              <form action={confirmStockUpdated} className="mt-3">
                <input type="hidden" name="id" value={r.id} />
                <button className={btnDark}>I&rsquo;ve updated the stock</button>
              </form>
            </div>
          )}

          <form action={saveNotes} className="mt-6">
            <input type="hidden" name="id" value={r.id} />
            <label className="block text-sm font-semibold mb-1.5" htmlFor="notes">
              Admin notes
            </label>
            <textarea id="notes" name="notes" rows={3} defaultValue={r.admin_notes ?? ""} className={input} />
            <button className={`${btnLight} mt-2`}>Save notes</button>
          </form>
        </section>

        <section className="rounded-xl border border-line bg-card p-4">
          <h2 className="font-semibold mb-3">Payment receipt</h2>
          {!receiptUrl ? (
            <p className="text-sm text-muted">No receipt uploaded yet.</p>
          ) : isPdf ? (
            <>
              <iframe src={receiptUrl} className="w-full h-[480px] rounded-lg border border-line" title="Receipt" />
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-sm text-accent-strong underline">
                Open PDF in a new tab
              </a>
            </>
          ) : (
            <a href={receiptUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={receiptUrl} alt="Payment receipt" className="w-full rounded-lg border border-line" />
            </a>
          )}
          {receiptUrl && <p className="mt-2 text-xs text-muted">Link expires in 5 minutes. Reload the page for a new one.</p>}
        </section>
      </div>
    </>
  );
}
