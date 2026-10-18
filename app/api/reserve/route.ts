import { reserve, validateReserve } from "@/lib/reservations";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const v = validateReserve(body);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
  const result = await reserve(v.value);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ id: result.id, reference: result.reference });
}
