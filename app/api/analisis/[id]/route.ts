import { createProdHandlers } from "@/lib/server/analyses/handlers-prod";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return createProdHandlers().estado(id);
}
