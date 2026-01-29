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
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status: string | null;
  joined_at: string | null;
  internal_notes: string | null;
  interests: string[] | null;
    training_completed: boolean | null;
  training_completed_at: string | null;
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
  emergency_contact_name: "",
  emergency_contact_phone: "",
  status: "active",
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

function toDateTimeLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num: number) => `${num}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function normalizeText(value: string) {
  return value.trim();
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
      emergency_contact_name: string;
      emergency_contact_phone: string;
      status: string;
      joined_at: string;
      internal_notes: string;
      interests: string;
      training_completed: boolean;
      training_completed_at: string;
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
      emergency_contact_name: seed.emergency_contact_name ?? "",
      emergency_contact_phone: seed.emergency_contact_phone ?? "",
      status: seed.status ?? "active",
      joined_at: toDateInput(seed.joined_at),
      internal_notes: seed.internal_notes ?? "",
      interests: seed.interests?.join(", ") ?? "",
      training_completed: true,
      training_completed_at: toDateTimeLocalInput(seed.training_completed_at),
    };

    return { ...baseForm, ...(draft ?? {}) };
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const parsedInterests = useMemo(
    () =>
      form.interests
        .split(",")
        .map((item) => normalizeText(item))
        .filter(Boolean),
    [form.interests],
  );

  const handleChange =
    (key: keyof typeof form) =>
    (
      event:
        | ChangeEvent<HTMLInputElement>
        | ChangeEvent<HTMLTextAreaElement>
        | ChangeEvent<HTMLSelectElement>,
    ) => {
      const target = event.target as HTMLInputElement;
      const value =
        target.type === "checkbox" ? target.checked : (target.value ?? "");
      setForm((prev) => ({ ...prev, [key]: value }));
    };

  const validate = () => {
    if (!form.full_name.trim()) return "Full name is required.";
    if (!form.preferred_name.trim()) return "Preferred name is required.";
    if (!form.pronouns.trim()) return "Pronouns are required.";
    if (!form.phone.trim()) return "Phone number is required.";
    if (!form.emergency_contact_name.trim())
      return "Emergency contact name is required.";
    if (!form.emergency_contact_phone.trim())
      return "Emergency contact phone is required.";
    if (!form.status.trim()) return "Status is required.";
    if (!form.joined_at) return "Joined date is required.";
    if (!form.internal_notes.trim()) return "Internal notes are required.";
    if (parsedInterests.length === 0) return "Add at least one interest.";
    if (!form.training_completed_at)
      return "Training completion time is required.";
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

    const payload: Partial<ProfileRecord> & {
      id: string;
      role: "Regular Volunteer" | "Lead" | "Admin";
    } = {
      id: userId,
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
      emergency_contact_name: normalizeText(form.emergency_contact_name),
      emergency_contact_phone: normalizeText(form.emergency_contact_phone),
      status: normalizeText(form.status),
      joined_at: form.joined_at || null,
      internal_notes: normalizeText(form.internal_notes),
      interests: parsedInterests,
      training_completed: true,
      training_completed_at: form.training_completed_at
        ? new Date(form.training_completed_at).toISOString()
        : null,
    };
    if (dobISO) {
      payload.date_of_birth = dobISO;
    }

    console.info("Profile onboarding upsert payload", payload);
    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();

    if (error || !data) {
      setMessage(error?.message ?? "Unable to save profile.");
      setSaving(false);
      return;
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
              <span className="form-label">Emergency contact name</span>
              <input
                className="form-input"
                type="text"
                value={form.emergency_contact_name}
                onChange={handleChange("emergency_contact_name")}
                required
              />
            </label>

            <label className="form-field">
              <span className="form-label">Emergency contact phone</span>
              <input
                className="form-input"
                type="tel"
                value={form.emergency_contact_phone}
                onChange={handleChange("emergency_contact_phone")}
                required
              />
            </label>

            <label className="form-field">
              <span className="form-label">Status</span>
              <input
                className="form-input"
                type="text"
                value={form.status}
                onChange={handleChange("status")}
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

            <label className="form-field form-field-wide">
              <span className="form-label">Interests (comma-separated)</span>
              <input
                className="form-input"
                type="text"
                value={form.interests}
                onChange={handleChange("interests")}
                required
              />
            </label>

            <label className="form-field form-field-wide">
              <span className="form-label">Internal notes</span>
              <textarea
                className="form-input form-textarea"
                rows={3}
                value={form.internal_notes}
                onChange={handleChange("internal_notes")}
                required
              />
            </label>

            <label className="form-field">
              <span className="form-label">Training completed at</span>
              <input
                className="form-input"
                type="datetime-local"
                value={form.training_completed_at}
                onChange={handleChange("training_completed_at")}
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
