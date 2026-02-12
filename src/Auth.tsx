import { useState, type FormEvent, type ChangeEvent } from "react";
import { supabase } from "./supabaseClient";

type AuthProps = {
  resetOnly?: boolean;
  onResetDone?: () => void;
};

export default function Auth({ resetOnly = false, onResetDone }: AuthProps) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [msg, setMsg] = useState("");
  const [resetting, setResetting] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const siteUrl =
    (import.meta.env.VITE_SITE_URL as string | undefined) ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, "");
  const requiredAccessCode = (
    import.meta.env.VITE_VOLUNTEER_ACCESS_CODE as string | undefined
  )?.trim();
  const accessCodeRequired = Boolean(requiredAccessCode);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMsg("");

    if (resetOnly) {
      const nextPassword = newPassword.trim();
      const confirmNext = confirmPassword.trim();
      if (!nextPassword || !confirmNext) {
        return setMsg("Enter and confirm your new password.");
      }
      if (nextPassword !== confirmNext) {
        return setMsg("Passwords do not match. Try again.");
      }
      setUpdatingPassword(true);
      try {
        const { error } = await supabase.auth.updateUser({ password: nextPassword });
        if (error) return setMsg(error.message);
        setMsg("Password updated. You can sign in with your new password.");
        setNewPassword("");
        setConfirmPassword("");
        try {
          window.history.replaceState({}, "", window.location.pathname);
        } catch {
          // ignore history failures
        }
        onResetDone?.();
        return;
      } finally {
        setUpdatingPassword(false);
      }
    }

    if (isSignup) {
      if (password !== signupConfirmPassword) {
        return setMsg("Passwords do not match. Try again.");
      }
      if (accessCodeRequired && requiredAccessCode) {
        if (!accessCode.trim()) {
          return setMsg("Enter the access code to create an account.");
        }
        if (accessCode.trim() !== requiredAccessCode) {
          return setMsg("That access code doesn’t match. Double-check with your organizer.");
        }
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${normalizedSiteUrl}/complete-profile`,
        },
      });
      if (error) return setMsg(error.message);
      if (data.session) {
        await supabase.auth.signOut();
      }
      return setMsg(
        "Check your email (and spam) for the confirmation link. Add us to your contacts so future messages land in inbox.",
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMsg(error.message);

    if (!data.session) return setMsg("Signed in, but no session returned.");
    return setMsg("Signed in!");
  };

  const handleForgotPassword = async () => {
    setMsg("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return setMsg("Enter your email above and then click “Forgot your password?”");
    }
    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${normalizedSiteUrl}/reset-password`,
      });
      if (error) return setMsg(error.message);
      return setMsg("Password reset email sent. Check your inbox (and spam).");
    } finally {
      setResetting(false);
    }
  };

  if (resetOnly) {
    return (
      <div className="auth-shell auth-shell--signin">
        <div className="auth-card">
          <div className="auth-header">
            <p className="auth-eyebrow">Reset password</p>
            <h2 className="auth-title">Create a new password</h2>
            <p className="auth-subtitle">
              Enter a new password for your account.
            </p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span className="auth-label">New password</span>
              <input
                className="auth-input"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setNewPassword(e.target.value)
                }
                required
              />
            </label>

            <label className="auth-field">
              <span className="auth-label">Confirm password</span>
              <input
                className="auth-input"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setConfirmPassword(e.target.value)
                }
                required
              />
            </label>

            <button className="auth-submit" type="submit" disabled={updatingPassword}>
              {updatingPassword ? "Updating…" : "Update password"}
            </button>
          </form>

          {msg ? <p className="auth-message">{msg}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`auth-shell ${isSignup ? "auth-shell--signup" : "auth-shell--signin"}`}>
      <div className="auth-card">
        <div className="auth-header">
          <p className="auth-eyebrow">{isSignup ? "Get started" : "Welcome back"}</p>
          <h2 className="auth-title">{isSignup ? "Sign Up" : "Sign In"}</h2>
          <p className="auth-subtitle">
            {isSignup
              ? "Create your account to claim shifts."
              : "Sign in to manage your shifts."}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-label">Email</span>
            <input
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>
            <input
              className="auth-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              required
            />
          </label>

          {isSignup ? (
            <label className="auth-field">
              <span className="auth-label">Confirm password</span>
              <input
                className="auth-input"
                type="password"
                placeholder="••••••••"
                value={signupConfirmPassword}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setSignupConfirmPassword(e.target.value)
                }
                required
              />
            </label>
          ) : null}

          {isSignup && accessCodeRequired ? (
            <label className="auth-field">
              <span className="auth-label">Access code</span>
              <input
                className="auth-input"
                type="text"
                autoCapitalize="characters"
                placeholder="CKC2026"
                value={accessCode}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setAccessCode(e.target.value.trim())
                }
                required
              />
            </label>
          ) : null}

          <button className="auth-submit" type="submit">
            {isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        {!isSignup ? (
          <button
            className="auth-switch"
            type="button"
            onClick={handleForgotPassword}
            disabled={resetting}
          >
            {resetting ? "Sending reset email…" : "Forgot your password?"}
          </button>
        ) : null}

        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setMsg("");
            setIsSignup((v) => !v);
          }}
        >
          Switch to {isSignup ? "Sign In" : "Sign Up"}
        </button>

        {msg ? <p className="auth-message">{msg}</p> : null}
      </div>
    </div>
  );
}
