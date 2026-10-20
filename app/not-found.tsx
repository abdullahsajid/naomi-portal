import { Shell } from "@/components/Shell";

export default function NotFound() {
  return (
    <Shell>
      <h1 className="font-heading text-3xl text-center leading-tight">Page not found</h1>
      <p className="mt-4 text-center text-muted">
        We couldn&apos;t find that page. If you were reserving an artwork, please go back to the store and try again.
      </p>
    </Shell>
  );
}
