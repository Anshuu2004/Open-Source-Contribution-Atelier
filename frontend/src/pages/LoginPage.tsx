import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { ArrowRight, GitBranch, Moon, ShieldCheck, Sun, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { PasswordInput } from "../components/PasswordInput";
import { useAuth } from "../features/auth/AuthContext";
import { DemoLoginButton } from "../features/auth/DemoLoginButton";
import { useTheme } from "../hooks/useTheme";
import { fetchApi } from "../lib/api";
import {
  buildGoogleLoginPayload,
  formatGoogleOAuthError,
  googleLoginOptions,
  googlePopupErrorMessage,
  hasGoogleCredential,
} from "../lib/googleOAuth";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [requires2FA, setRequires2FA] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("expired") === "true")
      toast.error("Your session expired. Please sign in again.");
    const redirect = params.get("redirect");
    if (redirect) sessionStorage.setItem("login_redirect", redirect);
  }, []);

  const finishLogin = (
    tokens: { access?: string; refresh?: string } | null,
  ) => {
    login(tokens);
    sessionStorage.setItem("justLoggedIn", "true");
    const redirect = sessionStorage.getItem("login_redirect") || "/dashboard";
    sessionStorage.removeItem("login_redirect");
    navigate(redirect);
  };

  const googleLogin = useGoogleLogin(
    googleLoginOptions({
      onSuccess: async (tokenResponse: any) => {
        try {
          const payload = buildGoogleLoginPayload(tokenResponse);
          if (!hasGoogleCredential(payload))
            throw new Error(
              "Google returned no token to exchange. Check VITE_GOOGLE_OAUTH_FLOW.",
            );
          const tokens = await fetchApi("/auth/google/", {
            method: "POST",
            requireAuth: false,
            body: JSON.stringify(payload),
          });
          finishLogin(tokens);
        } catch (err: unknown) {
          const message = formatGoogleOAuthError(err, "backend");
          setError(message);
          toast.error(message);
        }
      },
      onError: (errorResponse) => {
        const message = formatGoogleOAuthError(errorResponse, "popup");
        setError(message);
        toast.error(message);
      },
      onNonOAuthError: (oauthError) => {
        const message = googlePopupErrorMessage(oauthError);
        setError(message);
        toast.error(message);
      },
    }),
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const payload: Record<string, string | boolean> = {
        username: username.trim(),
        password,
        remember: rememberMe,
      };
      if (requires2FA && totpCode) payload.totp_code = totpCode.trim();
      const tokens = await fetchApi("/auth/login/", {
        method: "POST",
        requireAuth: false,
        body: JSON.stringify(payload),
      });
      finishLogin(tokens);
    } catch (err: any) {
      const code = err?.code as string | undefined;
      if (
        code === "2fa_required" ||
        code === "requires_2fa" ||
        err?.requires_2fa ||
        err?.message?.includes("Two-factor")
      ) {
        setRequires2FA(true);
        toast.error("Enter the code from your authenticator app.");
      } else {
        const message = getErrorMessage(err, "Failed to login");
        setError(message);
        toast.error(requires2FA ? "Invalid verification code." : message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGithubSignIn = () => {
    window.location.href =
      import.meta.env?.VITE_GITHUB_OAUTH_URL ||
      `${import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000/api"}/auth/github/`;
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafafa] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(99,102,241,0.12),transparent_28rem),radial-gradient(circle_at_88%_88%,rgba(16,185,129,0.08),transparent_25rem)] dark:bg-[radial-gradient(circle_at_12%_10%,rgba(99,102,241,0.16),transparent_28rem),radial-gradient(circle_at_88%_88%,rgba(16,185,129,0.10),transparent_25rem)]" />
      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link
          to="/"
          className="flex items-center gap-2.5 font-semibold tracking-tight"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <GitBranch size={18} strokeWidth={2.5} aria-hidden="true" />
          </span>
          <span>Open Source Atelier</span>
        </Link>
        <button
          type="button"
          onClick={toggleTheme}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white"
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>
      <main className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-10 pt-8 sm:px-8 lg:min-h-[calc(100vh-76px)] lg:grid-cols-[1fr_25rem] lg:py-12">
        <section className="hidden max-w-xl lg:block">
          <p className="mb-5 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            Build in public, with confidence.
          </p>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-tight text-slate-950 dark:text-white">
            A better place to learn open source.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-600 dark:text-slate-400">
            Practice the workflow, contribute thoughtfully, and grow alongside a
            community that cares about good code.
          </p>
          <div className="mt-9 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              <ShieldCheck size={16} aria-hidden="true" />
            </span>
            Your workspace and progress are waiting for you.
          </div>
        </section>
        <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/[0.05] sm:p-8 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
          <div className="mb-7">
            <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
              Welcome back
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
              Sign in to your account
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Pick up right where you left off.
            </p>
          </div>
          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200"
            >
              <span className="min-w-0 flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError("")}
                className="rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-500/10"
                aria-label="Dismiss error"
              >
                <X size={15} />
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            {requires2FA ? (
              <>
                <div>
                  <label
                    htmlFor="totp_code"
                    className="text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    Verification code
                  </label>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Enter the six-digit code from your authenticator app.
                  </p>
                  <input
                    id="totp_code"
                    name="totp_code"
                    autoFocus
                    autoComplete={useBackupCode ? "off" : "one-time-code"}
                    inputMode={useBackupCode ? "text" : "numeric"}
                    maxLength={useBackupCode ? 10 : 6}
                    placeholder={useBackupCode ? "a1b2-c3d4" : "123456"}
                    value={totpCode}
                    onChange={(event) => setTotpCode(event.target.value)}
                    className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-center font-mono tracking-[0.25em] text-slate-950 outline-none transition placeholder:tracking-normal focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setUseBackupCode(!useBackupCode);
                      setTotpCode("");
                    }}
                    className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    {useBackupCode
                      ? "Use an authenticator code"
                      : "Use a backup code"}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRequires2FA(false);
                    setTotpCode("");
                  }}
                  className="text-sm text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline dark:hover:text-slate-200"
                >
                  Back to sign in
                </button>
              </>
            ) : (
              <>
                <div>
                  <label
                    htmlFor="username"
                    className="text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    Username or email
                  </label>
                  <input
                    id="username"
                    name="username"
                    autoComplete="username"
                    spellCheck={false}
                    placeholder="the_smartest@kid.com"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="login-password"
                    className="text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    Password
                  </label>
                  <PasswordInput
                    id="login-password"
                    name="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-2 rounded-lg border-slate-300 bg-white py-2.5 text-sm text-slate-950 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
                    required
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                  Remember me for 30 days
                </label>
              </>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-slate-900"
            >
              {isLoading
                ? requires2FA
                  ? "Verifying…"
                  : "Signing in…"
                : requires2FA
                  ? "Verify and continue"
                  : "Let Me In!"}
              {!isLoading && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>
          {!requires2FA && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                or continue with
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => googleLogin()}
                  className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <GoogleMark />
                  Google
                </button>
                <button
                  type="button"
                  onClick={handleGithubSignIn}
                  className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <GitBranch size={16} aria-hidden="true" />
                  Sign in with GitHub
                </button>
              </div>
              <DemoLoginButton
                label="Explore a demo workspace"
                className="mt-3 w-full rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
              />
              <div className="mt-6 flex items-center justify-between text-sm">
                <Link
                  to="/reset-password"
                  className="text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-white"
                >
                  Forgot password?
                </Link>
                <span className="text-slate-500 dark:text-slate-400">
                  New here?{" "}
                  <Link
                    to="/signup"
                    className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    Create an account
                  </Link>
                </span>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default LoginPage;
