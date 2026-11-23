import { connection } from "next/server";
import { MODEL, aiConfigured } from "@/lib/ai/client";

export async function GET() {
  await connection(); // evaluate env at request time, not at build time
  return Response.json({ ai: aiConfigured(), model: MODEL });
}
