import React, { useState } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import BrandWordmark from '../BrandWordmark';
import ForgotPassword from './ForgotPassword';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthView = 'signin' | 'signup' | 'forgot';

const BUSINESS_TYPES = [
  { value: 'residential_real_estate', label: 'Residential Real Estate' },
  { value: 'commercial_real_estate', label: 'Commercial Real Estate' },
  { value: 'legal', label: 'Legal' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'home_services', label: 'Home Services' },
  { value: 'property_management', label: 'Property Management' },
] as const;

// ---------------------------------------------------------------------------
// AuthScreen
// ---------------------------------------------------------------------------

const AuthScreen: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [view, setView] = useState<AuthView>('signin');

  // Sign In state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInError, setSignInError] = useState('');

  // Sign Up state
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [signUpLoading, setSignUpLoading] = useState(false);
  const [signUpError, setSignUpError] = useState('');
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError('');
    setSignInLoading(true);

    try {
      await signIn(signInEmail, signInPassword);
      // onAuthStateChange in useAuth will update state automatically.
    } catch (err: unknown) {
      setSignInError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setSignInLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignUpError('');

    if (signUpPassword !== confirmPassword) {
      setSignUpError('Passwords do not match.');
      return;
    }
    if (signUpPassword.length < 8) {
      setSignUpError('Password must be at least 8 characters.');
      return;
    }
    if (!businessType) {
      setSignUpError('Please select a business type.');
      return;
    }

    setSignUpLoading(true);

    try {
      await signUp(signUpEmail, signUpPassword, { businessName, contactName, businessType });

      // Check whether email confirmation is required.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        // Email confirmation required -- show success message.
        setSignUpSuccess(true);
      }
      // Otherwise onAuthStateChange picks up the new session.
    } catch (err: unknown) {
      setSignUpError(err instanceof Error ? err.message : 'Sign up failed. Please try again.');
    } finally {
      setSignUpLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Forgot password view
  // ------------------------------------------------------------------
  if (view === 'forgot') {
    return (
      <Shell>
        <ForgotPassword onBack={() => setView('signin')} />
      </Shell>
    );
  }

  // ------------------------------------------------------------------
  // Sign-up success (email verification pending)
  // ------------------------------------------------------------------
  if (signUpSuccess) {
    return (
      <Shell>
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
            Verification email sent!
          </h3>
          <p className="text-sm text-gray-600 dark:text-neutral-400">
            We sent a verification link to <span className="font-medium">{signUpEmail}</span>.
            Please check your inbox and click the link to activate your account.
          </p>
          <button
            type="button"
            onClick={() => {
              setSignUpSuccess(false);
              setView('signin');
            }}
            className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
            Back to Sign In
          </button>
        </div>
      </Shell>
    );
  }

  // ------------------------------------------------------------------
  // Main auth form
  // ------------------------------------------------------------------
  return (
    <Shell>
      {/* Tab toggle */}
      <div className="flex rounded-lg bg-gray-100 dark:bg-neutral-800 p-1 mb-6">
        <button
          type="button"
          onClick={() => setView('signin')}
          className={`ce-press-scale flex-1 rounded-md py-2 text-sm font-semibold transition-all duration-200 ${
            view === 'signin'
              ? 'bg-white dark:bg-neutral-900 text-[#7C3AED] dark:text-[#A855F7] shadow-sm'
              : 'text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200'
          }`}>
          Sign In
        </button>
        <button
          type="button"
          onClick={() => setView('signup')}
          className={`ce-press-scale flex-1 rounded-md py-2 text-sm font-semibold transition-all duration-200 ${
            view === 'signup'
              ? 'bg-white dark:bg-neutral-900 text-[#7C3AED] dark:text-[#A855F7] shadow-sm'
              : 'text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200'
          }`}>
          Sign Up
        </button>
      </div>

      {view === 'signin' ? (
        /* ---- Sign In Form ---- */
        <form onSubmit={handleSignIn} className="space-y-4">
          {signInError && <ErrorBanner message={signInError} />}

          <Field label="Email" htmlFor="signin-email">
            <input
              id="signin-email"
              type="email"
              required
              value={signInEmail}
              onChange={e => setSignInEmail(e.target.value)}
              placeholder="you@company.com"
              className={inputClass}
            />
          </Field>

          <Field label="Password" htmlFor="signin-password">
            <input
              id="signin-password"
              type="password"
              required
              value={signInPassword}
              onChange={e => setSignInPassword(e.target.value)}
              placeholder="Enter your password"
              className={inputClass}
            />
          </Field>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setView('forgot')}
              className="text-xs font-medium text-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
              Forgot password?
            </button>
          </div>

          <SubmitButton loading={signInLoading} label="Sign In" loadingLabel="Signing in..." />
        </form>
      ) : (
        /* ---- Sign Up Form ---- */
        <form onSubmit={handleSignUp} className="space-y-4">
          {signUpError && <ErrorBanner message={signUpError} />}

          <Field label="Business Name" htmlFor="signup-business">
            <input
              id="signup-business"
              type="text"
              required
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="Acme Realty"
              className={inputClass}
            />
          </Field>

          <Field label="Contact Name" htmlFor="signup-contact">
            <input
              id="signup-contact"
              type="text"
              required
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="Jane Smith"
              className={inputClass}
            />
          </Field>

          <Field label="Email" htmlFor="signup-email">
            <input
              id="signup-email"
              type="email"
              required
              value={signUpEmail}
              onChange={e => setSignUpEmail(e.target.value)}
              placeholder="you@company.com"
              className={inputClass}
            />
          </Field>

          <Field label="Password" htmlFor="signup-password">
            <input
              id="signup-password"
              type="password"
              required
              minLength={8}
              value={signUpPassword}
              onChange={e => setSignUpPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className={inputClass}
            />
          </Field>

          <Field label="Confirm Password" htmlFor="signup-confirm">
            <input
              id="signup-confirm"
              type="password"
              required
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className={inputClass}
            />
          </Field>

          <Field label="Business Type" htmlFor="signup-type">
            <select
              id="signup-type"
              required
              value={businessType}
              onChange={e => setBusinessType(e.target.value)}
              className={`${inputClass} ${!businessType ? 'text-gray-400 dark:text-neutral-500' : ''}`}>
              <option value="" disabled>
                Select your industry
              </option>
              {BUSINESS_TYPES.map(bt => (
                <option key={bt.value} value={bt.value}>
                  {bt.label}
                </option>
              ))}
            </select>
          </Field>

          <SubmitButton loading={signUpLoading} label="Create Account" loadingLabel="Creating..." />
        </form>
      )}
    </Shell>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Full-screen centered shell with the branded card. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ce-ambient-bg min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-up" style={{ animationDuration: '0.6s' }}>
        {/* Branding */}
        <div
          className="text-center mb-8 animate-stagger-fade-up"
          style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
          <BrandWordmark className="mx-auto mb-3 h-11 w-auto" />
          <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
            AI Employees for Your Business
          </p>
        </div>

        {/* Card */}
        <div
          className="ce-hover-lift rounded-2xl bg-white dark:bg-[#1a1a22] shadow-xl ring-1 ring-gray-900/5 dark:ring-[#25252f] p-8 animate-stagger-fade-up"
          style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Labeled form field wrapper. */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Red error banner. */
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-3 text-sm text-red-700 dark:text-red-400">
      {message}
    </div>
  );
}

/** Primary submit button with loading spinner. */
function SubmitButton({
  loading,
  label,
  loadingLabel,
}: {
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="ce-press-scale mt-2 w-full rounded-lg bg-[#7C3AED] px-4 py-3 text-sm font-semibold text-white
                 hover:bg-[#6D28D9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/50 focus-visible:ring-offset-2
                 dark:focus-visible:ring-offset-[#1a1a22]
                 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200">
      {loading ? (
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
          {loadingLabel}
        </span>
      ) : (
        label
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Shared Tailwind class for inputs
// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-lg border border-gray-300 dark:border-[#25252f] bg-white dark:bg-[#141418] px-4 py-3 ' +
  'text-gray-900 dark:text-neutral-100 placeholder-gray-400 dark:placeholder-neutral-500 ' +
  'focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20 transition-colors text-sm';

export default AuthScreen;
