/**
 * Route-level tests for POST /api/analyze. The handler is invoked directly with
 * a `Request`; the upstream Gemini call is a stubbed `fetch`. No key, no network.
 *
 * Each test uses a unique client IP because the rate limiter's window is
 * module-level state shared across the suite.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/analyze/route";
import { GEMINI_MODEL, MAX_INPUT_CHARS } from "@/lib/config";
import type { AnalyzeResponse } from "@/lib/types";

const VALID_TEXT =
  "Acme Cloud reported Q3 revenue of $4.2 billion, up 27% year over year.";
const KEY = "AIzaTest-not-a-real-key";

let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `192.0.2.${ipCounter}`;
}

/** Build a request for the route under test. */
function makeRequest(
  body: unknown,
  opts: { key?: string | null; ip?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-forwarded-for": opts.ip ?? freshIp(),
  };
  if (opts.key !== null) headers["X-Gemini-Key"] = opts.key ?? KEY;

  return new Request("http://localhost:3003/api/analyze", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** A well-formed generateContent payload wrapping `text`. */
function geminiOk(text: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        { finishReason: "STOP", content: { parts: [{ text }] } },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * A fetch mock that mints a FRESH Response per call. A Response body can only be
 * read once, so a shared instance would make every retry look like an API error.
 */
function fetchAlways(makeResponse: () => Response) {
  return vi.fn(async () => makeResponse());
}

const MODEL_JSON = JSON.stringify({
  summary: "Acme beat estimates. Shares rose.",
  entities: { companies: ["Acme Cloud"], people: [], places: [] },
  metrics: [{ label: "Revenue", value: "$4.2B", change: "+27%" }],
  sentiment: {
    label: "Positive",
    confidence: "High",
    confidence_score: 92,
    reasoning: "Broad beats.",
  },
  topics: ["Earnings"],
});

let savedEnvKey: string | undefined;

beforeEach(() => {
  savedEnvKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedEnvKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedEnvKey;
});

describe("POST /api/analyze — success", () => {
  it("returns a normalized result, the model id and a duration", async () => {
    vi.stubGlobal("fetch", fetchAlways(() => geminiOk(MODEL_JSON)));

    const res = await POST(makeRequest({ text: VALID_TEXT }));
    const body = (await res.json()) as AnalyzeResponse;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("expected ok");
    expect(body.model).toBe(GEMINI_MODEL);
    expect(typeof body.durationMs).toBe("number");
    expect(body.result.sentiment.label).toBe("Positive");
    expect(body.result.metrics[0]).toEqual({
      label: "Revenue",
      value: "$4.2B",
      change: "+27%",
    });
  });

  it("sends the key in the x-goog-api-key header, never the URL or body", async () => {
    const fetchMock = fetchAlways(() => geminiOk(MODEL_JSON));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest({ text: VALID_TEXT }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/models/${GEMINI_MODEL}:generateContent`);
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    expect(String(init.body)).not.toContain(KEY);
  });

  it("recovers JSON wrapped in markdown fences", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(() => geminiOk("```json\n" + MODEL_JSON + "\n```")),
    );

    const res = await POST(makeRequest({ text: VALID_TEXT }));
    expect(res.status).toBe(200);
  });

  it("falls back to the server env key when no header is sent", async () => {
    process.env.GEMINI_API_KEY = "env-fallback-key";
    const fetchMock = fetchAlways(() => geminiOk(MODEL_JSON));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ text: VALID_TEXT }, { key: null }));
    expect(res.status).toBe(200);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "env-fallback-key",
    );
  });
});

describe("POST /api/analyze — key errors", () => {
  it("401 missing_key when no key is supplied anywhere", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ text: VALID_TEXT }, { key: null }));
    const body = (await res.json()) as AnalyzeResponse;

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("missing_key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 invalid_key on a 400 API_KEY_INVALID", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(
        () =>
          new Response(
            JSON.stringify({
              error: { status: "INVALID_ARGUMENT", message: "API_KEY_INVALID" },
            }),
            { status: 400 },
          ),
      ),
    );

    const res = await POST(makeRequest({ text: VALID_TEXT }));
    const body = (await res.json()) as AnalyzeResponse;

    expect(res.status).toBe(401);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("invalid_key");
  });

  it("401 invalid_key on a 403", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(() => new Response("forbidden", { status: 403 })),
    );

    const res = await POST(makeRequest({ text: VALID_TEXT }));
    const body = (await res.json()) as AnalyzeResponse;

    expect(res.status).toBe(401);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("invalid_key");
  });

  it("does not retry an auth failure", async () => {
    const fetchMock = fetchAlways(() => new Response("forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest({ text: VALID_TEXT }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/analyze — transient handling", () => {
  it("retries once after a 429 and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(geminiOk(MODEL_JSON));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ text: VALID_TEXT }));
    const body = (await res.json()) as AnalyzeResponse;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("502 api_error when a 503 persists through the retry", async () => {
    const fetchMock = fetchAlways(() => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ text: VALID_TEXT }));
    const body = (await res.json()) as AnalyzeResponse;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("api_error");
  });

  it("retries a network failure once", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(geminiOk(MODEL_JSON));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ text: VALID_TEXT }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/analyze — model output errors", () => {
  it("502 malformed_json after a full re-attempt also returns garbage", async () => {
    const fetchMock = fetchAlways(() => geminiOk("not json at all"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ text: VALID_TEXT }));
    const body = (await res.json()) as AnalyzeResponse;

    // One fresh model call per attempt: the route retries the whole call once.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("malformed_json");
  });

  it("recovers when the malformed re-attempt returns valid JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiOk("sorry, no JSON here"))
      .mockResolvedValueOnce(geminiOk(MODEL_JSON));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ text: VALID_TEXT }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("502 empty_response on a SAFETY finish reason", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(
        () =>
          new Response(
            JSON.stringify({
              candidates: [{ finishReason: "SAFETY", content: { parts: [] } }],
            }),
            { status: 200 },
          ),
      ),
    );

    const res = await POST(makeRequest({ text: VALID_TEXT }));
    const body = (await res.json()) as AnalyzeResponse;

    expect(res.status).toBe(502);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("empty_response");
    expect(body.error.message).toMatch(/declined/i);
  });

  it("502 empty_response when there are no candidates at all", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(() => new Response(JSON.stringify({ candidates: [] }), { status: 200 })),
    );

    const res = await POST(makeRequest({ text: VALID_TEXT }));
    const body = (await res.json()) as AnalyzeResponse;

    expect(res.status).toBe(502);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("empty_response");
  });
});

describe("POST /api/analyze — input guards", () => {
  it("400 input_too_long past the 20k cap", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ text: "a".repeat(MAX_INPUT_CHARS + 1) }));
    const body = (await res.json()) as AnalyzeResponse;

    expect(res.status).toBe(400);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("input_too_long");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 input_too_long on a body over 64KB", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ text: "a".repeat(70_000) }));
    const body = (await res.json()) as AnalyzeResponse;

    expect(res.status).toBe(400);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("input_too_long");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 input_too_short below the minimum", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const res = await POST(makeRequest({ text: "too short" }));
    const body = (await res.json()) as AnalyzeResponse;

    expect(res.status).toBe(400);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("input_too_short");
  });

  it("400 input_too_short for a missing, non-string or unparseable body", async () => {
    vi.stubGlobal("fetch", vi.fn());

    for (const body of [{}, { text: 42 }, "{not json"]) {
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const parsed = (await res.json()) as AnalyzeResponse;
      if (parsed.ok) throw new Error("expected failure");
      expect(parsed.error.code).toBe("input_too_short");
    }
  });

  it("counts the trimmed length, not the padding", async () => {
    vi.stubGlobal("fetch", fetchAlways(() => geminiOk(MODEL_JSON)));

    const res = await POST(makeRequest({ text: `   ${VALID_TEXT}   ` }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/analyze — rate limiting", () => {
  it("429 rate_limited on the 11th request from one IP", async () => {
    vi.stubGlobal("fetch", fetchAlways(() => geminiOk(MODEL_JSON)));
    const ip = freshIp();

    for (let i = 0; i < 10; i++) {
      const ok = await POST(makeRequest({ text: VALID_TEXT }, { ip }));
      expect(ok.status).toBe(200);
    }

    const res = await POST(makeRequest({ text: VALID_TEXT }, { ip }));
    const body = (await res.json()) as AnalyzeResponse;

    expect(res.status).toBe(429);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("rate_limited");
  });
});
