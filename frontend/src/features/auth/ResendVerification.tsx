import React, { useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";

const COOLDOWN_SECONDS = 60;

type ResendVerificationProps = {
  /** Prefills the address field. */
  email?: string;
  /**
   * Key from an expired link. When given, the link owner gets the new email
   * and no address field is shown.
   */
  verificationKey?: string;
};

type Status = "idle" | "sending" | "sent" | "error";

export function ResendVerification({
  email: initialEmail = "",
  verificationKey,
}: ResendVerificationProps) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const data = await fetchApi("/auth/resend-verification/", {
        method: "POST",
        requireAuth: false,
        suppressErrorToast: true,
        body: JSON.stringify(
          verificationKey ? { key: verificationKey } : { email: email.trim() },
        ),
      });
      setStatus("sent");
      setMessage(data?.message || "A new verification link is on its way.");
      setCooldown(COOLDOWN_SECONDS);
    } catch (err: unknown) {
      setStatus("error");
      setMessage(
        err instanceof Error
          ? err.message
          : "Could not send a new link. Please try again.",
      );
    }
  };

  const busy = status === "sending" || cooldown > 0;

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      {!verificationKey && (
        <div className="space-y-2 text-left">
          <label
            htmlFor="resend-verification-email"
            className="font-bold text-black dark:text-white ml-2 uppercase tracking-wide text-sm"
          >
            Email Address
          </label>
          <input
            id="resend-verification-email"
            className="w-full rounded-2xl border-4 border-black bg-white px-5 py-3 text-black font-bold outline-none placeholder:text-muted/60 focus:bg-accent shadow-card-sm transition-all focus:-translate-y-1 focus:shadow-card"
            type="email"
            placeholder="nerd@homework.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={status === "sending"}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-2xl border-4 border-black bg-accent px-5 py-3 font-black text-black shadow-card-sm transition-all hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 cursor-pointer uppercase"
      >
        {status === "sending"
          ? "Sending..."
          : cooldown > 0
            ? `Send again in ${cooldown}s`
            : status === "sent"
              ? "Send another link"
              : "Resend verification email"}
      </button>

      <p
        role={status === "error" ? "alert" : "status"}
        aria-live="polite"
        className={`min-h-5 text-sm font-bold ${
          status === "error"
            ? "text-red-600 dark:text-red-400"
            : "text-slate-700 dark:text-slate-300"
        }`}
      >
        {message}
      </p>
    </form>
  );
}

export default ResendVerification;
