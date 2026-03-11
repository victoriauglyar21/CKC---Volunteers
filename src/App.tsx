import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./App.css";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";
import { signOutSafely, supabase } from "./supabaseClient";
import SplashScreen from "./components/SplashScreen";
import AppLoader from "./components/AppLoader";

const Auth = lazy(() => import("./Auth"));
const AuthedApp = lazy(() => import("./AuthedApp"));
const ProfileOnboarding = lazy(() => import("./ProfileOnboarding"));
const NewUI = lazy(() => import("./NewUI"));

type ThemeMode = "light" | "dark";
const THEME_STORAGE_KEY = "ui-theme";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

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

function isNewUiEnabled() {
  if (typeof window === "undefined") {
    return import.meta.env.VITE_ENABLE_NEW_UI === "true";
  }

  const envEnabled = import.meta.env.VITE_ENABLE_NEW_UI === "true";
  const searchParams = new URLSearchParams(window.location.search);
  const queryEnabled =
    searchParams.get("new_ui") === "1" || searchParams.get("new_ui") === "true";
  const storageEnabled = window.localStorage.getItem("feature:new-ui") === "1";
  return envEnabled || queryEnabled || storageEnabled;
}

function canAccessNewUi(role: ProfileRecord["role"] | null | undefined) {
  if (import.meta.env.VITE_ENABLE_NEW_UI_FOR_ALL_USERS === "true") {
    return true;
  }
  return role === "Admin";
}

function hasAuthType(targetType: string) {
  if (typeof window === "undefined") return false;
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return searchParams.get("type") === targetType || hashParams.get("type") === targetType;
}

function MainApp() {
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
  const useNewUi = isNewUiEnabled();
  const hasUsableProfile = Boolean(profile);

  const goToCompleteProfile = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/complete-profile") {
      window.history.replaceState({}, "", "/complete-profile");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const signupConfirmation = hasAuthType("signup");

    const isResetRoute =
      typeof window !== "undefined" && window.location.pathname === "/reset-password";

    if (hasAuthType("recovery") || isResetRoute) {
      setPasswordRecovery(true);
    }

    if (signupConfirmation && typeof window !== "undefined" && window.location.pathname !== "/signin") {
      window.history.replaceState({}, "", "/signin");
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;

      if (signupConfirmation && data.session) {
        await signOutSafely();
        if (!mounted) return;
        setSession(null);
      } else {
        setSession(data.session ?? null);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, newSession) => {
        // Avoid clearing the UI on transient auth refresh/visibility changes.
        if (event === "PASSWORD_RECOVERY") {
          setPasswordRecovery(true);
        }
        if (event === "SIGNED_IN" && signupConfirmation) {
          void signOutSafely();
          setSession(null);
          setLoading(false);
          return;
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

  const willRenderNewUi =
    !loading &&
    !passwordRecovery &&
    !!session &&
    !profileMissing &&
    (hasUsableProfile || !profileLoading) &&
    !needsOnboarding &&
    useNewUi &&
    canAccessNewUi(profile?.role);

  const willRenderAuthedApp =
    !loading &&
    !passwordRecovery &&
    !!session &&
    !profileMissing &&
    (hasUsableProfile || !profileLoading) &&
    !needsOnboarding &&
    !willRenderNewUi;

  let content: ReactNode = null;

  if (!loading && passwordRecovery) {
    content = (
      <Auth
        resetOnly
        onResetDone={() => {
          setPasswordRecovery(false);
        }}
      />
    );
  }

  if (!loading && !passwordRecovery && !session) {
    content = <Auth defaultMode={isSignupRoute ? "signup" : "signin"} />;
  }

  if (!loading && !passwordRecovery && session && profileMissing && !profileLoading) {
    content = <div style={{ padding: 16 }}>Oops Profile Not Found</div>;
  }

  if (!loading && !passwordRecovery && session && !profileMissing && needsOnboarding) {
    content = (
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

  if (
    !loading &&
    !passwordRecovery &&
    session &&
    !profileMissing &&
    (hasUsableProfile || !profileLoading) &&
    !needsOnboarding &&
    useNewUi &&
    canAccessNewUi(profile?.role)
  ) {
    content = <NewUI session={session} profile={profile} />;
  }

  if (
    !loading &&
    !passwordRecovery &&
    session &&
    !profileMissing &&
    (hasUsableProfile || !profileLoading) &&
    !needsOnboarding &&
    !content
  ) {
    content = <AuthedApp session={session} profile={profile} />;
  }

  return content;
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [showSplash, setShowSplash] = useState(false);
  const hadSessionOnBootRef = useRef(false);
  const authReadyRef = useRef(false);
  const splashTimerRef = useRef<number | null>(null);
  const splashShownAtRef = useRef<number | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const runSplash = () => {
      setShowSplash(true);
      splashShownAtRef.current = performance.now();
      if (splashTimerRef.current !== null) {
        window.clearTimeout(splashTimerRef.current);
      }
      splashTimerRef.current = window.setTimeout(() => {
        setShowSplash(false);
        splashTimerRef.current = null;
        splashShownAtRef.current = null;
      }, 900);
    };

    const clearSplashSoon = () => {
      if (splashShownAtRef.current === null) {
        setShowSplash(false);
        return;
      }

      const elapsedMs = performance.now() - splashShownAtRef.current;
      const remainingMs = Math.max(0, 450 - elapsedMs);
      if (splashTimerRef.current !== null) {
        window.clearTimeout(splashTimerRef.current);
      }
      splashTimerRef.current = window.setTimeout(() => {
        setShowSplash(false);
        splashTimerRef.current = null;
        splashShownAtRef.current = null;
      }, remainingMs);
    };

    supabase.auth.getSession().then(({ data }) => {
      hadSessionOnBootRef.current = Boolean(data.session);
      authReadyRef.current = true;
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!authReadyRef.current) return;

      if (event === "SIGNED_OUT") {
        hadSessionOnBootRef.current = false;
        setShowSplash(false);
        if (splashTimerRef.current !== null) {
          window.clearTimeout(splashTimerRef.current);
          splashTimerRef.current = null;
        }
        splashShownAtRef.current = null;
        return;
      }

      if (event === "SIGNED_IN") {
        if (!hadSessionOnBootRef.current) {
          runSplash();
        }
        hadSessionOnBootRef.current = true;
      }

      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        clearSplashSoon();
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      if (splashTimerRef.current !== null) {
        window.clearTimeout(splashTimerRef.current);
      }
      splashShownAtRef.current = null;
    };
  }, []);

  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <Suspense fallback={<AppLoader visible />}>
      <MainApp />
    </Suspense>
  );
}
