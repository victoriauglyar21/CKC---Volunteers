import { useEffect, useMemo, useState } from "react";
import AuthedApp from "./AuthedApp";
import type { AuthedAppProps } from "./authedApp/types";
import { signOutSafely } from "./supabaseClient";

export default function NewUI({ session, profile }: AuthedAppProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"all" | "open" | "pending" | "assigned">("all");
  const [theme, setTheme] = useState<"ocean" | "sand" | "forest">("ocean");
  const displayName =
    profile?.preferred_name?.trim() ||
    profile?.full_name?.trim() ||
    session.user.email ||
    "Volunteer";
  const roleLabel = profile?.role ?? "Volunteer";
  const notificationLabel =
    profile?.notification_pref === "push_and_email"
      ? "Push + email enabled"
      : "Email notifications";
  const userEmail = session.user.email ?? "No email on file";
  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    [],
  );

  const disablePreview = () => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("feature:new-ui");
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("new_ui");
    window.location.href = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  };

  const keepPreviewEnabled = () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("feature:new-ui", "1");
    setActionMessage("Preview mode will stay on for this browser.");
  };

  const handleSignOut = async () => {
    setActionMessage("");
    setSigningOut(true);
    const { error } = await signOutSafely();
    if (error) {
      setActionMessage(`Unable to sign out: ${error.message}`);
      setSigningOut(false);
      return;
    }
    if (typeof window !== "undefined") {
      window.location.assign("/signin");
      return;
    }
    setActionMessage("Signed out.");
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSummaryLoading(false);
    }, 500);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const summaryCards = useMemo(
    () => [
      { label: "Shifts This Week", value: roleLabel === "Admin" ? "18" : "4", tone: "text-emerald-300" },
      { label: "Pending Requests", value: roleLabel === "Admin" || roleLabel === "Lead" ? "6" : "1", tone: "text-amber-300" },
      { label: "Coverage Alerts", value: "2", tone: "text-rose-300" },
      { label: "Response Rate", value: "94%", tone: "text-sky-300" },
    ],
    [roleLabel],
  );

  const filterOptions: Array<{ key: "all" | "open" | "pending" | "assigned"; label: string }> = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "pending", label: "Pending" },
    { key: "assigned", label: "Assigned" },
  ];

  const themeClasses = {
    ocean: {
      shell: "bg-background",
      hero: "border-b bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-100",
      heroPanel:
        "ui-soft-card border-slate-700/60 bg-slate-900/60 text-slate-100 shadow-xl",
      actionBtn:
        "rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-100 transition hover:-translate-y-0.5 hover:bg-slate-700",
      sticky: "sticky top-0 z-20 border-b bg-background/95 backdrop-blur",
      accentBadge:
        "inline-flex w-fit items-center rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-100",
    },
    sand: {
      shell: "bg-amber-50 text-stone-900",
      hero: "border-b bg-gradient-to-br from-amber-100 via-orange-50 to-rose-50 text-stone-900",
      heroPanel:
        "ui-soft-card border-amber-200/70 bg-white/85 text-stone-900 shadow-xl",
      actionBtn:
        "rounded-lg border border-amber-300 bg-white px-4 py-3 text-sm font-medium text-stone-900 transition hover:-translate-y-0.5 hover:bg-amber-50",
      sticky: "sticky top-0 z-20 border-b bg-amber-50/95 backdrop-blur",
      accentBadge:
        "inline-flex w-fit items-center rounded-full border border-orange-300 bg-orange-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-orange-800",
    },
    forest: {
      shell: "bg-emerald-950 text-emerald-50",
      hero: "border-b bg-gradient-to-br from-emerald-900 via-emerald-950 to-teal-950 text-emerald-50",
      heroPanel:
        "ui-soft-card border-emerald-700/60 bg-emerald-900/55 text-emerald-50 shadow-xl",
      actionBtn:
        "rounded-lg border border-emerald-700 bg-emerald-900 px-4 py-3 text-sm font-medium text-emerald-50 transition hover:-translate-y-0.5 hover:bg-emerald-800",
      sticky: "sticky top-0 z-20 border-b bg-emerald-950/90 backdrop-blur",
      accentBadge:
        "inline-flex w-fit items-center rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-100",
    },
  } as const;

  const activeTheme = themeClasses[theme];

  return (
    <div className={`min-h-screen transition-colors duration-300 ${activeTheme.shell}`}>
      <section className={activeTheme.hero}>
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className={`ui-fade-up rounded-2xl p-4 backdrop-blur sm:p-6 ${activeTheme.heroPanel}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className={activeTheme.accentBadge}>
                  New UI Preview
                </p>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Welcome, {displayName}
                </h1>
                <p className="text-sm opacity-85 sm:text-base">
                  {roleLabel} | {todayLabel}
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto">
                <button
                  className={activeTheme.actionBtn}
                  onClick={keepPreviewEnabled}
                  type="button"
                >
                  Keep preview on
                </button>
                <button
                  className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-200"
                  onClick={disablePreview}
                  type="button"
                >
                  Back to current UI
                </button>
              </div>
            </div>
            <p className="mt-3 text-sm opacity-85">
              This is a safe redesign shell. The current app still renders directly below.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.08em] opacity-80">Theme</span>
              <button
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  theme === "ocean" ? "border-white/70 bg-white/15" : "border-white/25 hover:bg-white/10"
                }`}
                onClick={() => setTheme("ocean")}
                type="button"
              >
                Ocean
              </button>
              <button
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  theme === "sand" ? "border-white/70 bg-white/15" : "border-white/25 hover:bg-white/10"
                }`}
                onClick={() => setTheme("sand")}
                type="button"
              >
                Sand
              </button>
              <button
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  theme === "forest" ? "border-white/70 bg-white/15" : "border-white/25 hover:bg-white/10"
                }`}
                onClick={() => setTheme("forest")}
                type="button"
              >
                Forest
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <button
                className={`${activeTheme.actionBtn} text-left disabled:cursor-not-allowed disabled:opacity-60`}
                onClick={handleSignOut}
                type="button"
                disabled={signingOut}
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
              <a
                className={activeTheme.actionBtn}
                href="https://forms.gle/grAvV1s3xraMXAUW9"
                rel="noreferrer"
                target="_blank"
              >
                Medical report form
              </a>
              <a
                className={activeTheme.actionBtn}
                href="https://forms.gle/nzvEKXq687bgejUE6"
                rel="noreferrer"
                target="_blank"
              >
                Photos form
              </a>
              <a
                className={activeTheme.actionBtn}
                href="mailto:victoriauglyar21@gmail.com"
              >
                Contact admin
              </a>
            </div>

            {actionMessage ? (
              <p className="mt-3 text-sm text-slate-200">{actionMessage}</p>
            ) : null}
          </div>
        </div>
      </section>
      <section className={activeTheme.sticky}>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Viewing: <span className="font-medium text-foreground">Week Calendar</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-accent"
                type="button"
              >
                Today
              </button>
              <button
                className="rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-accent"
                type="button"
              >
                Week
              </button>
              <button
                className="rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-accent"
                type="button"
              >
                Month
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Filters
            </p>
            {filterOptions.map((option) => (
              <button
                key={option.key}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeFilter === option.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background hover:bg-accent"
                }`}
                onClick={() => setActiveFilter(option.key)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Open
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              Pending
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
              Assigned
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              Uncovered
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="ui-soft-card ui-fade-up rounded-lg p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Role</p>
              <p className="mt-1 text-sm font-semibold">{roleLabel}</p>
            </div>
            <div className="ui-soft-card ui-fade-up rounded-lg p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Today</p>
              <p className="mt-1 text-sm font-semibold">{todayLabel}</p>
            </div>
            <div className="ui-soft-card ui-fade-up rounded-lg p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Notifications
              </p>
              <p className="mt-1 text-sm font-semibold">{notificationLabel}</p>
            </div>
            <div className="ui-soft-card ui-fade-up rounded-lg p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Account</p>
              <p className="mt-1 truncate text-sm font-semibold">{userEmail}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {summaryLoading
              ? Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="ui-soft-card rounded-lg p-3">
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    <div className="mt-2 h-6 w-12 animate-pulse rounded bg-muted" />
                  </div>
                ))
              : summaryCards.map((card) => (
                  <div key={card.label} className="ui-soft-card ui-fade-up rounded-lg p-3">
                    <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      {card.label}
                    </p>
                    <p className={`mt-1 text-2xl font-semibold ${card.tone}`}>{card.value}</p>
                  </div>
                ))}
          </div>
        </div>
      </section>
      <AuthedApp session={session} profile={profile} />
      {actionMessage ? (
        <div className="ui-pop-in ui-soft-card fixed bottom-4 right-4 z-50 px-4 py-3 text-sm shadow-lg">
          {actionMessage}
        </div>
      ) : null}
    </div>
  );
}
