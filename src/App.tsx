import { useEffect, useState } from "react";
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
  if (profile.date_of_birth !== null && profile.date_of_birth === "") return false;
  if (!hasText(profile.phone)) return false;
  if (!hasText(profile.emergency_contact_name)) return false;
  if (!hasText(profile.emergency_contact_phone)) return false;
  if (!hasText(profile.status)) return false;
  if (!profile.joined_at) return false;
  if (!hasText(profile.internal_notes)) return false;
  if (!profile.interests || profile.interests.length === 0) return false;
  if (profile.training_completed !== true) return false;
  if (!profile.training_completed_at) return false;
  return true;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, newSession) => {
        // Avoid clearing the UI on transient auth refresh/visibility changes.
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
        setProfileLoading(false);
        return;
      }

      setProfile(data as ProfileRecord | null);
      setNeedsOnboarding(!data);

      setProfileLoading(false);
    };

    fetchProfile();

    return () => {
      mounted = false;
    };
  }, [session]);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  if (!session) return <Auth />;

  if (profileLoading && !profile) return <div style={{ padding: 16 }}>Loading profile...</div>;

  if (needsOnboarding) {
    return (
      <ProfileOnboarding
        userId={session.user.id}
        initialProfile={profile}
        onComplete={(updated) => {
          setProfile(updated);
          setNeedsOnboarding(false);
        }}
      />
    );
  }

  return <AuthedApp session={session} profile={profile} />;
}
