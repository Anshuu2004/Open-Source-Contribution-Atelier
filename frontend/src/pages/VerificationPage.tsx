import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { AuthPageShell } from "../features/auth/AuthPageShell";
import { ResendVerification } from "../features/auth/ResendVerification";
import { useAuth } from "../features/auth/AuthContext";
import { fetchApi } from "../lib/api";
import { ApiError } from "../lib/apiErrors";

const REDIRECT_SECONDS = 5;

type Status =
  | "verifying"
  | "verified"
  | "already_verified"
  | "expired"
  | "invalid"
  | "error";

const linkButton =
  "inline-block w-full rounded-2xl border-4 border-black bg-primary px-5 py-3 font-black text-black shadow-card-sm hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center uppercase";

export function VerificationPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<Status>(token ? "verifying" : "invalid");
  const [attempt, setAttempt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);
  // StrictMode runs effects twice in development; without this the same key
  // would be sent twice and the second answer could overwrite the first.
  const requested = useRef<string | null>(null);

  const nextPath = isAuthenticated ? "/dashboard" : "/login";
  const nextLabel = isAuthenticated ? "Go to dashboard" : "Continue to login";

  useEffect(() => {
    if (!token) return;
    const requestId = `${token}:${attempt}`;
    if (requested.current === requestId) return;
    requested.current = requestId;

    fetchApi(`/auth/verify-email/${encodeURIComponent(token)}/`, {
      requireAuth: false,
      suppressErrorToast: true,
    })
      .then((data) => {
        setStatus(
          data?.status === "already_verified" ? "already_verified" : "verified",
        );
      })
      .catch((err: unknown) => {
        const code = err instanceof ApiError ? err.code : null;
        if (code === "expired_key") setStatus("expired");
        else if (code === "invalid_key") setStatus("invalid");
        else setStatus("error");
      });
  }, [token, attempt]);

  const done = status === "verified" || status === "already_verified";

  useEffect(() => {
    if (!done) return;
    if (secondsLeft <= 0) {
      navigate(nextPath, { replace: true });
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [done, secondsLeft, navigate, nextPath]);

  const content = {
    verifying: {
      icon: <Loader2 className="animate-spin text-indigo-600" size={40} />,
      heading: "Verifying your email...",
      body: "Hang tight, this only takes a second.",
    },
    verified: {
      icon: <CheckCircle2 className="text-emerald-500" size={40} />,
      heading: "Email verified!",
      body: "Your address is confirmed. You're all set.",
    },
    already_verified: {
      icon: <CheckCircle2 className="text-emerald-500" size={40} />,
      heading: "Already verified",
      body: "This email address was confirmed earlier, so there's nothing left to do.",
    },
    expired: {
      icon: <Clock className="text-amber-500" size={40} />,
      heading: "This link has expired",
      body: "Verification links only last a little while. Grab a fresh one below.",
    },
    invalid: {
      icon: <XCircle className="text-red-500" size={40} />,
      heading: "This link doesn't work",
      body: "It may have been copied incompletely, or it belongs to an email address you've since changed. Enter your current email to get a new link.",
    },
    error: {
      icon: <XCircle className="text-red-500" size={40} />,
      heading: "We couldn't reach the server",
      body: "Your link may be fine. Check your connection and try again.",
    },
  }[status];

  return (
    <AuthPageShell
      title="Verify your email."
      subtitle="One click and your account is officially yours."
      mode="info"
    >
      <div className="text-center space-y-5 pt-2">
        <div role="status" aria-live="polite" className="space-y-3">
          <div className="flex justify-center">{content.icon}</div>
          <h2 className="text-2xl font-black text-black dark:text-white">
            {content.heading}
          </h2>
          <p className="font-bold text-slate-700 dark:text-slate-300">
            {content.body}
          </p>
        </div>

        {done && (
          <>
            <Link to={nextPath} replace className={linkButton}>
              {nextLabel}
            </Link>
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
              Redirecting in {secondsLeft}s...
            </p>
          </>
        )}

        {status === "expired" && token && (
          <ResendVerification verificationKey={token} />
        )}

        {status === "invalid" && <ResendVerification />}

        {status === "error" && (
          <button
            type="button"
            onClick={() => {
              setStatus("verifying");
              setAttempt((n) => n + 1);
            }}
            className={`${linkButton} cursor-pointer`}
          >
            Try again
          </button>
        )}

        {(status === "expired" || status === "invalid") && (
          <Link
            to={nextPath}
            className="inline-block text-sm font-black text-black dark:text-white underline underline-offset-4"
          >
            {nextLabel}
          </Link>
        )}
      </div>
    </AuthPageShell>
  );
}

export default VerificationPage;
