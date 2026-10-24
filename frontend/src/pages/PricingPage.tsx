import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

export function PricingPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-5xl font-black tracking-tight text-black dark:text-white uppercase mb-6">
        Free Forever
      </h1>

      <p className="text-xl text-gray-600 dark:text-[#c4bbae] font-medium mb-8 leading-relaxed">
        This platform is <strong>100% free and open source</strong>.
        <br />
        Every learning path, real-time collaboration feature, and tool is available
        to everyone at no cost.
      </p>

      <div className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl p-8 mb-10 text-left">
        <h2 className="text-lg font-bold uppercase tracking-wider mb-4 text-black dark:text-white">
          What you get
        </h2>
        <ul className="space-y-3 text-gray-700 dark:text-gray-300">
          <li className="flex gap-3">
            <span className="text-green-600 dark:text-green-400 font-bold">✓</span>
            Full access to all Git learning paths and exercises
          </li>
          <li className="flex gap-3">
            <span className="text-green-600 dark:text-green-400 font-bold">✓</span>
            Real-time collaboration features
          </li>
          <li className="flex gap-3">
            <span className="text-green-600 dark:text-green-400 font-bold">✓</span>
            Community bounties & contribution tracking
          </li>
          <li className="flex gap-3">
            <span className="text-green-600 dark:text-green-400 font-bold">✓</span>
            No feature gates, no usage limits, no “premium” tiers
          </li>
        </ul>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        The code is open source. Contributions, issues, and pull requests are welcome.
      </p>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        {user ? (
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center px-8 py-3 bg-black dark:bg-white text-white dark:text-black font-bold uppercase tracking-wider rounded-lg hover:opacity-90 transition"
          >
            Go to Dashboard
          </Link>
        ) : (
          <Link
            to="/signup"
            className="inline-flex items-center justify-center px-8 py-3 bg-black dark:bg-white text-white dark:text-black font-bold uppercase tracking-wider rounded-lg hover:opacity-90 transition"
          >
            Get Started Free
          </Link>
        )}
        <a
          href="https://github.com/nandinigoyaldev/Open-Source-Contribution-Atelier"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-8 py-3 border-2 border-black dark:border-white text-black dark:text-white font-bold uppercase tracking-wider rounded-lg hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition"
        >
          View Source on GitHub
        </a>
      </div>
    </div>
  );
}

export default PricingPage;