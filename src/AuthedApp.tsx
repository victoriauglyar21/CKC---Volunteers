import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

type ShiftTemplate = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  rrule: string | null;
  capacity: number | null;
  timezone: string | null;
  description: string | null;
  is_active: boolean;
};

type ShiftInstance = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  templateId: string;
  instanceId: number;
};

type ShiftAssignmentDetail = {
  id: string;
  created_at?: string | null;
  dropped_at?: string | null;
  status?: "active" | "dropped" | "pending";
  dropped_reason?: string | null;
  assignment_role: "lead" | "regular";
  volunteer: {
    id: string;
    full_name: string | null;
    preferred_name: string | null;
    phone?: string | null;
    role?: "Regular Volunteer" | "Lead" | "Admin" | null;
  } | null;
  shift_instance?: {
    id: number;
    shift_date: string | null;
    starts_at: string | null;
    ends_at: string | null;
    template?: {
      id: string;
      title: string;
    } | null;
  } | null;
};

type CalendarCell = {
  date: Date | null;
  label: string;
};

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

type VolunteerRow = {
  id: string;
  full_name: string | null;
  preferred_name: string | null;
  pronouns: string | null;
  role: "Regular Volunteer" | "Lead" | "Admin";
  joined_at: string | null;
};

type RecurringAssignment = {
  id: string;
  volunteer_id: string;
  template_id: string;
  starts_on: string;
  ends_on: string | null;
  byday?: string[] | null;
  template?: {
    id: string;
    title: string;
  } | null;
};

type ShiftAssignment = {
  id: string;
  status: "active" | "dropped" | "pending";
  assignment_role: "lead" | "regular";
  shift_instance: {
    id: number;
    shift_date: string | null;
    starts_at: string | null;
    ends_at: string | null;
    notes: string | null;
    template: {
      id: string;
      title: string;
    } | null;
  } | null;
};

type PersonalAssignment = {
  shift_date: string | null;
  starts_at: string | null;
  template_id: string | null;
};

type AuthedAppProps = {
  session: Session;
  profile: ProfileRecord | null;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function diffInDays(start: Date, end: Date) {
  const ms = startOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

type ShiftInstanceRow = {
  id: number;
  starts_at: string | null;
  ends_at: string | null;
  shift_date: string | null;
  template: {
    id: string;
    title: string;
  } | null;
};

function buildWeekCells(baseDate: Date): CalendarCell[] {
  const weekStart = addDays(startOfDay(baseDate), -baseDate.getDay());
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    cells.push({ date, label: String(date.getDate()) });
  }
  return cells;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizePhoneLink(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function formatTemplateTime(value: string | null | undefined) {
  if (!value) return "—";
  const [hours, minutes] = value.split(":");
  if (!hours || !minutes) return value;
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  if (Number.isNaN(date.getTime())) return value;
  return timeFormatter.format(date);
}

function formatTimeRangeFromInstance(start: Date, end: Date) {
  return `${timeFormatter.format(start)} — ${timeFormatter.format(end)}`;
}

function formatRRule(rrule: string | null | undefined) {
  if (!rrule) return "Repeats";
  const parts = rrule.split(";");
  const freq = parts.find((part) => part.startsWith("FREQ="))?.replace("FREQ=", "");
  const byday = parts.find((part) => part.startsWith("BYDAY="))?.replace("BYDAY=", "");
  const dayMap: Record<string, string> = {
    SU: "Sun",
    MO: "Mon",
    TU: "Tue",
    WE: "Wed",
    TH: "Thu",
    FR: "Fri",
    SA: "Sat",
  };
  const days = byday
    ? byday
        .split(",")
        .map((day) => dayMap[day] ?? day)
        .filter(Boolean)
    : [];
  const freqLabel = freq
    ? freq.charAt(0).toUpperCase() + freq.slice(1).toLowerCase()
    : "Repeats";
  if (days.length > 0) {
    return `${freqLabel} on ${days.join(", ")}`;
  }
  return freqLabel;
}

function formatByDay(days: string[] | null | undefined) {
  if (!days || days.length === 0) return "Repeats";
  const dayMap: Record<string, string> = {
    SU: "Sun",
    MO: "Mon",
    TU: "Tue",
    WE: "Wed",
    TH: "Thu",
    FR: "Fri",
    SA: "Sat",
  };
  return days.map((day) => dayMap[day] ?? day).join(", ");
}

function getDayCode(value: string | null | undefined) {
  if (!value) return null;
  const date = value.includes("T") ? new Date(value) : parseDateOnly(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  const map = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  return map[date.getDay()] ?? null;
}

export default function AuthedApp({ session, profile }: AuthedAppProps) {
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeShiftInstanceId, setActiveShiftInstanceId] = useState<number | null>(null);
  const [instanceShifts, setInstanceShifts] = useState<ShiftInstance[]>([]);
  const [weekAssignments, setWeekAssignments] = useState<
    Record<number, ShiftAssignmentDetail[]>
  >({});
  const [showTakeShiftPrompt, setShowTakeShiftPrompt] = useState(false);
  const [takeShiftLoading, setTakeShiftLoading] = useState(false);
  const [takeShiftMessage, setTakeShiftMessage] = useState("");
  const [takeShiftMode, setTakeShiftMode] = useState<"request" | "join">("request");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsMessage, setNotificationsMessage] = useState("");
  const [notifications, setNotifications] = useState<ShiftAssignmentDetail[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  const [showDenyPrompt, setShowDenyPrompt] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [denyTargetId, setDenyTargetId] = useState<string | null>(null);
  const [showDropConfirm, setShowDropConfirm] = useState(false);
  const [showDropReason, setShowDropReason] = useState(false);
  const [dropReason, setDropReason] = useState("");
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [showRemovePrompt, setShowRemovePrompt] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ShiftAssignmentDetail | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeMessage, setRemoveMessage] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [showVolunteers, setShowVolunteers] = useState(false);
  const [volunteersLoading, setVolunteersLoading] = useState(false);
  const [volunteersMessage, setVolunteersMessage] = useState("");
  const [volunteers, setVolunteers] = useState<VolunteerRow[]>([]);
  const [selectedVolunteer, setSelectedVolunteer] = useState<VolunteerRow | null>(null);
  const [volunteerRecurring, setVolunteerRecurring] = useState<RecurringAssignment[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringMessage, setRecurringMessage] = useState("");
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    templateId: "",
    startsOn: "",
    endsOn: "",
  });
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [recurringDeleteId, setRecurringDeleteId] = useState<string | null>(null);
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [showMyShifts, setShowMyShifts] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [assignmentsMessage, setAssignmentsMessage] = useState("");
  const [myRecurring, setMyRecurring] = useState<RecurringAssignment[]>([]);
  const [myShiftsPage, setMyShiftsPage] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [personalShiftKeys, setPersonalShiftKeys] = useState<Set<string>>(new Set());
  const [profileOverride, setProfileOverride] = useState<Partial<ProfileRecord> | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    pronouns: "",
    phone: "",
  });
  const [profileSaveMessage, setProfileSaveMessage] = useState("");
  const [profileSaveLoading, setProfileSaveLoading] = useState(false);
  const scrollYRef = useRef(0);
  const todayCellRef = useRef<HTMLDivElement | null>(null);
  const pendingTodayScrollRef = useRef<string | null>(null);
  const todayKey = getDateKey(today);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const displayProfile = profileOverride ? { ...profile, ...profileOverride } : profile;

  useEffect(() => {
    let mounted = true;

    const fetchTemplates = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("shift_templates")
        .select("*")
        .eq("is_active", true);

      if (!mounted) return;

      if (error || !data) {
        setTemplates([]);
      } else {
        setTemplates(data as unknown as ShiftTemplate[]);
      }

      setLoading(false);
    };

    fetchTemplates();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchShiftInstances = async () => {
      const baseDate = addDays(today, weekOffset * 7);
      const weekStart = addDays(startOfDay(baseDate), -baseDate.getDay());
      const weekEnd = addDays(weekStart, 6);

      const weekStartDate = getDateKey(weekStart);
      const weekEndDate = getDateKey(addDays(weekEnd, 1));
      const { data, error } = await supabase
        .from("shift_instances")
        .select(
          `
          id,
          starts_at,
          ends_at,
          shift_date,
          template:shift_templates (
            id,
            title
          )
        `,
        )
        .or(
          `starts_at.gte.${weekStart.toISOString()},starts_at.lt.${addDays(
            weekEnd,
            1,
          ).toISOString()},shift_date.gte.${weekStartDate},shift_date.lt.${weekEndDate}`,
        )
        .order("starts_at", { ascending: true });

      if (!mounted) return;

      if (error || !data) {
        setInstanceShifts([]);
        return;
      }

      const rows = data as unknown as ShiftInstanceRow[];
      const shifts = rows
        .map((row) => {
          const startValue = row.starts_at ?? row.shift_date;
          const endValue = row.ends_at ?? row.shift_date;
          if (!startValue) return null;
          const start = row.starts_at ? new Date(row.starts_at) : parseDateOnly(startValue);
          const end = row.ends_at ? new Date(row.ends_at) : start;
          if (!start || Number.isNaN(start.getTime())) return null;
          const safeEnd = end && !Number.isNaN(end.getTime()) ? end : start;
          return {
            id: `${row.id}`,
            instanceId: row.id,
            title: row.template?.title ?? "Shift",
            start,
            end: safeEnd,
            templateId: row.template?.id ?? "",
          } satisfies ShiftInstance;
        })
        .filter((item): item is ShiftInstance => Boolean(item));

      setInstanceShifts(shifts);
    };

    fetchShiftInstances();

    return () => {
      mounted = false;
    };
  }, [today, weekOffset]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)");
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    setProfileOverride(null);
  }, [profile?.id]);

  useEffect(() => {
    if (!isEditingProfile) return;
    setProfileForm({
      full_name: displayProfile?.full_name ?? "",
      pronouns: displayProfile?.pronouns ?? "",
      phone: displayProfile?.phone ?? "",
    });
    setProfileSaveMessage("");
  }, [isEditingProfile, displayProfile?.full_name, displayProfile?.pronouns, displayProfile?.phone]);

  useEffect(() => {
    if (showProfile) return;
    setIsEditingProfile(false);
    setProfileSaveMessage("");
  }, [showProfile]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      0,
    );
    const timeout = window.setTimeout(() => {
      setToday(startOfDay(new Date()));
    }, nextMidnight.getTime() - now.getTime());
    return () => {
      window.clearTimeout(timeout);
    };
  }, [today]);

  useEffect(() => {
    if (isMobile) {
      setWeekOffset(0);
    }
  }, [isMobile]);

  // Shift assignments are shown inline per shift; no modal fetch needed.

  const fetchWeekAssignments = useCallback(async () => {
    if (instanceShifts.length === 0) {
      setWeekAssignments({});
      return;
    }

    const instanceIds = instanceShifts.map((shift) => shift.instanceId);
    const { data, error } = await supabase
      .from("shift_assignments")
      .select(
        `
        id,
        created_at,
        status,
        assignment_role,
        volunteer:profiles (
          id,
          full_name,
          preferred_name,
          phone,
          role
        ),
        shift_instance:shift_instances (
          id,
          starts_at,
          shift_date
        )
      `,
      )
      .in("shift_instance_id", instanceIds)
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: true });

    if (error || !data) {
      setWeekAssignments({});
      return;
    }

    const map: Record<number, ShiftAssignmentDetail[]> = {};
    (data as unknown as ShiftAssignmentDetail[]).forEach((assignment) => {
      const instanceId = assignment.shift_instance?.id;
      if (!instanceId) return;
      if (!map[instanceId]) map[instanceId] = [];
      map[instanceId].push(assignment);
    });

    setWeekAssignments(map);
  }, [instanceShifts]);

  useEffect(() => {
    fetchWeekAssignments();
  }, [fetchWeekAssignments]);

  const handleProfileSave = useCallback(async () => {
    if (!displayProfile) return;
    setProfileSaveMessage("");

    if (!profileForm.full_name.trim()) {
      setProfileSaveMessage("Name is required.");
      return;
    }
    if (!profileForm.pronouns.trim()) {
      setProfileSaveMessage("Pronouns are required.");
      return;
    }
    if (!profileForm.phone.trim()) {
      setProfileSaveMessage("Phone number is required.");
      return;
    }

    setProfileSaveLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: profileForm.full_name.trim(),
        pronouns: profileForm.pronouns.trim(),
        phone: profileForm.phone.trim(),
      })
      .eq("id", session.user.id)
      .select("*")
      .single();

    if (error || !data) {
      setProfileSaveMessage(error?.message ?? "Unable to save profile.");
      setProfileSaveLoading(false);
      return;
    }

    setProfileOverride(data as ProfileRecord);
    setIsEditingProfile(false);
    setProfileSaveLoading(false);
  }, [displayProfile, profileForm, session.user.id]);

  const fetchVolunteers = useCallback(async () => {
    setVolunteersLoading(true);
    setVolunteersMessage("");
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, preferred_name, pronouns, role, joined_at")
      .order("joined_at", { ascending: false, nullsFirst: false });

    if (error || !data) {
      setVolunteers([]);
      setVolunteersMessage(error?.message ?? "Unable to load volunteers.");
      setVolunteersLoading(false);
      return;
    }

    setVolunteers(data as unknown as VolunteerRow[]);
    setVolunteersLoading(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const fetchVolunteerRecurring = useCallback(async (volunteerId: string) => {
    setRecurringLoading(true);
    setRecurringMessage("");
    const { data, error } = await supabase
      .from("recurring_assignments")
      .select(
        `
        id,
        volunteer_id,
        template_id,
        starts_on,
        ends_on,
        byday,
        template:shift_templates (
          id,
          title
        )
      `,
      )
      .eq("volunteer_id", volunteerId)
      .order("starts_on", { ascending: true });

    if (error || !data) {
      setVolunteerRecurring([]);
      setRecurringMessage(error?.message ?? "Unable to load recurring shifts.");
      setRecurringLoading(false);
      return;
    }

    setVolunteerRecurring(data as unknown as RecurringAssignment[]);
    setRecurringLoading(false);
  }, []);

  const fetchPersonalAssignments = useCallback(async () => {
    const rangeStart = new Date();
    const rangeEnd = addMonths(rangeStart, 12);
    const { data, error } = await supabase
      .from("shift_assignments")
      .select(
        `
        shift_instance:shift_instances (
          shift_date,
          starts_at,
          template_id
        )
      `,
      )
      .eq("volunteer_id", session.user.id)
      .eq("status", "active")
      .or(
        `starts_at.gte.${rangeStart.toISOString()},starts_at.lt.${rangeEnd.toISOString()},shift_date.gte.${getDateKey(
          rangeStart,
        )},shift_date.lt.${getDateKey(rangeEnd)}`,
        { foreignTable: "shift_instances" },
      );

    if (error || !data) {
      setPersonalShiftKeys(new Set());
      return;
    }

    const keys = new Set<string>();
    (data as unknown as { shift_instance: PersonalAssignment | null }[]).forEach((row) => {
      const instance = row.shift_instance;
      if (!instance || !instance.template_id) return;
      let date: Date | null = null;
      if (instance.shift_date) {
        date = parseDateOnly(instance.shift_date);
      } else if (instance.starts_at) {
        const parsed = new Date(instance.starts_at);
        if (!Number.isNaN(parsed.getTime())) {
          date = parsed;
        }
      }
      if (!date) return;
      keys.add(`${getDateKey(date)}-${instance.template_id}`);
    });
    setPersonalShiftKeys(keys);
  }, [session.user.id]);

  const fetchMyRecurring = useCallback(async () => {
    const { data, error } = await supabase
      .from("recurring_assignments")
      .select("id, volunteer_id, template_id, starts_on, ends_on, byday")
      .eq("volunteer_id", session.user.id);

    if (error || !data) {
      setMyRecurring([]);
      return;
    }

    setMyRecurring(data as unknown as RecurringAssignment[]);
  }, [session.user.id]);

  useEffect(() => {
    fetchPersonalAssignments();
  }, [fetchPersonalAssignments]);

  useEffect(() => {
    fetchMyRecurring();
  }, [fetchMyRecurring]);

  const fetchMyShifts = useCallback(async () => {
    setAssignmentsLoading(true);
    setAssignmentsMessage("");
    const rangeStart = new Date();
    const rangeEnd = addMonths(rangeStart, 12);

    const { data, error } = await supabase
      .from("shift_assignments")
      .select(
        `
        id,
        status,
        assignment_role,
        shift_instance:shift_instances (
          id,
          shift_date,
          starts_at,
          ends_at,
          notes,
          template:shift_templates (
            id,
            title
          )
        )
      `,
      )
      .eq("volunteer_id", session.user.id)
      .in("status", ["active", "pending"])
      .gte("shift_instances.starts_at", rangeStart.toISOString())
      .lt("shift_instances.starts_at", rangeEnd.toISOString())
      .order("starts_at", { ascending: true, foreignTable: "shift_instances" });

    if (!data || error) {
      setAssignments([]);
      setAssignmentsMessage(error?.message ?? "");
    } else {
      setAssignments((data as unknown as ShiftAssignment[]) ?? []);
    }

    setAssignmentsLoading(false);
  }, [session.user.id]);

  const handleRecurringSave = useCallback(async () => {
    if (!selectedVolunteer) return;
    setRecurringMessage("");
    if (!recurringForm.templateId) {
      setRecurringMessage("Select a shift template.");
      return;
    }
    if (!recurringForm.startsOn) {
      setRecurringMessage("Start date is required.");
      return;
    }
    if (recurringDays.length === 0) {
      setRecurringMessage("Select at least one weekday.");
      return;
    }

    setRecurringSaving(true);

    const { data, error } = await supabase
      .from("recurring_assignments")
      .insert({
        volunteer_id: selectedVolunteer.id,
        template_id: recurringForm.templateId,
        starts_on: recurringForm.startsOn,
        ends_on: recurringForm.endsOn || null,
        byday: recurringDays,
      })
      .select("*")
      .single();

    if (error || !data) {
      setRecurringMessage(error?.message ?? "Unable to save recurring shifts.");
      setRecurringSaving(false);
      return;
    }

    const rangeStart = recurringForm.startsOn;
    const rangeEnd = recurringForm.endsOn || getDateKey(addMonths(today, 12));
    const startIso = new Date(`${rangeStart}T00:00:00`).toISOString();
    const endDate = parseDateOnly(rangeEnd) ?? new Date();
    const endExclusive = addDays(endDate, 1).toISOString();

    const { data: instances, error: instanceError } = await supabase
      .from("shift_instances")
      .select("id, shift_date, starts_at")
      .eq("template_id", recurringForm.templateId)
      .or(
        `starts_at.gte.${startIso},starts_at.lt.${endExclusive},shift_date.gte.${rangeStart},shift_date.lte.${rangeEnd}`,
      );

    const allowedDays = recurringDays;
    const filteredInstances =
      allowedDays.length > 0
        ? (instances ?? []).filter((instance) => {
            const dayCode = getDayCode(instance.shift_date ?? instance.starts_at ?? undefined);
            return dayCode ? allowedDays.includes(dayCode) : false;
          })
        : instances ?? [];

    if (!instanceError && filteredInstances.length > 0) {
      const assignmentRole = selectedVolunteer.role === "Lead" ? "lead" : "regular";
      const payload = filteredInstances.map((instance) => ({
        shift_instance_id: instance.id,
        volunteer_id: selectedVolunteer.id,
        status: "active",
        assignment_role: assignmentRole,
        dropped_at: null,
        dropped_reason: null,
      }));
      await supabase
        .from("shift_assignments")
        .upsert(payload, { onConflict: "shift_instance_id,volunteer_id" });
    }

    setRecurringForm({ templateId: "", startsOn: "", endsOn: "" });
    setRecurringDays([]);
    setShowAddRecurring(false);
    setRecurringSaving(false);
    fetchVolunteerRecurring(selectedVolunteer.id);
    fetchMyShifts();
    fetchWeekAssignments();
  }, [
    selectedVolunteer,
    recurringForm,
    today,
    fetchVolunteerRecurring,
    fetchMyShifts,
    fetchWeekAssignments,
  ]);

  const handleRecurringDelete = useCallback(
    async (recurringId: string) => {
      if (!selectedVolunteer) return;
      setRecurringMessage("");
      setRecurringDeleteId(recurringId);
      const target = volunteerRecurring.find((item) => item.id === recurringId);
      if (!target) {
        setRecurringMessage("Recurring shift not found.");
        setRecurringDeleteId(null);
        return;
      }
      setVolunteerRecurring((prev) => prev.filter((item) => item.id !== recurringId));

      const rangeStart = target.starts_on;
      const rangeEnd = target.ends_on || getDateKey(addMonths(today, 12));
      const startIso = new Date(`${rangeStart}T00:00:00`).toISOString();
      const endDate = parseDateOnly(rangeEnd) ?? new Date();
      const endExclusive = addDays(endDate, 1).toISOString();

      const { data: instances, error: instanceError } = await supabase
        .from("shift_instances")
        .select("id")
        .eq("template_id", target.template_id)
        .or(
          `starts_at.gte.${startIso},starts_at.lt.${endExclusive},shift_date.gte.${rangeStart},shift_date.lte.${rangeEnd}`,
        );

      if (instanceError) {
        setRecurringMessage(instanceError.message);
        setRecurringDeleteId(null);
        return;
      }

      const instanceIds = (instances ?? []).map((item) => item.id);
      if (instanceIds.length > 0) {
        const { error: assignmentError } = await supabase
          .from("shift_assignments")
          .delete()
          .eq("volunteer_id", selectedVolunteer.id)
          .in("shift_instance_id", instanceIds);

        if (assignmentError) {
          setRecurringMessage(assignmentError.message);
          setRecurringDeleteId(null);
          return;
        }
      }

      const { error } = await supabase
        .from("recurring_assignments")
        .delete()
        .eq("id", recurringId);

      if (error) {
        setRecurringMessage(error.message);
        setRecurringDeleteId(null);
        fetchVolunteerRecurring(selectedVolunteer.id);
        return;
      }

      setRecurringDeleteId(null);
      fetchVolunteerRecurring(selectedVolunteer.id);
      fetchMyShifts();
      fetchWeekAssignments();
    },
    [
      selectedVolunteer,
      volunteerRecurring,
      today,
      fetchVolunteerRecurring,
      fetchMyShifts,
      fetchWeekAssignments,
    ],
  );

  useEffect(() => {
    if (!showMyShifts) return;
    let mounted = true;

    fetchMyShifts().then(() => {
      if (!mounted) return;
    });

    return () => {
      mounted = false;
    };
  }, [showMyShifts, fetchMyShifts]);

  useEffect(() => {
    const channel = supabase
      .channel("shift-assignments-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_assignments" },
        () => {
          fetchWeekAssignments();
          fetchMyShifts();
          fetchPersonalAssignments();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchWeekAssignments, fetchMyShifts, fetchPersonalAssignments]);

  const fetchNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsMessage("");
    const baseSelect = `
        id,
        created_at,
        dropped_at,
        status,
        dropped_reason,
        assignment_role,
        volunteer:profiles (
          id,
          full_name,
          preferred_name,
          role
        ),
        shift_instance:shift_instances (
          id,
          shift_date,
          starts_at,
          ends_at,
          template:shift_templates (
            id,
            title
          )
        )
      `;

    const query =
      profile?.role === "Admin"
        ? supabase
            .from("shift_assignments")
            .select(baseSelect)
            .in("status", ["pending", "dropped"])
            .order("created_at", { ascending: true })
        : supabase
            .from("shift_assignments")
            .select(baseSelect)
            .eq("volunteer_id", session.user.id)
            .in("status", ["active", "dropped"])
            .order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      setNotifications([]);
      setNotificationsMessage(error.message);
      setNotificationsLoading(false);
      return;
    }

    const items = (data as unknown as ShiftAssignmentDetail[]) ?? [];
    setNotifications(items);
    const unreadCount =
      profile?.role === "Admin"
        ? items.filter((item) => item.status === "pending" || !readNotificationIds.has(item.id))
            .length
        : items.filter((item) => !readNotificationIds.has(item.id)).length;
    setNotificationCount(unreadCount);
    setNotificationsLoading(false);
  }, [profile?.role, session.user.id, readNotificationIds]);

  const fetchNotificationCount = useCallback(async () => {
    const baseSelect = `
        id,
        created_at,
        dropped_at,
        status,
        dropped_reason,
        assignment_role,
        volunteer:profiles (
          id,
          full_name,
          preferred_name,
          role
        ),
        shift_instance:shift_instances (
          id,
          shift_date,
          starts_at,
          ends_at,
          template:shift_templates (
            id,
            title
          )
        )
      `;

    const query =
      profile?.role === "Admin"
        ? supabase
            .from("shift_assignments")
            .select(baseSelect)
            .in("status", ["pending", "dropped"])
        : supabase
            .from("shift_assignments")
            .select(baseSelect)
            .eq("volunteer_id", session.user.id)
            .in("status", ["active", "dropped"]);

    const { data, error } = await query;

    if (error) {
      setNotificationCount(0);
      return;
    }

    const items = (data as unknown as ShiftAssignmentDetail[]) ?? [];
    const unreadCount =
      profile?.role === "Admin"
        ? items.filter((item) => item.status === "pending" || !readNotificationIds.has(item.id))
            .length
        : items.filter((item) => !readNotificationIds.has(item.id)).length;
    setNotificationCount(unreadCount);
  }, [profile?.role, session.user.id, readNotificationIds]);

  useEffect(() => {
    if (!showNotifications) return;
    fetchNotifications();
  }, [showNotifications, fetchNotifications]);

  useEffect(() => {
    if (!showVolunteers) return;
    fetchVolunteers();
  }, [showVolunteers, fetchVolunteers]);

  useEffect(() => {
    if (!selectedVolunteer) return;
    fetchVolunteerRecurring(selectedVolunteer.id);
  }, [selectedVolunteer, fetchVolunteerRecurring]);

  useEffect(() => {
    if (!session.user.id) return;
    const channel = supabase
      .channel(`notifications:${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shift_assignments",
          filter:
            profile?.role === "Admin"
              ? "status=in.(pending,dropped)"
              : `volunteer_id=eq.${session.user.id}`,
        },
        () => {
          fetchNotificationCount();
          fetchNotifications();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.role, session.user.id, showNotifications, fetchNotifications, fetchNotificationCount]);

  useEffect(() => {
    const readKey = `notificationsRead:${session.user.id}`;
    const readStored = localStorage.getItem(readKey);
    if (readStored) {
      try {
        const parsed = JSON.parse(readStored) as string[];
        setReadNotificationIds(new Set(parsed));
      } catch {
        setReadNotificationIds(new Set());
      }
    } else {
      setReadNotificationIds(new Set());
    }
  }, [session.user.id]);

  useEffect(() => {
    const storageKey = `weekOffset:${session.user.id}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) {
        setWeekOffset(parsed);
      }
    }
  }, [session.user.id]);

  useEffect(() => {
    const storageKey = `weekOffset:${session.user.id}`;
    localStorage.setItem(storageKey, String(weekOffset));
  }, [session.user.id, weekOffset]);

  const persistReadIds = (next: Set<string>) => {
    const readKey = `notificationsRead:${session.user.id}`;
    localStorage.setItem(readKey, JSON.stringify(Array.from(next)));
    setReadNotificationIds(next);
  };

  useEffect(() => {
    fetchNotificationCount();
  }, [fetchNotificationCount]);

  const shifts = useMemo(() => instanceShifts, [instanceShifts]);

  const unreadNotifications = useMemo(() => {
    if (profile?.role === "Admin") {
      return notifications.filter(
        (item) => item.status === "pending" || !readNotificationIds.has(item.id),
      );
    }
    return notifications.filter((item) => !readNotificationIds.has(item.id));
  }, [notifications, readNotificationIds, profile?.role]);

  const shiftsByDate = useMemo(
    () =>
      shifts.reduce<Record<string, ShiftInstance[]>>((acc, shift) => {
        const key = getDateKey(shift.start);
        if (!acc[key]) acc[key] = [];
        acc[key].push(shift);
        return acc;
      }, {}),
    [shifts],
  );

  const templateMap = useMemo(
    () =>
      templates.reduce<Record<string, ShiftTemplate>>((acc, template) => {
        acc[template.id] = template;
        return acc;
      }, {}),
    [templates],
  );

  const baseDate = addDays(today, weekOffset * 7);
  const displayCells = buildWeekCells(baseDate);
  const monthLabel = monthFormatter.format(baseDate);
  const weekStart = addDays(startOfDay(baseDate), -baseDate.getDay());
  const weekEnd = addDays(weekStart, 6);
  const rangeLabel = `${dayFormatter.format(weekStart)} – ${dayFormatter.format(weekEnd)}`;
  const maxWeekOffset = Math.max(0, Math.floor(diffInDays(today, addMonths(today, 12)) / 7));

  const showEmptyState = !loading && templates.length === 0;
  const assignmentsForDisplay = assignments.filter(
    (assignment) => assignment.shift_instance && assignment.shift_instance.starts_at,
  );
  const recurringTemplates = useMemo(() => {
    const seen = new Set<string>();
    const results: ShiftTemplate[] = [];
    assignments.forEach((assignment) => {
      const templateId = assignment.shift_instance?.template?.id;
      if (!templateId || seen.has(templateId)) return;
      const template = templateMap[templateId];
      if (!template?.rrule) return;
      seen.add(templateId);
      results.push(template);
    });
    myRecurring.forEach((recurring) => {
      const templateId = recurring.template_id;
      if (!templateId || seen.has(templateId)) return;
      const template = templateMap[templateId];
      if (!template) return;
      seen.add(templateId);
      results.push(template);
    });
    return results;
  }, [assignments, templateMap, myRecurring]);
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(assignmentsForDisplay.length / pageSize));
  const clampedPage = Math.min(myShiftsPage, totalPages - 1);
  const pagedAssignments = assignmentsForDisplay.slice(
    clampedPage * pageSize,
    clampedPage * pageSize + pageSize,
  );
  const showNoUpcoming = !assignmentsLoading && assignmentsForDisplay.length === 0 && !assignmentsMessage;
  const showNoRecurring = !assignmentsLoading && recurringTemplates.length === 0 && !assignmentsMessage;

  const handleConfirmTakeShift = async () => {
    if (!activeShiftInstanceId) {
      setTakeShiftMessage("Shift instance not found.");
      return;
    }
    setTakeShiftLoading(true);
    setTakeShiftMessage("");

    const assignmentRole = profile?.role === "Lead" ? "lead" : "regular";
    const nextStatus = takeShiftMode === "join" ? "active" : "pending";

    const { error } = await supabase
      .from("shift_assignments")
      .upsert(
        {
          shift_instance_id: activeShiftInstanceId,
          volunteer_id: session.user.id,
          status: nextStatus,
          assignment_role: assignmentRole,
          dropped_at: null,
          dropped_reason: null,
        },
        { onConflict: "shift_instance_id,volunteer_id" },
      );

    if (error) {
      setTakeShiftMessage(error.message);
      setTakeShiftLoading(false);
      return;
    }

    setShowTakeShiftPrompt(false);
    setTakeShiftLoading(false);

    const baseDate = addDays(today, weekOffset * 7);
    const weekStart = addDays(startOfDay(baseDate), -baseDate.getDay());
    const weekEnd = addDays(weekStart, 6);

    const { data, error: refreshError } = await supabase
      .from("shift_assignments")
      .select(
        `
        id,
        created_at,
        status,
        assignment_role,
        volunteer:profiles (
          id,
          full_name,
          preferred_name,
          role
        ),
        shift_instance:shift_instances (
          id,
          starts_at,
          shift_date
        )
      `,
      )
      .in("status", ["active", "pending"])
      .or(
        `starts_at.gte.${weekStart.toISOString()},starts_at.lt.${addDays(
          weekEnd,
          1,
        ).toISOString()},shift_date.gte.${getDateKey(weekStart)},shift_date.lt.${getDateKey(
          addDays(weekEnd, 1),
        )}`,
        { foreignTable: "shift_instances" },
      )
      .order("created_at", { ascending: true });

    if (!refreshError && data) {
      const map: Record<number, ShiftAssignmentDetail[]> = {};
      (data as unknown as ShiftAssignmentDetail[]).forEach((assignment) => {
        const instanceId = assignment.shift_instance?.id;
        if (!instanceId) return;
        if (!map[instanceId]) map[instanceId] = [];
        map[instanceId].push(assignment);
      });
      setWeekAssignments(map);
    }
    await fetchWeekAssignments();
    await fetchPersonalAssignments();
  };

  const handleNotificationDecision = async (
    assignmentId: string,
    decision: "approve" | "deny",
  ) => {
    if (decision === "deny") {
      setDenyTargetId(assignmentId);
      setDenyReason("");
      setShowDenyPrompt(true);
      return;
    }

    setNotificationsLoading(true);
    setNotificationsMessage("");

    const { error } = await supabase
      .from("shift_assignments")
      .update({ status: "active" })
      .eq("id", assignmentId);

    if (error) {
      setNotificationsMessage(error.message);
      setNotificationsLoading(false);
      return;
    }

    const { data } = await supabase
      .from("shift_assignments")
      .select(
        `
        id,
        created_at,
        status,
        dropped_reason,
        assignment_role,
        volunteer:profiles (
          id,
          full_name,
          preferred_name,
          role
        ),
        shift_instance:shift_instances (
          id,
          shift_date,
          starts_at,
          ends_at,
          template:shift_templates (
            id,
            title
          )
        )
      `,
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    setNotifications((data as unknown as ShiftAssignmentDetail[]) ?? []);
    setNotificationsLoading(false);
    await fetchWeekAssignments();
  };

  const handleConfirmDeny = async () => {
    if (!denyTargetId) return;
    if (!denyReason.trim()) {
      setNotificationsMessage("Please add a denial reason.");
      return;
    }
    setNotificationsLoading(true);
    setNotificationsMessage("");

    const { error } = await supabase
      .from("shift_assignments")
      .update({
        status: "dropped",
        dropped_at: new Date().toISOString(),
        dropped_reason: denyReason.trim(),
      })
      .eq("id", denyTargetId);

    if (error) {
      setNotificationsMessage(error.message);
      setNotificationsLoading(false);
      return;
    }

    setShowDenyPrompt(false);
    setDenyTargetId(null);
    setDenyReason("");

    const { data } = await supabase
      .from("shift_assignments")
      .select(
        `
        id,
        created_at,
        status,
        dropped_reason,
        assignment_role,
        volunteer:profiles (
          id,
          full_name,
          preferred_name,
          role
        ),
        shift_instance:shift_instances (
          id,
          shift_date,
          starts_at,
          ends_at,
          template:shift_templates (
            id,
            title
          )
        )
      `,
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    setNotifications((data as unknown as ShiftAssignmentDetail[]) ?? []);
    setNotificationsLoading(false);
    await fetchWeekAssignments();
  };

  const handleRemoveVolunteer = async () => {
    if (!removeTarget) return;
    setRemoveLoading(true);
    setRemoveMessage("");

    const { error } = await supabase
      .from("shift_assignments")
      .update({
        status: "dropped",
        dropped_at: new Date().toISOString(),
        dropped_reason: "Removed by admin",
      })
      .eq("id", removeTarget.id);

    if (error) {
      setRemoveMessage(error.message);
      setRemoveLoading(false);
      return;
    }

    setShowRemovePrompt(false);
    setRemoveTarget(null);
    setRemoveMessage("");
    setRemoveLoading(false);

    await fetchWeekAssignments();
  };

  const handleDropShift = async () => {
    if (!dropTargetId) return;
    if (profile?.role !== "Admin" && !dropReason.trim()) {
      setAssignmentsMessage("Please add a drop reason.");
      return;
    }
    setAssignmentsLoading(true);
    setAssignmentsMessage("");

    const { error } = await supabase
      .from("shift_assignments")
      .update({
        status: "dropped",
        dropped_at: new Date().toISOString(),
        dropped_reason: profile?.role === "Admin" ? "Removed by admin" : dropReason.trim(),
      })
      .eq("id", dropTargetId);

    if (error) {
      setAssignmentsMessage(error.message);
      setAssignmentsLoading(false);
      return;
    }

    setShowDropReason(false);
    setShowDropConfirm(false);
    setDropTargetId(null);
    setDropReason("");

    await fetchMyShifts();
    await fetchPersonalAssignments();
    await fetchWeekAssignments();
  };

  useEffect(() => {
    if (showMyShifts) {
      setMyShiftsPage(0);
    }
  }, [showMyShifts, assignmentsForDisplay.length]);

  // Removed focus refresh to avoid reloading view on tab switch.

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        scrollYRef.current = window.scrollY;
      } else {
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollYRef.current);
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setShowMenu(false);
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [showMenu]);

  const findScrollParent = (node: HTMLElement | null) => {
    let current: HTMLElement | null = node?.parentElement ?? null;
    while (current) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  };

  const scrollToDateKey = (dateKey: string) => {
    const target = document.getElementById(`day-${dateKey}`) as HTMLDivElement | null;
    if (!target) return;
    const scrollParent = findScrollParent(target);
    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offset = targetRect.top - parentRect.top - 24;
      scrollParent.scrollTo({ top: scrollParent.scrollTop + offset, behavior: "smooth" });
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    const rect = target.getBoundingClientRect();
    const top = window.scrollY + rect.top - 24;
    window.scrollTo({ top, behavior: "smooth" });
  };

  useEffect(() => {
    const targetKey = pendingTodayScrollRef.current;
    if (weekOffset !== 0 || !targetKey) return;
    pendingTodayScrollRef.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToDateKey(targetKey);
        window.setTimeout(() => scrollToDateKey(targetKey), 200);
      });
    });
  }, [todayKey, weekOffset]);

  const handleTodayClick = () => {
    const now = startOfDay(new Date());
    const nowKey = getDateKey(now);

    setToday(now);
    pendingTodayScrollRef.current = nowKey;

    if (weekOffset !== 0) {
      setWeekOffset(0);
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToDateKey(nowKey);
        window.setTimeout(() => scrollToDateKey(nowKey), 200);
      });
    });
  };

  return (
    <div className="calendar-shell">
      <header className="calendar-header">
        <div>
          <p className="calendar-eyebrow">Team schedule</p>
          <h1 className="calendar-title">CKC Shift Calendar</h1>
          <p className="calendar-subtitle">{rangeLabel}</p>
          <div className="month-nav month-nav-left">
            <button
              className="nav-button"
              onClick={() => setWeekOffset((value) => Math.max(0, value - 1))}
              disabled={weekOffset === 0}
            >
              Prev
            </button>
            <button className="nav-button" onClick={handleTodayClick}>
              Today
            </button>
            <button
              className="nav-button"
              onClick={() => setWeekOffset((value) => Math.min(maxWeekOffset, value + 1))}
              disabled={weekOffset >= maxWeekOffset}
            >
              Next
            </button>
          </div>
        </div>
        <div className="calendar-actions">
          <div className="menu-shell" ref={menuRef}>
            <button
              className="menu-button"
              type="button"
              aria-label="Open menu"
              aria-haspopup="menu"
              aria-expanded={showMenu}
              onClick={() => setShowMenu((value) => !value)}
            >
              ⋯
              {notificationCount > 0 ? (
                <span className="notification-badge">
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              ) : null}
            </button>
            {showMenu ? (
              <div className="menu-dropdown" role="menu">
                <button
                  className="menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMenu(false);
                    setShowMyShifts(true);
                  }}
                >
                  My shifts
                </button>
                <button
                  className="menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMenu(false);
                    setShowNotifications(true);
                  }}
                >
                  Notifications
                </button>
                <button
                  className="menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMenu(false);
                    setShowVolunteers(true);
                  }}
                >
                  All volunteers
                </button>
                <button
                  className="menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMenu(false);
                    setShowProfile(true);
                  }}
                >
                  My profile
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="loading-banner">Loading templates…</div>
      ) : null}
      {showEmptyState ? (
        <div className="error-banner">No active shift templates</div>
      ) : null}

      <section className="calendar-panel">
        <div className="calendar-jump">
          <button className="account-button jump-today" type="button" onClick={handleTodayClick}>
            Jump to Today
          </button>
        </div>
        <div className="calendar-header">
          <div>
            <p className="calendar-eyebrow">Week View</p>
            <h2 className="calendar-title">{monthLabel}</h2>
            <p className="calendar-subtitle">{rangeLabel}</p>
          </div>
        </div>

        <div className="calendar-grid">
          {WEEKDAYS.map((day, index) => (
            <div
              key={`${monthLabel}-${day}`}
              className={`weekday ${index === today.getDay() ? "weekday-today" : ""}`}
            >
              {day}
            </div>
          ))}

          {displayCells.map((cell, cellIndex) => {
            if (!cell.date) {
              return (
                <div
                  key={`${monthLabel}-empty-${cellIndex}`}
                  className="day-cell outside"
                />
              );
            }

            const dateKey = getDateKey(cell.date);
            const dayShifts = shiftsByDate[dateKey] ?? [];

            return (
              <div
                key={`${monthLabel}-${dateKey}`}
                className="day-cell"
                data-date={dateKey}
                id={`day-${dateKey}`}
                ref={dateKey === todayKey ? todayCellRef : undefined}
              >
                <div className="day-weekday">
                  {WEEKDAYS[cell.date.getDay()]}
                </div>
                <div className="day-number">{cell.label}</div>
                <div className="shift-list">
                  {dayShifts.map((shift) => {
                    const hasTimes = Boolean(shift.start && shift.end);
                    const assignmentList = weekAssignments[shift.instanceId] ?? [];
                    const sortedAssignments = assignmentList
                      .slice()
                      .sort((left, right) => {
                        const rankFor = (assignment: ShiftAssignmentDetail) => {
                          if (assignment.status === "pending") return 3;
                          if (assignment.volunteer?.role === "Admin") return 0;
                          if (assignment.assignment_role === "lead") return 1;
                          return 2;
                        };
                        const rankLeft = rankFor(left);
                        const rankRight = rankFor(right);
                        if (rankLeft !== rankRight) return rankLeft - rankRight;
                        const leftCreated = left.created_at ?? "";
                        const rightCreated = right.created_at ?? "";
                        return leftCreated.localeCompare(rightCreated);
                      });
                    return (
                      <div
                        key={shift.id}
                        className="shift-block"
                      >
                        <div className="shift-block-header">
                          <div>
                            <p className="shift-block-title">{shift.title}</p>
                            <p className="shift-block-meta">
                              {hasTimes
                                ? `${timeFormatter.format(shift.start)}–${timeFormatter.format(
                                    shift.end,
                                  )}`
                                : "—"}
                            </p>
                          </div>
                        </div>
                        <div className="shift-assignment-list">
                          {Array.from({ length: 6 }).map((_, index) => {
                            const assignment = sortedAssignments[index];
                            const name =
                              assignment?.volunteer?.preferred_name ||
                              assignment?.volunteer?.full_name ||
                              null;
                            const slotClass = assignment
                              ? assignment.status === "pending"
                                ? "pending"
                                : assignment.volunteer?.role === "Admin"
                                  ? "admin"
                                  : assignment.assignment_role === "lead"
                                    ? "lead"
                                    : "assigned"
                              : "none";
                            return (
                              <button
                                key={`${shift.id}-slot-${index}`}
                                className={`capacity-slot ${slotClass}`}
                                type="button"
                                disabled={
                                  Boolean(assignment) &&
                                  profile?.role !== "Admin" &&
                                  assignment?.volunteer?.id !== session.user.id
                                }
                                onClick={() => {
                                  setActiveShiftInstanceId(shift.instanceId);

                                  if (!assignment) {
                                    setTakeShiftMessage("");
                                    setTakeShiftMode(
                                      profile?.role === "Admin" ? "join" : "request",
                                    );
                                    setShowTakeShiftPrompt(true);
                                  } else if (
                                    assignment.volunteer?.id === session.user.id &&
                                    profile?.role !== "Admin"
                                  ) {
                                    setDropTargetId(assignment.id);
                                    setShowDropConfirm(true);
                                  } else if (profile?.role === "Admin") {
                                    setRemoveTarget(assignment);
                                    setShowRemovePrompt(true);
                                  }
                                }}
                              >
                                {assignment?.status === "pending" ? (
                                  "Pending"
                                ) : assignment ? (
                                  <div className="capacity-slot-content">
                                    <span>{name ?? "No Volunteer Assigned"}</span>
                                    {(assignment.assignment_role === "lead" ||
                                      assignment.volunteer?.role === "Admin") &&
                                    assignment.volunteer?.phone ? (
                                      isMobile ? (
                                        <span className="capacity-slot-phone">
                                          <a
                                            className="capacity-slot-phone-link"
                                            href={`tel:${normalizePhoneLink(
                                              assignment.volunteer.phone,
                                            )}`}
                                          >
                                            {assignment.volunteer.phone}
                                          </a>
                                        </span>
                                      ) : (
                                        <span className="capacity-slot-phone">
                                          {assignment.volunteer.phone}
                                        </span>
                                      )
                                    ) : null}
                                  </div>
                                ) : (
                                  "No Volunteer Assigned"
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>


      {showMyShifts ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel account-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Schedule</p>
                <h3 className="modal-title">My shifts</h3>
              </div>
              <button className="modal-close" type="button" onClick={() => setShowMyShifts(false)}>
                Close
              </button>
            </div>

            <div className="modal-body">
              {assignmentsLoading ? (
                <div className="loading-banner">Loading shifts...</div>
              ) : null}
              {assignmentsMessage ? (
                <div className="error-banner">{assignmentsMessage}</div>
              ) : null}
              <div className="myshifts-section">
                <p className="myshifts-section-title">Upcoming shifts</p>
                {showNoUpcoming ? (
                  <div className="empty-banner">
                    No upcoming shifts yet. Check the calendar to join a shift!
                  </div>
                ) : null}
                {assignmentsForDisplay.length > 0 ? (
                  <div className="myshifts-list">
                    {pagedAssignments.map((assignment) => {
                      const shift = assignment.shift_instance;
                      if (!shift) return null;
                      const title = shift.template?.title ?? "Shift";
                      const roleLabel =
                        profile?.role === "Admin"
                          ? "Lead Shift"
                          : assignment.assignment_role === "lead"
                            ? "Lead Volunteer"
                            : "Regular Volunteer";
                      return (
                        <button
                          key={assignment.id}
                          className="myshift-card"
                          type="button"
                          onClick={() => {
                            setDropTargetId(assignment.id);
                            setShowDropConfirm(true);
                          }}
                        >
                          <div className="myshift-header">
                            <div>
                              <p className="myshift-title">{title}</p>
                              <p className="myshift-meta">
                                {formatDateTime(shift.starts_at)} — {formatDateTime(shift.ends_at)}
                              </p>
                            </div>
                            <span className={`myshift-role ${assignment.assignment_role}`}>
                              {roleLabel}
                            </span>
                          </div>
                          {shift.notes ? (
                            <div className="myshift-notes">{shift.notes}</div>
                          ) : null}
                        </button>
                      );
                    })}
                    {totalPages > 1 ? (
                      <div className="myshifts-pagination">
                        <button
                          className="nav-button"
                          type="button"
                          onClick={() => setMyShiftsPage((page) => Math.max(0, page - 1))}
                          disabled={clampedPage === 0}
                        >
                          Prev
                        </button>
                        <span className="pagination-label">
                          Page {clampedPage + 1} of {totalPages}
                        </span>
                        <button
                          className="nav-button"
                          type="button"
                          onClick={() =>
                            setMyShiftsPage((page) => Math.min(totalPages - 1, page + 1))
                          }
                          disabled={clampedPage >= totalPages - 1}
                        >
                          Next
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="myshifts-section">
                <p className="myshifts-section-title">Repeating shifts</p>
                {showNoRecurring ? (
                  <div className="empty-banner">
                    No repeating shifts yet.
                  </div>
                ) : null}
                {recurringTemplates.length > 0 ? (
                  <div className="recurring-list">
                    {recurringTemplates.map((template) => {
                      const templateInstance = instanceShifts.find(
                        (shift) => shift.templateId === template.id,
                      );
                      const timeRange = template.start_time
                        ? `${formatTemplateTime(template.start_time)} — ${formatTemplateTime(
                            template.end_time,
                          )}`
                        : templateInstance
                          ? formatTimeRangeFromInstance(templateInstance.start, templateInstance.end)
                          : "—";
                      return (
                        <div key={template.id} className="recurring-card">
                          <div>
                            <p className="recurring-title">{template.title}</p>
                            <p className="recurring-meta">{timeRange}</p>
                          </div>
                          <span className="recurring-pill">{formatRRule(template.rrule)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showTakeShiftPrompt ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel take-shift-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Confirm</p>
                <h3 className="modal-title">
                  {takeShiftMode === "join" ? "Join Shift?" : "Take Shift?"}
                </h3>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowTakeShiftPrompt(false)}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                {takeShiftMode === "join"
                  ? "Would you like to join this shift?"
                  : "Would you like to take this shift? This will reserve the spot for you."}
              </p>
              {takeShiftMessage ? (
                <div className="error-banner">{takeShiftMessage}</div>
              ) : null}
              <div className="modal-actions">
                <button
                  className="nav-button"
                  type="button"
                  onClick={() => setShowTakeShiftPrompt(false)}
                  disabled={takeShiftLoading}
                >
                  No
                </button>
                <button
                  className="account-button"
                  type="button"
                  onClick={handleConfirmTakeShift}
                  disabled={takeShiftLoading}
                >
                  {takeShiftLoading
                    ? "Saving..."
                    : takeShiftMode === "join"
                      ? "Join shift"
                      : "Request to be Added"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}


      {showNotifications ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel account-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">
                  {displayProfile?.preferred_name ||
                    displayProfile?.full_name ||
                    session.user.email ||
                    "Account"}
                </p>
                <h3 className="modal-title">Notifications</h3>
              </div>
              <div className="modal-header-actions">
                <button
                  className="nav-button"
                  type="button"
                  onClick={() => {
                    const next = new Set(readNotificationIds);
                    notifications.forEach((item) => next.add(item.id));
                    persistReadIds(next);
                    setNotificationCount(0);
                  }}
                >
                  Clear all
                </button>
                <button
                  className="modal-close"
                  type="button"
                  onClick={() => setShowNotifications(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="modal-body">
              {notificationsLoading ? (
                <div className="loading-banner">Loading requests...</div>
              ) : null}
              {notificationsMessage ? (
                <div className="error-banner">{notificationsMessage}</div>
              ) : null}
              {unreadNotifications.length === 0 && !notificationsLoading ? (
                <div className="empty-banner">Nothing Here!</div>
              ) : null}
              {unreadNotifications.length > 0 ? (
                <div className="notifications-list">
                  {unreadNotifications.map((request) => {
                    const volunteerName =
                      request.volunteer?.preferred_name ||
                      request.volunteer?.full_name ||
                      "Volunteer";
                    const shiftInstance = request.shift_instance;
                    const startsAt = shiftInstance?.starts_at ?? shiftInstance?.shift_date ?? "";
                    const endsAt = shiftInstance?.ends_at ?? "";
                    const shiftTitle = shiftInstance?.template?.title ?? "Shift";
                    const timeLine = `${formatDateTime(startsAt)}${
                      endsAt ? ` — ${formatDateTime(endsAt)}` : ""
                    } · ${shiftTitle}`;

                    const markRead = () => {
                      const next = new Set(readNotificationIds);
                      next.add(request.id);
                      persistReadIds(next);
                    };

                    if (profile?.role === "Admin") {
                      if (request.status === "dropped") {
                        return (
                          <div key={request.id} className="notification-card">
                            <label className="notification-read">
                              <input type="checkbox" onChange={markRead} checked={false} />
                              <span className="notification-check-label">Mark read</span>
                            </label>
                            <div className="notification-info">
                              <p className="notification-name">
                                {volunteerName} dropped a shift
                              </p>
                              <p className="notification-meta">{timeLine}</p>
                              {request.dropped_reason ? (
                                <p className="notification-reason">{request.dropped_reason}</p>
                              ) : null}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={request.id} className="notification-card">
                          <label className="notification-read">
                            <input type="checkbox" onChange={markRead} checked={false} />
                            <span className="notification-check-label">Mark read</span>
                          </label>
                          <div className="notification-info">
                            <p className="notification-name">{volunteerName} request to join</p>
                            <p className="notification-meta">{timeLine}</p>
                          </div>
                          <div className="notification-actions">
                            <button
                              className="nav-button"
                              type="button"
                              onClick={() => handleNotificationDecision(request.id, "deny")}
                            >
                              Deny
                            </button>
                            <button
                              className="account-button"
                              type="button"
                              onClick={() => handleNotificationDecision(request.id, "approve")}
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const statusLabel =
                      request.status === "active"
                        ? "Your shift was approved!"
                        : request.dropped_reason === "Removed by admin"
                          ? `You have been removed from ${shiftTitle}`
                          : `Shift Denied · ${shiftTitle}`;

                    return (
                      <div key={request.id} className="notification-card">
                        <label className="notification-read">
                          <input type="checkbox" onChange={markRead} checked={false} />
                          <span className="notification-check-label">Mark read</span>
                        </label>
                        <div className="notification-info">
                          <p className="notification-name">{statusLabel}</p>
                          <p className="notification-meta">{timeLine}</p>
                          {request.status === "dropped" &&
                          request.dropped_reason &&
                          request.dropped_reason !== "Removed by admin" ? (
                            <p className="notification-reason">{request.dropped_reason}</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showDropConfirm ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel take-shift-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Confirm</p>
                <h3 className="modal-title">Drop Shift?</h3>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowDropConfirm(false)}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-actions">
                <button
                  className="nav-button"
                  type="button"
                  onClick={() => setShowDropConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  className="account-button"
                  type="button"
                  onClick={() => {
                    setShowDropConfirm(false);
                    if (profile?.role === "Admin") {
                      handleDropShift();
                    } else {
                      setShowDropReason(true);
                    }
                  }}
                >
                  Drop shift
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showDropReason ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel take-shift-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Drop shift</p>
                <h3 className="modal-title">Reason</h3>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowDropReason(false)}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <label className="form-field">
                <span className="form-label">Reason</span>
                <textarea
                  className="form-input form-textarea"
                  rows={3}
                  value={dropReason}
                  onChange={(event) => setDropReason(event.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button
                  className="nav-button"
                  type="button"
                  onClick={() => setShowDropReason(false)}
                >
                  Cancel
                </button>
                <button className="account-button" type="button" onClick={handleDropShift}>
                  Submit drop
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showDenyPrompt ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel take-shift-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Admin</p>
                <h3 className="modal-title">Deny request</h3>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowDenyPrompt(false)}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <label className="form-field">
                <span className="form-label">Reason</span>
                <textarea
                  className="form-input form-textarea"
                  rows={3}
                  value={denyReason}
                  onChange={(event) => setDenyReason(event.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button
                  className="nav-button"
                  type="button"
                  onClick={() => setShowDenyPrompt(false)}
                >
                  Cancel
                </button>
                <button
                  className="account-button"
                  type="button"
                  onClick={handleConfirmDeny}
                >
                  Deny request
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showRemovePrompt ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel take-shift-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Admin</p>
                <h3 className="modal-title">Remove Volunteer?</h3>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowRemovePrompt(false)}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                Remove{" "}
                {removeTarget?.volunteer?.preferred_name ||
                  removeTarget?.volunteer?.full_name ||
                  "this volunteer"}{" "}
                from this shift?
              </p>
              {removeMessage ? (
                <div className="error-banner">{removeMessage}</div>
              ) : null}
              <div className="modal-actions">
                <button
                  className="nav-button"
                  type="button"
                  onClick={() => setShowRemovePrompt(false)}
                  disabled={removeLoading}
                >
                  Cancel
                </button>
                <button
                  className="account-button"
                  type="button"
                  onClick={handleRemoveVolunteer}
                  disabled={removeLoading}
                >
                  {removeLoading ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showVolunteers ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel account-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Directory</p>
                <h3 className="modal-title">All Volunteers</h3>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowVolunteers(false)}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              {selectedVolunteer ? (
                <div className="volunteer-detail">
                  <div className="volunteer-detail-header">
                    <div>
                      <p className="volunteer-name">
                        {selectedVolunteer.preferred_name ||
                          selectedVolunteer.full_name ||
                          "Volunteer"}
                      </p>
                      <p className="volunteer-meta">
                        {selectedVolunteer.pronouns ?? "—"} ·{" "}
                        {selectedVolunteer.role === "Lead"
                          ? "Lead Volunteer"
                          : selectedVolunteer.role === "Regular Volunteer"
                            ? "Regular Volunteer"
                            : "Admin"}
                      </p>
                      <p className="volunteer-meta">
                        Joined {formatDate(selectedVolunteer.joined_at)}
                      </p>
                    </div>
                    <div className="volunteer-detail-actions">
                      {profile?.role === "Admin" ? (
                        <button
                          className="account-button"
                          type="button"
                          onClick={() => setShowAddRecurring(true)}
                        >
                          + Add recurring
                        </button>
                      ) : null}
                      <button
                        className="account-button volunteer-back"
                        type="button"
                        onClick={() => {
                          setSelectedVolunteer(null);
                          setShowAddRecurring(false);
                        }}
                      >
                        ← Back to list
                      </button>
                    </div>
                  </div>

                  {volunteerRecurring.length > 0 || showAddRecurring ? (
                    <div className="volunteer-recurring">
                      <div className="volunteer-recurring-header">
                        <p className="account-section-title">Recurring shifts</p>
                      </div>
                      {recurringLoading ? (
                        <div className="loading-banner">Loading recurring shifts...</div>
                      ) : null}
                      {recurringMessage ? (
                        <div className="error-banner">{recurringMessage}</div>
                      ) : null}
                      {volunteerRecurring.length > 0 ? (
                        <div className="recurring-list">
                          {volunteerRecurring.map((recurring) => {
                            const templateMeta = templateMap[recurring.template_id];
                            const templateInstance = instanceShifts.find(
                              (shift) => shift.templateId === recurring.template_id,
                            );
                            const timeRange = templateMeta?.start_time
                              ? `${formatTemplateTime(
                                  templateMeta.start_time,
                                )} — ${formatTemplateTime(templateMeta.end_time)}`
                              : templateInstance
                                ? formatTimeRangeFromInstance(
                                    templateInstance.start,
                                    templateInstance.end,
                                  )
                                : "—";
                            const dateRange = recurring.ends_on
                              ? `${formatDate(recurring.starts_on)} — ${formatDate(
                                  recurring.ends_on,
                                )}`
                              : `${formatDate(recurring.starts_on)} — Calendar end`;
                            return (
                              <div key={recurring.id} className="recurring-card">
                                <div>
                                  <p className="recurring-title">
                                    {recurring.template?.title ?? "Shift"}
                                  </p>
                                  <p className="recurring-meta">{timeRange}</p>
                                  {recurring.byday && recurring.byday.length > 0 ? (
                                    <p className="recurring-meta">
                                      {formatByDay(recurring.byday)}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="recurring-actions">
                                  <span className="recurring-pill">{dateRange}</span>
                                  {profile?.role === "Admin" ? (
                                    <button
                                      className="recurring-delete"
                                      type="button"
                                      onClick={() => handleRecurringDelete(recurring.id)}
                                      disabled={recurringDeleteId === recurring.id}
                                    >
                                      {recurringDeleteId === recurring.id
                                        ? "Deleting..."
                                        : "Delete"}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {showAddRecurring && profile?.role === "Admin" ? (
                    <div className="volunteer-recurring-form">
                      <p className="account-section-title">Add recurring shift</p>
                      <label className="form-field">
                        <span className="form-label">Shift template</span>
                        <select
                          className="form-input"
                          value={recurringForm.templateId}
                          onChange={(event) =>
                            setRecurringForm((prev) => ({
                              ...prev,
                              templateId: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select a template</option>
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="repeat-days">
                        {[
                          ["SU", "Sun"],
                          ["MO", "Mon"],
                          ["TU", "Tue"],
                          ["WE", "Wed"],
                          ["TH", "Thu"],
                          ["FR", "Fri"],
                          ["SA", "Sat"],
                        ].map(([code, label]) => (
                          <label key={code} className="repeat-day">
                            <input
                              type="checkbox"
                              checked={recurringDays.includes(code)}
                              onChange={() => {
                                setRecurringDays((prev) =>
                                  prev.includes(code)
                                    ? prev.filter((day) => day !== code)
                                    : [...prev, code],
                                );
                              }}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="form-grid form-grid-compact">
                        <label className="form-field">
                          <span className="form-label">Start date</span>
                          <input
                            className="form-input"
                            type="date"
                            value={recurringForm.startsOn}
                            onChange={(event) =>
                              setRecurringForm((prev) => ({
                                ...prev,
                                startsOn: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="form-field">
                          <span className="form-label">End date (optional)</span>
                          <input
                            className="form-input"
                            type="date"
                            value={recurringForm.endsOn}
                            onChange={(event) =>
                              setRecurringForm((prev) => ({
                                ...prev,
                                endsOn: event.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                      {recurringMessage ? (
                        <div className="error-banner">{recurringMessage}</div>
                      ) : null}
                      <div className="modal-actions">
                        <button
                          className="nav-button"
                          type="button"
                          onClick={() => setShowAddRecurring(false)}
                          disabled={recurringSaving}
                        >
                          Cancel
                        </button>
                        <button
                          className="account-button"
                          type="button"
                          onClick={handleRecurringSave}
                          disabled={recurringSaving}
                        >
                          {recurringSaving ? "Saving..." : "Save recurring"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {volunteersLoading ? (
                <div className="loading-banner">Loading volunteers...</div>
              ) : null}
              {volunteersMessage ? (
                <div className="error-banner">{volunteersMessage}</div>
              ) : null}
              {volunteers.length === 0 && !volunteersLoading && !selectedVolunteer ? (
                <div className="empty-banner">No volunteers found.</div>
              ) : null}
              {volunteers.length > 0 && !selectedVolunteer ? (
                <div className="volunteers-list">
                  {volunteers.map((volunteer) => {
                    const name =
                      volunteer.preferred_name || volunteer.full_name || "Volunteer";
                    const roleLabel =
                      volunteer.role === "Lead"
                        ? "Lead Volunteer"
                        : volunteer.role === "Regular Volunteer"
                          ? "Regular Volunteer"
                          : "Admin";
                    const nameClass =
                      volunteer.role === "Admin"
                        ? "volunteer-name volunteer-name-admin"
                        : volunteer.role === "Lead"
                          ? "volunteer-name volunteer-name-lead"
                          : "volunteer-name volunteer-name-regular";
                    return (
                      <button
                        key={volunteer.id}
                        className="volunteer-row"
                        type="button"
                        onClick={() => {
                          setSelectedVolunteer(volunteer);
                          setShowAddRecurring(false);
                          setRecurringForm({ templateId: "", startsOn: "", endsOn: "" });
                          setRecurringDays([]);
                        }}
                      >
                        <div className="volunteer-main">
                          <p className={nameClass}>{name}</p>
                          <p className="volunteer-meta">
                            {volunteer.pronouns ?? "—"} · {roleLabel}
                          </p>
                        </div>
                        <span className="volunteer-joined">
                          Joined {formatDate(volunteer.joined_at)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showProfile ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel account-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Account</p>
                <h3 className="modal-title">
                  Welcome, {displayProfile?.preferred_name || displayProfile?.full_name || "Volunteer"}
                </h3>
              </div>
              <button className="modal-close" type="button" onClick={() => setShowProfile(false)}>
                Close
              </button>
            </div>
            <div className="modal-body account-body">
              <div className="account-section">
                <p className="account-section-title">Account info</p>
                <div className="modal-row">
                  <span className="modal-label">Email</span>
                  <span>{session.user.email ?? "—"}</span>
                </div>
                <div className="modal-row">
                  <span className="modal-label">Created</span>
                  <span>{formatDateTime(session.user.created_at)}</span>
                </div>
                <div className="modal-row">
                  <button className="account-button" type="button" onClick={handleSignOut}>
                    Log Out
                  </button>
                </div>
              </div>

              <div className="account-section">
                <p className="account-section-title">Profile details</p>
                <div className="modal-row">
                  <button
                    className="account-button"
                    type="button"
                    onClick={() => setIsEditingProfile((value) => !value)}
                  >
                    {isEditingProfile ? "Cancel" : "Edit profile"}
                  </button>
                  {isEditingProfile ? (
                    <button
                      className="account-button"
                      type="button"
                      onClick={handleProfileSave}
                      disabled={profileSaveLoading}
                    >
                      {profileSaveLoading ? "Saving..." : "Save"}
                    </button>
                  ) : null}
                </div>
                {profileSaveMessage ? (
                  <div className="error-banner">{profileSaveMessage}</div>
                ) : null}
                <div className="modal-row">
                  <span className="modal-label">Role</span>
                  <span>
                    {profile?.role === "Lead"
                      ? "Lead Volunteer"
                      : profile?.role === "Regular Volunteer"
                        ? "Regular Volunteer"
                        : profile?.role === "Admin"
                          ? "Admin"
                          : "—"}
                  </span>
                </div>
                <div className="modal-row">
                  <span className="modal-label">Full name</span>
                  {isEditingProfile ? (
                    <input
                      className="form-input"
                      type="text"
                      value={profileForm.full_name}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          full_name: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <span>{displayProfile?.full_name ?? "—"}</span>
                  )}
                </div>
                <div className="modal-row">
                  <span className="modal-label">Preferred name</span>
                  <span>{displayProfile?.preferred_name ?? "—"}</span>
                </div>
                <div className="modal-row">
                  <span className="modal-label">Pronouns</span>
                  {isEditingProfile ? (
                    <input
                      className="form-input"
                      type="text"
                      value={profileForm.pronouns}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          pronouns: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <span>{displayProfile?.pronouns ?? "—"}</span>
                  )}
                </div>
                <div className="modal-row">
                  <span className="modal-label">Date of birth</span>
                  <span>{formatDate(profile?.date_of_birth)}</span>
                </div>
                <div className="modal-row">
                  <span className="modal-label">Phone</span>
                  {isEditingProfile ? (
                    <input
                      className="form-input"
                      type="tel"
                      value={profileForm.phone}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          phone: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <span>{displayProfile?.phone ?? "—"}</span>
                  )}
                </div>
                <div className="modal-row">
                  <span className="modal-label">Emergency contact</span>
                  <span>{profile?.emergency_contact_name ?? "—"}</span>
                </div>
                <div className="modal-row">
                  <span className="modal-label">Emergency phone</span>
                  <span>{profile?.emergency_contact_phone ?? "—"}</span>
                </div>
                <div className="modal-row">
                  <span className="modal-label">Status</span>
                  <span>{profile?.status ?? "—"}</span>
                </div>
                <div className="modal-row">
                  <span className="modal-label">Joined</span>
                  <span>{formatDate(profile?.joined_at)}</span>
                </div>
                <div className="modal-row modal-row-stack">
                  <span className="modal-label">Interests</span>
                  <div className="pill-row">
                    {(profile?.interests?.length ?? 0) > 0 ? (
                      profile?.interests?.map((interest) => (
                        <span key={interest} className="pill">
                          {interest}
                        </span>
                      ))
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </div>
                <div className="modal-row modal-row-stack">
                  <span className="modal-label">Internal notes</span>
                  <span className="account-notes">{profile?.internal_notes ?? "—"}</span>
                </div>
                <div className="modal-row">
                  <span className="modal-label">Training completed at</span>
                  <span>{formatDateTime(profile?.training_completed_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
