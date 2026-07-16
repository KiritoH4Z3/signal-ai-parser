/**
 * Typed error taxonomy — mirrors the legacy Python typed hierarchy
 * (utils/constants.py: SignalError / MissingKeyError / APICallError /
 * EmptyResponseError / MalformedJSONError) but flattens it to a single
 * `SignalError` carrying a machine-readable `code`. The route layer maps each
 * code to an HTTP status; the UI maps each code to a friendly message so
 * `ErrorPanel` never shows a stack trace.
 */

export type SignalErrorCode =
  | "missing_key"
  | "invalid_key"
  | "rate_limited"
  | "input_too_short"
  | "input_too_long"
  | "empty_response"
  | "malformed_json"
  | "api_error";

/** HTTP status for each error code (docs/PLAN.md error taxonomy). */
export const ERROR_STATUS: Record<SignalErrorCode, number> = {
  missing_key: 401,
  invalid_key: 401,
  rate_limited: 429,
  input_too_short: 400,
  input_too_long: 400,
  empty_response: 502,
  malformed_json: 502,
  api_error: 502,
};

/** Friendly, user-facing default messages — never leak internals. */
export const FRIENDLY_MESSAGES: Record<SignalErrorCode, string> = {
  missing_key: "Add a Gemini API key to run a live analysis.",
  invalid_key:
    "That API key was rejected. Check it in Google AI Studio and try again.",
  rate_limited: "Too many requests. Wait a moment and try again.",
  input_too_short: "Please provide a bit more text to analyze.",
  input_too_long: "That text is too long — trim it and try again.",
  empty_response:
    "The model declined to analyze this text or returned nothing. Try different wording.",
  malformed_json: "The model returned something that was not valid JSON.",
  api_error: "The AI request failed. This is often transient — please try again.",
};

/**
 * The single user-facing error type. Every failure mode in the pipeline is
 * re-raised as a `SignalError` with one of the `SignalErrorCode`s.
 */
export class SignalError extends Error {
  readonly code: SignalErrorCode;

  constructor(code: SignalErrorCode, message?: string) {
    super(message ?? FRIENDLY_MESSAGES[code]);
    this.name = "SignalError";
    this.code = code;
    // Restore prototype chain for instanceof under transpiled targets.
    Object.setPrototypeOf(this, SignalError.prototype);
  }
}

export function isSignalError(value: unknown): value is SignalError {
  return value instanceof SignalError;
}

/** HTTP status for a thrown value (defaults to api_error/502). */
export function statusForError(err: unknown): number {
  if (isSignalError(err)) return ERROR_STATUS[err.code];
  return ERROR_STATUS.api_error;
}

/**
 * Build the `{ ok: false, error }` body + status for a failure. Never includes
 * a stack trace or raw upstream detail — only the code and a friendly message.
 */
export function errorResponse(err: unknown): {
  status: number;
  body: { ok: false; error: { code: SignalErrorCode; message: string } };
} {
  const code: SignalErrorCode = isSignalError(err) ? err.code : "api_error";
  const message =
    isSignalError(err) && err.message ? err.message : FRIENDLY_MESSAGES[code];
  return {
    status: ERROR_STATUS[code],
    body: { ok: false, error: { code, message } },
  };
}
