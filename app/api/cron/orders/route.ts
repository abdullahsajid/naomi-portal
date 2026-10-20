import { env } from "@/lib/env";
import { reportBigCartelProblem } from "@/lib/health";
import { checkOrders } from "@/lib/orders";

export async function POST(request: Request) {
  if (request.headers.get("x-cron-secret") !== env("CRON_SECRET")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await checkOrders());
  } catch (e) {
    console.error("[cron/orders] failed", e);
    await reportBigCartelProblem(e); // this job doubles as the Big Cartel health check
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
