import { NextResponse } from "next/server";

/**
 * Liveness probe. Deliberately does not touch the database — this answers
 * "is the Next.js process up", which is what a load balancer needs to know.
 * Backend reachability is covered by scripts/smoke.mjs.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
