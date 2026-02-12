import { useCallback, useEffect, useState } from "react";
import "./App.css";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import AuthedApp from "./AuthedApp";
import ProfileOnboarding from "./ProfileOnboarding";

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
  const routePath = typeof window !== "undefined" ? window.location.pathname : "/";
  const isSignupRoute = routePath === "/signup";
  const isCompleteProfileRoute = routePath === "/complete-profile";

  const goToCompleteProfile = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/complete-profile") {
      window.history.replaceState({}, "", "/complete-profile");
    }
  }, []);

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
        goToCompleteProfile();
        return;
      }

      const fetchedProfile = data as ProfileRecord;
      const profileComplete = isProfileComplete(fetchedProfile);
      setProfile(fetchedProfile);
      setNeedsOnboarding(!profileComplete);
      setProfileMissing(false);

      setProfileLoading(false);
      if (!profileComplete) {
        goToCompleteProfile();
        return;
      }
      if (isSignupRoute || isCompleteProfileRoute) {
        window.history.replaceState({}, "", "/");
      }
    };

    fetchProfile();

    return () => {
      mounted = false;
    };
  }, [goToCompleteProfile, isCompleteProfileRoute, isSignupRoute, session]);

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

  if (!session) return <Auth defaultMode={isSignupRoute ? "signup" : "signin"} />;

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
