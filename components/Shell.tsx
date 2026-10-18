import type { ReactNode } from "react";

export function Logo() {
  return (
    <div className="text-center leading-tight text-ink">
      <div className="text-[15px] tracking-[0.4em] pl-[0.4em]">NAOMI KATZ</div>
      <div className="text-[11px] tracking-[0.5em] pl-[0.5em] mt-1">ART</div>
    </div>
  );
}

/** Mobile-first centered card with the brand header. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1 w-full max-w-md mx-auto px-4 py-6">
      <div className="rounded-2xl border border-line bg-card px-5 py-6 shadow-sm">
        <Logo />
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export function ArtworkHeader({ name, image }: { name?: string | null; image?: string | null }) {
  if (!name) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-white/60 p-2.5 mb-5">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={name} className="h-16 w-16 rounded-lg object-cover" />
      ) : null}
      <div className="font-medium">{name}</div>
    </div>
  );
}
