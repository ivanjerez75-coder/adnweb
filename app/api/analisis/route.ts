import { createProdHandlers } from "@/lib/server/analyses/handlers-prod";

export const maxDuration = 300;

export async function POST(req: Request) {
  return createProdHandlers().crear(req);
}
