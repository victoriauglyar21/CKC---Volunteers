import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./App.css";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";
import type { ProfileRecord } from "./authedApp/types";
import { signOutSafely, supabase } from "./supabaseClient";

const Auth = lazy(() => import("./Auth"));
const AuthedApp = lazy(() => import("./AuthedApp"));
const ProfileOnboarding = lazy(() => import("./ProfileOnboarding"));
const NewUI = lazy(() => import("./NewUI"));

type ThemeMode = "light" | "dark";
const THEME_STORAGE_KEY = "ui-theme";
const PROFILE_CACHE_PREFIX = "ckc:profile";

function readStoredJson<T>(storageKey: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStoredJson(storageKey: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Ignore cache write failures.
  }
}

function getProfileCacheKey(userId: string) {
  return `${PROFILE_CACHE_PREFIX}:${userId}`;
}

function readCachedProfile(userId: string | null | undefined) {
  if (!userId) return null;
  const cached = readStoredJson<ProfileRecord>(getProfileCacheKey(userId));
  return cached?.id === userId ? cached : null;
}

function readStoredSupabaseSession() {
  if (typeof window === "undefined") return null;
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith("sb-") || !key.includes("-auth-token")) continue;
    const stored = readStoredJson<Session | { currentSession?: Session | null }>(key);
    const session =
      stored && "currentSession" in stored ? stored.currentSession : (stored as Session | null);
    if (session?.access_token && session.user?.id) {
      return session;
    }
  }
  return null;
}

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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

function LogoLoadingScreen({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--app-page-bg)",
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(1.015)",
        transition: "opacity 280ms ease, transform 280ms ease",
        pointerEvents: visible ? "auto" : "none",
        zIndex: 999,
      }}
      aria-live="polite"
      aria-busy="true"
    >
      <img
        src="/favicon.png"
        alt="CKC logo"
        style={{
          width: "clamp(160px, 28vw, 260px)",
          height: "auto",
          display: "block",
          opacity: visible ? 1 : 0.92,
          transform: visible ? "translateY(0)" : "translateY(4px)",
          transition: "opacity 240ms ease, transform 240ms ease",
        }}
      />
    </div>
  );
}

function hasAuthType(targetType: string) {
  if (typeof window === "undefined") return false;
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return searchParams.get("type") === targetType || hashParams.get("type") === targetType;
}

function replaceRoute(path: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== path || window.location.search || window.location.hash) {
    window.history.replaceState({}, "", path);
  }
}

function MainApp() {
  const [initialSession] = useState(() => readStoredSupabaseSession());
  const [initialProfile] = useState(() => readCachedProfile(initialSession?.user.id));
  const [session, setSession] = useState<Session | null>(initialSession);
  const [loading, setLoading] = useState(!initialSession);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileChecked, setProfileChecked] = useState(Boolean(initialProfile));
  const [profile, setProfile] = useState<ProfileRecord | null>(initialProfile);
  const [needsOnboarding, setNeedsOnboarding] = useState(
    () => Boolean(initialProfile && !isProfileComplete(initialProfile)),
  );
  const [profileMissing, setProfileMissing] = useState(false);
  const [startupOverlayMounted, setStartupOverlayMounted] = useState(true);
  const [startupOverlayVisible, setStartupOverlayVisible] = useState(true);
  const startupOverlayStartedAtRef = useRef(Date.now());
  const routePath = typeof window !== "undefined" ? window.location.pathname : "/";
  const isSignupRoute = routePath === "/signup";
  const isCompleteProfileRoute = routePath === "/complete-profile";
  const useNewUi = isNewUiEnabled();
  const hasUsableProfile = Boolean(profile);

  const handleSignedIn = useCallback((nextSession: Session) => {
    setProfile(null);
    setNeedsOnboarding(false);
    setProfileMissing(false);
    setProfileChecked(false);
    setProfileLoading(true);
    setSession(nextSession);
  }, []);

  const goToCompleteProfile = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/complete-profile") {
      window.history.replaceState({}, "", "/complete-profile");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const signupConfirmation = hasAuthType("signup");
    let signupConfirmationPending = signupConfirmation;

    const isResetRoute =
      typeof window !== "undefined" && window.location.pathname === "/reset-password";

    if (hasAuthType("recovery") || isResetRoute) {
      setPasswordRecovery(true);
    }

    if (signupConfirmation) {
      replaceRoute("/signin");
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;

      if (signupConfirmationPending && data.session) {
        signupConfirmationPending = false;
        await signOutSafely();
        if (!mounted) return;
        setSession(null);
      } else {
        signupConfirmationPending = false;
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
        if (event === "SIGNED_IN" && signupConfirmationPending) {
          signupConfirmationPending = false;
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
        setProfileChecked(false);
        setProfileLoading(false);
        return;
      }
      const cachedProfile = readCachedProfile(session.user.id);
      if (cachedProfile && !profile) {
        setProfile(cachedProfile);
        setNeedsOnboarding(!isProfileComplete(cachedProfile));
        setProfileChecked(true);
      } else if (!profile) {
        setProfileChecked(false);
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
        setProfileChecked(true);
        setProfileLoading(false);
        return;
      }

      if (!data) {
        setProfile(null);
        setNeedsOnboarding(true);
        setProfileMissing(false);
        setProfileChecked(true);
        setProfileLoading(false);
        goToCompleteProfile();
        return;
      }

      const fetchedProfile = data as ProfileRecord;
      const profileComplete = isProfileComplete(fetchedProfile);
      setProfile(fetchedProfile);
      writeStoredJson(getProfileCacheKey(session.user.id), fetchedProfile);
      setNeedsOnboarding(!profileComplete);
      setProfileMissing(false);
      setProfileChecked(true);

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
    profileChecked &&
    !profileMissing &&
    hasUsableProfile &&
    !needsOnboarding &&
    useNewUi &&
    canAccessNewUi(profile?.role);

  const willRenderAuthedApp =
    !loading &&
    !passwordRecovery &&
    !!session &&
    profileChecked &&
    !profileMissing &&
    hasUsableProfile &&
    !needsOnboarding &&
    !willRenderNewUi;

  const showStartupLogo =
    loading ||
    (!!session &&
      (!profileChecked || profileLoading) &&
      !hasUsableProfile &&
      !profileMissing &&
      !needsOnboarding &&
      !passwordRecovery);

  useEffect(() => {
    if (showStartupLogo) {
      startupOverlayStartedAtRef.current = Date.now();
      setStartupOverlayMounted(true);
      const frameId = window.requestAnimationFrame(() => {
        setStartupOverlayVisible(true);
      });
      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    const minimumVisibleMs = 260;
    const fadeDurationMs = 280;
    const elapsed = Date.now() - startupOverlayStartedAtRef.current;
    const delayBeforeFade = Math.max(0, minimumVisibleMs - elapsed);
    const fadeTimer = window.setTimeout(() => {
      setStartupOverlayVisible(false);
    }, delayBeforeFade);
    const unmountTimer = window.setTimeout(() => {
      setStartupOverlayMounted(false);
    }, delayBeforeFade + fadeDurationMs);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(unmountTimer);
    };
  }, [showStartupLogo]);

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
    content = (
      <Auth
        defaultMode={isSignupRoute ? "signup" : "signin"}
        onSignedIn={handleSignedIn}
      />
    );
  }

  if (!loading && !passwordRecovery && session && profileChecked && profileMissing && !profileLoading) {
    content = <div style={{ padding: 16 }}>Oops Profile Not Found</div>;
  }

  if (!loading && !passwordRecovery && session && profileChecked && !profileMissing && needsOnboarding) {
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
    profileChecked &&
    !profileMissing &&
    hasUsableProfile &&
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
    profileChecked &&
    !profileMissing &&
    hasUsableProfile &&
    !needsOnboarding &&
    !content
  ) {
    content = <AuthedApp session={session} profile={profile} />;
  }

  return (
    <>
      <div
        style={{
          minHeight: "100vh",
          opacity: showStartupLogo ? 0 : 1,
          transition: "opacity 240ms ease",
        }}
      >
        {content}
      </div>
      {startupOverlayMounted ? <LogoLoadingScreen visible={startupOverlayVisible} /> : null}
    </>
  );
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return (
    <Suspense fallback={<LogoLoadingScreen visible={true} />}>
      <MainApp />
    </Suspense>
  );
}
