import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../features/auth/AuthContext";
import { fetchApi } from "../lib/api";
import { toast } from "react-hot-toast";
import { DraggableSticker } from "../components/ui/DraggableSticker";
import { DemoLoginButton } from "../features/auth/DemoLoginButton";
import {
  buildGoogleLoginPayload,
  formatGoogleOAuthError,
  googleLoginOptions,
  googlePopupErrorMessage,
  hasGoogleCredential,
} from "../lib/googleOAuth";
import { PasswordInput } from "../components/PasswordInput";
import { MascotBuddy, MascotState } from "../components/ui/MascotBuddy";
import {
  User,
  KeyRound,
  AlertCircle,
  ArrowRight,
  Shield,
  Lock,
  Flame,
  X,
  Moon,
  Sun,
  GitBranch,
  Sparkles,
} from "lucide-react";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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
  const [mascotState, setMascotState] = useState<MascotState>("idle");
  const [showStickers, setShowStickers] = useState(false);

  const navigate = useNavigate();
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const expired = params.get("expired");
    const redirect = params.get("redirect");

    if (expired === "true") {
      toast.error("Session expired. Please sign in again.", {
        duration: 4000,
        position: "bottom-center",
        icon: "🔒",
      });
    }

    if (redirect) {
      sessionStorage.setItem("login_redirect", redirect);
    }
  }, []);

  const googleLogin = useGoogleLogin(
    googleLoginOptions({
      onSuccess: async (tokenResponse: any) => {
        try {
          const payload = buildGoogleLoginPayload(tokenResponse);
          if (!hasGoogleCredential(payload)) {
            throw new Error(
              "Google returned no token to exchange. Check VITE_GOOGLE_OAUTH_FLOW.",
            );
          }
          const tokens = await fetchApi("/auth/google/", {
            method: "POST",
            requireAuth: false,
            body: JSON.stringify(payload),
          });
          login(tokens);
          sessionStorage.setItem("justLoggedIn", "true");
          navigate("/dashboard");
        } catch (err: unknown) {
          setMascotState("error");
          const message = formatGoogleOAuthError(err, "backend");
          setError(message);
          toast.error(message);
        }
      },
      onError: (errorResponse) => {
        setMascotState("error");
        const message = formatGoogleOAuthError(errorResponse, "popup");
        setError(message);
        toast.error(message, { duration: 5000 });
      },
      onNonOAuthError: (error) => {
        setMascotState("error");
        const message = googlePopupErrorMessage(error);
        setError(message);
        toast.error(message, { duration: 5000 });
      },
    }),
  );

  const handleGoogleDevFallback = async () => {
    try {
      const tokens = await fetchApi("/auth/google/", {
        method: "POST",
        requireAuth: false,
        body: JSON.stringify({ access_token: "dev-google-mock-access-token" }),
      });
      login(tokens);
      sessionStorage.setItem("justLoggedIn", "true");
      toast.success("Logged in as Google Dev User! 🚀");
      navigate("/dashboard");
    } catch (err: unknown) {
      const message = formatGoogleOAuthError(err, "backend");
      setError(message);
      toast.error(message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    setMascotState("loading");

    try {
      const payload: Record<string, string> = {
        username: username.trim(),
        password,
      };
      if (requires2FA && totpCode) {
        payload.totp_code = totpCode.trim();
      }

      const tokens = await fetchApi("/auth/login/", {
        method: "POST",
        requireAuth: false,
        body: JSON.stringify({ ...payload, remember: rememberMe }),
      });

      login(tokens);

      toast.success("Welcome back, builder! 🎉", {
        duration: 3000,
        position: "bottom-center",
      });

      sessionStorage.setItem("justLoggedIn", "true");
      const redirect = sessionStorage.getItem("login_redirect") || "/dashboard";
      sessionStorage.removeItem("login_redirect");
      navigate(redirect);
    } catch (err: any) {
      setMascotState("error");
      const code = err?.code as string | undefined;
      if (
        code === "2fa_required" ||
        code === "requires_2fa" ||
        err?.requires_2fa ||
        (err?.message && err.message.includes("Two-factor"))
      ) {
        setRequires2FA(true);
        toast.error("2FA code required. Enter code from authenticator app.");
      } else {
        const message = getErrorMessage(err, "Failed to login");
        setError(message);
        if (requires2FA) {
          toast.error("Invalid 2FA code or backup code.");
        } else if (code === "rate_limited" || err?.status === 429) {
          toast.error(message, { duration: 6000 });
        } else {
          toast.error("Login failed. Please check your credentials.");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-full bg-[#0f0c14] text-slate-200 relative overflow-hidden select-none">
      {/* Animated mesh-gradient background */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-60">
        <div className="absolute -top-1/3 -left-1/4 w-96 h-96 bg-purple-600/30 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[600px] h-[600px] bg-emerald-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-80 h-80 bg-indigo-500/25 rounded-full blur-[96px] animate-pulse" />
        <div className="absolute inset-0 bg-[radial-gradient(2px_circle_at_20%_30%,rgba(255,255,255,0.06),transparent_1px)] [background-size:40px_40px]" />
      </div>

      {/* Top bar */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 shrink-0">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-11 h-11 rounded-3xl border-2 border-white/20 bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-xl shadow-[0_0_20px_rgba(99,102,241,0.35)] group-hover:rotate-6 transition-transform duration-300">
            🚀
          </div>
          <div className="flex flex-col">
            <span className="font-black text-sm tracking-tight text-white uppercase leading-none">Atelier</span>
            <span className="text-[9px] font-bold text-indigo-300/80 uppercase tracking-wider leading-none">
              Open Source Portal
            </span>
          </div>
        </Link>

        <button
          className="relative w-9 h-9 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm flex items-center justify-center text-xs font-black text-white hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <Sun size={14} className="text-amber-400" />
          ) : (
            <Moon size={14} className="text-white/70" />
          )}
        </button>
      </header>

      <main className="relative z-20 flex items-center justify-center h-[calc(100vh-64px)] w-full px-4">
        <div className="w-full max-w-xs">
          {/* Mascot + brand */}
          <div className="flex flex-col items-center text-center mb-8">
            <MascotBuddy
              state={mascotState}
              className="mb-2 scale-100 transition-all duration-300 hover:scale-110"
            />
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-wider text-indigo-300 mb-3 backdrop-blur-sm">
              <Flame size={10} className="text-amber-400 animate-pulse" />
              <span>Ready to build?</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight leading-tight mb-1">
              Sign in
            </h1>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
              Enter your atelier credentials
            </p>
          </div>

          {/* Glass card */}
          <div className="relative rounded-[30px] border border-white/10 bg-white/5 backdrop-blur-[20px] p-6 shadow-[0_25px_50px_rgba(0,0,0,0.5)]">
            {/* Gradient accent border glow */}
            <div className="absolute inset-0 rounded-[30px] padding-[2px] bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 -msk-[2px] mask-composite-source-over pointer-events-none" />
            <div className="relative z-10 rounded-[28px] border border-white/5 bg-white/[0.03] p-6 backdrop-blur-sm shadow-[inset_0_0_20px_rgba(0,0,0,0.2)]">

              {/* Error banner */}
              {error && (
                <div
                  role="alert"
                  className="flex items-center gap-3 mb-4 rounded-xl border border-rose-500/30 bg-rose-900/20 p-3 text-[11px] font-bold text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.2)]"
                >
                  <AlertCircle size={16} className="shrink-0 text-rose-400" />
                  <span className="leading-tight">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError("")}
                    className="ml-auto shrink-0 text-rose-500 hover:text-rose-300 transition-colors p-1"
                    aria-label="Dismiss error"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {!requires2FA ? (
                <>
                  {/* Identity field */}
                  <div className="relative group space-y-2">
                    <User
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors shrink-0"
                    />
                    <input
                      className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 py-3.5 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500 transition-all"
                      placeholder="developer@atelier.com"
                      value={username}
                      name="username"
                      autoComplete="username"
                      spellCheck={false}
                      onFocus={() => setMascotState("focus-username")}
                      onBlur={() => setMascotState("idle")}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>

                  {/* Password field */}
                  <div className="relative group space-y-2">
                    <Lock
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors shrink-0"
                    />
                    <PasswordInput
                      id="login-password"
                      name="password"
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-10 py-3.5 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500 transition-all"
                      placeholder="••••••••"
                      value={password}
                      onFocus={() => setMascotState("focus-password")}
                      onBlur={() => setMascotState("idle")}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>

                  {/* Remember me */}
                  <div className="flex items-center justify-between px-1">
                    <label className="flex items-center gap-2 cursor-pointer text-[10px] font-bold text-slate-300 select-none uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-2 border-white/20 bg-white/5 accent-indigo-500 cursor-pointer"
                      />
                      <span>Remember me (30 days)</span>
                    </label>
                  </div>

                  {/* Primary button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-6 rounded-xl border-2 border-white/10 bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3.5 font-black text-white text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] active:translate-y-0 active:shadow-none transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                  >
                    <span>
                      {isLoading
                        ? "Authenticating…"
                        : "Enter Atelier 🚀"}
                    </span>
                    {!isLoading && (
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    )}
                  </button>

                  {/* Divider */}
                  <div className="relative my-5">
                    <div className="absolute inset-x-0 top-1/2 h-[1px] bg-white/10" />
                    <span className="relative z-10 inline-block px-3 bg-[#0f0c14] text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                      or continue with
                    </span>
                  </div>

                  {/* Bento social actions */}
                  <div className="grid grid-cols-2 gap-2 mb-6">
                    <button
                      type="button"
                      onClick={() => googleLogin()}
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-black text-xs uppercase tracking-wider text-slate-200 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer active:scale-95"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      <span className="truncate">Google</span>
                    </button>

                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-black text-xs uppercase tracking-wider text-slate-200 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer active:scale-95"
                      onClick={() => {
                        window.location.href =
                          import.meta.env?.VITE_GITHUB_OAUTH_URL ||
                          `${import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000/api"}/auth/github/`;
                      }}
                    >
                      <GitBranch size={16} className="shrink-0" />
                      <span>GitHub</span>
                    </button>
                  </div>

                  <DemoLoginButton
                    label="⚡ Demo Mode"
                    className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 font-black text-xs uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500 transition-all cursor-pointer active:scale-95"
                  />
                </>
              ) : (
                /* 2FA Verification Step */
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <button
                      type="button"
                      onClick={() => setRequires2FA(false)}
                      className="text-[10px] font-bold text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      ← Back
                    </button>
                    <span className="text-[10px] font-bold uppercase text-indigo-300 tracking-wider flex items-center gap-1.5">
                      <Shield size={12} className="text-indigo-400" />
                      2FA Verification
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="relative group">
                      <KeyRound
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors shrink-0"
                      />
                      <input
                        type="text"
                        autoFocus
                        name="totp_code"
                        autoComplete={useBackupCode ? "off" : "one-time-code"}
                        inputMode={useBackupCode ? "text" : "numeric"}
                        maxLength={useBackupCode ? 10 : 6}
                        placeholder={useBackupCode ? "a1b2-c3d4" : "123456"}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 py-3.5 text-center text-base font-mono font-bold text-white outline-none placeholder:text-slate-500 tracking-widest focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500 transition-all"
                        required
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setUseBackupCode(!useBackupCode);
                        setTotpCode("");
                      }}
                      className="text-[10px] font-bold text-indigo-300 hover:text-emerald-400 underline block text-center cursor-pointer transition-colors"
                    >
                      {useBackupCode
                        ? "Use 6-digit authenticator code"
                        : "Use a backup code"}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full rounded-xl border-2 border-white/10 bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3.5 font-black text-white text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] active:translate-y-0 active:shadow-none transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                  >
                    <span>
                      {isLoading ? "Verifying…" : "Verify & Continue 🛡️"}
                    </span>
                    {!isLoading && (
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    )}
                  </button>
                </div>
              )}

              {/* Playful stickers toggle */}
              {!requires2FA && (
                <div className="mt-6 pt-4 border-t border-white/10 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowStickers(!showStickers)}
                    className="text-[10px] font-bold text-slate-400 hover:text-indigo-300 flex items-center gap-1.5 cursor-pointer transition-colors uppercase tracking-wider"
                  >
                    <Sparkles size={12} className="text-amber-400 animate-spin-slow" />
                    <span>
                      {showStickers ? "Hide badges" : "Show badges"}
                    </span>
                  </button>
                  {showStickers && (
                    <div className="flex flex-wrap justify-center gap-2 w-72 animate-scale-up">
                      <DraggableSticker
                        initialX={0}
                        initialY={0}
                        className="bg-rose-500 text-white text-[9px] font-black px-2 py-1 rounded-xl shadow-sm border border-black"
                      >
                        Bug Hunter 🐛
                      </DraggableSticker>
                      <DraggableSticker
                        initialX={0}
                        initialY={0}
                        className="bg-indigo-500 text-white text-[9px] font-black px-2 py-1 rounded-xl shadow-sm border border-black"
                      >
                        git commit 🚀
                      </DraggableSticker>
                      <DraggableSticker
                        initialX={0}
                        initialY={0}
                        className="bg-emerald-500 text-white text-[9px] font-black px-2 py-1 rounded-xl shadow-sm border border-black"
                      >
                        100% Merged ✅
                      </DraggableSticker>
                      <DraggableSticker
                        initialX={0}
                        initialY={0}
                        className="bg-amber-400 text-black text-[9px] font-black px-2 py-1 rounded-xl shadow-sm border border-black"
                      >
                        Code Ninja 🥷
                      </DraggableSticker>
                    </div>
                  )}
                </div>
              )}

              {/* Footer links */}
              {!requires2FA && (
                <div className="mt-6 pt-4 border-t border-white/10 flex flex-col items-center gap-3 text-center">
                  <p className="text-[10px] font-bold text-slate-500">
                    Forgot your password?{" "}
                    <a
                      href="/reset-password"
                      className="text-indigo-300 hover:text-white underline underline-offset-2 transition-colors font-black"
                    >
                      Reset it
                    </a>
                  </p>
                  <p className="text-[10px] font-bold text-slate-500">
                    New to Atelier?{" "}
                    <Link
                      to="/signup"
                      className="text-indigo-300 hover:text-white underline underline-offset-2 transition-colors font-black"
                    >
                      Create account
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default LoginPage;