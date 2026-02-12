import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import "./App.css";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import AuthedApp from "./AuthedApp";
import ProfileOnboarding from "./ProfileOnboarding";

const ACCESS_CODE_STORAGE_KEY = "volunteer-access-code";

type ProfileRecord = {
  id: string;
  role: "Regular Volunteer" | "Lead" | "Admin";
  full_name: string | null;
  preferred_name: string | null;
  pronouns: string | null;
  date_of_birth: string | null;
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status: string | null;
  joined_at: string | null;
  internal_notes: string | null;
  interests: string[] | null;
  training_completed: boolean | null;
  training_completed_at: string | null;
  notification_pref?: "email_only" | "push_and_email" | null;
};

type AccessCodeGateProps = {
  requiredCode: string;
  onVerified: () => void;
};

function isAccessCodeValid(value: string) {
  return /^[A-Za-z0-9]+$/.test(value);
}

function AccessCodeGate({ requiredCode, onVerified }: AccessCodeGateProps) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    if (!isAccessCodeValid(code)) {
      setMessage("Enter the access code using letters and numbers only.");
      return;
    }

    if (code !== requiredCode) {
      setMessage("That code doesn’t match. Double-check with your organizer.");
      return;
    }

    setSubmitting(true);
    try {
      localStorage.setItem(ACCESS_CODE_STORAGE_KEY, requiredCode);
    } catch {
      // Ignore storage failures; still allow access for this session.
    }
    onVerified();
    setSubmitting(false);
  };

  return (
    <div className="auth-shell auth-shell--signin">
      <div className="auth-card">
        <div className="auth-header">
          <p className="auth-eyebrow">One more step</p>
          <h2 className="auth-title">Enter access code</h2>
          <p className="auth-subtitle">
            This volunteer portal requires a shared numeric code.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-label">Access code</span>
            <input
              className="auth-input"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              placeholder="CKC2026"
              value={code}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setCode(event.target.value.trim())
              }
              required
            />
          </label>

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Checking..." : "Continue"}
          </button>
        </form>

        {message ? <p className="auth-message">{message}</p> : null}
      </div>
    </div>
  );
}

function isProfileComplete(profile: ProfileRecord) {
  const hasText = (value: string | null) => Boolean(value && value.trim());

  if (
    profile.role !== "Regular Volunteer" &&
    profile.role !== "Lead" &&
    profile.role !== "Admin"
  )
    return false;
  if (!hasText(profile.full_name)) return false;
  if (!hasText(profile.preferred_name)) return false;
  if (!hasText(profile.pronouns)) return false;
  if (!hasText(profile.phone)) return false;
  if (!profile.joined_at) return false;
  return true;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const isCompleteProfileRoute =
    typeof window !== "undefined" && window.location.pathname === "/complete-profile";
  const requiredAccessCode = (
    import.meta.env.VITE_VOLUNTEER_ACCESS_CODE as string | undefined
  )?.trim();
  const accessCodeRequired = Boolean(requiredAccessCode);
  const [accessVerified, setAccessVerified] = useState(() => {
    if (!accessCodeRequired) return true;
    try {
      return (
        localStorage.getItem(ACCESS_CODE_STORAGE_KEY) === requiredAccessCode
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mounted = true;

    const hasRecoveryType = () => {
      if (typeof window === "undefined") return false;
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      return (
        searchParams.get("type") === "recovery" ||
        hashParams.get("type") === "recovery"
      );
    };

    const isResetRoute =
      typeof window !== "undefined" && window.location.pathname === "/reset-password";

    if (hasRecoveryType() || isResetRoute) {
      setPasswordRecovery(true);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, newSession) => {
        // Avoid clearing the UI on transient auth refresh/visibility changes.
        if (event === "PASSWORD_RECOVERY") {
          setPasswordRecovery(true);
        }
        if (event === "SIGNED_OUT") {
          setSession(null);
        } else if (newSession) {
          setSession(newSession);
        }
        setLoading(false);
      },
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!accessCodeRequired) {
      setAccessVerified(true);
      return;
    }
    if (!session?.user) {
      setAccessVerified(false);
      return;
    }
    try {
      setAccessVerified(
        localStorage.getItem(ACCESS_CODE_STORAGE_KEY) === requiredAccessCode,
      );
    } catch {
      setAccessVerified(false);
    }
  }, [accessCodeRequired, requiredAccessCode, session?.user?.id]);

  useEffect(() => {
    let mounted = true;

    const fetchProfile = async () => {
      if (!session?.user) {
        setProfile(null);
        setNeedsOnboarding(false);
        setProfileMissing(false);
        setProfileLoading(false);
        return;
      }
      setProfileLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        setProfile(null);
        setNeedsOnboarding(false);
        setProfileMissing(true);
        setProfileLoading(false);
        return;
      }

      if (!data) {
        setProfile(null);
        setNeedsOnboarding(true);
        setProfileMissing(false);
        setProfileLoading(false);
        return;
      }

      const fetchedProfile = data as ProfileRecord;
      setProfile(fetchedProfile);
      setNeedsOnboarding(isCompleteProfileRoute || !isProfileComplete(fetchedProfile));
      setProfileMissing(false);

      setProfileLoading(false);
    };

    fetchProfile();

    return () => {
      mounted = false;
    };
  }, [session, isCompleteProfileRoute]);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  if (passwordRecovery) {
    return (
      <Auth
        resetOnly
        onResetDone={() => {
          setPasswordRecovery(false);
        }}
      />
    );
  }

  if (!session) return <Auth />;

  if (accessCodeRequired && !accessVerified && requiredAccessCode) {
    return (
      <AccessCodeGate
        requiredCode={requiredAccessCode}
        onVerified={() => setAccessVerified(true)}
      />
    );
  }

  if (profileMissing && !profileLoading) {
    return <div style={{ padding: 16 }}>Oops Profile Not Found</div>;
  }

  if (profileLoading && !profile) return <div style={{ padding: 16 }}>Loading profile...</div>;

  if (needsOnboarding) {
    return (
      <ProfileOnboarding
        userId={session.user.id}
        initialProfile={profile}
        onComplete={(updated) => {
          setProfile(updated);
          setNeedsOnboarding(false);
          if (typeof window !== "undefined" && window.location.pathname === "/complete-profile") {
            window.history.replaceState({}, "", "/");
          }
        }}
      />
    );
  }

  return <AuthedApp session={session} profile={profile} />;
}
