import { Shell } from "./Shell";

const COPY = {
  reserved: {
    title: "This artwork is currently reserved",
    body: "Someone else is completing a bank transfer for this artwork right now. If they don't finish in time it becomes available again, so please check back in a little while.",
  },
  "not-offered": {
    title: "Bank transfer isn't available for this artwork",
    body: "Please purchase this artwork through the store checkout.",
  },
  "not-found": {
    title: "We couldn't find that artwork",
    body: "Please go back to the store and try again.",
  },
} as const;

export function Unavailable({ reason }: { reason: keyof typeof COPY }) {
  const c = COPY[reason];
  return (
    <Shell>
      <h1 className="font-heading text-3xl text-center leading-tight">{c.title}</h1>
      <p className="mt-4 text-center text-muted">{c.body}</p>
      <a
        href={`https://${process.env.BIGCARTEL_SUBDOMAIN}.bigcartel.com`}
        className="mt-6 flex items-center justify-center rounded-lg bg-ink text-white py-3.5 font-semibold"
      >
        Back to the store
      </a>
    </Shell>
  );
}
