import { submitReceipt } from "@/lib/receipts";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const result = await submitReceipt(id, file instanceof File ? file : null);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true });
}
