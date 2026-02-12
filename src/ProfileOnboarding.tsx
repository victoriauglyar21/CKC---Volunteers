import { useEffect, useMemo, useState, type FormEvent, type ChangeEvent } from "react";
import { supabase } from "./supabaseClient";

type ProfileRecord = {
  id: string;
  role: "Regular Volunteer" | "Lead" | "Admin";
  full_name: string | null;
  preferred_name: string | null;
  pronouns: string | null;
  date_of_birth: string | null;
  phone: string | null;
  joined_at: string | null;
  internal_notes: string | null;
  interests: string[] | null;
  training_completed: boolean | null;
  training_completed_at: string | null;
  notification_pref?: "email_only" | "push_and_email" | null;
  created_at?: string | null;
};

type Props = {
  userId: string;
  initialProfile: ProfileRecord | null;
  onComplete: (profile: ProfileRecord) => void;
};

const DEFAULT_PROFILE: Omit<ProfileRecord, "id"> = {
  role: "Regular Volunteer",
  full_name: "",
  preferred_name: "",
  pronouns: "",
  date_of_birth: "",
  phone: "",
  joined_at: "",
  internal_notes: "",
  interests: [],
  training_completed: false,
  training_completed_at: "",
  created_at: "",
};

function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.split("T")[0] ?? "";
}

function normalizeText(value: string) {
  return value.trim();
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 10);
  if (digits.length <= 3) return part1;
  if (digits.length <= 6) return `${part1}-${part2}`;
  return `${part1}-${part2}-${part3}`;
}

export default function ProfileOnboarding({ userId, initialProfile, onComplete }: Props) {
  const seed = initialProfile ?? { ...DEFAULT_PROFILE, id: userId };
  const storageKey = useMemo(() => `profile-onboarding-draft:${userId}`, [userId]);
  const [form, setForm] = useState(() => {
    let draft: Partial<{
      role: "Regular Volunteer" | "Lead" | "Admin";
      full_name: string;
      preferred_name: string;
      pronouns: string;
      date_of_birth: string;
      phone: string;
      joined_at: string;
    }> | null = null;

    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        draft = JSON.parse(raw);
      }
    } catch {
      draft = null;
    }

    const baseForm = {
      role: seed.role ?? "Regular Volunteer",
      full_name: seed.full_name ?? "",
      preferred_name: seed.preferred_name ?? "",
      pronouns: seed.pronouns ?? "",
      date_of_birth: toDateInput(seed.date_of_birth),
      phone: seed.phone ?? "",
      joined_at: toDateInput(seed.joined_at),
    };

    return { ...baseForm, ...(draft ?? {}) };
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleChange =
    (key: keyof typeof form) =>
    (
      event:
        | ChangeEvent<HTMLInputElement>
        | ChangeEvent<HTMLTextAreaElement>
        | ChangeEvent<HTMLSelectElement>,
    ) => {
      const target = event.target as HTMLInputElement;
      let value =
        target.type === "checkbox" ? target.checked : (target.value ?? "");
      if (key === "phone" && typeof value === "string") {
        value = formatPhone(value);
      }
      setForm((prev) => ({ ...prev, [key]: value }));
    };

  const validate = () => {
    if (!form.full_name.trim()) return "Full name is required.";
    if (!form.preferred_name.trim()) return "Preferred name is required.";
    if (!form.pronouns.trim()) return "Pronouns are required.";
    if (!form.phone.trim()) return "Phone number is required.";
    if (!form.joined_at) return "Joined date is required.";
    return "";
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    const errorMessage = validate();
    if (errorMessage) {
      setMessage(errorMessage);
      return;
    }

    setSaving(true);

    const dobISO =
      form.date_of_birth && !Number.isNaN(Date.parse(form.date_of_birth))
        ? new Date(`${form.date_of_birth}T00:00:00`).toISOString()
        : null;

    const {
      data: { user: authUser },
      error: authUserError,
    } = await supabase.auth.getUser();
    if (authUserError || !authUser?.id) {
      setMessage("Your session expired. Please sign in again from your email link.");
      setSaving(false);
      return;
    }

    const payload: Partial<ProfileRecord> & {
      id: string;
      role: "Regular Volunteer" | "Lead" | "Admin";
    } = {
      id: authUser.id,
      role:
        form.role === "Lead"
          ? "Lead"
          : form.role === "Admin"
            ? "Admin"
            : "Regular Volunteer",
      full_name: normalizeText(form.full_name),
      preferred_name: normalizeText(form.preferred_name),
      pronouns: normalizeText(form.pronouns),
      phone: normalizeText(form.phone),
      joined_at: form.joined_at || null,
    };
    if (dobISO) {
      payload.date_of_birth = dobISO;
    }

    console.info("Profile onboarding upsert payload", payload);
    const upsertProfile = async () =>
      supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();

    let { data, error } = await upsertProfile();

    if ((error as { code?: string; message?: string } | null)?.code === "23503") {
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      ({ data, error } = await upsertProfile());
    }

    if (error || !data) {
      setMessage(error?.message ?? "Unable to save profile.");
      setSaving(false);
      return;
    }

    if (!initialProfile) {
      const newVolunteerName =
        normalizeText(form.preferred_name) || normalizeText(form.full_name) || "A volunteer";
      await supabase.functions.invoke("send-admin-push", {
        body: {
          title: "New volunteer signup",
          body: `${newVolunteerName} has signed up for CKC Volunteer shifts`,
          url: "/?view=notifications",
        },
      });
    }

    onComplete(data as ProfileRecord);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage cleanup failures.
    }
    setSaving(false);
  };

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(form));
    } catch {
      // Ignore storage write failures.
    }
  }, [form, storageKey]);

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <div>
          <p className="onboarding-eyebrow">Welcome</p>
          <h1 className="onboarding-title">Complete your volunteer profile</h1>
          <p className="onboarding-subtitle">
            Please fill out every field so we can match you to the right shifts.
          </p>
        </div>

        <form className="onboarding-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Volunteer role</span>
              <select
                className="form-input"
                value={form.role}
                onChange={handleChange("role")}
                required
              >
                <option value="Regular Volunteer">Regular Volunteer</option>
                <option value="Lead">Lead Volunteer</option>
              </select>
            </label>

            <label className="form-field">
              <span className="form-label">Full name</span>
              <input
                className="form-input"
                type="text"
                value={form.full_name}
                onChange={handleChange("full_name")}
                required
              />
            </label>

            <label className="form-field">
              <span className="form-label">Preferred name</span>
              <input
                className="form-input"
                type="text"
                value={form.preferred_name}
                onChange={handleChange("preferred_name")}
                required
              />
            </label>

            <label className="form-field">
              <span className="form-label">Pronouns</span>
              <input
                className="form-input"
                type="text"
                value={form.pronouns}
                onChange={handleChange("pronouns")}
                required
              />
            </label>

            <label className="form-field">
              <span className="form-label">Date of birth</span>
              <input
                className="form-input"
                type="date"
                value={form.date_of_birth}
                onChange={handleChange("date_of_birth")}
              />
            </label>

            <label className="form-field">
              <span className="form-label">Phone</span>
              <input
                className="form-input"
                type="tel"
                value={form.phone}
                onChange={handleChange("phone")}
                required
              />
            </label>

            <label className="form-field">
              <span className="form-label">Joined date</span>
              <input
                className="form-input"
                type="date"
                value={form.joined_at}
                onChange={handleChange("joined_at")}
                required
              />
            </label>
          </div>

          {message ? <div className="form-alert">{message}</div> : null}

          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
