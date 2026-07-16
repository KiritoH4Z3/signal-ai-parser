/**
 * POST /api/validate-key — a cheap "is this key real?" check powering the
 * ApiKeyPanel's green/red LED.
 *
 * Lists a single model (`GET /v1beta/models?pageSize=1`) rather than spending a
 * generation. Key comes from the `X-Gemini-Key` header and is never logged or
 * persisted.
 */

import { SignalError, errorResponse } from "@/lib/errors";
import { validateGeminiKey } from "@/lib/gemini";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ValidateKeyResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: ValidateKeyResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(req: Request): Promise<Response> {
  try {
    if (!checkRateLimit(clientIp(req))) {
      throw new SignalError("rate_limited");
    }

    const key = req.headers.get("x-gemini-key")?.trim();
    if (!key) {
      throw new SignalError("missing_key");
    }

    await validateGeminiKey(key);
    return json({ ok: true }, 200);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return json(body, status);
  }
}
