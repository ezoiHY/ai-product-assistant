import { connection } from "next/server";
import { envConfig } from "@/lib/ai/config";

// Whether the server itself has a key (visitors can still bring their own).
export async function GET() {
  await connection(); // evaluate env at request time, not at build time
  const env = envConfig();
  return Response.json({ ai: env.keySource !== "none", model: env.model });
}
