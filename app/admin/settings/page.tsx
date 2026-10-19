import { btnDark, input } from "@/components/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { getSettings } from "@/lib/availability";
import { listProducts, type BcProduct } from "@/lib/bigcartel";
import { saveSettings } from "../actions";

function Field({ name, label, value }: { name: string; label: string; value?: string | null }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-semibold mb-1.5">{label}</label>
      <input id={name} name={name} defaultValue={value ?? ""} className={input} />
    </div>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await requireAdmin();
  const { saved } = await searchParams;
  const s = (await getSettings()) ?? {};
  let products: BcProduct[] = [];
  try {
    products = await listProducts();
  } catch {}
  const enabled: string[] = s.enabled_product_ids ?? [];

  return (
    <>
      <h1 className="font-heading text-2xl mb-5">Settings</h1>
      {saved && <p className="mb-4 rounded-lg bg-green-100 text-green-800 px-4 py-2.5 text-sm">Settings saved.</p>}
      <form action={saveSettings} className="max-w-2xl space-y-8">
        <section className="space-y-4">
          <h2 className="font-semibold">Bank details (shown to customers after they reserve)</h2>
          <Field name="bank_name" label="Bank name" value={s.bank_name} />
          <Field name="account_name" label="Account name" value={s.account_name} />
          <Field name="account_number" label="Account number" value={s.account_number} />
          <Field name="bsb" label="BSB (optional)" value={s.bsb} />
          <Field name="swift_code" label="SWIFT code" value={s.swift_code} />
          <div>
            <label htmlFor="payment_instructions" className="block text-sm font-semibold mb-1.5">
              Extra payment instructions (optional)
            </label>
            <textarea id="payment_instructions" name="payment_instructions" rows={3} defaultValue={s.payment_instructions ?? ""} className={input} />
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Bank transfer discount</h2>
          <label htmlFor="discount_amount" className="block text-sm mb-1.5">Amount off the store price (AUD)</label>
          <input id="discount_amount" name="discount_amount" type="number" min="0" step="1" defaultValue={s.discount_amount ?? 300} className={`${input} max-w-[160px]`} />
        </section>

        <section>
          <h2 className="font-semibold mb-1">Artworks that offer bank transfer</h2>
          <p className="text-sm text-muted mb-3">Leave everything unticked to offer it on all artworks.</p>
          <div className="space-y-2">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-3 text-sm">
                <input type="checkbox" name="enabled" value={p.id} defaultChecked={enabled.includes(p.id)} className="h-4 w-4 accent-[#d64fe7]" />
                {p.name} <span className="text-muted">#{p.id}</span>
              </label>
            ))}
            {!products.length && <p className="text-sm text-muted">Couldn’t load products from Big Cartel.</p>}
          </div>
        </section>

        <button className={btnDark}>Save settings</button>
      </form>
    </>
  );
}
