/**
 * Route-level tests for POST /api/ask (both ops). The handler is invoked
 * directly with a `Request`; the upstream Gemini call is a stubbed `fetch`. No
 * key, no network.
 *
 * Each test uses a unique client IP because the rate limiter's window is
 * module-level state shared across the suite.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/ask/route";
import {
  EMBED_DIM,
  GEMINI_EMBED_MODEL,
  GEMINI_MODEL,
  MAX_ASK_CONTEXT,
  MAX_EMBED_BATCH,
  MAX_EMBED_CHARS,
  MAX_QUESTION_CHARS,
} from "@/lib/config";
import type { AskResponse, BriefingContext } from "@/lib/types";

const KEY = "AIzaTest-not-a-real-key";
const QUESTION = "Which briefings mention revenue growth?";

let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  // A different documentation range from api-analyze.test.ts, so the two files
  // can never collide on the shared limiter if they ever share a worker.
  return `198.51.100.${ipCounter}`;
}

function makeRequest(
  body: unknown,
  opts: { key?: string | null; ip?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-forwarded-for": opts.ip ?? freshIp(),
  };
  if (opts.key !== null) headers["X-Gemini-Key"] = opts.key ?? KEY;

  return new Request("http://localhost:3003/api/ask", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const CONTEXT: BriefingContext[] = [
  {
    id: "lib-1",
    summary: "Acme Cloud beat estimates with revenue up 27%.",
    topics: ["Earnings"],
    sentiment: "Positive",
  },
  {
    id: "lib-2",
    summary: "Globex announced a restructuring.",
    topics: ["Restructuring"],
    sentiment: "Negative",
  },
];

/** A batchEmbedContents payload with `count` vectors of EMBED_DIM floats. */
function embedOk(count: number, dim: number = EMBED_DIM): Response {
  return new Response(
    JSON.stringify({
      embeddings: Array.from({ length: count }, (_, i) => ({
        values: Array.from({ length: dim }, () => 0.01 * (i + 1)),
      })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** A well-formed generateContent payload wrapping `text`. */
function geminiOk(text: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
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

const ANSWER_JSON = JSON.stringify({
  answer: "Acme Cloud's revenue rose 27%.",
  citations: ["lib-1"],
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

describe("POST /api/ask — op:embed", () => {
  it("returns one vector per text, in order, with the embedding model id", async () => {
    vi.stubGlobal("fetch", fetchAlways(() => embedOk(2)));

    const res = await POST(makeRequest({ op: "embed", texts: ["first", "second"] }));
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(200);
    if (!body.ok || body.op !== "embed") throw new Error("expected an embed success");
    expect(body.model).toBe(GEMINI_EMBED_MODEL);
    expect(body.vectors).toHaveLength(2);
    expect(body.vectors[0]).toHaveLength(EMBED_DIM);
    expect(body.vectors[0]![0]).toBeCloseTo(0.01, 10);
    expect(body.vectors[1]![0]).toBeCloseTo(0.02, 10);
  });

  it("calls batchEmbedContents with the pinned model, dimension and the key in the header", async () => {
    const fetchMock = fetchAlways(() => embedOk(1));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest({ op: "embed", texts: ["a briefing summary"] }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/models/${GEMINI_EMBED_MODEL}:batchEmbedContents`);
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    expect(String(init.body)).not.toContain(KEY);

    const sent = JSON.parse(String(init.body));
    expect(sent.requests).toHaveLength(1);
    expect(sent.requests[0].outputDimensionality).toBe(EMBED_DIM);
    expect(sent.requests[0].content.parts[0].text).toBe("a briefing summary");
  });

  it("trims texts before sending them", async () => {
    const fetchMock = fetchAlways(() => embedOk(1));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest({ op: "embed", texts: ["  padded  "] }));

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).requests[0].content.parts[0].text).toBe("padded");
  });
});

describe("POST /api/ask — op:answer", () => {
  it("returns a grounded answer with citations, the chat model id and a duration", async () => {
    vi.stubGlobal("fetch", fetchAlways(() => geminiOk(ANSWER_JSON)));

    const res = await POST(
      makeRequest({ op: "answer", question: QUESTION, context: CONTEXT }),
    );
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(200);
    if (!body.ok || body.op !== "answer") throw new Error("expected an answer success");
    expect(body.answer).toBe("Acme Cloud's revenue rose 27%.");
    expect(body.citations).toEqual(["lib-1"]);
    expect(body.model).toBe(GEMINI_MODEL);
    expect(typeof body.durationMs).toBe("number");
  });

  it("puts the briefings and the question in the prompt, and nothing else", async () => {
    const fetchMock = fetchAlways(() => geminiOk(ANSWER_JSON));
    vi.stubGlobal("fetch", fetchMock);

    await POST(
      makeRequest({
        op: "answer",
        question: QUESTION,
        // A client sending extra LibraryEntry fields must not leak them upstream.
        context: [{ ...CONTEXT[0], vector: [1, 2, 3], preview: "SECRET SOURCE TEXT" }],
      }),
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const prompt = JSON.parse(String(init.body)).contents[0].parts[0].text as string;

    expect(prompt).toContain("lib-1");
    expect(prompt).toContain("Acme Cloud beat estimates");
    expect(prompt).toContain(QUESTION);
    expect(prompt).not.toContain("SECRET SOURCE TEXT");
    // The grounding contract itself.
    expect(prompt).toMatch(/ONLY from the briefings/i);
  });

  it("drops citations naming a briefing that was never supplied", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(() =>
        geminiOk(
          JSON.stringify({
            answer: "Something about both.",
            citations: ["lib-1", "lib-99", "not-an-id"],
          }),
        ),
      ),
    );

    const res = await POST(
      makeRequest({ op: "answer", question: QUESTION, context: CONTEXT }),
    );
    const body = (await res.json()) as AskResponse;

    if (!body.ok || body.op !== "answer") throw new Error("expected an answer success");
    // A hallucinated source must never reach the UI as a link.
    expect(body.citations).toEqual(["lib-1"]);
  });

  it("de-duplicates repeated citations", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(() =>
        geminiOk(JSON.stringify({ answer: "Twice.", citations: ["lib-1", "lib-1"] })),
      ),
    );

    const res = await POST(
      makeRequest({ op: "answer", question: QUESTION, context: CONTEXT }),
    );
    const body = (await res.json()) as AskResponse;

    if (!body.ok || body.op !== "answer") throw new Error("expected an answer success");
    expect(body.citations).toEqual(["lib-1"]);
  });

  it("passes through an honest 'not covered' answer with no citations", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(() =>
        geminiOk(
          JSON.stringify({
            answer: "The saved briefings don't cover that.",
            citations: [],
          }),
        ),
      ),
    );

    const res = await POST(
      makeRequest({ op: "answer", question: "What is the weather?", context: CONTEXT }),
    );
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(200);
    if (!body.ok || body.op !== "answer") throw new Error("expected an answer success");
    expect(body.citations).toEqual([]);
    expect(body.answer).toMatch(/don't cover/i);
  });

  it("recovers an answer wrapped in markdown fences", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(() => geminiOk("```json\n" + ANSWER_JSON + "\n```")),
    );

    const res = await POST(
      makeRequest({ op: "answer", question: QUESTION, context: CONTEXT }),
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/ask — key errors", () => {
  it("401 missing_key when no key is supplied anywhere", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ op: "embed", texts: ["x"] }, { key: null }));
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(401);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("missing_key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 missing_key for op:answer too", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const res = await POST(
      makeRequest({ op: "answer", question: QUESTION, context: CONTEXT }, { key: null }),
    );
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(401);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("missing_key");
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

    const res = await POST(makeRequest({ op: "embed", texts: ["x"] }));
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(401);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("invalid_key");
  });

  it("401 invalid_key on a 403, without retrying", async () => {
    const fetchMock = fetchAlways(() => new Response("forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      makeRequest({ op: "answer", question: QUESTION, context: CONTEXT }),
    );
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(401);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("invalid_key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the server env key when no header is sent", async () => {
    process.env.GEMINI_API_KEY = "env-fallback-key";
    const fetchMock = fetchAlways(() => embedOk(1));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ op: "embed", texts: ["x"] }, { key: null }));
    expect(res.status).toBe(200);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "env-fallback-key",
    );
  });
});

describe("POST /api/ask — transient handling", () => {
  it("retries an embed once after a 429 and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(embedOk(1));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ op: "embed", texts: ["x"] }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("502 api_error when a 503 persists through the retry", async () => {
    const fetchMock = fetchAlways(() => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ op: "embed", texts: ["x"] }));
    const body = (await res.json()) as AskResponse;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("api_error");
  });
});

describe("POST /api/ask — malformed model output", () => {
  it("502 malformed_json when the answer is not JSON", async () => {
    const fetchMock = fetchAlways(() => geminiOk("I think probably Acme?"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      makeRequest({ op: "answer", question: QUESTION, context: CONTEXT }),
    );
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(502);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("malformed_json");
    // Unlike /api/analyze, a bad answer is not re-attempted: the visitor can
    // simply ask again, and a silent second call doubles their cost.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("502 malformed_json when valid JSON carries no answer", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(() => geminiOk(JSON.stringify({ citations: ["lib-1"] }))),
    );

    const res = await POST(
      makeRequest({ op: "answer", question: QUESTION, context: CONTEXT }),
    );
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(502);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("malformed_json");
  });

  it("tolerates a missing citations field, treating it as no citations", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(() => geminiOk(JSON.stringify({ answer: "No sources named." }))),
    );

    const res = await POST(
      makeRequest({ op: "answer", question: QUESTION, context: CONTEXT }),
    );
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(200);
    if (!body.ok || body.op !== "answer") throw new Error("expected an answer success");
    expect(body.citations).toEqual([]);
  });

  it("502 empty_response when the embed call returns no embeddings", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(() => new Response(JSON.stringify({ embeddings: [] }), { status: 200 })),
    );

    const res = await POST(makeRequest({ op: "embed", texts: ["x"] }));
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(502);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("empty_response");
  });

  it("502 empty_response when the embed result count doesn't match the input", async () => {
    // Two texts in, one vector back — pairing them positionally would attach the
    // wrong vector to a briefing, forever.
    vi.stubGlobal("fetch", fetchAlways(() => embedOk(1)));

    const res = await POST(makeRequest({ op: "embed", texts: ["a", "b"] }));
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(502);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("empty_response");
  });

  it("502 malformed_json when a vector holds a non-number", async () => {
    vi.stubGlobal(
      "fetch",
      fetchAlways(
        () =>
          new Response(JSON.stringify({ embeddings: [{ values: [0.1, "nope", 0.3] }] }), {
            status: 200,
          }),
      ),
    );

    const res = await POST(makeRequest({ op: "embed", texts: ["x"] }));
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(502);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("malformed_json");
  });
});

describe("POST /api/ask — input guards", () => {
  it("400 input_too_short for an unknown or missing op", async () => {
    vi.stubGlobal("fetch", vi.fn());

    for (const body of [{}, { op: "delete-everything" }, "{not json", { op: 42 }]) {
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
      const parsed = (await res.json()) as AskResponse;
      if (parsed.ok) throw new Error("expected failure");
      expect(parsed.error.code).toBe("input_too_short");
    }
  });

  it("400 input_too_long past the embed batch cap", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      makeRequest({
        op: "embed",
        texts: Array.from({ length: MAX_EMBED_BATCH + 1 }, () => "text"),
      }),
    );
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(400);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("input_too_long");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 input_too_long for a single absurdly long text", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      makeRequest({ op: "embed", texts: ["a".repeat(MAX_EMBED_CHARS + 1)] }),
    );
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(400);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("input_too_long");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 input_too_long on a body over 64KB, before buffering it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ op: "embed", texts: ["a".repeat(70_000)] }));
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(400);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("input_too_long");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 input_too_short for empty, blank or non-string embed texts", async () => {
    vi.stubGlobal("fetch", vi.fn());

    for (const texts of [[], ["   "], [42], ["ok", null]]) {
      const res = await POST(makeRequest({ op: "embed", texts }));
      expect(res.status).toBe(400);
      const parsed = (await res.json()) as AskResponse;
      if (parsed.ok) throw new Error("expected failure");
      expect(parsed.error.code).toBe("input_too_short");
    }
  });

  it("400 input_too_short for a too-short or non-string question", async () => {
    vi.stubGlobal("fetch", vi.fn());

    for (const question of ["", "  ", "hi", 42]) {
      const res = await POST(makeRequest({ op: "answer", question, context: CONTEXT }));
      expect(res.status).toBe(400);
      const parsed = (await res.json()) as AskResponse;
      if (parsed.ok) throw new Error("expected failure");
      expect(parsed.error.code).toBe("input_too_short");
    }
  });

  it("accepts a short but real question", async () => {
    vi.stubGlobal("fetch", fetchAlways(() => geminiOk(ANSWER_JSON)));

    const res = await POST(
      makeRequest({ op: "answer", question: "Who is bullish?", context: CONTEXT }),
    );
    expect(res.status).toBe(200);
  });

  it("400 input_too_long past the question cap", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const res = await POST(
      makeRequest({
        op: "answer",
        question: "a".repeat(MAX_QUESTION_CHARS + 1),
        context: CONTEXT,
      }),
    );
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(400);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("input_too_long");
  });

  it("400 input_too_short when asking with no briefings — grounded means grounded", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest({ op: "answer", question: QUESTION, context: [] }));
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(400);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("input_too_short");
    expect(body.error.message).toMatch(/Library/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 input_too_long past the context cap", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const res = await POST(
      makeRequest({
        op: "answer",
        question: QUESTION,
        context: Array.from({ length: MAX_ASK_CONTEXT + 1 }, (_, i) => ({
          ...CONTEXT[0],
          id: `lib-${i}`,
        })),
      }),
    );
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(400);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("input_too_long");
  });

  it("400 input_too_short for a briefing with no id or no summary", async () => {
    vi.stubGlobal("fetch", vi.fn());

    for (const bad of [{ summary: "no id", topics: [] }, { id: "lib-1", topics: [] }, null]) {
      const res = await POST(
        makeRequest({ op: "answer", question: QUESTION, context: [bad] }),
      );
      expect(res.status).toBe(400);
      const parsed = (await res.json()) as AskResponse;
      if (parsed.ok) throw new Error("expected failure");
      expect(parsed.error.code).toBe("input_too_short");
    }
  });
});

describe("POST /api/ask — rate limiting", () => {
  it("429 rate_limited on the 11th request from one IP", async () => {
    vi.stubGlobal("fetch", fetchAlways(() => embedOk(1)));
    const ip = freshIp();

    for (let i = 0; i < 10; i++) {
      const ok = await POST(makeRequest({ op: "embed", texts: ["x"] }, { ip }));
      expect(ok.status).toBe(200);
    }

    const res = await POST(makeRequest({ op: "embed", texts: ["x"] }, { ip }));
    const body = (await res.json()) as AskResponse;

    expect(res.status).toBe(429);
    if (body.ok) throw new Error("expected failure");
    expect(body.error.code).toBe("rate_limited");
  });
});
