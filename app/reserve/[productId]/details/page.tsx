import { DetailsForm } from "@/components/DetailsForm";
import { ArtworkHeader, Shell } from "@/components/Shell";
import { Unavailable } from "@/components/Unavailable";
import { getAvailability } from "@/lib/availability";

export const dynamic = "force-dynamic";

export default async function DetailsPage({ params }: PageProps<"/reserve/[productId]/details">) {
  const { productId } = await params;
  const a = await getAvailability(productId);
  if (!a.available) return <Unavailable reason={a.reason} />;

  return (
    <Shell>
      <h1 className="font-heading text-[2rem] leading-tight text-center">Reserve your artwork</h1>
      <p className="mt-3 text-center text-muted">Enter your details, then confirm your email to begin your 15-minute reservation.</p>

      <div className="mt-5">
        <ArtworkHeader name={a.product.name} image={a.product.imageUrl} />
      </div>

      <div className="rounded-xl bg-accent-soft px-5 py-4 flex gap-4 text-sm leading-relaxed">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#8a1c9b" strokeWidth="1.6" className="shrink-0" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" />
        </svg>
        <p>
          <strong className="text-accent-strong">Important:</strong> Once you verify your email you have 15 minutes to
          initiate payment and upload your receipt. Your payment does not need to arrive within that time.
        </p>
      </div>
      <p className="mt-4">If no receipt is uploaded, your reservation will automatically expire.</p>

      <DetailsForm productId={productId} />
    </Shell>
  );
}
