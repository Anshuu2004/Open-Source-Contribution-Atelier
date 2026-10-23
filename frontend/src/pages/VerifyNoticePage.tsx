import { Link, useLocation, useSearchParams } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { AuthPageShell } from "../features/auth/AuthPageShell";
import { ResendVerification } from "../features/auth/ResendVerification";
import { useAuth } from "../features/auth/AuthContext";

export default function VerifyNoticePage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const stateEmail = (location.state as { email?: unknown } | null)?.email;
  const email =
    typeof stateEmail === "string"
      ? stateEmail
      : searchParams.get("email") || "";

  return (
    <AuthPageShell
      title="Check your email."
      subtitle="We've sent a verification link to your inbox. Open it to confirm your address."
      mode="info"
    >
      <div className="text-center space-y-5 pt-2">
        <div className="flex justify-center">
          <MailCheck
            className="text-indigo-600 dark:text-indigo-400"
            size={40}
          />
        </div>
        <h2 className="text-2xl font-black text-black dark:text-white">
          Check your email
        </h2>
        <p className="font-bold text-slate-700 dark:text-slate-300">
          {email ? (
            <>
              We sent a verification link to{" "}
              <span className="text-black dark:text-white break-all">
                {email}
              </span>
              .
            </>
          ) : (
            "We sent a verification link to the address you signed up with."
          )}{" "}
          It can take a few minutes, and it sometimes lands in spam.
        </p>

        <ResendVerification email={email} />

        <Link
          to={isAuthenticated ? "/dashboard" : "/login"}
          className="inline-block text-sm font-black text-black dark:text-white underline underline-offset-4"
        >
          {isAuthenticated ? "Continue to dashboard" : "Back to login"}
        </Link>
      </div>
    </AuthPageShell>
  );
}
