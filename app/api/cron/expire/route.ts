import { env } from "@/lib/env";
import { expireReservations } from "@/lib/reservations";

export async function POST(request: Request) {
  if (request.headers.get("x-cron-secret") !== env("CRON_SECRET")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await expireReservations());
}
