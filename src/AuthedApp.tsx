import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { signOutSafely, supabase } from "./supabaseClient";
import {
  APPOINTMENT_COLOR_ADOPTION,
  APPOINTMENT_COLOR_FOSTER,
  APPOINTMENT_COLOR_ORIENTATION,
  APPOINTMENT_COLOR_VAX,
  APPOINTMENT_COLOR_OTHER_DEFAULT,
  dayFormatter,
  monthFormatter,
  monthJumpFormatter,
  PRIMARY_ADMIN_EMAIL,
  SELF_DROP_REASON_PREFIX,
  timeFormatter,
  WEEKDAYS_MONDAY_FIRST,
} from "./authedApp/constants";
import {
  deleteAppointmentById,
  fetchWeekAppointmentsByInstanceIds,
  saveAppointment,
} from "./authedApp/services/appointmentService";
import {
  approveNotificationAssignment,
  denyNotificationAssignment,
  fetchAssignmentById,
  fetchNotificationsData,
  fetchPendingNotifications,
} from "./authedApp/services/notificationService";
import {
  notifyActiveMembersOnShiftInstance,
  notifyLeadsOnShiftInstance,
  sendAdminPush,
  sendAdminDropPush,
  sendVolunteerPush,
} from "./authedApp/services/pushNotificationService";
import type {
  AuthedAppProps,
  AppointmentKind,
  PersonalAssignment,
  ProfileRecord,
  RecurringAssignment,
  ShiftAppointment,
  ShiftAssignment,
  ShiftAssignmentDetail,
  ShiftInstance,
  ShiftInstanceRow,
  ShiftTemplate,
  VolunteerRow,
} from "./authedApp/types";
import {
  addDays,
  addMonths,
  buildMonthCells,
  buildVirtualInstanceId,
  buildWeekCells,
  diffInDays,
  format24HourTime,
  formatByDayLongList,
  formatCompactTemplateTimeRange,
  formatDate,
  formatDateTime,
  formatDateWithWeekday,
  formatPhone,
  formatRepeatPattern,
  formatRepeatPatternFromDays,
  formatTemplateTime,
  formatTimeOnly,
  formatTimeRangeFromInstance,
  getAppointmentKindFromColor,
  getDateKey,
  getDayCode,
  getMonthKey,
  getNotificationDismissToken,
  getShiftDayStart,
  getShiftPeriodLabel,
  getWeekStart,
  isAdminRole,
  isLeadAssignmentRole,
  isLeadRole,
  isSelfDropReason,
  normalizeDropReason,
  normalizePhoneLink,
  parseDateOnly,
  rankShiftForDisplay,
  resolveTemplateEndTime,
  resolveTemplateStartTime,
  startOfDay,
  toDateInputValue,
  toIsoForDateAndTime,
  toTimeInputValue,
  urlBase64ToUint8Array,
} from "./authedApp/utils";

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
  const [isTakeShiftClosing, setIsTakeShiftClosing] = useState(false);
  const [takeShiftLoading, setTakeShiftLoading] = useState(false);
  const [takeShiftMessage, setTakeShiftMessage] = useState("");
  const [takeShiftMode, setTakeShiftMode] = useState<"request" | "join">("request");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsMessage, setNotificationsMessage] = useState("");
  const [notifications, setNotifications] = useState<ShiftAssignmentDetail[]>([]);
  const [dismissedNotificationTokens, setDismissedNotificationTokens] = useState<Set<string>>(new Set());
  const [hasLoadedNotifications, setHasLoadedNotifications] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [showAssignVolunteer, setShowAssignVolunteer] = useState(false);
  const [assignShiftInstanceId, setAssignShiftInstanceId] = useState<number | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignMessage, setAssignMessage] = useState("");
  const [showAssignOtherForm, setShowAssignOtherForm] = useState(false);
  const [assignOtherName, setAssignOtherName] = useState("");
  const [assignOtherDetails, setAssignOtherDetails] = useState("");
  const [assignOtherLoading, setAssignOtherLoading] = useState(false);
  const [showDenyPrompt, setShowDenyPrompt] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [denyTargetId, setDenyTargetId] = useState<string | null>(null);
  const [showPendingDecisionPrompt, setShowPendingDecisionPrompt] = useState(false);
  const [pendingDecisionTarget, setPendingDecisionTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showDropConfirm, setShowDropConfirm] = useState(false);
  const [showDropReason, setShowDropReason] = useState(false);
  const [dropReason, setDropReason] = useState("");
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [showRemovePrompt, setShowRemovePrompt] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ShiftAssignmentDetail | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeMessage, setRemoveMessage] = useState("");
  const [showAssignmentNotes, setShowAssignmentNotes] = useState(false);
  const [notesTarget, setNotesTarget] = useState<ShiftAssignmentDetail | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesMessage, setNotesMessage] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [showVolunteers, setShowVolunteers] = useState(false);
  const [volunteersLoading, setVolunteersLoading] = useState(false);
  const [volunteersMessage, setVolunteersMessage] = useState("");
  const [volunteers, setVolunteers] = useState<VolunteerRow[]>([]);
  const [volunteerSearchInput, setVolunteerSearchInput] = useState("");
  const [volunteerSearch, setVolunteerSearch] = useState("");
  const [volunteerRoleFilter, setVolunteerRoleFilter] = useState<
    "All" | "Admin" | "Lead" | "Regular Volunteer"
  >("All");
  const [assignVolunteerSearchInput, setAssignVolunteerSearchInput] = useState("");
  const [assignVolunteerSearch, setAssignVolunteerSearch] = useState("");
  const [selectedVolunteer, setSelectedVolunteer] = useState<VolunteerRow | null>(null);
  const [volunteerRecurring, setVolunteerRecurring] = useState<RecurringAssignment[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringMessage, setRecurringMessage] = useState("");
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    templateId: "",
    startsOn: "",
    endsOn: "",
    repeatEveryWeeks: "1" as "1" | "2",
  });
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [recurringDeleteId, setRecurringDeleteId] = useState<string | null>(null);
  const [recurringEditId, setRecurringEditId] = useState<string | null>(null);
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [showMyShifts, setShowMyShifts] = useState(false);
  const [showWeekGlance, setShowWeekGlance] = useState(false);
  const [weekGlanceMode, setWeekGlanceMode] = useState<"volunteers" | "appointments">("volunteers");
  const [calendarViewMode, setCalendarViewMode] = useState<"volunteers" | "appointments">(
    "volunteers",
  );
  const [showMonthDayDetails, setShowMonthDayDetails] = useState(false);
  const [monthDayDetailsDate, setMonthDayDetailsDate] = useState<Date | null>(null);
  const [showAppointments, setShowAppointments] = useState(false);
  const [appointmentsShift, setAppointmentsShift] = useState<ShiftInstance | null>(null);
  const [appointmentsShiftInstanceId, setAppointmentsShiftInstanceId] = useState<number | null>(null);
  const [appointmentsByShift, setAppointmentsByShift] = useState<Record<number, ShiftAppointment[]>>({});
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsMessage, setAppointmentsMessage] = useState("");
  const [mobileAppointmentsShiftId, setMobileAppointmentsShiftId] = useState<number | null>(null);
  const [appointmentForm, setAppointmentForm] = useState({
    id: null as string | null,
    kind: "other" as AppointmentKind,
    title: "",
    description: "",
    color: APPOINTMENT_COLOR_OTHER_DEFAULT,
    starts_at: "",
  });
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentDeleteId, setAppointmentDeleteId] = useState<string | null>(null);
  const [expandedAppointmentIds, setExpandedAppointmentIds] = useState<Set<string>>(new Set());
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [assignmentsMessage, setAssignmentsMessage] = useState("");
  const [myRecurring, setMyRecurring] = useState<RecurringAssignment[]>([]);
  const [myShiftsPage, setMyShiftsPage] = useState(0);
  const [calendarRangeMode, setCalendarRangeMode] = useState<"week" | "month">("week");
  const [isMobile, setIsMobile] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [collapsedDayKeys, setCollapsedDayKeys] = useState<Set<string>>(new Set());
  const [manuallyToggledDayKeys, setManuallyToggledDayKeys] = useState<Set<string>>(new Set());
  const [personalShiftKeys, setPersonalShiftKeys] = useState<Set<string>>(new Set());
  const [profileOverride, setProfileOverride] = useState<Partial<ProfileRecord> | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    pronouns: "",
    phone: "",
    joined_at: "",
  });
  const [profileSaveMessage, setProfileSaveMessage] = useState("");
  const [profileSaveLoading, setProfileSaveLoading] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationAction, setNotificationAction] = useState<"enable" | "disable" | "test" | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [todayJumpToken, setTodayJumpToken] = useState(0);
  const scrollYRef = useRef(0);
  const liveRefreshInFlightRef = useRef(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeTriggeredRef = useRef(false);
  const todayCellRef = useRef<HTMLDivElement | null>(null);
  const todayKey = getDateKey(today);
  const [showMenu, setShowMenu] = useState(false);
  const [showHelpfulLinks, setShowHelpfulLinks] = useState(false);
  const [showFloatingViewToggle, setShowFloatingViewToggle] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const takeShiftCloseTimerRef = useRef<number | null>(null);
  const baseDocumentTitleRef = useRef<string>(
    typeof document !== "undefined" ? document.title : "CKC Shift Calendar",
  );
  const displayProfile = profileOverride ? { ...profile, ...profileOverride } : profile;
  const notificationsEnabled = displayProfile?.notification_pref === "push_and_email";
  const notificationPermission =
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "default";
  const notificationStatusLabel = notificationsEnabled
    ? "Enabled"
    : notificationPermission === "granted"
      ? "Allowed on device (tap Enable to finish setup)"
      : "Disabled";
  const canManageAppointments = profile?.role === "Admin" || profile?.role === "Lead";
  const canModifyAppointments = profile?.role === "Admin";
  const isPrimaryAdminAccount =
    profile?.role === "Admin" &&
    (session.user.email ?? "").trim().toLowerCase() === PRIMARY_ADMIN_EMAIL;
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (import.meta.env.DEV && !vapidPublicKey) {
    console.warn("Missing VITE_VAPID_PUBLIC_KEY");
  }
  const helpfulLinks = useMemo(
    () => [
      {
        label: "Medical Report Form",
        url: "https://forms.gle/grAvV1s3xraMXAUW9",
      },
      {
        label: "Photos and Personality Form",
        url: "https://forms.gle/nzvEKXq687bgejUE6",
      },
    ],
    [],
  );
  const dismissedStorageKey = `notificationsDismissed:${session.user.id}`;
  const isAnyModalOpen =
    showMyShifts ||
    showWeekGlance ||
    showMonthDayDetails ||
    showAppointments ||
    showTakeShiftPrompt ||
    showNotifications ||
    showAssignVolunteer ||
    showHelpfulLinks ||
    showDropConfirm ||
    showDropReason ||
    showDenyPrompt ||
    showPendingDecisionPrompt ||
    showRemovePrompt ||
    showAssignmentNotes ||
    showVolunteers ||
    showProfile ||
    showAddRecurring;

  const closeTakeShiftPrompt = useCallback(() => {
    if (!showTakeShiftPrompt) return;
    setIsTakeShiftClosing(true);
    if (takeShiftCloseTimerRef.current !== null) {
      window.clearTimeout(takeShiftCloseTimerRef.current);
    }
    takeShiftCloseTimerRef.current = window.setTimeout(() => {
      setShowTakeShiftPrompt(false);
      setIsTakeShiftClosing(false);
      takeShiftCloseTimerRef.current = null;
    }, 340);
  }, [showTakeShiftPrompt]);

  const openTakeShiftPrompt = useCallback(() => {
    if (takeShiftCloseTimerRef.current !== null) {
      window.clearTimeout(takeShiftCloseTimerRef.current);
      takeShiftCloseTimerRef.current = null;
    }
    setIsTakeShiftClosing(false);
    setShowTakeShiftPrompt(true);
  }, []);

  useEffect(() => {
    return () => {
      if (takeShiftCloseTimerRef.current !== null) {
        window.clearTimeout(takeShiftCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchTemplates = async () => {
      setLoading(true);
      const { data, error } = await supabase.from("shift_templates").select("*");

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
      const rangeAnchorDate =
        calendarRangeMode === "month"
          ? addMonths(today, monthOffset)
          : addDays(today, weekOffset * 7);
      const normalizedAnchor = startOfDay(rangeAnchorDate);
      let visibleDates: Date[] = [];
      if (calendarRangeMode === "month") {
        const firstOfMonth = new Date(
          normalizedAnchor.getFullYear(),
          normalizedAnchor.getMonth(),
          1,
        );
        const gridStart = getWeekStart(firstOfMonth, true);
        for (let i = 0; i < 42; i += 1) {
          visibleDates.push(addDays(gridStart, i));
        }
      } else {
        const weekStart = getWeekStart(normalizedAnchor, true);
        for (let i = 0; i < 7; i += 1) {
          visibleDates.push(addDays(weekStart, i));
        }
      }
      if (visibleDates.length === 0) {
        setInstanceShifts([]);
        return;
      }
      const rangeStart = visibleDates[0];
      const lastVisibleDate = visibleDates[visibleDates.length - 1];
      const rangeEndExclusive = addDays(lastVisibleDate, 1);
      const rangeStartDate = getDateKey(rangeStart);
      const rangeEndDate = getDateKey(rangeEndExclusive);

      // Ensure visible range always has shift instances for active templates.
      if (templates.length > 0) {
        const templateIds = templates.map((template) => template.id);
        const { data: existingRows } = await supabase
          .from("shift_instances")
          .select("template_id,shift_date,starts_at")
          .in("template_id", templateIds)
          .or(
            `starts_at.gte.${rangeStart.toISOString()},starts_at.lt.${rangeEndExclusive.toISOString()},shift_date.gte.${rangeStartDate},shift_date.lt.${rangeEndDate}`,
          );

        const existingKeys = new Set(
          (existingRows ?? []).map((row) => {
            const day = row.shift_date ?? (row.starts_at ? getDateKey(new Date(row.starts_at)) : "");
            return `${row.template_id}-${day}`;
          }),
        );

        const rowsToInsert: {
          template_id: string;
          shift_date: string;
          starts_at: string;
          ends_at: string;
        }[] = [];

        visibleDates.forEach((day) => {
          const dayKey = getDateKey(day);
          templates.forEach((template) => {
            if (template.is_active === false) return;
            const key = `${template.id}-${dayKey}`;
            if (existingKeys.has(key)) return;
            const startsAt = toIsoForDateAndTime(day, resolveTemplateStartTime(template));
            const endsAt = toIsoForDateAndTime(day, resolveTemplateEndTime(template));
            if (!startsAt || !endsAt) return;
            rowsToInsert.push({
              template_id: template.id,
              shift_date: dayKey,
              starts_at: startsAt,
              ends_at: endsAt,
            });
            existingKeys.add(key);
          });
        });

        if (rowsToInsert.length > 0) {
          const { error: insertError } = await supabase.from("shift_instances").insert(rowsToInsert);
          if (insertError && import.meta.env.DEV) {
            console.warn("Unable to generate visible shift instances", insertError.message);
          }
        }
      }

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
          `starts_at.gte.${rangeStart.toISOString()},starts_at.lt.${rangeEndExclusive.toISOString()},shift_date.gte.${rangeStartDate},shift_date.lt.${rangeEndDate}`,
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

      const existingKeys = new Set(
        shifts
          .filter((shift) => Boolean(shift.templateId))
          .map((shift) => `${shift.templateId}-${getDateKey(shift.start)}`),
      );
      const fallbackShifts: ShiftInstance[] = [];
      visibleDates.forEach((day) => {
        const dayKey = getDateKey(day);
        templates.forEach((template) => {
          if (template.is_active === false) return;
          const key = `${template.id}-${dayKey}`;
          if (existingKeys.has(key)) return;
          const startIso = toIsoForDateAndTime(day, resolveTemplateStartTime(template));
          const endIso = toIsoForDateAndTime(day, resolveTemplateEndTime(template));
          if (!startIso || !endIso) return;
          fallbackShifts.push({
            id: `virtual-${template.id}-${dayKey}`,
            instanceId: buildVirtualInstanceId(template.id, dayKey),
            title: template.title,
            start: new Date(startIso),
            end: new Date(endIso),
            templateId: template.id,
            isVirtual: true,
          });
        });
      });

      setInstanceShifts(
        [...shifts, ...fallbackShifts].sort((left, right) => {
          const startDiff = left.start.getTime() - right.start.getTime();
          if (startDiff !== 0) return startDiff;
          return left.title.localeCompare(right.title);
        }),
      );
    };

    fetchShiftInstances();

    return () => {
      mounted = false;
    };
  }, [today, weekOffset, monthOffset, calendarRangeMode, templates]);

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
    const onScroll = () => {
      setShowFloatingViewToggle(window.scrollY > 220);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
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
      joined_at: toDateInputValue(displayProfile?.joined_at),
    });
    setProfileSaveMessage("");
  }, [
    isEditingProfile,
    displayProfile?.full_name,
    displayProfile?.pronouns,
    displayProfile?.phone,
    displayProfile?.joined_at,
  ]);

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
        notes,
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
          shift_date,
          ends_at,
          template:shift_templates (
            id,
            title
          )
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

  const fetchWeekAppointments = useCallback(async () => {
    if (instanceShifts.length === 0) {
      setAppointmentsByShift({});
      setAppointmentsLoading(false);
      return;
    }

    setAppointmentsLoading(true);
    const instanceIds = instanceShifts.map((shift) => shift.instanceId);
    const { data, error } = await fetchWeekAppointmentsByInstanceIds(instanceIds);

    if (error) {
      setAppointmentsByShift({});
      setAppointmentsLoading(false);
      return;
    }

    setAppointmentsByShift(data);
    setAppointmentsLoading(false);
  }, [instanceShifts]);

  const ensureShiftInstance = useCallback(async (shift: ShiftInstance) => {
    if (!shift.isVirtual && shift.instanceId > 0) {
      return shift.instanceId;
    }

    const shiftDate = getDateKey(shift.start);
    const { data: existing, error: existingError } = await supabase
      .from("shift_instances")
      .select("id")
      .eq("template_id", shift.templateId)
      .eq("shift_date", shiftDate)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      setAssignmentsMessage(existingError.message);
      return null;
    }
    if (existing?.id) {
      return existing.id;
    }

    const { data: created, error: createError } = await supabase
      .from("shift_instances")
      .insert({
        template_id: shift.templateId,
        shift_date: shiftDate,
        starts_at: shift.start.toISOString(),
        ends_at: shift.end.toISOString(),
      })
      .select("id")
      .single();

    if (createError || !created?.id) {
      setAssignmentsMessage(createError?.message ?? "Unable to open this shift yet.");
      return null;
    }

    return created.id as number;
  }, []);

  useEffect(() => {
    fetchWeekAssignments();
  }, [fetchWeekAssignments]);

  useEffect(() => {
    fetchWeekAppointments();
  }, [fetchWeekAppointments]);


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
    if (!profileForm.joined_at.trim()) {
      setProfileSaveMessage("Joined date is required.");
      return;
    }

    setProfileSaveLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: profileForm.full_name.trim(),
        pronouns: profileForm.pronouns.trim(),
        phone: profileForm.phone.trim(),
        joined_at: profileForm.joined_at.trim(),
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
      .select(
        "id, full_name, preferred_name, pronouns, role, joined_at, date_of_birth, phone, emergency_contact_name, emergency_contact_phone, status, internal_notes, interests, training_completed, training_completed_at, notification_pref, created_at",
      )
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

  useEffect(() => {
    if (!showAssignVolunteer) return;
    fetchVolunteers();
  }, [showAssignVolunteer, fetchVolunteers]);

  const handleSignOut = useCallback(async () => {
    await signOutSafely();
    if (typeof window !== "undefined") {
      window.location.assign("/signin");
    }
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
        repeat_interval_weeks,
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
      .select("id, volunteer_id, template_id, starts_on, ends_on, byday, repeat_interval_weeks")
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
    const rangeStart = getWeekStart(startOfDay(new Date()), true);
    const rangeEnd = addDays(rangeStart, 7);

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
      .order("starts_at", { ascending: true, foreignTable: "shift_instances" });

    if (!data || error) {
      setAssignments([]);
      setAssignmentsMessage(error?.message ?? "");
    } else {
      const sorted = ((data as unknown as ShiftAssignment[]) ?? [])
        .filter((assignment) => {
          const instance = assignment.shift_instance;
          if (!instance) return false;
          let date: Date | null = null;
          if (instance.shift_date) {
            date = parseDateOnly(instance.shift_date);
          } else if (instance.starts_at) {
            const parsed = new Date(instance.starts_at);
            if (!Number.isNaN(parsed.getTime())) {
              date = parsed;
            }
          }
          if (!date) return false;
          const dayStart = startOfDay(date);
          return dayStart >= rangeStart && dayStart < rangeEnd;
        })
        .sort((left, right) => {
          const leftDate = left.shift_instance?.shift_date ?? "";
          const rightDate = right.shift_instance?.shift_date ?? "";
          if (leftDate && rightDate && leftDate !== rightDate) {
            return leftDate.localeCompare(rightDate);
          }
          const leftValue =
            left.shift_instance?.starts_at ??
            `${left.shift_instance?.shift_date ?? ""}T00:00:00`;
          const rightValue =
            right.shift_instance?.starts_at ??
            `${right.shift_instance?.shift_date ?? ""}T00:00:00`;
          const leftMs = Date.parse(leftValue);
          const rightMs = Date.parse(rightValue);
          if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) {
            return leftValue.localeCompare(rightValue);
          }
          return leftMs - rightMs;
        });
      setAssignments(sorted);
    }

    setAssignmentsLoading(false);
  }, [session.user.id]);

  useEffect(() => {
    fetchMyShifts();
  }, [fetchMyShifts]);

  const getRecurringIntervalWeeks = useCallback(
    (recurring: Pick<RecurringAssignment, "repeat_interval_weeks"> | null | undefined) =>
      recurring?.repeat_interval_weeks === 2 ? 2 : 1,
    [],
  );

  const matchesRecurringWeek = useCallback(
    (
      dateValue: string | null | undefined,
      startsOn: string,
      repeatIntervalWeeks: number | null | undefined,
    ) => {
      const intervalWeeks = repeatIntervalWeeks === 2 ? 2 : 1;
      if (intervalWeeks === 1) return true;
      const anchor = parseDateOnly(startsOn);
      const candidate = dateValue
        ? dateValue.includes("T")
          ? new Date(dateValue)
          : parseDateOnly(dateValue)
        : null;
      if (!anchor || !candidate || Number.isNaN(candidate.getTime())) return false;
      const dayDiff = diffInDays(startOfDay(candidate), startOfDay(anchor));
      if (dayDiff < 0) return false;
      return Math.floor(dayDiff / 7) % intervalWeeks === 0;
    },
    [],
  );

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
    const repeatIntervalWeeks = Number(recurringForm.repeatEveryWeeks) === 2 ? 2 : 1;
    const filteredInstances =
      allowedDays.length > 0
        ? (instances ?? []).filter((instance) => {
            const dayCode = getDayCode(instance.shift_date ?? instance.starts_at ?? undefined);
            if (!dayCode || !allowedDays.includes(dayCode)) return false;
            return matchesRecurringWeek(
              instance.shift_date ?? instance.starts_at ?? undefined,
              recurringForm.startsOn,
              repeatIntervalWeeks,
            );
          })
        : instances ?? [];

    if (instanceError) {
      setRecurringMessage(instanceError.message);
      setRecurringSaving(false);
      return;
    }

    if (recurringEditId) {
      const targetRecurring = volunteerRecurring.find((item) => item.id === recurringEditId);
      if (!targetRecurring) {
        setRecurringMessage("Recurring shift not found.");
        setRecurringSaving(false);
        return;
      }

      const oldRangeStart = targetRecurring.starts_on;
      const oldRangeEnd = targetRecurring.ends_on || getDateKey(addMonths(today, 12));
      const oldStartIso = new Date(`${oldRangeStart}T00:00:00`).toISOString();
      const oldEndDate = parseDateOnly(oldRangeEnd) ?? new Date();
      const oldEndExclusive = addDays(oldEndDate, 1).toISOString();

      const { data: oldInstances, error: oldInstancesError } = await supabase
        .from("shift_instances")
        .select("id, shift_date, starts_at")
        .eq("template_id", targetRecurring.template_id)
        .or(
          `starts_at.gte.${oldStartIso},starts_at.lt.${oldEndExclusive},shift_date.gte.${oldRangeStart},shift_date.lte.${oldRangeEnd}`,
        );

      if (oldInstancesError) {
        setRecurringMessage(oldInstancesError.message);
        setRecurringSaving(false);
        return;
      }

      const oldRepeatIntervalWeeks = getRecurringIntervalWeeks(targetRecurring);
      const oldAllowedDays = targetRecurring.byday ?? [];
      const oldInstanceIds = (oldInstances ?? [])
        .filter((item) => {
          const dayCode = getDayCode(item.shift_date ?? item.starts_at ?? undefined);
          if (oldAllowedDays.length > 0 && (!dayCode || !oldAllowedDays.includes(dayCode))) {
            return false;
          }
          return matchesRecurringWeek(
            item.shift_date ?? item.starts_at ?? undefined,
            targetRecurring.starts_on,
            oldRepeatIntervalWeeks,
          );
        })
        .map((item) => item.id);
      if (oldInstanceIds.length > 0) {
        const { error: oldAssignmentDeleteError } = await supabase
          .from("shift_assignments")
          .delete()
          .eq("volunteer_id", selectedVolunteer.id)
          .in("shift_instance_id", oldInstanceIds);
        if (oldAssignmentDeleteError) {
          setRecurringMessage(oldAssignmentDeleteError.message);
          setRecurringSaving(false);
          return;
        }
      }

      const { error: updateRecurringError } = await supabase
        .from("recurring_assignments")
        .update({
          template_id: recurringForm.templateId,
          starts_on: recurringForm.startsOn,
          ends_on: recurringForm.endsOn || null,
          byday: recurringDays,
          repeat_interval_weeks: repeatIntervalWeeks,
        })
        .eq("id", recurringEditId)
        .eq("volunteer_id", selectedVolunteer.id);

      if (updateRecurringError) {
        setRecurringMessage(updateRecurringError.message);
        setRecurringSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("recurring_assignments")
        .insert({
          volunteer_id: selectedVolunteer.id,
          template_id: recurringForm.templateId,
          starts_on: recurringForm.startsOn,
          ends_on: recurringForm.endsOn || null,
          byday: recurringDays,
          repeat_interval_weeks: repeatIntervalWeeks,
        })
        .select("*")
        .single();

      if (error || !data) {
        setRecurringMessage(error?.message ?? "Unable to save recurring shifts.");
        setRecurringSaving(false);
        return;
      }
    }

    if (filteredInstances.length > 0) {
      const assignmentRole = selectedVolunteer.role === "Lead" ? "lead" : "regular";
      const payload = filteredInstances.map((instance) => ({
        shift_instance_id: instance.id,
        volunteer_id: selectedVolunteer.id,
        status: "active",
        assignment_role: assignmentRole,
        dropped_at: null,
        dropped_reason: null,
      }));
      const { error: assignmentError } = await supabase
        .from("shift_assignments")
        .upsert(payload, { onConflict: "shift_instance_id,volunteer_id" })
        .select("id");
      if (assignmentError) {
        setRecurringMessage(`Recurring shifts saved, but assignment update failed: ${assignmentError.message}`);
        setRecurringSaving(false);
        return;
      }
      if (!recurringEditId) {
        const recurringPushError = await sendVolunteerPush({
          userId: selectedVolunteer.id,
          title: "Recurring shifts added",
          body: "Victoria added reaccuring shifts to your schedule",
          notificationType: "recurring_added",
        });
        if (recurringPushError) {
          setRecurringMessage(`Recurring shifts saved, but push notification failed: ${recurringPushError}`);
        }
      }
    } else {
      setRecurringMessage("Recurring pattern saved. No matching shift dates were found yet.");
    }

    setRecurringForm({ templateId: "", startsOn: "", endsOn: "", repeatEveryWeeks: "1" });
    setRecurringDays([]);
    setRecurringEditId(null);
    setShowAddRecurring(false);
    setRecurringSaving(false);
    fetchVolunteerRecurring(selectedVolunteer.id);
    fetchMyShifts();
    fetchWeekAssignments();
  }, [
    selectedVolunteer,
    recurringEditId,
    volunteerRecurring,
    recurringForm,
    recurringDays,
    today,
    fetchVolunteerRecurring,
    fetchMyShifts,
    fetchWeekAssignments,
    getRecurringIntervalWeeks,
    matchesRecurringWeek,
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
        .select("id, shift_date, starts_at")
        .eq("template_id", target.template_id)
        .or(
          `starts_at.gte.${startIso},starts_at.lt.${endExclusive},shift_date.gte.${rangeStart},shift_date.lte.${rangeEnd}`,
        );

      if (instanceError) {
        setRecurringMessage(instanceError.message);
        setRecurringDeleteId(null);
        return;
      }

      const targetRepeatIntervalWeeks = getRecurringIntervalWeeks(target);
      const targetAllowedDays = target.byday ?? [];
      const instanceIds = (instances ?? [])
        .filter((item) => {
          const dayCode = getDayCode(item.shift_date ?? item.starts_at ?? undefined);
          if (targetAllowedDays.length > 0 && (!dayCode || !targetAllowedDays.includes(dayCode))) {
            return false;
          }
          return matchesRecurringWeek(
            item.shift_date ?? item.starts_at ?? undefined,
            target.starts_on,
            targetRepeatIntervalWeeks,
          );
        })
        .map((item) => item.id);
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

      if (volunteerRecurring.length === 1) {
        const adminName =
          displayProfile?.preferred_name || displayProfile?.full_name || session.user.email || "An admin";
        const recurringDeletePushError = await sendVolunteerPush({
          userId: selectedVolunteer.id,
          title: "Recurring shifts removed",
          body: "Your reaccuring shifts were deleted",
          notificationType: "recurring_removed",
        });
        if (recurringDeletePushError) {
          setRecurringMessage(
            `Recurring shift deleted, but push notification failed: ${recurringDeletePushError}`,
          );
        }
      }

      setRecurringDeleteId(null);
      if (recurringEditId === recurringId) {
        setRecurringEditId(null);
        setRecurringForm({ templateId: "", startsOn: "", endsOn: "", repeatEveryWeeks: "1" });
        setRecurringDays([]);
        setShowAddRecurring(false);
      }
      fetchVolunteerRecurring(selectedVolunteer.id);
      fetchMyShifts();
      fetchWeekAssignments();
    },
    [
      selectedVolunteer,
      recurringEditId,
      volunteerRecurring,
      today,
      fetchVolunteerRecurring,
      fetchMyShifts,
      fetchWeekAssignments,
      getRecurringIntervalWeeks,
      matchesRecurringWeek,
    ],
  );

  const handleRecurringEdit = useCallback((recurring: RecurringAssignment) => {
    setRecurringEditId(recurring.id);
    setRecurringForm({
      templateId: recurring.template_id,
      startsOn: recurring.starts_on,
      endsOn: recurring.ends_on ?? "",
      repeatEveryWeeks: recurring.repeat_interval_weeks === 2 ? "2" : "1",
    });
    setRecurringDays(recurring.byday ?? []);
    setRecurringMessage("");
    setShowAddRecurring(true);
  }, []);

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
    setNotificationsLoading(!hasLoadedNotifications);
    setNotificationsMessage("");
    const { items, error } = await fetchNotificationsData({
      sessionUserId: session.user.id,
      role: profile?.role,
      isPrimaryAdminAccount,
      dismissedTokens: dismissedNotificationTokens,
    });

    if (error) {
      setNotifications([]);
      setNotificationsMessage(error);
      setNotificationsLoading(false);
      return;
    }

    setNotifications(items);
    setNotificationCount(items.length);
    setNotificationsLoading(false);
    setHasLoadedNotifications(true);
  }, [profile?.role, session.user.id, hasLoadedNotifications, dismissedNotificationTokens, isPrimaryAdminAccount]);

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
            isPrimaryAdminAccount
              ? "status=in.(pending,dropped)"
              : `volunteer_id=eq.${session.user.id}`,
        },
        () => {
          fetchNotifications();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.role, session.user.id, showNotifications, fetchNotifications, isPrimaryAdminAccount]);

  useEffect(() => {
    const stored = localStorage.getItem(dismissedStorageKey);
    if (!stored) {
      setDismissedNotificationTokens(new Set());
      return;
    }
    try {
      const parsed = JSON.parse(stored) as string[];
      setDismissedNotificationTokens(new Set(parsed ?? []));
    } catch {
      setDismissedNotificationTokens(new Set());
    }
  }, [dismissedStorageKey]);

  const persistDismissedTokens = useCallback(
    (next: Set<string>) => {
      localStorage.setItem(dismissedStorageKey, JSON.stringify(Array.from(next).slice(-1000)));
      setDismissedNotificationTokens(next);
    },
    [dismissedStorageKey],
  );

  const handleDeleteAllNotifications = useCallback(() => {
    if (notifications.length === 0) return;
    const next = new Set(dismissedNotificationTokens);
    notifications.forEach((item) => {
      next.add(getNotificationDismissToken(item));
    });
    persistDismissedTokens(next);
    setNotifications([]);
    setNotificationCount(0);
  }, [notifications, dismissedNotificationTokens, persistDismissedTokens]);

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

  useEffect(() => {
    setHasLoadedNotifications(false);
  }, [session.user.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const shifts = useMemo(() => instanceShifts, [instanceShifts]);
  const sortedVolunteers = useMemo(() => {
    const rankByRole = (role: VolunteerRow["role"]) => {
      if (role === "Admin") return 0;
      if (role === "Lead") return 1;
      if (role === "Regular Volunteer") return 2;
      return 3;
    };
    const nameOf = (volunteer: VolunteerRow) =>
      (volunteer.preferred_name || volunteer.full_name || "").toLowerCase();

    return [...volunteers].sort((left, right) => {
      const roleRank = rankByRole(left.role) - rankByRole(right.role);
      if (roleRank !== 0) return roleRank;
      return nameOf(left).localeCompare(nameOf(right));
    });
  }, [volunteers]);
  const filteredSortedVolunteers = useMemo(() => {
    const query = volunteerSearch.trim().toLowerCase();
    return sortedVolunteers.filter((volunteer) => {
      if (volunteerRoleFilter !== "All" && volunteer.role !== volunteerRoleFilter) return false;
      if (!query) return true;
      const fullName = (volunteer.full_name ?? "").toLowerCase();
      const preferredName = (volunteer.preferred_name ?? "").toLowerCase();
      return fullName.includes(query) || preferredName.includes(query);
    });
  }, [sortedVolunteers, volunteerRoleFilter, volunteerSearch]);
  const filteredAssignableVolunteers = useMemo(() => {
    const query = assignVolunteerSearch.trim().toLowerCase();
    if (!query) return sortedVolunteers;
    return sortedVolunteers.filter((volunteer) => {
      const fullName = (volunteer.full_name ?? "").toLowerCase();
      const preferredName = (volunteer.preferred_name ?? "").toLowerCase();
      return fullName.includes(query) || preferredName.includes(query);
    });
  }, [sortedVolunteers, assignVolunteerSearch]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setVolunteerSearch(volunteerSearchInput);
    }, 120);
    return () => window.clearTimeout(timerId);
  }, [volunteerSearchInput]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setAssignVolunteerSearch(assignVolunteerSearchInput);
    }, 120);
    return () => window.clearTimeout(timerId);
  }, [assignVolunteerSearchInput]);

  useEffect(() => {
    setNotificationCount(notifications.length);
  }, [notifications]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title =
        notificationCount > 0
          ? `(${notificationCount}) ${baseDocumentTitleRef.current}`
          : baseDocumentTitleRef.current;
    }

    const nav = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    if (typeof nav.setAppBadge === "function") {
      if (notificationCount > 0) {
        void nav.setAppBadge(notificationCount);
      } else if (typeof nav.clearAppBadge === "function") {
        void nav.clearAppBadge();
      }
    }
  }, [notificationCount]);

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
  const orderedShiftsByDate = useMemo(
    () =>
      Object.entries(shiftsByDate).reduce<Record<string, ShiftInstance[]>>((acc, [dateKey, dayShifts]) => {
        acc[dateKey] = dayShifts.slice().sort((left, right) => {
          const rankDiff = rankShiftForDisplay(left) - rankShiftForDisplay(right);
          if (rankDiff !== 0) return rankDiff;
          const startDiff = left.start.getTime() - right.start.getTime();
          if (startDiff !== 0) return startDiff;
          return left.title.localeCompare(right.title);
        });
        return acc;
      }, {}),
    [shiftsByDate],
  );

  const templateMap = useMemo(
    () =>
      templates.reduce<Record<string, ShiftTemplate>>((acc, template) => {
        acc[template.id] = template;
        return acc;
      }, {}),
    [templates],
  );

  const weekBaseDate = addDays(today, weekOffset * 7);
  const monthBaseDate = addMonths(today, monthOffset);
  const baseDate = calendarRangeMode === "month" ? monthBaseDate : weekBaseDate;
  const todayStartMs = today.getTime();
  const displayCells =
    calendarRangeMode === "month" ? buildMonthCells(baseDate, true) : buildWeekCells(baseDate, true);
  const displayDayKeys = useMemo(
    () =>
      displayCells
        .map((cell) => (cell.date ? getDateKey(cell.date) : null))
        .filter((value): value is string => Boolean(value)),
    [displayCells],
  );
  const allVisibleDaysCollapsed =
    displayDayKeys.length > 0 && displayDayKeys.every((key) => collapsedDayKeys.has(key));
  const monthLabel = monthFormatter.format(baseDate);
  const calendarTitleLabel = baseDate.toLocaleDateString("en-US", { month: "long" });
  const weekStart = getWeekStart(baseDate, true);
  const weekEnd = addDays(weekStart, 6);
  const rangeLabel =
    calendarRangeMode === "month"
      ? baseDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : `${dayFormatter.format(weekStart)} – ${dayFormatter.format(weekEnd)}`;
  const weekdayLabels = WEEKDAYS_MONDAY_FIRST;
  const todayWeekdayIndex = (today.getDay() + 6) % 7;
  const maxWeekOffset = Math.max(0, Math.floor(diffInDays(today, addMonths(today, 12)) / 7));
  const currentMonthKey = getMonthKey(monthBaseDate);
  const monthJumpOptions = useMemo(() => {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const options: { key: string; label: string; weekOffset: number; monthOffset: number }[] = [];
    for (let i = 0; i < 12; i += 1) {
      const monthDate = addMonths(start, i);
      const monthStartWeek = getWeekStart(monthDate, true);
      const calendarStartWeek = getWeekStart(startOfDay(today), true);
      const offset = Math.max(0, Math.floor(diffInDays(calendarStartWeek, monthStartWeek) / 7));
      options.push({
        key: getMonthKey(monthDate),
        label: monthJumpFormatter.format(monthDate),
        weekOffset: Math.min(maxWeekOffset, offset),
        monthOffset: i,
      });
    }
    return options;
  }, [today, maxWeekOffset]);

  const showEmptyState = !loading && templates.length === 0;
  const assignmentsForDisplay = assignments.filter(
    (assignment) =>
      assignment.shift_instance &&
      (assignment.shift_instance.starts_at || assignment.shift_instance.shift_date),
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
  const showNoRecurring = !assignmentsLoading && myRecurring.length === 0 && !assignmentsMessage;
  const selectedShiftAppointments = useMemo(() => {
    if (!appointmentsShiftInstanceId) return [];
    return (appointmentsByShift[appointmentsShiftInstanceId] ?? []).slice().sort((left, right) => {
      const leftTime = left.starts_at ? new Date(left.starts_at).getTime() : 0;
      const rightTime = right.starts_at ? new Date(right.starts_at).getTime() : 0;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return (left.created_at ?? "").localeCompare(right.created_at ?? "");
    });
  }, [appointmentsByShift, appointmentsShiftInstanceId]);
  const monthDayDetailsDateKey = monthDayDetailsDate ? getDateKey(monthDayDetailsDate) : null;
  const monthDayDetailsShifts = useMemo(() => {
    if (!monthDayDetailsDateKey) return [];
    const dayShifts = orderedShiftsByDate[monthDayDetailsDateKey] ?? [];
    return dayShifts.slice().sort((left, right) => {
      const rank = (shift: ShiftInstance) => {
        if (/morning/i.test(shift.title)) return 0;
        if (/evening/i.test(shift.title)) return 1;
        return 2;
      };
      const rankDiff = rank(left) - rank(right);
      if (rankDiff !== 0) return rankDiff;
      return left.start.getTime() - right.start.getTime();
    });
  }, [monthDayDetailsDateKey, orderedShiftsByDate]);
  const weekGlanceRows = useMemo(() => {
    const rowMap = new Map<
      string,
      {
        key: string;
        title: string;
        timeLabel: string;
        rank: number;
        startMs: number;
        byDay: Record<
          string,
          {
            leads: string[];
            volunteers: string[];
            pending: string[];
          }
        >;
      }
    >();

    const getDisplayName = (assignment: ShiftAssignmentDetail) =>
      assignment.volunteer?.preferred_name || assignment.volunteer?.full_name || "Volunteer";

    displayDayKeys.forEach((dayKey) => {
      const dayShifts = orderedShiftsByDate[dayKey] ?? [];
      dayShifts.forEach((shift) => {
        const rowKey = shift.templateId || `${shift.title}-${timeFormatter.format(shift.start)}`;
        const existing = rowMap.get(rowKey);
        const timeLabel = `${timeFormatter.format(shift.start)}-${timeFormatter.format(shift.end)}`;
        const row =
          existing ??
          {
            key: rowKey,
            title: shift.title,
            timeLabel,
            rank: rankShiftForDisplay(shift),
            startMs: shift.start.getTime(),
            byDay: {},
          };

        const assignmentsForShift = (weekAssignments[shift.instanceId] ?? []).filter(
          (assignment) => Boolean(assignment.volunteer?.id),
        );

        const leads: string[] = [];
        const volunteers: string[] = [];
        const pending: string[] = [];

        assignmentsForShift.forEach((assignment) => {
          const name = getDisplayName(assignment);
          if (assignment.status === "pending") {
            pending.push(name);
            return;
          }
          if (
            isLeadAssignmentRole(assignment.assignment_role) ||
            isLeadRole(assignment.volunteer?.role) ||
            isAdminRole(assignment.volunteer?.role)
          ) {
            leads.push(name);
            return;
          }
          volunteers.push(name);
        });

        row.byDay[dayKey] = { leads, volunteers, pending };
        rowMap.set(rowKey, row);
      });
    });

    return Array.from(rowMap.values()).sort((left, right) => {
      const rankDiff = left.rank - right.rank;
      if (rankDiff !== 0) return rankDiff;
      const startDiff = left.startMs - right.startMs;
      if (startDiff !== 0) return startDiff;
      return left.title.localeCompare(right.title);
    });
  }, [displayDayKeys, orderedShiftsByDate, weekAssignments]);
  const weekGlanceAppointmentRows = useMemo(() => {
    const rowMap = new Map<
      string,
      {
        key: string;
        title: string;
        timeLabel: string;
        rank: number;
        startMs: number;
        byDay: Record<
          string,
          Array<{
            id: string;
            title: string;
            timeLabel: string | null;
          }>
        >;
      }
    >();

    displayDayKeys.forEach((dayKey) => {
      const dayShifts = orderedShiftsByDate[dayKey] ?? [];
      dayShifts.forEach((shift) => {
        const rowKey = shift.templateId || `${shift.title}-${timeFormatter.format(shift.start)}`;
        const existing = rowMap.get(rowKey);
        const timeLabel = `${timeFormatter.format(shift.start)}-${timeFormatter.format(shift.end)}`;
        const row =
          existing ??
          {
            key: rowKey,
            title: shift.title,
            timeLabel,
            rank: rankShiftForDisplay(shift),
            startMs: shift.start.getTime(),
            byDay: {},
          };

        const items = (appointmentsByShift[shift.instanceId] ?? [])
          .slice()
          .sort((left, right) => {
            const leftTime = left.starts_at ? new Date(left.starts_at).getTime() : 0;
            const rightTime = right.starts_at ? new Date(right.starts_at).getTime() : 0;
            if (leftTime !== rightTime) return leftTime - rightTime;
            return (left.created_at ?? "").localeCompare(right.created_at ?? "");
          })
          .map((appointment) => ({
            id: appointment.id,
            title: appointment.title,
            timeLabel: appointment.starts_at ? format24HourTime(appointment.starts_at) : null,
          }));

        row.byDay[dayKey] = items;
        rowMap.set(rowKey, row);
      });
    });

    return Array.from(rowMap.values()).sort((left, right) => {
      const rankDiff = left.rank - right.rank;
      if (rankDiff !== 0) return rankDiff;
      const startDiff = left.startMs - right.startMs;
      if (startDiff !== 0) return startDiff;
      return left.title.localeCompare(right.title);
    });
  }, [appointmentsByShift, displayDayKeys, orderedShiftsByDate]);

  const renderInteractiveShiftBlock = (shift: ShiftInstance, keyPrefix = "") => {
    const hasTimes = Boolean(shift.start && shift.end);
    const isPastShiftDay = startOfDay(shift.start).getTime() < todayStartMs;
    const assignmentList = weekAssignments[shift.instanceId] ?? [];
    const sortedAssignments = assignmentList.slice().sort((left, right) => {
      const rankFor = (assignment: ShiftAssignmentDetail) => {
        if (assignment.status === "pending") return 3;
        if (isAdminRole(assignment.volunteer?.role)) return 0;
        if (isLeadRole(assignment.volunteer?.role)) return 1;
        if (isLeadAssignmentRole(assignment.assignment_role)) return 1;
        return 2;
      };
      const rankLeft = rankFor(left);
      const rankRight = rankFor(right);
      if (rankLeft !== rankRight) return rankLeft - rankRight;
      const leftCreated = left.created_at ?? "";
      const rightCreated = right.created_at ?? "";
      return leftCreated.localeCompare(rightCreated);
    });
    const filledAssignments = sortedAssignments.filter((assignment) => Boolean(assignment.volunteer?.id));
    const otherAssignments = sortedAssignments.filter(
      (assignment) =>
        !assignment.volunteer?.id &&
        assignment.status !== "pending" &&
        Boolean((assignment.notes ?? "").trim()),
    );
    const leadAssignment =
      filledAssignments.find(
        (assignment) =>
          isLeadAssignmentRole(assignment.assignment_role) ||
          isLeadRole(assignment.volunteer?.role) ||
          isAdminRole(assignment.volunteer?.role),
      ) ?? null;
    const regularAssignments = leadAssignment
      ? filledAssignments.filter((assignment) => assignment !== leadAssignment)
      : filledAssignments;
    const slotAssignments: Array<ShiftAssignmentDetail | null> = [
      leadAssignment,
      ...regularAssignments,
      ...otherAssignments,
    ].slice(0, 8);
    while (slotAssignments.length < 6) {
      slotAssignments.push(null);
    }
    const canAddExtraVolunteer = slotAssignments.length < 8;
    const appointmentsForShift = appointmentsByShift[shift.instanceId] ?? [];

    return (
      <div key={`${keyPrefix}${shift.id}`} className="shift-block">
        <div
          className={`shift-block-header ${calendarViewMode === "appointments" ? "shift-block-header-clickable" : ""}`}
          role={calendarViewMode === "appointments" ? "button" : undefined}
          tabIndex={calendarViewMode === "appointments" ? 0 : undefined}
          onClick={
            calendarViewMode === "appointments"
              ? () => {
                  if (!canManageAppointments) return;
                  void handleOpenAppointments(shift);
                }
              : undefined
          }
          onKeyDown={
            calendarViewMode === "appointments"
              ? (event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  if (!canManageAppointments) return;
                  void handleOpenAppointments(shift);
                }
              : undefined
          }
        >
          <div className="shift-block-header-content">
            <div className="shift-block-title-row">
              <p className="shift-block-title">{shift.title}</p>
            </div>
            {calendarViewMode === "volunteers" ? (
              <div className="shift-appointments-group">
                <button
                  className={`shift-appointments-toggle ${
                    mobileAppointmentsShiftId === shift.instanceId ? "shift-appointments-open" : ""
                  }`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMobileAppointmentsShiftId((current) =>
                      current === shift.instanceId ? null : shift.instanceId,
                    );
                  }}
                >
                  Appointments {appointmentsForShift.length}
                </button>
                {canModifyAppointments ? (
                  <button
                    className="shift-appointments-add"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleOpenAppointments(shift);
                    }}
                    aria-label={`Add appointment for ${shift.title}`}
                    title="Add appointment"
                  >
                    +
                  </button>
                ) : null}
              </div>
            ) : null}
            <p className="shift-block-meta">
              {hasTimes ? `${timeFormatter.format(shift.start)}–${timeFormatter.format(shift.end)}` : "—"}
            </p>
            {calendarViewMode === "appointments" ? (
              <p className="shift-block-meta">Appointments: {appointmentsForShift.length}</p>
            ) : null}
          </div>
        </div>
        {calendarViewMode === "volunteers" ? (
          <div className="shift-assignment-list">
            {mobileAppointmentsShiftId === shift.instanceId ? (
              <div className="shift-appointments-inline">
                {appointmentsForShift.length === 0 ? (
                  <p className="shift-appointment-empty">No appointments</p>
                ) : (
                  appointmentsForShift.map((appointment) => (
                    <div key={appointment.id} className="shift-appointment-item">
                      <button
                        className="shift-appointment-button"
                        type="button"
                        onClick={() => toggleAppointmentExpanded(appointment.id)}
                        style={{
                          borderLeftColor: appointment.color ?? APPOINTMENT_COLOR_OTHER_DEFAULT,
                        }}
                      >
                        <span className="shift-appointment-title">{appointment.title}</span>
                        {appointment.starts_at ? (
                          <span className="shift-appointment-meta">{format24HourTime(appointment.starts_at)}</span>
                        ) : null}
                      </button>
                      {expandedAppointmentIds.has(appointment.id) ? (
                        <div className="shift-appointment-popover shift-appointment-popover-inline">
                          <p className="shift-appointment-popover-title">{appointment.title}</p>
                          {appointment.starts_at ? (
                            <p className="shift-appointment-popover-meta">
                              {format24HourTime(appointment.starts_at)}
                            </p>
                          ) : null}
                          {appointment.description ? (
                            <p className="shift-appointment-description">{appointment.description}</p>
                          ) : (
                            <p className="shift-appointment-description">No details added.</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            ) : null}
            {slotAssignments.map((assignment, index) => {
              const name = assignment?.volunteer?.preferred_name || assignment?.volunteer?.full_name || null;
              const hasVolunteer = Boolean(assignment?.volunteer?.id);
              const hasOtherLabel = Boolean(!hasVolunteer && (assignment?.notes ?? "").trim());
              const isLeadCoverageSlot = index === 0 && !hasVolunteer;
              const canClaimLeadCoverage = profile?.role === "Lead" || profile?.role === "Admin";
              const isVolunteerPastLocked = profile?.role !== "Admin" && isPastShiftDay;
              const slotClass =
                !assignment || !assignment.volunteer?.id
                  ? index === 0
                    ? "needs-lead"
                    : hasOtherLabel
                      ? "other"
                    : "none"
                  : assignment.status === "pending"
                    ? "pending"
                    : assignment.volunteer?.role === "Admin"
                      ? "admin"
                      : assignment.assignment_role === "lead"
                        ? "lead"
                        : "assigned";
              return (
                <button
                  key={`${shift.id}-slot-${index}`}
                  className={`capacity-slot ${slotClass}`}
                  type="button"
                  disabled={
                    isVolunteerPastLocked ||
                    (hasVolunteer &&
                      profile?.role !== "Admin" &&
                      assignment?.volunteer?.id !== session.user.id) ||
                    (isLeadCoverageSlot && !canClaimLeadCoverage)
                  }
                  onClick={async () => {
                    const resolvedInstanceId = await ensureShiftInstance(shift);
                    if (!resolvedInstanceId) return;
                    setActiveShiftInstanceId(resolvedInstanceId);

                    if (!assignment || !hasVolunteer) {
                      if (profile?.role === "Admin") {
                        if (assignment && hasOtherLabel) {
                          setRemoveTarget(assignment);
                          setRemoveMessage("");
                          setShowRemovePrompt(true);
                          return;
                        }
                        setAssignMessage("");
                        setAssignVolunteerSearchInput("");
                        setAssignVolunteerSearch("");
                        setShowAssignOtherForm(false);
                        setAssignOtherName("");
                        setAssignOtherDetails("");
                        setAssignShiftInstanceId(resolvedInstanceId);
                        setShowAssignVolunteer(true);
                      } else {
                        if (index === 0 && profile?.role !== "Lead") {
                          return;
                        }
                        const alreadyOnShift = assignmentList.some(
                          (slot) => slot.volunteer?.id === session.user.id && slot.status !== "dropped",
                        );
                        if (alreadyOnShift) {
                          setTakeShiftMessage("You are already on this shift!");
                          openTakeShiftPrompt();
                          return;
                        }
                        setTakeShiftMessage("");
                        setTakeShiftMode("request");
                        openTakeShiftPrompt();
                      }
                    } else if (assignment.volunteer?.id === session.user.id && profile?.role !== "Admin") {
                      setDropTargetId(assignment.id);
                      setShowDropConfirm(true);
                    } else if (isPrimaryAdminAccount) {
                      if (assignment.status === "pending") {
                        const pendingName =
                          assignment.volunteer?.preferred_name ||
                          assignment.volunteer?.full_name ||
                          "Volunteer";
                        setPendingDecisionTarget({
                          id: assignment.id,
                          name: pendingName,
                        });
                        setShowPendingDecisionPrompt(true);
                      } else {
                        setNotesTarget(assignment);
                        setNotesDraft(assignment.notes ?? "");
                        setNotesMessage("");
                        setShowAssignmentNotes(true);
                      }
                    }
                  }}
                >
                  {assignment?.status === "pending" ? (
                    "Pending"
                  ) : assignment && hasOtherLabel ? (
                    <div className="capacity-slot-content">
                      <span className="capacity-slot-name">{assignment.notes}</span>
                    </div>
                  ) : assignment && hasVolunteer ? (
                    <div className="capacity-slot-content">
                      <span className="capacity-slot-name">{name ?? "No Volunteer Assigned"}</span>
                      {assignment.notes ? (
                        <span className="capacity-slot-phone">{assignment.notes}</span>
                      ) : (assignment.assignment_role === "lead" || assignment.volunteer?.role === "Admin") &&
                        assignment.volunteer?.phone ? (
                        isMobile ? (
                          <span className="capacity-slot-phone">
                            <a
                              className="capacity-slot-phone-link"
                              href={`tel:${normalizePhoneLink(assignment.volunteer.phone)}`}
                            >
                              {assignment.volunteer.phone}
                            </a>
                          </span>
                        ) : (
                          <span className="capacity-slot-phone">{assignment.volunteer.phone}</span>
                        )
                      ) : null}
                    </div>
                  ) : (
                    (index === 0 ? "Needs Lead Coverage" : "No Volunteer Assigned")
                  )}
                </button>
              );
            })}
            {canAddExtraVolunteer ? (
              <button
                className="capacity-slot capacity-slot-extra"
                type="button"
                disabled={profile?.role !== "Admin" && isPastShiftDay}
                onClick={async () => {
                  const resolvedInstanceId = await ensureShiftInstance(shift);
                  if (!resolvedInstanceId) return;
                  setActiveShiftInstanceId(resolvedInstanceId);

                  if (profile?.role === "Admin") {
                    setAssignMessage("");
                    setAssignVolunteerSearchInput("");
                    setAssignVolunteerSearch("");
                    setShowAssignOtherForm(false);
                    setAssignOtherName("");
                    setAssignOtherDetails("");
                    setAssignShiftInstanceId(resolvedInstanceId);
                    setShowAssignVolunteer(true);
                    return;
                  }

                  const alreadyOnShift = assignmentList.some(
                    (slot) => slot.volunteer?.id === session.user.id && slot.status !== "dropped",
                  );
                  if (alreadyOnShift) {
                    setTakeShiftMessage("You are already on this shift!");
                    openTakeShiftPrompt();
                    return;
                  }
                  setTakeShiftMessage("");
                  setTakeShiftMode("request");
                  openTakeShiftPrompt();
                }}
              >
                Add Extra Volunteer
              </button>
            ) : null}
          </div>
        ) : (
          <div className="shift-appointments-list">
            {appointmentsForShift.length > 0
              ? appointmentsForShift.map((appointment) => (
                  <div key={appointment.id} className="shift-appointment-item">
                    <button
                      className="shift-appointment-button"
                      type="button"
                      onClick={async () => {
                        if (canManageAppointments) {
                          await handleOpenAppointments(shift);
                          if (canModifyAppointments) {
                            handleEditAppointment(appointment);
                          }
                          return;
                        }
                        toggleAppointmentExpanded(appointment.id);
                      }}
                      style={{
                        borderLeftColor: appointment.color ?? APPOINTMENT_COLOR_OTHER_DEFAULT,
                      }}
                    >
                      <span className="shift-appointment-title">{appointment.title}</span>
                      {appointment.starts_at ? (
                        <span className="shift-appointment-meta">{format24HourTime(appointment.starts_at)}</span>
                      ) : null}
                    </button>
                    {!canManageAppointments && expandedAppointmentIds.has(appointment.id) ? (
                      <div className="shift-appointment-popover">
                        <p className="shift-appointment-popover-title">{appointment.title}</p>
                        {appointment.starts_at ? (
                          <p className="shift-appointment-popover-meta">{format24HourTime(appointment.starts_at)}</p>
                        ) : null}
                        {appointment.description ? (
                          <p className="shift-appointment-description">{appointment.description}</p>
                        ) : (
                          <p className="shift-appointment-description">No details added.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))
              : null}
          </div>
        )}
      </div>
    );
  };

  const handleConfirmTakeShift = async () => {
    if (!activeShiftInstanceId) {
      setTakeShiftMessage("Shift instance not found.");
      return;
    }
    if (profile?.role !== "Admin") {
      const activeShift = instanceShifts.find((shift) => shift.instanceId === activeShiftInstanceId);
      if (activeShift && startOfDay(activeShift.start).getTime() < todayStartMs) {
        setTakeShiftMessage("Past shifts are locked and can no longer be changed.");
        return;
      }
    }
    const existingAssignment = (weekAssignments[activeShiftInstanceId] ?? []).some(
      (assignment) =>
        assignment.volunteer?.id === session.user.id && assignment.status !== "dropped",
    );
    if (existingAssignment) {
      setTakeShiftMessage("You are already on this shift!");
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

    closeTakeShiftPrompt();
    setTakeShiftLoading(false);

    if (takeShiftMode === "request") {
      const volunteerName =
        displayProfile?.preferred_name ||
        displayProfile?.full_name ||
        session.user.email ||
        "A volunteer";
      await supabase.functions.invoke("send-admin-push", {
        body: {
          title: "Shift request",
          body: `${volunteerName} requested to join a shift.`,
          url: "/?view=notifications",
        },
      });
    } else if (nextStatus === "active" && profile?.role === "Regular Volunteer") {
      const volunteerName =
        displayProfile?.preferred_name ||
        displayProfile?.full_name ||
        session.user.email ||
        "A volunteer";
      const leadNotifyError = await notifyLeadsOnShiftInstance({
        shiftInstanceId: activeShiftInstanceId,
        excludeVolunteerIds: [session.user.id],
        title: "Shift added",
        body: `${volunteerName} has been added to your shift`,
        notificationType: "shift_added",
      });
      if (leadNotifyError) {
        setTakeShiftMessage(`Joined shift, but ${leadNotifyError}`);
      }
    }

    const baseDate = addDays(today, weekOffset * 7);
    const weekStart = getWeekStart(baseDate, true);
    const weekEnd = addDays(weekStart, 6);

    const { data, error: refreshError } = await supabase
      .from("shift_assignments")
      .select(
        `
        id,
        created_at,
        status,
        assignment_role,
        notes,
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

  const handleAssignmentNotesSave = async () => {
    if (!notesTarget) return;
    setNotesSaving(true);
    setNotesMessage("");
    const { error } = await supabase
      .from("shift_assignments")
      .update({ notes: notesDraft.trim() || null })
      .eq("id", notesTarget.id);
    if (error) {
      setNotesMessage(error.message);
      setNotesSaving(false);
      return;
    }
    setNotesSaving(false);
    setShowAssignmentNotes(false);
    setNotesTarget(null);
    setNotesDraft("");
    await fetchWeekAssignments();
  };

  const handleEnableNotifications = async () => {
    setNotificationMessage("");
    if (!vapidPublicKey) {
      setNotificationMessage("Missing VAPID public key configuration.");
      return;
    }
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setNotificationMessage("Push notifications are not supported on this device.");
      return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isIOS && !isStandalone) {
      setNotificationMessage(
        "On iPhone, open this app from the Home Screen icon first (Safari -> Share -> Add to Home Screen), then tap Enable notifications again.",
      );
      return;
    }

    setNotificationLoading(true);
    setNotificationAction("enable");
    try {
      if (Notification.permission === "denied") {
        setNotificationMessage(
          "Notifications are blocked in iPhone/browser settings. Re-enable them in Settings, then try again.",
        );
        return;
      }

      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setNotificationMessage(
          "Notification permission was not granted. If no popup appeared, permissions are already set for this app.",
        );
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      const json = subscription.toJSON();
      const p256dh = json.keys?.p256dh;
      const authKey = json.keys?.auth;
      if (!p256dh || !authKey) {
        setNotificationMessage("Unable to read subscription keys.");
        return;
      }

      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: session.user.id,
          endpoint: subscription.endpoint,
          p256dh,
          auth: authKey,
        },
        { onConflict: "user_id,endpoint" },
      );

      if (error) {
        setNotificationMessage(error.message);
        return;
      }

      const { error: prefError } = await supabase
        .from("profiles")
        .update({ notification_pref: "push_and_email" })
        .eq("id", session.user.id);
      if (prefError) {
        setNotificationMessage(prefError.message);
        return;
      }

      setProfileOverride((previous) => ({
        ...(previous ?? {}),
        notification_pref: "push_and_email",
      }));
      setNotificationMessage("Notifications enabled!");
    } catch (error) {
      setNotificationMessage(
        error instanceof Error ? error.message : "Unable to enable notifications.",
      );
    } finally {
      setNotificationLoading(false);
      setNotificationAction(null);
    }
  };

  const handleDisableNotifications = async () => {
    setNotificationMessage("");
    setNotificationLoading(true);
    setNotificationAction("disable");
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(async (registration) => {
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
              await subscription.unsubscribe();
            }
          }),
        );
      }

      const { error: removeSubsError } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", session.user.id);

      if (removeSubsError) {
        setNotificationMessage(removeSubsError.message);
        return;
      }

      const { error: prefError } = await supabase
        .from("profiles")
        .update({ notification_pref: "email_only" })
        .eq("id", session.user.id);

      if (prefError) {
        setNotificationMessage(prefError.message);
        return;
      }

      setProfileOverride((previous) => ({
        ...(previous ?? {}),
        notification_pref: "email_only",
      }));
      setNotificationMessage("Notifications disabled.");
    } catch (error) {
      setNotificationMessage(
        error instanceof Error ? error.message : "Unable to disable notifications.",
      );
    } finally {
      setNotificationLoading(false);
      setNotificationAction(null);
    }
  };

  const handleNotificationToggle = async (nextEnabled: boolean) => {
    if (nextEnabled) {
      await handleEnableNotifications();
      return;
    }
    await handleDisableNotifications();
  };

  const handleTestNotification = async () => {
    setNotificationMessage("");
    setNotificationLoading(true);
    setNotificationAction("test");
    try {
      const pushError = await sendVolunteerPush({
        userId: session.user.id,
        title: "Test notification",
        body: "Push is working on this device.",
        notificationType: "self_test",
        url: "/?view=notifications",
      });
      if (pushError) {
        setNotificationMessage(`Test failed: ${pushError}`);
      } else {
        setNotificationMessage("Test push sent.");
      }
    } finally {
      setNotificationLoading(false);
      setNotificationAction(null);
    }
  };

  const toShiftDateTimeIso = useCallback(
    (shift: ShiftInstance, timeValue: string) => {
      if (!timeValue) return null;
      const match = timeValue.match(/^(\d{2}):(\d{2})$/);
      if (!match) return null;
      const base = new Date(shift.start);
      base.setHours(Number(match[1]), Number(match[2]), 0, 0);
      if (Number.isNaN(base.getTime())) return null;
      return base.toISOString();
    },
    [],
  );

  const handleOpenAppointments = useCallback(
    async (shift: ShiftInstance) => {
      const resolvedInstanceId = await ensureShiftInstance(shift);
      if (!resolvedInstanceId) return;
      setAppointmentsShift(shift);
      setAppointmentsShiftInstanceId(resolvedInstanceId);
      setAppointmentsMessage("");
      setAppointmentForm({
        id: null,
        kind: "other",
        title: "",
        description: "",
        color: APPOINTMENT_COLOR_OTHER_DEFAULT,
        starts_at: "",
      });
      setExpandedAppointmentIds(new Set());
      setShowAppointments(true);
    },
    [ensureShiftInstance],
  );

  const handleEditAppointment = useCallback((appointment: ShiftAppointment) => {
    setAppointmentsMessage("");
    setAppointmentForm({
      id: appointment.id,
      kind: getAppointmentKindFromColor(appointment.color),
      title: appointment.title ?? "",
      description: appointment.description ?? "",
      color: appointment.color ?? APPOINTMENT_COLOR_OTHER_DEFAULT,
      starts_at: toTimeInputValue(appointment.starts_at),
    });
  }, []);

  const handleSaveAppointment = useCallback(async () => {
    if (!canModifyAppointments) {
      setAppointmentsMessage("Only admins can add or edit appointments.");
      return;
    }
    if (!appointmentsShift || !appointmentsShiftInstanceId) return;
    if (!appointmentForm.title.trim()) {
      setAppointmentsMessage("Title is required.");
      return;
    }
    const startIso = toShiftDateTimeIso(appointmentsShift, appointmentForm.starts_at);
    const isNewAppointment = !appointmentForm.id;

    setAppointmentSaving(true);
    setAppointmentsMessage("");
    const { error } = await saveAppointment({
      id: appointmentForm.id,
      shiftInstanceId: appointmentsShiftInstanceId,
      kind: appointmentForm.kind,
      title: appointmentForm.title,
      description: appointmentForm.description,
      color: appointmentForm.color,
      startsAtIso: startIso,
      userId: session.user.id,
    });
    if (error) {
      setAppointmentsMessage(error);
      setAppointmentSaving(false);
      return;
    }

    if (isNewAppointment) {
      const kindLabel =
        appointmentForm.kind === "foster"
          ? "Foster"
          : appointmentForm.kind === "adoption"
            ? "Adoption"
            : appointmentForm.kind === "vax"
              ? "Vax"
              : appointmentForm.kind === "orientation"
                ? "Orientation"
              : "Other";
      if (appointmentForm.kind !== "orientation") {
        const leadNotifyError = await notifyLeadsOnShiftInstance({
          shiftInstanceId: appointmentsShiftInstanceId,
          excludeVolunteerIds: [session.user.id],
          title: "New appointment",
          body: `${kindLabel}: ${appointmentForm.title.trim()} was added to ${appointmentsShift.title}.`,
          notificationType: "shift_added",
        });
        if (leadNotifyError) {
          setAppointmentsMessage(`Appointment saved, but ${leadNotifyError}`);
        }
      }
      const adminNotifyError = await sendAdminPush({
        title: "New appointment",
        body: `${kindLabel}: ${appointmentForm.title.trim()} was added to ${appointmentsShift.title}.`,
      });
      if (adminNotifyError) {
        setAppointmentsMessage((previous) =>
          previous
            ? `${previous} | admin notification failed: ${adminNotifyError}`
            : `Appointment saved, but admin notification failed: ${adminNotifyError}`,
        );
      }
    }

    setAppointmentForm({
      id: null,
      kind: "other",
      title: "",
      description: "",
      color: APPOINTMENT_COLOR_OTHER_DEFAULT,
      starts_at: "",
    });
    setAppointmentSaving(false);
    await fetchWeekAppointments();
  }, [
    appointmentForm,
    appointmentsShift,
    appointmentsShiftInstanceId,
    canModifyAppointments,
    fetchWeekAppointments,
    session.user.id,
    toShiftDateTimeIso,
  ]);

  const handleDeleteAppointment = useCallback(
    async (appointmentId: string) => {
      if (!canModifyAppointments) {
        setAppointmentsMessage("Only admins can delete appointments.");
        return;
      }
      const deletedAppointment =
        selectedShiftAppointments.find((appointment) => appointment.id === appointmentId) ?? null;
      setAppointmentDeleteId(appointmentId);
      setAppointmentsMessage("");
      const { error } = await deleteAppointmentById(appointmentId);
      if (error) {
        setAppointmentsMessage(error);
        setAppointmentDeleteId(null);
        return;
      }
      if (appointmentForm.id === appointmentId) {
        setAppointmentForm({
          id: null,
          kind: "other",
          title: "",
          description: "",
          color: APPOINTMENT_COLOR_OTHER_DEFAULT,
          starts_at: "",
        });
      }
      if (appointmentsShiftInstanceId) {
        const appointmentTitle = (deletedAppointment?.title ?? "An appointment").trim();
        const shiftTitle = appointmentsShift?.title ?? "the shift";
        const leadNotifyError = await notifyLeadsOnShiftInstance({
          shiftInstanceId: appointmentsShiftInstanceId,
          excludeVolunteerIds: [session.user.id],
          title: "Appointment deleted",
          body: `${appointmentTitle} was deleted from ${shiftTitle}.`,
          notificationType: "shift_removed",
        });
        const adminNotifyError = await sendAdminPush({
          title: "Appointment deleted",
          body: `${appointmentTitle} was deleted from ${shiftTitle}.`,
        });
        const notificationErrors = [leadNotifyError, adminNotifyError && `admin notification failed: ${adminNotifyError}`]
          .filter((value): value is string => Boolean(value));
        if (notificationErrors.length > 0) {
          setAppointmentsMessage(`Appointment deleted, but ${notificationErrors.join(" | ")}`);
        }
      }
      setAppointmentDeleteId(null);
      await fetchWeekAppointments();
    },
    [
      appointmentForm.id,
      appointmentsShift,
      appointmentsShiftInstanceId,
      canModifyAppointments,
      fetchWeekAppointments,
      selectedShiftAppointments,
      session.user.id,
    ],
  );

  const toggleAppointmentExpanded = useCallback((appointmentId: string) => {
    setExpandedAppointmentIds((previous) => {
      const next = new Set(previous);
      if (next.has(appointmentId)) {
        next.delete(appointmentId);
      } else {
        next.add(appointmentId);
      }
      return next;
    });
  }, []);

  const handleAssignVolunteer = async (volunteerId: string) => {
    if (!assignShiftInstanceId) {
      setAssignMessage("Shift instance not found.");
      return;
    }
    const volunteer = volunteers.find((item) => item.id === volunteerId);
    if (!volunteer) {
      setAssignMessage("Volunteer not found.");
      return;
    }
    setAssignLoading(true);
    setAssignMessage("");
    const assignmentRole = volunteer.role === "Lead" ? "lead" : "regular";
    const { error } = await supabase
      .from("shift_assignments")
      .upsert(
        {
          shift_instance_id: assignShiftInstanceId,
          volunteer_id: volunteerId,
          status: "active",
          assignment_role: assignmentRole,
          dropped_at: null,
          dropped_reason: null,
        },
        { onConflict: "shift_instance_id,volunteer_id" },
      );

    if (error) {
      setAssignMessage(error.message);
      setAssignLoading(false);
      return;
    }

    setShowAssignVolunteer(false);
    setAssignVolunteerSearchInput("");
    setAssignVolunteerSearch("");
    setAssignShiftInstanceId(null);
    setShowAssignOtherForm(false);
    setAssignOtherName("");
    setAssignOtherDetails("");

    const assignedShift = instanceShifts.find((shift) => shift.instanceId === assignShiftInstanceId);
    const volunteerName = volunteer.preferred_name || volunteer.full_name || "A volunteer";
    const adminName =
      displayProfile?.preferred_name || displayProfile?.full_name || session.user.email || "An admin";
    const shiftTitle = assignedShift?.title ?? "Shift";
    const shiftDate = assignedShift
      ? assignedShift.start.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "an upcoming date";
    const shiftTime = assignedShift ? formatTimeRangeFromInstance(assignedShift.start, assignedShift.end) : "—";
    const notificationErrors: string[] = [];

    const { error: adminPushError } = await supabase.functions.invoke("send-admin-push", {
      body: {
        title: "Shift added",
        body: `${volunteerName} is now on (${shiftDate}, ${shiftTime}), ${shiftTitle}.`,
        url: "/?view=notifications",
      },
    });
    if (adminPushError) {
      notificationErrors.push(`admin notification failed: ${adminPushError.message}`);
    }

    const leadNotifyError = await notifyLeadsOnShiftInstance({
      shiftInstanceId: assignShiftInstanceId,
      excludeVolunteerIds: [volunteerId],
      title: "Shift added",
      body: `${volunteerName} was added to your shift`,
      notificationType: "shift_added",
    });
    if (leadNotifyError) {
      notificationErrors.push(leadNotifyError);
    }

    const pushError = await sendVolunteerPush({
      userId: volunteerId,
      title: "Shift added",
      body: `${adminName} added you to ${shiftDate}, ${shiftTime}, ${shiftTitle}.`,
      notificationType: "shift_added",
      shiftInstanceId: assignShiftInstanceId,
    });
    if (pushError) {
      notificationErrors.push(`volunteer notification failed: ${pushError}`);
    }
    if (notificationErrors.length > 0) {
      setAssignMessage(`Volunteer added, but ${notificationErrors.join(" | ")}`);
      setAssignLoading(false);
      await fetchWeekAssignments();
      return;
    }

    await fetchWeekAssignments();
    setAssignLoading(false);
  };

  const handleAssignOther = useCallback(async () => {
    if (!assignShiftInstanceId) {
      setAssignMessage("Shift instance not found.");
      return;
    }
    const label = assignOtherName.trim();
    if (!label) {
      setAssignMessage("Please enter a name for Other.");
      return;
    }

    setAssignOtherLoading(true);
    setAssignMessage("");
    const details = assignOtherDetails.trim();
    const notes = details ? `${label} — ${details}` : label;
    const { error } = await supabase.from("shift_assignments").insert({
      shift_instance_id: assignShiftInstanceId,
      volunteer_id: null,
      status: "active",
      assignment_role: "regular",
      notes,
      dropped_at: null,
      dropped_reason: null,
    });

    if (error) {
      setAssignMessage(error);
      setAssignOtherLoading(false);
      return;
    }

    const assignedShift = instanceShifts.find((shift) => shift.instanceId === assignShiftInstanceId);
    const shiftTitle = assignedShift?.title ?? "Shift";
    const leadNotifyError = await notifyLeadsOnShiftInstance({
      shiftInstanceId: assignShiftInstanceId,
      excludeVolunteerIds: [session.user.id],
      title: "Shift updated",
      body: `Other: ${label} was added to ${shiftTitle}.`,
      notificationType: "shift_added",
    });
    const adminNotifyError = await sendAdminPush({
      title: "Shift updated",
      body: `Other: ${label} was added to ${shiftTitle}.`,
    });

    const notificationErrors = [
      leadNotifyError,
      adminNotifyError ? `admin notification failed: ${adminNotifyError}` : null,
    ].filter((value): value is string => Boolean(value));

    setAssignOtherName("");
    setAssignOtherDetails("");
    setShowAssignOtherForm(false);
    setAssignOtherLoading(false);
    setAssignMessage(
      notificationErrors.length > 0
        ? `Added Other, but ${notificationErrors.join(" | ")}`
        : "Added Other to this shift.",
    );
    await fetchWeekAssignments();
  }, [
    assignOtherDetails,
    assignOtherName,
    assignShiftInstanceId,
    fetchWeekAssignments,
    instanceShifts,
    session.user.id,
  ]);

  const handleNotificationDecision = async (
    assignmentId: string,
    decision: "approve" | "deny",
  ) => {
    if (!isPrimaryAdminAccount) {
      setNotificationsMessage("Only admins can approve or deny requests.");
      return;
    }
    if (decision === "deny") {
      setDenyTargetId(assignmentId);
      setDenyReason("");
      setShowDenyPrompt(true);
      return;
    }

    setNotificationsLoading(true);
    setNotificationsMessage("");

    const { error } = await approveNotificationAssignment(assignmentId);

    if (error) {
      setNotificationsMessage(error);
      setNotificationsLoading(false);
      return;
    }

    let approvedRequest = notifications.find((item) => item.id === assignmentId);
    if (!approvedRequest) {
      const { data: approvedData } = await fetchAssignmentById(assignmentId);
      approvedRequest = approvedData ?? undefined;
    }
    const approvedVolunteerId = approvedRequest?.volunteer?.id;
    const approvedVolunteerName =
      approvedRequest?.volunteer?.preferred_name ||
      approvedRequest?.volunteer?.full_name ||
      "A volunteer";
    const approvedShiftInstanceId = approvedRequest?.shift_instance?.id;
    const approvedShiftTitle = approvedRequest?.shift_instance?.template?.title ?? "your shift";
    const approvalNotificationErrors: string[] = [];
    if (approvedVolunteerId) {
      const pushError = await sendVolunteerPush({
        userId: approvedVolunteerId,
        title: "Shift approved",
        body: `Your request for ${approvedShiftTitle} was approved.`,
        notificationType: "shift_approved",
      });
      if (pushError) {
        approvalNotificationErrors.push(`push notification failed: ${pushError}`);
      }
    }

    if (approvedShiftInstanceId) {
      const leadNotifyError = await notifyLeadsOnShiftInstance({
        shiftInstanceId: approvedShiftInstanceId,
        excludeVolunteerIds: [approvedVolunteerId, session.user.id].filter(
          (value): value is string => Boolean(value),
        ),
        title: "Shift added",
        body: `${approvedVolunteerName} has been added to your shift`,
        notificationType: "shift_added",
      });
      if (leadNotifyError) {
        approvalNotificationErrors.push(leadNotifyError);
      }
    }
    if (approvalNotificationErrors.length > 0) {
      setNotificationsMessage(`Approved, but ${approvalNotificationErrors.join(" | ")}`);
    }

    const { data: pendingItems } = await fetchPendingNotifications();
    setNotifications(pendingItems);
    setNotificationsLoading(false);
    await fetchWeekAssignments();
  };

  const handleConfirmDeny = async () => {
    if (!isPrimaryAdminAccount) {
      setNotificationsMessage("Only admins can deny requests.");
      return;
    }
    if (!denyTargetId) return;
    if (!denyReason.trim()) {
      setNotificationsMessage("Please add a denial reason.");
      return;
    }
    setNotificationsLoading(true);
    setNotificationsMessage("");

    const { error } = await denyNotificationAssignment(denyTargetId, denyReason.trim());

    if (error) {
      setNotificationsMessage(error);
      setNotificationsLoading(false);
      return;
    }

    setShowDenyPrompt(false);
    setDenyTargetId(null);
    setDenyReason("");

    const { data: pendingItems } = await fetchPendingNotifications();
    setNotifications(pendingItems);
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

    const adminName =
      displayProfile?.preferred_name || displayProfile?.full_name || session.user.email || "An admin";
    const removeTargetLabel = (removeTarget.notes ?? "").split(" — ")[0]?.trim();
    const volunteerName =
      removeTarget.volunteer?.preferred_name ||
      removeTarget.volunteer?.full_name ||
      removeTargetLabel ||
      "A volunteer";
    const pushError = await sendAdminDropPush(`${adminName} removed ${volunteerName} from a shift.`);
    if (pushError) {
      setAssignmentsMessage(`Volunteer removed, but push notification failed: ${pushError}`);
    }
    const removedVolunteerId = removeTarget.volunteer?.id;
    const removedShiftInstanceId = removeTarget.shift_instance?.id;
    if (removedVolunteerId) {
      const shiftDateValue = removeTarget.shift_instance?.starts_at ?? removeTarget.shift_instance?.shift_date;
      const shiftDate = formatDateWithWeekday(shiftDateValue);
      const shiftStart = removeTarget.shift_instance?.starts_at;
      const shiftEnd = removeTarget.shift_instance?.ends_at;
      const templateId = removeTarget.shift_instance?.template?.id;
      const template = templateId ? templateMap[templateId] : undefined;
      const shiftTime = shiftStart
        ? `${formatTimeOnly(shiftStart)}${shiftEnd ? ` — ${formatTimeOnly(shiftEnd)}` : ""}`
        : template?.start_time
          ? `${formatTemplateTime(template.start_time)}${
              template.end_time ? ` — ${formatTemplateTime(template.end_time)}` : ""
            }`
          : "scheduled shift";
      const shiftTitle = removeTarget.shift_instance?.template?.title ?? "Shift";
      const volunteerPushError = await sendVolunteerPush({
        userId: removedVolunteerId,
        title: "Shift removed",
        body: `${adminName} removed you from ${shiftDate}, ${shiftTime}, ${shiftTitle}.`,
        notificationType: "shift_removed",
        shiftInstanceId: removedShiftInstanceId ?? undefined,
      });
      if (volunteerPushError) {
        setAssignmentsMessage(`Volunteer removed, but push notification failed: ${volunteerPushError}`);
      }
    }
    if (removedShiftInstanceId) {
      const memberNotifyError = await notifyActiveMembersOnShiftInstance({
        shiftInstanceId: removedShiftInstanceId,
        excludeVolunteerIds: [session.user.id, removedVolunteerId].filter(
          (value): value is string => Boolean(value),
        ),
        title: "Shift dropped",
        body: `${volunteerName} left your shift`,
        notificationType: "shift_dropped",
      });
      if (memberNotifyError) {
        setAssignmentsMessage(`Volunteer removed, but ${memberNotifyError}`);
      }
    }

    setShowRemovePrompt(false);
    setRemoveTarget(null);
    setRemoveMessage("");
    setRemoveLoading(false);

    await fetchWeekAssignments();
  };

  const handleDropShift = async () => {
    if (!dropTargetId) return;
    const targetAssignment = assignments.find((assignment) => assignment.id === dropTargetId);
    const targetShiftInstanceId = targetAssignment?.shift_instance?.id ?? null;
    if (profile?.role !== "Admin") {
      const targetDay = getShiftDayStart(targetAssignment?.shift_instance);
      if (targetDay && targetDay.getTime() < todayStartMs) {
        setAssignmentsMessage("Past shifts are locked and can no longer be changed.");
        setShowDropConfirm(false);
        setShowDropReason(false);
        setDropTargetId(null);
        return;
      }
    }
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
        dropped_reason:
          profile?.role === "Admin"
            ? "Removed by admin"
            : `${SELF_DROP_REASON_PREFIX} ${dropReason.trim()}`,
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
    const actorName =
      displayProfile?.preferred_name || displayProfile?.full_name || session.user.email || "A volunteer";
    const reasonText = dropReason.trim();
    const pushMessage = reasonText
      ? `${actorName} dropped a shift. Reason: ${reasonText}`
      : `${actorName} dropped a shift.`;
    const pushError = await sendAdminDropPush(pushMessage);
    const isVolunteerDrop = profile?.role !== "Admin";
    if (isVolunteerDrop && targetShiftInstanceId) {
      const memberNotifyError = await notifyActiveMembersOnShiftInstance({
        shiftInstanceId: targetShiftInstanceId,
        excludeVolunteerIds: [session.user.id],
        title: "Shift dropped",
        body: `${actorName} left your shift`,
        notificationType: "shift_dropped",
      });
      if (memberNotifyError) {
        setAssignmentsMessage(`Shift dropped, but ${memberNotifyError}`);
      }
    }
    setDropReason("");
    if (pushError) {
      setAssignmentsMessage(`Shift dropped, but push notification failed: ${pushError}`);
    }

    await fetchMyShifts();
    await fetchPersonalAssignments();
    await fetchWeekAssignments();
    setAssignmentsLoading(false);
  };

  useEffect(() => {
    if (showMyShifts) {
      setMyShiftsPage(0);
    }
  }, [showMyShifts, assignmentsForDisplay.length]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") !== "notifications") return;
    setShowNotifications(true);
    setShowMenu(false);
  }, []);

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

  const scrollToDateKey = (dateKey: string, attempt = 0) => {
    const target = document.getElementById(`day-${dateKey}`) as HTMLDivElement | null;
    if (!target) {
      if (attempt < 12) {
        window.setTimeout(() => scrollToDateKey(dateKey, attempt + 1), 80);
      }
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
  };

  const jumpToNotificationShift = (item: ShiftAssignmentDetail) => {
    const shift = item.shift_instance;
    if (!shift) return;
    let targetDate: Date | null = null;
    if (shift.starts_at) {
      const parsed = new Date(shift.starts_at);
      if (!Number.isNaN(parsed.getTime())) {
        targetDate = startOfDay(parsed);
      }
    }
    if (!targetDate && shift.shift_date) {
      const parsed = parseDateOnly(shift.shift_date);
      if (parsed) targetDate = startOfDay(parsed);
    }
    if (!targetDate) return;

    const targetWeekStart = getWeekStart(targetDate, true);
    const currentWeekStart = getWeekStart(startOfDay(today), true);
    const rawOffset = Math.floor(diffInDays(currentWeekStart, targetWeekStart) / 7);
    const clampedOffset = Math.min(maxWeekOffset, Math.max(0, rawOffset));
    const targetKey = getDateKey(targetDate);

    setShowNotifications(false);
    setWeekOffset(clampedOffset);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToDateKey(targetKey);
        window.setTimeout(() => scrollToDateKey(targetKey), 200);
      });
    });
  };

  useEffect(() => {
    if (todayJumpToken === 0) return;
    if (calendarRangeMode === "week" && weekOffset !== 0) return;
    if (calendarRangeMode === "month" && monthOffset !== 0) return;
    const targetKey = getDateKey(startOfDay(new Date()));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToDateKey(targetKey);
        window.setTimeout(() => scrollToDateKey(targetKey), 200);
      });
    });
  }, [todayJumpToken, weekOffset, monthOffset, calendarRangeMode, todayKey]);

  const handleTodayClick = () => {
    const now = startOfDay(new Date());
    const nowKey = getDateKey(now);

    setToday(now);
    setWeekOffset(0);
    setMonthOffset(0);
    setTodayJumpToken((value) => value + 1);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToDateKey(nowKey);
        window.setTimeout(() => scrollToDateKey(nowKey), 200);
      });
    });
  };

  const handleMonthJump = (monthKey: string) => {
    const option = monthJumpOptions.find((item) => item.key === monthKey);
    if (!option) return;
    if (calendarRangeMode === "month") {
      setMonthOffset(option.monthOffset);
    } else {
      setWeekOffset(option.weekOffset);
    }
  };

  const handlePrevRange = () => {
    if (calendarRangeMode === "month") {
      setMonthOffset((value) => value - 1);
      return;
    }
    setWeekOffset((value) => Math.max(0, value - 1));
  };

  const handleNextRange = () => {
    if (calendarRangeMode === "month") {
      setMonthOffset((value) => value + 1);
      return;
    }
    setWeekOffset((value) => Math.min(maxWeekOffset, value + 1));
  };

  const handleToggleAllDays = () => {
    if (displayDayKeys.length === 0) return;
    setCollapsedDayKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleDaysCollapsed) {
        displayDayKeys.forEach((key) => next.delete(key));
      } else {
        displayDayKeys.forEach((key) => next.add(key));
      }
      return next;
    });
    setManuallyToggledDayKeys((prev) => {
      const next = new Set(prev);
      displayDayKeys.forEach((key) => next.add(key));
      return next;
    });
  };

  const handleCalendarTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    swipeTriggeredRef.current = false;
  };

  const handleCalendarTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    if (!swipeStartRef.current || swipeTriggeredRef.current) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - swipeStartRef.current.x;
    const deltaY = touch.clientY - swipeStartRef.current.y;
    const horizontalDominant = Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
    if (!horizontalDominant || Math.abs(deltaX) < 48) return;
    swipeTriggeredRef.current = true;
    if (deltaX < 0) {
      handleNextRange();
    } else {
      handlePrevRange();
    }
  };

  const handleCalendarTouchEnd = () => {
    swipeStartRef.current = null;
    swipeTriggeredRef.current = false;
  };
  const enableCalendarSwipe = isMobile && calendarRangeMode !== "month";

  const toggleDayCollapsed = (dateKey: string) => {
    setCollapsedDayKeys((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
    setManuallyToggledDayKeys((prev) => {
      const next = new Set(prev);
      next.add(dateKey);
      return next;
    });
  };

  useEffect(() => {
    if (displayDayKeys.length === 0) return;
    if (calendarRangeMode === "month") {
      setCollapsedDayKeys((prev) => {
        let didChange = false;
        const next = new Set(prev);
        displayDayKeys.forEach((dateKey) => {
          if (next.delete(dateKey)) didChange = true;
        });
        return didChange ? next : prev;
      });
      return;
    }
    setCollapsedDayKeys((prev) => {
      let didChange = false;
      const next = new Set(prev);
      displayDayKeys.forEach((dateKey) => {
        if (manuallyToggledDayKeys.has(dateKey)) return;
        if (!isMobile) {
          if (next.has(dateKey)) {
            next.delete(dateKey);
            didChange = true;
          }
          return;
        }

        const parsedDate = parseDateOnly(dateKey);
        if (!parsedDate) return;
        const isToday = startOfDay(parsedDate).getTime() === todayStartMs;
        if (isToday) {
          if (next.has(dateKey)) {
            next.delete(dateKey);
            didChange = true;
          }
          return;
        }
        if (!next.has(dateKey)) {
          next.add(dateKey);
          didChange = true;
        }
      });
      return didChange ? next : prev;
    });
  }, [displayDayKeys, manuallyToggledDayKeys, todayStartMs, isMobile, calendarRangeMode]);

  const handleRefreshClick = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        fetchWeekAssignments(),
        fetchWeekAppointments(),
        fetchPersonalAssignments(),
        fetchMyShifts(),
        fetchMyRecurring(),
        fetchNotifications(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const runLiveRefresh = useCallback(async () => {
    if (liveRefreshInFlightRef.current) return;
    liveRefreshInFlightRef.current = true;
    try {
      await Promise.all([
        fetchWeekAssignments(),
        fetchWeekAppointments(),
        fetchPersonalAssignments(),
        fetchMyShifts(),
        fetchNotifications(),
      ]);
    } finally {
      liveRefreshInFlightRef.current = false;
    }
  }, [fetchWeekAssignments, fetchWeekAppointments, fetchPersonalAssignments, fetchMyShifts, fetchNotifications]);

  useEffect(() => {
    const handleVisibleRefresh = () => {
      if (document.visibilityState !== "visible") return;
      void runLiveRefresh();
    };

    const handleOnlineRefresh = () => {
      void runLiveRefresh();
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void runLiveRefresh();
    }, 15000);

    window.addEventListener("focus", handleVisibleRefresh);
    document.addEventListener("visibilitychange", handleVisibleRefresh);
    window.addEventListener("online", handleOnlineRefresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibleRefresh);
      document.removeEventListener("visibilitychange", handleVisibleRefresh);
      window.removeEventListener("online", handleOnlineRefresh);
    };
  }, [runLiveRefresh]);

  const handleModalBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    setShowMyShifts(false);
    setShowWeekGlance(false);
    setShowMonthDayDetails(false);
    setShowAppointments(false);
    closeTakeShiftPrompt();
    setShowNotifications(false);
    setShowAssignVolunteer(false);
    setAssignVolunteerSearchInput("");
    setAssignVolunteerSearch("");
    setShowAssignOtherForm(false);
    setAssignOtherName("");
    setAssignOtherDetails("");
    setShowHelpfulLinks(false);
    setShowDropConfirm(false);
    setShowDropReason(false);
    setShowDenyPrompt(false);
    setShowPendingDecisionPrompt(false);
    setShowRemovePrompt(false);
    setShowAssignmentNotes(false);
    setShowVolunteers(false);
    setShowProfile(false);
    setShowAddRecurring(false);
  };

  return (
    <div className="calendar-shell">
      <header className="calendar-header">
        <div>
          <div className="calendar-eyebrow-row">
            <p className="calendar-eyebrow">
              Welcome,{" "}
              {displayProfile?.preferred_name ||
                displayProfile?.full_name ||
                session.user.email ||
                "Volunteer"}
            </p>
          </div>
          <div className="calendar-title-row">
            <h1 className="calendar-title">CKC Shift Calendar</h1>
            <img className="calendar-title-logo" src="/favicon.png" alt="CKC logo" />
          </div>
        </div>
        <div className="calendar-actions">
          <select
            className={`month-jump-select range-mode-select ${isMobile ? "range-select-mobile" : ""}`}
            value={calendarRangeMode}
            onChange={(event) =>
              setCalendarRangeMode(event.target.value as "week" | "month")
            }
            aria-label="Select calendar range"
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
          <button
            className={`account-button refresh-button jump-today-icon ${
              refreshing ? "refresh-spinning" : ""
            }`}
            type="button"
            onClick={handleRefreshClick}
            disabled={refreshing}
            title="Refresh shifts and notifications"
            aria-label="Refresh shifts and notifications"
          >
            {refreshing ? "↻" : "↻"}
          </button>
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
                  className="menu-item menu-item-single-line"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMenu(false);
                    setShowWeekGlance(true);
                  }}
                >
                  This week at a glance
                </button>
                <button
                  className="menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMenu(false);
                    setShowHelpfulLinks(true);
                  }}
                >
                  Resources
                </button>
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

      <section
        className={`calendar-panel ${isMobile && calendarRangeMode === "month" ? "month-mode" : ""}`}
        onTouchStart={enableCalendarSwipe ? handleCalendarTouchStart : undefined}
        onTouchMove={enableCalendarSwipe ? handleCalendarTouchMove : undefined}
        onTouchEnd={enableCalendarSwipe ? handleCalendarTouchEnd : undefined}
        onTouchCancel={enableCalendarSwipe ? handleCalendarTouchEnd : undefined}
      >
        <div className="calendar-header">
          <div>
            <div className="calendar-title-with-month">
              <h2 className="calendar-title">{calendarTitleLabel}</h2>
              <div className="month-title-nav">
                <button
                  className="month-title-nav-button"
                  onClick={handlePrevRange}
                  disabled={calendarRangeMode === "week" && weekOffset === 0}
                  aria-label="Previous"
                  title="Previous"
                >
                  ←
                </button>
                <button className="month-title-nav-button month-title-nav-today" onClick={handleTodayClick}>
                  Today
                </button>
                <button
                  className="month-title-nav-button"
                  onClick={handleNextRange}
                  disabled={calendarRangeMode === "week" && weekOffset >= maxWeekOffset}
                  aria-label="Next"
                  title="Next"
                >
                  →
                </button>
              </div>
              {calendarRangeMode === "month" && isMobile ? (
                <select
                  className="month-jump-select month-jump-inline month-jump-inline-mobile"
                  value={currentMonthKey}
                  onChange={(event) => handleMonthJump(event.target.value)}
                  aria-label="Jump to month"
                >
                  {monthJumpOptions.map((option) => {
                    const [year, month] = option.key.split("-").map((part) => Number(part));
                    const optionDate = new Date(year, month - 1, 1);
                    return (
                      <option key={option.key} value={option.key}>
                        {monthFormatter.format(optionDate)}
                      </option>
                    );
                  })}
                </select>
              ) : null}
            </div>
            {calendarRangeMode === "month" ? null : <p className="calendar-subtitle">{rangeLabel}</p>}
          </div>
          <div className="calendar-header-actions">
            {calendarRangeMode === "month" && !isMobile ? (
              <select
                className="month-jump-select month-jump-inline"
                value={currentMonthKey}
                onChange={(event) => handleMonthJump(event.target.value)}
                aria-label="Jump to month"
              >
                {monthJumpOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              className="account-button jump-today jump-today-icon"
              type="button"
              onClick={handleTodayClick}
              aria-label="Jump to today"
              title="Jump to today"
            >
              ↓
            </button>
            <div className="calendar-view-toggle" role="tablist" aria-label="Calendar view mode">
              <button
                className={`calendar-view-toggle-button ${
                  calendarViewMode === "volunteers" ? "active" : ""
                }`}
                type="button"
                role="tab"
                aria-selected={calendarViewMode === "volunteers"}
                onClick={() => setCalendarViewMode("volunteers")}
              >
                Volunteers
              </button>
              <button
                className={`calendar-view-toggle-button ${
                  calendarViewMode === "appointments" ? "active" : ""
                }`}
                type="button"
                role="tab"
                aria-selected={calendarViewMode === "appointments"}
                onClick={() => setCalendarViewMode("appointments")}
              >
                Appointments
              </button>
            </div>
            {isMobile && calendarRangeMode !== "month" ? (
              <button
                className="account-button jump-today"
                type="button"
                onClick={handleToggleAllDays}
                aria-label={allVisibleDaysCollapsed ? "Expand all days" : "Collapse all days"}
                title={allVisibleDaysCollapsed ? "Expand all" : "Collapse all"}
              >
                {allVisibleDaysCollapsed ? "▾▾" : "▴▴"}
              </button>
            ) : null}
          </div>
        </div>

        <div className={`calendar-grid ${calendarRangeMode === "month" ? "month-mode" : ""}`}>
          {weekdayLabels.map((day, index) => (
            <div
              key={`${monthLabel}-${day}`}
              className={`weekday ${index === todayWeekdayIndex ? "weekday-today" : ""}`}
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
            const cellDate = cell.date;
            const isOutsideMonth =
              calendarRangeMode === "month" && cell.date.getMonth() !== baseDate.getMonth();
            if (calendarRangeMode === "month" && isMobile && isOutsideMonth) {
              return null;
            }
            const isPastDay = startOfDay(cell.date).getTime() < todayStartMs;
            const isCollapsed =
              isMobile && calendarRangeMode !== "month" && collapsedDayKeys.has(dateKey);
            const weekdayLabel = weekdayLabels[(cell.date.getDay() + 6) % 7];
            const dayShifts = orderedShiftsByDate[dateKey] ?? [];

            const sortedDayShifts = dayShifts;

            return (
              <div
                key={`${monthLabel}-${dateKey}`}
                className={`day-cell ${isPastDay ? "past" : ""} ${isCollapsed ? "collapsed" : ""} ${
                  calendarRangeMode === "month" ? "month-cell-clickable" : ""
                } ${
                  isOutsideMonth ? "outside" : ""
                }`}
                data-date={dateKey}
                id={`day-${dateKey}`}
                ref={dateKey === todayKey ? todayCellRef : undefined}
                onClick={
                  calendarRangeMode === "month"
                    ? () => {
                        setMonthDayDetailsDate(startOfDay(cellDate));
                        setShowMonthDayDetails(true);
                      }
                    : undefined
                }
              >
                <div
                  className={`day-header-row ${
                    isMobile && calendarRangeMode !== "month" ? "day-header-row-clickable" : ""
                  }`}
                  role={isMobile && calendarRangeMode !== "month" ? "button" : undefined}
                  tabIndex={isMobile && calendarRangeMode !== "month" ? 0 : undefined}
                  onClick={
                    isMobile && calendarRangeMode !== "month"
                      ? () => toggleDayCollapsed(dateKey)
                      : undefined
                  }
                  onKeyDown={
                    isMobile && calendarRangeMode !== "month"
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleDayCollapsed(dateKey);
                          }
                        }
                      : undefined
                  }
                >
                  <div>
                    <div className={`day-weekday ${isCollapsed ? "day-weekday-visible" : ""}`}>
                      {weekdayLabel}
                    </div>
                    <div className="day-number">{cell.label}</div>
                  </div>
                </div>
                {!isCollapsed ? (
                  calendarRangeMode === "month" ? (
                    <div className="month-event-list">
                      {dayShifts.slice(0, 2).map((shift) => {
                        const maxItemsPerShift = isMobile ? 1 : 4;
                        const shiftAppointments = appointmentsByShift[shift.instanceId] ?? [];
                        const appointmentCount = shiftAppointments.length;
                        const monthShiftLabel = /morning/i.test(shift.title)
                          ? isMobile && calendarRangeMode === "month"
                            ? "AM"
                            : "Morning"
                          : /evening/i.test(shift.title)
                            ? isMobile && calendarRangeMode === "month"
                              ? "PM"
                              : "Evening"
                            : shift.title;
                        const items =
                          calendarViewMode === "appointments"
                            ? (appointmentsByShift[shift.instanceId] ?? []).map((appointment) => ({
                                key: `appt-${appointment.id}`,
                                label: appointment.title,
                                color: appointment.color ?? APPOINTMENT_COLOR_OTHER_DEFAULT,
                              }))
                            : (weekAssignments[shift.instanceId] ?? [])
                                .filter(
                                  (assignment) =>
                                    assignment.status !== "pending" && Boolean(assignment.volunteer?.id),
                                )
                                .map((assignment) => ({
                                  key: `asg-${assignment.id}`,
                                  label:
                                    assignment.volunteer?.preferred_name ||
                                    assignment.volunteer?.full_name ||
                                    "Volunteer",
                                  color:
                                    isLeadAssignmentRole(assignment.assignment_role) ||
                                    isLeadRole(assignment.volunteer?.role) ||
                                    isAdminRole(assignment.volunteer?.role)
                                      ? "#60a5fa"
                                      : "#34d399",
                                }));

                        return (
                          <div key={`month-shift-${shift.id}`} className="month-shift-group">
                            <p className="month-shift-title">{monthShiftLabel}</p>
                            {calendarViewMode !== "appointments" && appointmentCount > 0 ? (
                              <div className="month-appointment-count">
                                <span className="month-event-dot" style={{ background: "#f59e0b" }} />
                                <span className="month-event-label">
                                  Appointments ({appointmentCount})
                                </span>
                              </div>
                            ) : null}
                            {items.slice(0, maxItemsPerShift).map((item) => (
                              <div
                                key={item.key}
                                className="month-event-item"
                                style={{ background: `${item.color}cc` }}
                              >
                                <span className="month-event-dot" style={{ background: item.color }} />
                                <span className="month-event-label">{item.label}</span>
                              </div>
                            ))}
                            {items.length > maxItemsPerShift ? (
                              <p className="month-more-label">{items.length - maxItemsPerShift} more</p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="shift-list">
                      {sortedDayShifts.map((shift) => renderInteractiveShiftBlock(shift))}
                    </div>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
        {isMobile ? (
          <div className="mobile-week-footer">
            <button
              className="account-button mobile-week-prev"
              type="button"
              onClick={handlePrevRange}
              disabled={calendarRangeMode === "week" && weekOffset === 0}
            >
              {calendarRangeMode === "month"
                  ? "Previous month"
                  : "Previous week"}
            </button>
            <button
              className="account-button mobile-week-top"
              type="button"
              aria-label="Back to top"
              title="Back to top"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              ↑
            </button>
            <button
              className="account-button mobile-week-next"
              type="button"
              onClick={handleNextRange}
              disabled={calendarRangeMode === "week" && weekOffset >= maxWeekOffset}
            >
              {calendarRangeMode === "month"
                  ? "Next month"
                  : "Next week"}
            </button>
          </div>
        ) : null}
      </section>

      {!isMobile && showFloatingViewToggle && !isAnyModalOpen ? (
        <div className="floating-view-toggle">
          <div className="calendar-view-toggle" role="tablist" aria-label="Calendar view mode">
            <button
              className={`calendar-view-toggle-button ${
                calendarViewMode === "volunteers" ? "active" : ""
              }`}
              type="button"
              role="tab"
              aria-selected={calendarViewMode === "volunteers"}
              onClick={() => setCalendarViewMode("volunteers")}
            >
              Volunteers
            </button>
            <button
              className={`calendar-view-toggle-button ${
                calendarViewMode === "appointments" ? "active" : ""
              }`}
              type="button"
              role="tab"
              aria-selected={calendarViewMode === "appointments"}
              onClick={() => setCalendarViewMode("appointments")}
            >
              Appointments
            </button>
          </div>
        </div>
      ) : null}


      {showMyShifts ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
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
                <p className="myshifts-section-title">Upcoming shifts this week</p>
                {showNoUpcoming ? (
                  <div className="empty-banner">
                    No shifts for this week yet. Check the calendar to join a shift!
                  </div>
                ) : null}
                {assignmentsForDisplay.length > 0 ? (
                  <div className="myshifts-list">
                    {pagedAssignments.map((assignment) => {
                      const shift = assignment.shift_instance;
                      if (!shift) return null;
                      const shiftDay = getShiftDayStart(shift);
                      const isPastShift = Boolean(
                        shiftDay && shiftDay.getTime() < todayStartMs && profile?.role !== "Admin",
                      );
                      const title = shift.template?.title ?? "Shift";
                      const locationAddress = "1403 N Monroe Ave";
                      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        locationAddress,
                      )}`;
                      const shiftType = /evening/i.test(title)
                        ? "Evening Shift"
                        : /morning/i.test(title)
                          ? "Morning Shift"
                          : title;
                      const dateText = formatDateWithWeekday(shift.starts_at ?? shift.shift_date);
                      const timeText = `${formatTimeOnly(shift.starts_at)} — ${formatTimeOnly(
                        shift.ends_at,
                      )}`;
                      return (
                        <button
                          key={assignment.id}
                          className="myshift-card"
                          type="button"
                          disabled={isPastShift}
                          onClick={() => {
                            if (isPastShift) return;
                            setDropTargetId(assignment.id);
                            setShowDropConfirm(true);
                          }}
                        >
                          <div className="myshift-detail-row myshift-detail-date">
                            <span className="myshift-detail-label">Date</span>
                            <span className="myshift-detail-value">{dateText}</span>
                          </div>
                          <div className="myshift-detail-row">
                            <span className="myshift-detail-label">Time</span>
                            <span className="myshift-detail-value">{timeText}</span>
                          </div>
                          <div className="myshift-detail-row">
                            <span className="myshift-detail-label">Location</span>
                            <span className="myshift-detail-value">
                              <a
                                className="myshift-location-link"
                                href={mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {locationAddress}
                              </a>
                            </span>
                          </div>
                          <div className="myshift-detail-row">
                            <span className="myshift-detail-label">Shift</span>
                            <span className="myshift-detail-value">{shiftType}</span>
                          </div>
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
                {myRecurring.length > 0 ? (
                  <div className="recurring-list">
                    {myRecurring.map((recurring) => {
                      const template = templateMap[recurring.template_id];
                      if (!template) return null;
                      const templateInstance = instanceShifts.find(
                        (shift) => shift.templateId === recurring.template_id,
                      );
                      const timeRange = template.start_time
                        ? `${formatTemplateTime(template.start_time)} — ${formatTemplateTime(
                            template.end_time,
                          )}`
                        : templateInstance
                          ? formatTimeRangeFromInstance(templateInstance.start, templateInstance.end)
                          : "—";
                      const repeatPattern =
                        recurring.byday && recurring.byday.length > 0
                          ? formatRepeatPatternFromDays(
                              recurring.byday,
                              getRecurringIntervalWeeks(recurring),
                            )
                          : formatRepeatPattern(template.rrule);
                      const shiftType = /evening/i.test(template.title)
                        ? "Evening Shift"
                        : /morning/i.test(template.title)
                          ? "Morning Shift"
                          : template.title;
                      return (
                        <div key={recurring.id} className="recurring-card">
                          <div>
                            <p className="recurring-meta">
                              <span className="recurring-meta-label">Repeats:</span> {repeatPattern}
                            </p>
                            <p className="recurring-meta">
                              <span className="recurring-meta-label">Shift:</span> {shiftType}
                            </p>
                            <p className="recurring-meta">
                              <span className="recurring-meta-label">Time:</span> {timeRange}
                            </p>
                          </div>
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

      {showWeekGlance ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
          <div className="modal-panel week-glance-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Schedule</p>
                <h3 className="modal-title week-glance-title">This week at a glance</h3>
                <p className="modal-location">{rangeLabel}</p>
              </div>
              <div className="modal-header-actions">
                <button className="modal-close" type="button" onClick={() => setShowWeekGlance(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="modal-body">
              <div
                className="calendar-view-toggle week-glance-mode-toggle"
                role="tablist"
                aria-label="Week glance mode"
              >
                <button
                  className={`calendar-view-toggle-button ${
                    weekGlanceMode === "volunteers" ? "active" : ""
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={weekGlanceMode === "volunteers"}
                  onClick={() => setWeekGlanceMode("volunteers")}
                >
                  Volunteers
                </button>
                <button
                  className={`calendar-view-toggle-button ${
                    weekGlanceMode === "appointments" ? "active" : ""
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={weekGlanceMode === "appointments"}
                  onClick={() => setWeekGlanceMode("appointments")}
                >
                  Appointments
                </button>
              </div>
              {(weekGlanceMode === "volunteers" ? weekGlanceRows.length : weekGlanceAppointmentRows.length) === 0 ? (
                <div className="empty-banner">No shifts found for this week.</div>
              ) : (
                <div className="week-glance-table-wrap">
                  <table className="week-glance-table">
                    <thead>
                      <tr>
                        <th>Shift</th>
                        {displayDayKeys.map((dayKey, index) => {
                          const day = addDays(weekStart, index);
                          return (
                            <th key={`glance-head-${dayKey}`}>
                              {WEEKDAYS_MONDAY_FIRST[index]}
                              <br />
                              <span>{dayFormatter.format(day)}</span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {(weekGlanceMode === "volunteers"
                        ? weekGlanceRows
                        : weekGlanceAppointmentRows
                      ).map((row) => (
                        <tr key={row.key}>
                          <td>
                            <div className="week-glance-shift-title">{row.title}</div>
                            <div className="week-glance-shift-time">{row.timeLabel}</div>
                          </td>
                          {displayDayKeys.map((dayKey) => {
                            const dayData = row.byDay[dayKey] as
                              | { leads: string[]; volunteers: string[]; pending: string[] }
                              | Array<{ id: string; title: string; timeLabel: string | null }>
                              | undefined;
                            if (!dayData) return <td key={`${row.key}-${dayKey}`}>—</td>;
                            if (weekGlanceMode === "appointments") {
                              const appointmentItems = dayData as Array<{
                                id: string;
                                title: string;
                                timeLabel: string | null;
                              }>;
                              if (appointmentItems.length === 0) {
                                return <td key={`${row.key}-${dayKey}`}>—</td>;
                              }
                              return (
                                <td key={`${row.key}-${dayKey}`}>
                                  {appointmentItems.map((item) => (
                                    <p key={item.id} className="week-glance-line">
                                      {item.timeLabel ? `${item.timeLabel} ` : ""}
                                      {item.title}
                                    </p>
                                  ))}
                                </td>
                              );
                            }
                            const volunteerData = dayData as {
                              leads: string[];
                              volunteers: string[];
                              pending: string[];
                            };
                            return (
                              <td key={`${row.key}-${dayKey}`}>
                                {volunteerData.leads.length > 0 ? (
                                  <p className="week-glance-line">L: {volunteerData.leads.join(", ")}</p>
                                ) : null}
                                {volunteerData.volunteers.length > 0 ? (
                                  <p className="week-glance-line">V: {volunteerData.volunteers.join(", ")}</p>
                                ) : null}
                                {volunteerData.pending.length > 0 ? (
                                  <p className="week-glance-line week-glance-pending">
                                    Pending: {volunteerData.pending.join(", ")}
                                  </p>
                                ) : null}
                                {volunteerData.leads.length === 0 &&
                                volunteerData.volunteers.length === 0 &&
                                volunteerData.pending.length === 0
                                  ? "—"
                                  : null}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showMonthDayDetails && monthDayDetailsDate ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
          <div className="modal-panel appointments-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Schedule details</p>
                <h3 className="modal-title">
                  {monthDayDetailsDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </h3>
                <p className="modal-location">
                  {monthDayDetailsShifts.length} shift{monthDayDetailsShifts.length === 1 ? "" : "s"}
                </p>
              </div>
              <button className="modal-close" type="button" onClick={() => setShowMonthDayDetails(false)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              {monthDayDetailsShifts.length === 0 ? (
                <div className="empty-banner">No shifts for this date.</div>
              ) : (
                <div className="shift-list">
                  {monthDayDetailsShifts.map((shift) => renderInteractiveShiftBlock(shift, "month-details-"))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showAppointments ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
          <div className="modal-panel appointments-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Shift planning</p>
                <h3 className="modal-title">Appointments</h3>
                <p className="modal-location">
                  {appointmentsShift?.title ?? "Shift"}{" "}
                  {appointmentsShift
                    ? `• ${timeFormatter.format(appointmentsShift.start)}-${timeFormatter.format(
                        appointmentsShift.end,
                      )}`
                    : ""}
                </p>
              </div>
              <button className="modal-close" type="button" onClick={() => setShowAppointments(false)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              {appointmentsLoading ? <div className="loading-banner">Loading appointments...</div> : null}
              {appointmentsMessage ? <div className="error-banner">{appointmentsMessage}</div> : null}

              {canModifyAppointments ? (
                <div className="account-section appointment-form">
                  <p className="account-section-title">
                    {appointmentForm.id ? "Edit appointment" : "New appointment"}
                  </p>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Title"
                    value={appointmentForm.title}
                    onChange={(event) =>
                      setAppointmentForm((prev) => ({
                        ...prev,
                        title: event.target.value,
                      }))
                    }
                  />
                  <textarea
                    className="form-input form-textarea"
                    placeholder="Description"
                    value={appointmentForm.description}
                    onChange={(event) =>
                      setAppointmentForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                  />
                  <div className="appointment-form-grid">
                    <label className="form-label">
                      Appointment type
                      <select
                        className="form-input"
                        value={appointmentForm.kind}
                        onChange={(event) => {
                          const nextKind = event.target.value as AppointmentKind;
                          setAppointmentForm((prev) => {
                            if (nextKind === "foster") {
                              return { ...prev, kind: nextKind, color: APPOINTMENT_COLOR_FOSTER };
                            }
                            if (nextKind === "adoption") {
                              return { ...prev, kind: nextKind, color: APPOINTMENT_COLOR_ADOPTION };
                            }
                            if (nextKind === "vax") {
                              return { ...prev, kind: nextKind, color: APPOINTMENT_COLOR_VAX };
                            }
                            if (nextKind === "orientation") {
                              return { ...prev, kind: nextKind, color: APPOINTMENT_COLOR_ORIENTATION };
                            }
                            const inheritedColor =
                              prev.color === APPOINTMENT_COLOR_FOSTER ||
                              prev.color === APPOINTMENT_COLOR_ADOPTION ||
                              prev.color === APPOINTMENT_COLOR_VAX ||
                              prev.color === APPOINTMENT_COLOR_ORIENTATION
                                ? APPOINTMENT_COLOR_OTHER_DEFAULT
                                : prev.color;
                            return { ...prev, kind: nextKind, color: inheritedColor };
                          });
                        }}
                      >
                        <option value="foster">Foster</option>
                        <option value="adoption">Adoption</option>
                        <option value="vax">Vax</option>
                        <option value="orientation">Orientation</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    {appointmentForm.kind === "other" ? (
                      <label className="form-label">
                        Color
                        <input
                          className="form-input form-color"
                          type="color"
                          value={appointmentForm.color}
                          onChange={(event) =>
                            setAppointmentForm((prev) => ({
                              ...prev,
                              color: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ) : null}
                    <label className="form-label">
                      Start time (optional)
                      <input
                        className="form-input appointment-time-input"
                        type="text"
                        inputMode="numeric"
                        placeholder="HH:MM"
                        maxLength={5}
                        value={appointmentForm.starts_at}
                        onChange={(event) =>
                          setAppointmentForm((prev) => ({
                            ...prev,
                            starts_at: event.target.value.replace(/[^\d:]/g, "").slice(0, 5),
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="modal-row">
                    <button
                      className="account-button"
                      type="button"
                      onClick={handleSaveAppointment}
                      disabled={appointmentSaving}
                    >
                      {appointmentSaving ? "Saving..." : appointmentForm.id ? "Save changes" : "Add appointment"}
                    </button>
                    {appointmentForm.id ? (
                      <button
                        className="account-button"
                        type="button"
                        onClick={() =>
                          setAppointmentForm({
                            id: null,
                            kind: "other",
                            title: "",
                            description: "",
                            color: APPOINTMENT_COLOR_OTHER_DEFAULT,
                            starts_at: "",
                          })
                        }
                      >
                        Cancel edit
                      </button>
                    ) : null}
                    {appointmentForm.id ? (
                      <button
                        className="account-button"
                        type="button"
                        onClick={() => {
                          if (!appointmentForm.id) return;
                          void handleDeleteAppointment(appointmentForm.id);
                        }}
                        disabled={appointmentDeleteId === appointmentForm.id}
                      >
                        {appointmentDeleteId === appointmentForm.id ? "Deleting..." : "Delete"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!appointmentForm.id ? (
                <div className="appointments-list">
                  {selectedShiftAppointments.length === 0 ? (
                    <div className="empty-banner">No appointments on this shift yet.</div>
                  ) : (
                    selectedShiftAppointments.map((appointment) => (
                      <div
                        key={appointment.id}
                        className="appointment-card"
                        style={{
                          borderColor: appointment.color ?? APPOINTMENT_COLOR_OTHER_DEFAULT,
                          background: `${appointment.color ?? APPOINTMENT_COLOR_OTHER_DEFAULT}22`,
                        }}
                      >
                        <div className="appointment-card-header">
                          <p className="appointment-title">{appointment.title}</p>
                          <p className="appointment-time">
                            {appointment.starts_at ? format24HourTime(appointment.starts_at) : "No time set"}
                          </p>
                        </div>
                        {appointment.description ? (
                          <button
                            className="appointment-expand-button"
                            type="button"
                            onClick={() => toggleAppointmentExpanded(appointment.id)}
                          >
                            {expandedAppointmentIds.has(appointment.id)
                              ? "Hide details"
                              : "Show details"}
                          </button>
                        ) : null}
                        {appointment.description && expandedAppointmentIds.has(appointment.id) ? (
                          <p className="appointment-description">{appointment.description}</p>
                        ) : null}
                        {canModifyAppointments ? (
                          <div className="appointment-actions">
                            <button
                              className="nav-button"
                              type="button"
                              onClick={() => handleDeleteAppointment(appointment.id)}
                              disabled={appointmentDeleteId === appointment.id}
                            >
                              {appointmentDeleteId === appointment.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showTakeShiftPrompt ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
          <div className={`modal-panel take-shift-panel ${isTakeShiftClosing ? "is-closing" : ""}`}>
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
                onClick={() => closeTakeShiftPrompt()}
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
                  onClick={() => closeTakeShiftPrompt()}
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
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
          <div className="modal-panel account-panel notifications-panel">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Notifications</h3>
              </div>
              <button
                className="modal-close notification-close-icon"
                type="button"
                aria-label="Close notifications"
                onClick={() => setShowNotifications(false)}
              >
                X
              </button>
            </div>
            <div className="notifications-toolbar">
              <button
                className="account-button notification-delete-action"
                type="button"
                onClick={handleDeleteAllNotifications}
                disabled={notifications.length === 0}
              >
                Delete all
              </button>
            </div>
            <div className="modal-body">
              {notificationsLoading ? (
                <div className="loading-banner">
                  {notifications.length > 0 ? "Refreshing notifications..." : "Loading notifications..."}
                </div>
              ) : null}
              {notificationsMessage ? (
                <div className="error-banner">{notificationsMessage}</div>
              ) : null}
              {notifications.length === 0 && !notificationsLoading ? (
                <div className="empty-banner">Nothing Here!</div>
              ) : null}
              {notifications.length > 0 ? (
                <div className="notifications-list">
                  {notifications.map((request, index) => {
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
                    const readableDropReason = normalizeDropReason(request.dropped_reason);
                    const isLatest = index === 0;

                    if (isPrimaryAdminAccount) {
                      if (request.status === "dropped") {
                        return (
                          <div
                            key={request.id}
                            className={`notification-card ${isLatest ? "latest" : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => jumpToNotificationShift(request)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                jumpToNotificationShift(request);
                              }
                            }}
                          >
                            <div className="notification-info">
                              {isLatest ? <span className="notification-tag">Latest</span> : null}
                              <p className="notification-meta">{timeLine}</p>
                              <p className="notification-name">
                                {volunteerName} dropped a shift
                              </p>
                              {readableDropReason ? (
                                <p className="notification-reason">{readableDropReason}</p>
                              ) : null}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={request.id}
                          className={`notification-card ${isLatest ? "latest" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => jumpToNotificationShift(request)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              jumpToNotificationShift(request);
                            }
                          }}
                        >
                          <div className="notification-info">
                            {isLatest ? <span className="notification-tag">Latest</span> : null}
                            <p className="notification-meta">{timeLine}</p>
                            <p className="notification-name">{volunteerName} request to join</p>
                          </div>
                          <div className="notification-actions">
                            <button
                              className="nav-button"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleNotificationDecision(request.id, "deny");
                              }}
                            >
                              Deny
                            </button>
                            <button
                              className="account-button"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleNotificationDecision(request.id, "approve");
                              }}
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
                          : isSelfDropReason(request.dropped_reason)
                            ? `You left ${shiftTitle}`
                          : `Shift Denied · ${shiftTitle}`;

                    return (
                      <div
                        key={request.id}
                        className={`notification-card ${isLatest ? "latest" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => jumpToNotificationShift(request)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            jumpToNotificationShift(request);
                          }
                        }}
                      >
                        <div className="notification-info">
                          {isLatest ? <span className="notification-tag">Latest</span> : null}
                          <p className="notification-meta">{timeLine}</p>
                          <p className="notification-name">{statusLabel}</p>
                          {request.status === "dropped" &&
                          readableDropReason &&
                          request.dropped_reason !== "Removed by admin" &&
                          !isSelfDropReason(request.dropped_reason) ? (
                            <p className="notification-reason">{readableDropReason}</p>
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
      {showAssignVolunteer ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
          <div className="modal-panel account-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Admin</p>
                <h3 className="modal-title">Add volunteer to shift</h3>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => {
                  setShowAssignVolunteer(false);
                  setAssignVolunteerSearchInput("");
                  setAssignVolunteerSearch("");
                  setAssignShiftInstanceId(null);
                  setAssignMessage("");
                  setShowAssignOtherForm(false);
                  setAssignOtherName("");
                  setAssignOtherDetails("");
                }}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              {assignMessage ? <div className="error-banner">{assignMessage}</div> : null}
              {volunteersLoading ? (
                <div className="loading-banner">Loading volunteers...</div>
              ) : null}
              {volunteersMessage ? (
                <div className="error-banner">{volunteersMessage}</div>
              ) : null}
              <label className="form-field">
                <span className="form-label">Search volunteers</span>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Type a name"
                  value={assignVolunteerSearchInput}
                  onChange={(event) => setAssignVolunteerSearchInput(event.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button
                  className="account-button"
                  type="button"
                  onClick={() => setShowAssignOtherForm((current) => !current)}
                >
                  {showAssignOtherForm ? "Cancel Add Other" : "Add Other"}
                </button>
              </div>
              {showAssignOtherForm ? (
                <div className="account-section">
                  <label className="form-field">
                    <span className="form-label">Other name</span>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Example: CSU Club Group"
                      value={assignOtherName}
                      onChange={(event) => setAssignOtherName(event.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Details (optional)</span>
                    <textarea
                      className="form-input form-textarea"
                      placeholder="Optional details"
                      value={assignOtherDetails}
                      onChange={(event) => setAssignOtherDetails(event.target.value)}
                    />
                  </label>
                  <div className="modal-actions">
                    <button
                      className="account-button"
                      type="button"
                      disabled={assignOtherLoading}
                      onClick={() => void handleAssignOther()}
                    >
                      {assignOtherLoading ? "Adding..." : "Save Other"}
                    </button>
                  </div>
                </div>
              ) : null}
              {filteredAssignableVolunteers.length === 0 && !volunteersLoading ? (
                <div className="empty-banner">No volunteers found.</div>
              ) : null}
              <div className="volunteers-list">
                {filteredAssignableVolunteers.map((volunteer) => {
                    const name = volunteer.preferred_name || volunteer.full_name || "Volunteer";
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
                        disabled={assignLoading}
                        onClick={() => handleAssignVolunteer(volunteer.id)}
                      >
                        <div className="volunteer-main">
                          <p className={nameClass}>{name}</p>
                          <p className="volunteer-meta">{roleLabel}</p>
                        </div>
                        <span className="volunteer-joined">
                          Joined {formatDate(volunteer.joined_at)}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showHelpfulLinks ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
          <div className="modal-panel account-panel helpful-modal">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Resources</p>
                <h3 className="modal-title">Helpful Links</h3>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShowHelpfulLinks(false)}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <div className="helpful-links">
                {helpfulLinks.map((link) => (
                  <a
                    key={link.url}
                    className="helpful-link"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              <div className="helpful-section">
                <h4 className="helpful-heading">Volunteer Outreach Numbers</h4>
                <div className="helpful-contacts">
                  <div className="helpful-contact">
                    <span className="helpful-name">Victoria</span>
                    <div className="helpful-phone-actions">
                      <a className="helpful-phone" href="tel:9704855211">
                        970-485-5211
                      </a>
                    </div>
                  </div>
                  <div className="helpful-contact">
                    <span className="helpful-name">Megan</span>
                    <div className="helpful-phone-actions">
                      <a className="helpful-phone" href="tel:9704028197">
                        970-402-8197
                      </a>
                    </div>
                  </div>
                  <div className="helpful-contact">
                    <span className="helpful-name">Arika</span>
                    <div className="helpful-phone-actions">
                      <a className="helpful-phone" href="tel:2623530988">
                        262-353-0988
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showDropConfirm ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
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
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
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
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
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

      {showPendingDecisionPrompt ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
          <div className="modal-panel take-shift-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Admin</p>
                <h3 className="modal-title">Pending request</h3>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => {
                  setShowPendingDecisionPrompt(false);
                  setPendingDecisionTarget(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                {pendingDecisionTarget
                  ? `${pendingDecisionTarget.name} requested to join this shift.`
                  : "This volunteer requested to join this shift."}
              </p>
              <div className="modal-actions">
                <button
                  className="nav-button"
                  type="button"
                  onClick={() => {
                    if (!pendingDecisionTarget) return;
                    const targetId = pendingDecisionTarget.id;
                    setShowPendingDecisionPrompt(false);
                    setPendingDecisionTarget(null);
                    void handleNotificationDecision(targetId, "deny");
                  }}
                >
                  Deny
                </button>
                <button
                  className="account-button"
                  type="button"
                  onClick={() => {
                    if (!pendingDecisionTarget) return;
                    const targetId = pendingDecisionTarget.id;
                    setShowPendingDecisionPrompt(false);
                    setPendingDecisionTarget(null);
                    void handleNotificationDecision(targetId, "approve");
                  }}
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showRemovePrompt ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
          <div className="modal-panel take-shift-panel remove-volunteer-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Admin</p>
                <h3 className="modal-title">
                  {removeTarget?.volunteer?.id ? "Remove Volunteer?" : "Remove Other Entry?"}
                </h3>
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
                  (removeTarget?.notes ?? "").split(" — ")[0] ||
                  "this entry"}{" "}
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
                  {removeLoading ? "Removing..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showAssignmentNotes ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
          <div className="modal-panel take-shift-panel volunteer-note-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Admin</p>
                <h3 className="modal-title">Volunteer shift note</h3>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => {
                  setShowAssignmentNotes(false);
                  setNotesTarget(null);
                  setNotesDraft("");
                  setNotesMessage("");
                }}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                {notesTarget?.volunteer?.preferred_name ||
                  notesTarget?.volunteer?.full_name ||
                  "Volunteer"}
              </p>
              <label className="form-field">
                <span className="form-label">Shift note</span>
                <textarea
                  className="form-input form-textarea"
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  rows={4}
                />
              </label>
              {notesMessage ? <div className="error-banner">{notesMessage}</div> : null}
              <div className="modal-actions">
                <button
                  className="account-button"
                  type="button"
                  onClick={handleAssignmentNotesSave}
                  disabled={notesSaving}
                >
                  {notesSaving ? "Saving..." : "Save note"}
                </button>
                <button
                  className="account-button"
                  type="button"
                  onClick={() => {
                    if (!notesTarget) return;
                    setShowAssignmentNotes(false);
                    setRemoveTarget(notesTarget);
                    setShowRemovePrompt(true);
                  }}
                >
                  Remove volunteer
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showVolunteers ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
          <div className="modal-panel account-panel">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Directory</p>
                <h3 className="modal-title">All Volunteers</h3>
              </div>
              {selectedVolunteer ? (
                <button
                  className="account-button"
                  type="button"
                  onClick={() => {
                    setSelectedVolunteer(null);
                    setShowAddRecurring(false);
                  }}
                >
                  Back
                </button>
              ) : null}
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
                  </div>

                  <div className="volunteer-recurring">
                    <p className="account-section-title">Volunteer profile</p>
                    <div className="modal-row">
                      <span className="modal-label">Full name</span>
                      <span>{selectedVolunteer.full_name ?? "—"}</span>
                    </div>
                    <div className="modal-row">
                      <span className="modal-label">Preferred name</span>
                      <span>{selectedVolunteer.preferred_name ?? "—"}</span>
                    </div>
                    <div className="modal-row">
                      <span className="modal-label">Pronouns</span>
                      <span>{selectedVolunteer.pronouns ?? "—"}</span>
                    </div>
                    <div className="modal-row">
                      <span className="modal-label">Date of birth</span>
                      <span>{formatDate(selectedVolunteer.date_of_birth)}</span>
                    </div>
                    <div className="modal-row">
                      <span className="modal-label">Phone</span>
                      {selectedVolunteer.phone ? (
                        <a
                          className="volunteer-phone-link"
                          href={`tel:${selectedVolunteer.phone}`}
                        >
                          {selectedVolunteer.phone}
                        </a>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  </div>

                  {volunteerRecurring.length > 0 || showAddRecurring || profile?.role === "Admin" ? (
                    <div className="volunteer-recurring">
                      <div className="volunteer-recurring-header">
                        <p className="account-section-title">Recurring shifts</p>
                        {profile?.role === "Admin" ? (
                          <button
                            className="account-button"
                            type="button"
                            onClick={() => {
                              if (showAddRecurring) {
                                setShowAddRecurring(false);
                                setRecurringEditId(null);
                                setRecurringForm({ templateId: "", startsOn: "", endsOn: "", repeatEveryWeeks: "1" });
                                setRecurringDays([]);
                                return;
                              }
                              setShowAddRecurring(true);
                            }}
                          >
                            {showAddRecurring
                              ? recurringEditId
                                ? "Cancel edit"
                                : "Cancel recurring shift"
                              : "Add recurring shifts"}
                          </button>
                        ) : null}
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
                              ? formatCompactTemplateTimeRange(
                                  templateMeta.start_time,
                                  templateMeta.end_time,
                                )
                              : templateInstance
                                ? formatTimeRangeFromInstance(
                                    templateInstance.start,
                                    templateInstance.end,
                                  )
                                : "—";
                            const dayList = formatByDayLongList(
                              recurring.byday,
                              getRecurringIntervalWeeks(recurring),
                            );
                            return (
                              <div key={recurring.id} className="recurring-card">
                                <div>
                                  <p className="recurring-title">
                                    {(recurring.template?.title ?? "Shift") + ": " + timeRange}
                                  </p>
                                  <p className="recurring-meta">{dayList}</p>
                                </div>
                                <div className="recurring-actions">
                                  {profile?.role === "Admin" ? (
                                    <>
                                      <button
                                        className="recurring-edit"
                                        type="button"
                                        onClick={() => handleRecurringEdit(recurring)}
                                        disabled={recurringDeleteId === recurring.id}
                                      >
                                        Edit
                                      </button>
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
                                    </>
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
                      <p className="account-section-title">
                        {recurringEditId ? "Edit recurring shift" : "Add recurring shift"}
                      </p>
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
                      <label className="form-field">
                        <span className="form-label">Repeat cadence</span>
                        <select
                          className="form-input"
                          value={recurringForm.repeatEveryWeeks}
                          onChange={(event) =>
                            setRecurringForm((prev) => ({
                              ...prev,
                              repeatEveryWeeks: event.target.value === "2" ? "2" : "1",
                            }))
                          }
                        >
                          <option value="1">Every week</option>
                          <option value="2">Every other week</option>
                        </select>
                      </label>
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
                          onClick={() => {
                            setShowAddRecurring(false);
                            setRecurringEditId(null);
                            setRecurringForm({ templateId: "", startsOn: "", endsOn: "", repeatEveryWeeks: "1" });
                            setRecurringDays([]);
                          }}
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
                          {recurringSaving
                            ? "Saving..."
                            : recurringEditId
                              ? "Save changes"
                              : "Save recurring"}
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
              {!selectedVolunteer ? (
                <>
                  <div className="volunteer-role-filters" role="tablist" aria-label="Volunteer role filters">
                    <button
                      className={`volunteer-role-filter ${
                        volunteerRoleFilter === "All" ? "active" : ""
                      }`}
                      type="button"
                      role="tab"
                      aria-selected={volunteerRoleFilter === "All"}
                      onClick={() => setVolunteerRoleFilter("All")}
                    >
                      All
                    </button>
                    <button
                      className={`volunteer-role-filter ${
                        volunteerRoleFilter === "Admin" ? "active role-admin" : ""
                      }`}
                      type="button"
                      role="tab"
                      aria-selected={volunteerRoleFilter === "Admin"}
                      onClick={() => setVolunteerRoleFilter("Admin")}
                    >
                      Admin
                    </button>
                    <button
                      className={`volunteer-role-filter ${
                        volunteerRoleFilter === "Lead" ? "active role-lead" : ""
                      }`}
                      type="button"
                      role="tab"
                      aria-selected={volunteerRoleFilter === "Lead"}
                      onClick={() => setVolunteerRoleFilter("Lead")}
                    >
                      Lead
                    </button>
                    <button
                      className={`volunteer-role-filter ${
                        volunteerRoleFilter === "Regular Volunteer" ? "active role-regular" : ""
                      }`}
                      type="button"
                      role="tab"
                      aria-selected={volunteerRoleFilter === "Regular Volunteer"}
                      onClick={() => setVolunteerRoleFilter("Regular Volunteer")}
                    >
                      Reg Volunteers
                    </button>
                  </div>
                  <label className="form-field">
                    <span className="form-label">Search volunteers</span>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Type a name"
                      value={volunteerSearchInput}
                      onChange={(event) => setVolunteerSearchInput(event.target.value)}
                    />
                  </label>
                </>
              ) : null}
              {filteredSortedVolunteers.length === 0 && !volunteersLoading && !selectedVolunteer ? (
                <div className="empty-banner">No volunteers found.</div>
              ) : null}
              {filteredSortedVolunteers.length > 0 && !selectedVolunteer ? (
                <div className="volunteers-list">
                  {filteredSortedVolunteers.map((volunteer) => {
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
                          setRecurringForm({ templateId: "", startsOn: "", endsOn: "", repeatEveryWeeks: "1" });
                          setRecurringDays([]);
                        }}
                      >
                        <div className="volunteer-main">
                          <p className={nameClass}>{name}</p>
                          <p className="volunteer-meta">{roleLabel}</p>
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
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleModalBackdropClick}>
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
                <div className="account-section-header">
                  <p className="account-section-title">Account info</p>
                  <button className="account-button" type="button" onClick={handleSignOut}>
                    Log Out
                  </button>
                </div>
                <div className="modal-row">
                  <span className="modal-label">Email</span>
                  <span>{session.user.email ?? "—"}</span>
                </div>
                <div className="modal-row">
                  <span className="modal-label">Created</span>
                  <span>{formatDateTime(session.user.created_at)}</span>
                </div>
              </div>

              <div className="account-section">
                <p className="account-section-title">Notifications</p>
                <p className="modal-text">
                  Enable notifications to get push alerts when this app is installed on your
                  phone. On iPhone: open in Safari → Share → Add to Home Screen, then open the
                  app from the icon to enable notifications.
                </p>
                <div className="modal-row">
                  <span className="modal-label">Status</span>
                  <span>{notificationStatusLabel}</span>
                </div>
                <div className="modal-row notification-toggle-row">
                  <span className="modal-label">Push notifications</span>
                  <label className="notification-switch">
                    <input
                      className="notification-switch-input"
                      type="checkbox"
                      checked={notificationsEnabled}
                      onChange={(event) => {
                        void handleNotificationToggle(event.currentTarget.checked);
                      }}
                      disabled={notificationLoading}
                      aria-label="Toggle push notifications"
                    />
                    <span className="notification-switch-track" aria-hidden="true">
                      <span className="notification-switch-thumb" />
                    </span>
                  </label>
                </div>
                <div className="modal-row notification-controls-row">
                </div>
                {notificationMessage ? (
                  <div className="error-banner">{notificationMessage}</div>
                ) : null}
              </div>

              <div className="account-section">
                <div className="account-section-header">
                  <p className="account-section-title">Profile details</p>
                  <button
                    className="account-button"
                    type="button"
                    onClick={() => setIsEditingProfile((value) => !value)}
                  >
                    {isEditingProfile ? "Cancel" : "Edit profile"}
                  </button>
                </div>
                {isEditingProfile ? (
                  <div className="modal-row">
                    <span />
                    <button
                      className="account-button"
                      type="button"
                      onClick={handleProfileSave}
                      disabled={profileSaveLoading}
                    >
                      {profileSaveLoading ? "Saving..." : "Save"}
                    </button>
                  </div>
                ) : null}
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
                          phone: formatPhone(event.target.value),
                        }))
                      }
                    />
                  ) : (
                    <span>{displayProfile?.phone ?? "—"}</span>
                  )}
                </div>
                <div className="modal-row">
                  <span className="modal-label">Joined</span>
                  {isEditingProfile ? (
                    <input
                      className="form-input"
                      type="date"
                      value={profileForm.joined_at}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          joined_at: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <span>{formatDate(displayProfile?.joined_at)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
