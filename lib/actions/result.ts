/**
 * Discriminated result type returned by every server action. Lets the UI
 * branch on auth/validation/rate-limit/unknown errors without losing the
 * typed payload on the success path.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code:
        | "auth_required"
        | "forbidden"
        | "invalid_input"
        | "rate_limited"
        | "unknown";
      message: string;
    };
