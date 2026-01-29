import { useState, type FormEvent, type ChangeEvent } from "react";
import { supabase } from "./supabaseClient";

export default function Auth() {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMsg("");

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return setMsg(error.message);

      if (!data.session) return setMsg("Check your email to confirm your account.");
      return setMsg("Signed in!");
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMsg(error.message);

    if (!data.session) return setMsg("Signed in, but no session returned.");
    return setMsg("Signed in!");
  };

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

          <button className="auth-submit" type="submit">
            {isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

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
