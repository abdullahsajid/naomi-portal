import { notFound } from "next/navigation";
import { ReservationView, type View } from "@/components/ReservationView";
import { getReservationView } from "@/lib/reservations";

export const dynamic = "force-dynamic";

export default async function ReservationPage({ params }: PageProps<"/reservation/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const view = await getReservationView(id);
  if (!view) notFound();
  return <ReservationView initial={view as unknown as View} />;
}
