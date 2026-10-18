import Link from "next/link";
import { ArtworkHeader, Shell } from "@/components/Shell";
import { Unavailable } from "@/components/Unavailable";
import { aud, getAvailability } from "@/lib/availability";

export const dynamic = "force-dynamic";

const STEPS = [
  "Enter your details to reserve your artwork for 15 minutes.",
  "Transfer the payment using the bank details provided.",
  "Upload your payment receipt within 15 minutes.",
];

export default async function ReservePage({ params }: PageProps<"/reserve/[productId]">) {
  const { productId } = await params;
  const a = await getAvailability(productId);
  if (!a.available) return <Unavailable reason={a.reason} />;

  const { product, discount } = a;
  return (
    <Shell>
      <h1 className="font-heading text-[2rem] leading-tight text-center">
        Official Naomi Katz Art Payment Portal
      </h1>
      <p className="mt-3 text-center text-muted">Purchase directly from Naomi Katz Art.</p>

      <div className="mt-5">
        <ArtworkHeader name={product.name} image={product.imageUrl} />
      </div>

      <div className="rounded-xl bg-accent-soft px-5 py-5 flex items-center gap-4 text-accent">
        <TagIcon />
        <div className="text-xl font-semibold leading-snug">
          {discount > 0 ? `Buy by bank transfer and save ${aud(discount).replace(".00", "")}` : "Buy by bank transfer"}
          <div className="mt-1 text-sm font-normal text-accent/80">
            {discount > 0
              ? `${aud(Math.max(0, product.price - discount))} instead of ${aud(product.price)}`
              : aud(product.price)}
          </div>
        </div>
      </div>

      <h2 className="font-heading text-2xl mt-7 mb-4">How it works</h2>
      <ol className="space-y-4">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-4">
            <span className="shrink-0 grid place-items-center h-10 w-10 rounded-full bg-accent-soft text-accent font-semibold">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      <hr className="my-6 border-line" />
      <p className="flex items-center gap-3 text-center justify-center">
        <LockIcon /> Your artwork will remain reserved while we confirm payment.
      </p>

      <div className="mt-6 space-y-3">
        <Link
          href={`/reserve/${productId}/details`}
          className="flex items-center justify-center gap-2 rounded-lg bg-ink text-white py-3.5 font-semibold"
        >
          Continue <span aria-hidden>→</span>
        </Link>
        <a
          href={product.url ?? `https://${process.env.BIGCARTEL_SUBDOMAIN}.bigcartel.com`}
          className="flex items-center justify-center rounded-lg border border-accent/30 py-3.5 font-semibold"
        >
          Cancel
        </a>
      </div>
    </Shell>
  );
}

function TagIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M3 12V4h8l10 10-8 8L3 12Z" strokeLinejoin="round" />
      <circle cx="7.5" cy="8.5" r="1.3" fill="currentColor" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#b3123f" strokeWidth="1.6" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
