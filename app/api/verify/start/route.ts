import { clientIp, startVerification } from "@/lib/verification";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await startVerification(body, clientIp(request.headers));
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ verificationId: result.verificationId });
}
