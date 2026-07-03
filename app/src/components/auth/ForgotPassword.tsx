import React, { useState } from 'react';

import { useAuth } from '../../hooks/useAuth';

// ---------------------------------------------------------------------------
// ForgotPassword
// ---------------------------------------------------------------------------

interface ForgotPasswordProps {
  onBack: () => void;
}

const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onBack }) => {
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset link. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/15">
          <svg
            className="h-6 w-6 text-green-600 dark:text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>

        <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
          Check your email
        </h3>
        <p className="text-sm text-gray-600 dark:text-neutral-400">
          We sent a password reset link to <span className="font-medium">{email}</span>. Please
          check your inbox and follow the instructions.
        </p>

        <button
          type="button"
          onClick={onBack}
          className="mt-4 text-sm font-medium text-[#7C3AED] hover:text-[#6D28D9] transition-colors">
          Back to Sign In
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
          Forgot your password?
        </h3>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Enter your email and we'll send you a link to reset it.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="forgot-email"
          className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">
          Email address
        </label>
        <input
          id="forgot-email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full rounded-lg border border-gray-300 dark:border-[#25252f] bg-white dark:bg-[#141418] px-4 py-3
                     text-gray-900 dark:text-neutral-100 placeholder-gray-400 dark:placeholder-neutral-500
                     focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20
                     transition-colors"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-[#7C3AED] px-4 py-3 text-sm font-semibold text-white
                   hover:bg-[#6D28D9] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/50 focus:ring-offset-2
                   dark:focus:ring-offset-[#1a1a22]
                   disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            Sending...
          </span>
        ) : (
          'Send Reset Link'
        )}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-[#7C3AED] hover:text-[#6D28D9] transition-colors">
          Back to Sign In
        </button>
      </div>
    </form>
  );
};

export default ForgotPassword;
