/**
 * Google OAuth helpers — never silently fall back to a demo user.
 */

import type { UseGoogleLoginOptionsImplicitFlow } from "@react-oauth/google";

export function isDemoLoginEnabled(): boolean {
  const flag = import.meta.env.VITE_ALLOW_DEMO_LOGIN;
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  // Local Vite dev only — never silent in production builds
  return Boolean(import.meta.env.DEV);
}

export type GoogleOAuthPhase = "popup" | "backend";

/** Scopes requested for every "Sign in with Google" entry point. */
export const GOOGLE_SIGNIN_SCOPE = "openid email profile";

export type GoogleOAuthFlow = "implicit" | "auth-code";

/**
 * OAuth flow used by `useGoogleLogin`.
 *
 * * `implicit` (default) — the popup returns an access token directly, so the
 *   backend can verify it without knowing the client secret.
 * * `auth-code` — the popup returns an authorization code which the backend
 *   exchanges (requires `GOOGLE_CLIENT_SECRET` on the server).
 */
export function getGoogleFlow(): GoogleOAuthFlow {
  return import.meta.env.VITE_GOOGLE_OAUTH_FLOW === "auth-code"
    ? "auth-code"
    : "implicit";
}

export type GoogleSigninHandlers = Pick<
  UseGoogleLoginOptionsImplicitFlow,
  "onSuccess" | "onError" | "onNonOAuthError"
>;

/**
 * Options for `useGoogleLogin` with the configured flow and scopes applied.
 *
 * The object is cast because the library exposes separate overloads for each
 * flow while we resolve the flow at runtime.
 */
export function googleLoginOptions(
  handlers: GoogleSigninHandlers,
): UseGoogleLoginOptionsImplicitFlow {
  return {
    flow: getGoogleFlow(),
    scope: GOOGLE_SIGNIN_SCOPE,
    ...handlers,
  } as UseGoogleLoginOptionsImplicitFlow;
}

type GoogleTokenLikeResponse = {
  access_token?: string;
  id_token?: string;
  credential?: string;
  code?: string;
  error?: string;
  error_description?: string;
};

/**
 * Normalize whatever `@react-oauth/google` returns into the payload the
 * backend accepts (`access_token`, `credential` and/or `code`), so no field
 * is silently dropped between flows.
 */
export function buildGoogleLoginPayload(
  tokenResponse: unknown,
): Record<string, string> {
  const response = (tokenResponse ?? {}) as GoogleTokenLikeResponse;
  const payload: Record<string, string> = {};

  if (response.access_token) {
    payload.access_token = response.access_token;
    // Legacy field kept for older backends during rolling deploys.
    payload.token = response.access_token;
  }
  const idToken = response.credential || response.id_token;
  if (idToken) {
    payload.credential = idToken;
    payload.id_token = idToken;
  }
  if (response.code) {
    payload.code = response.code;
    // The backend must exchange the code with the exact redirect URI that was
    // used in the authorization request.
    if (typeof window !== "undefined") {
      payload.redirect_uri = window.location.origin;
    }
  }

  return payload;
}

/** True when the payload carries something the backend can verify. */
export function hasGoogleCredential(payload: Record<string, string>): boolean {
  return Boolean(payload.access_token || payload.credential || payload.code);
}

/** Human-readable message for popup-level failures (closed popup, blocked...). */
export function googlePopupErrorMessage(error?: unknown): string {
  const raw =
    (error as { type?: string } | undefined)?.type ||
    (typeof error === "string" ? error : "");
  if (raw === "popup_closed" || raw === "popup_failed_to_close") {
    return "Google sign-in was cancelled. The popup was closed before finishing.";
  }
  if (raw === "unknown") {
    return (
      "Google sign-in could not start. Check VITE_GOOGLE_CLIENT_ID and that " +
      "http://localhost:5173 is an authorized JavaScript origin."
    );
  }
  return formatGoogleOAuthError(error, "popup");
}

/**
 * Human-readable error for Google OAuth popup/config or backend exchange failures.
 */
export function formatGoogleOAuthError(
  error: unknown,
  phase: GoogleOAuthPhase,
): string {
  if (phase === "popup") {
    return (
      "Google sign-in failed or was cancelled. Check VITE_GOOGLE_CLIENT_ID, " +
      "authorized JavaScript origins, and redirect URIs in Google Cloud Console."
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (/timeout|network|failed to fetch|abort/i.test(message)) {
    return (
      "Could not reach the API to finish Google login. " +
      "Is the backend running, and is VITE_API_BASE_URL correct?"
    );
  }

  if (/401|403|invalid|token|verify|credentials/i.test(message)) {
    return (
      "Google token was rejected by the server. " +
      "Verify GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET match the frontend client ID."
    );
  }

  if (message.trim()) {
    return `Google login failed: ${message}`;
  }

  return (
    "Google login failed on the server. " +
    "Check backend Google OAuth settings and try again."
  );
}
