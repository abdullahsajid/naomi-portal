import { confirmVerification } from "@/lib/verification";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await confirmVerification(String(body?.verificationId ?? ""), String(body?.code ?? "").trim());
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ id: result.id, reference: result.reference });
}
