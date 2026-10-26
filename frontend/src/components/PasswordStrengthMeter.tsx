import React from "react";
import zxcvbn from "zxcvbn";

interface PasswordStrengthMeterProps {
  password: string;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  password,
}) => {
  if (!password) return null;

  const result = zxcvbn(password);
  const score = result.score;

  const tiers = [
    { label: "Very Weak", barColor: "bg-red-500", textColor: "text-red-600" },
    { label: "Weak", barColor: "bg-orange-500", textColor: "text-orange-600" },
    { label: "Fair", barColor: "bg-yellow-500", textColor: "text-yellow-700" },
    { label: "Strong", barColor: "bg-green-500", textColor: "text-green-600" },
    {
      label: "Very Strong 💪",
      barColor: "bg-emerald-600",
      textColor: "text-emerald-700",
    },
  ];

  const currentTier = tiers[score] ?? tiers[0];
  const filledBars = score + 1;

  const crackTime =
    result.crack_times_display.offline_slow_hashing_1e4_per_second;

  const criteria = [
    { label: "8+ chars", met: password.length >= 8 },
    { label: "Uppercase", met: /[A-Z]/.test(password) },
    { label: "Lowercase", met: /[a-z]/.test(password) },
    { label: "Number", met: /\d/.test(password) },
    { label: "Symbol", met: /[^a-zA-Z0-9]/.test(password) },
  ];

  return (
    <div className="ml-1 mt-2 space-y-1.5" role="status" aria-live="polite">
      <div className="flex justify-between items-center text-xs font-bold">
        <span className={currentTier.textColor}>{currentTier.label}</span>
        <span className="text-gray-600 font-mono bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300">
          Estimated crack time: {crackTime}
        </span>
      </div>

      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={[
              "h-2 flex-1 rounded-full border-2 border-black transition-all duration-300",
              i < filledBars ? currentTier.barColor : "bg-gray-200",
            ].join(" ")}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {criteria.map((criterion) => (
          <span
            key={criterion.label}
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
              criterion.met
                ? "bg-green-100 text-green-800 border-green-400"
                : "bg-gray-100 text-gray-400 border-gray-200"
            }`}
          >
            {criterion.met ? "✓" : "•"} {criterion.label}
          </span>
        ))}
      </div>

      {result.feedback.warning && (
        <p className="text-xs text-amber-700">
          {result.feedback.warning}
        </p>
      )}

      {result.feedback.suggestions.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-gray-600">
          {result.feedback.suggestions.map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PasswordStrengthMeter;
