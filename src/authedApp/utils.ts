import {
  APPOINTMENT_COLOR_ADOPTION,
  APPOINTMENT_COLOR_FOSTER,
  APPOINTMENT_COLOR_ORIENTATION,
  APPOINTMENT_COLOR_VAX,
  SELF_DROP_REASON_PREFIX,
  timeFormatter,
} from "./constants";
import type {
  AppointmentKind,
  CalendarCell,
  DropDayLeadAssignment,
  ShiftAssignmentDetail,
  ShiftInstance,
  ShiftTemplate,
} from "./types";

export function getDropAssignmentVolunteerRole(assignment: DropDayLeadAssignment) {
  if (Array.isArray(assignment.volunteer)) {
    return assignment.volunteer[0]?.role ?? null;
  }
  return assignment.volunteer?.role ?? null;
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

export function diffInDays(start: Date, end: Date) {
  const ms = startOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

export function getNotificationSortTimestamp(item: ShiftAssignmentDetail) {
  const value = item.dropped_at ?? item.created_at ?? "";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getNotificationDismissToken(item: ShiftAssignmentDetail) {
  const status = item.status ?? "unknown";
  const changeMoment = item.dropped_at ?? item.created_at ?? "";
  return `${item.id}:${status}:${changeMoment}`;
}

export function isSelfDropReason(reason: string | null | undefined) {
  return Boolean(reason && reason.startsWith(SELF_DROP_REASON_PREFIX));
}

export function normalizeDropReason(reason: string | null | undefined) {
  if (!reason) return "";
  return isSelfDropReason(reason) ? reason.slice(SELF_DROP_REASON_PREFIX.length).trim() : reason;
}

export function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function getShiftDayStart(
  shift: { starts_at?: string | null; shift_date?: string | null } | null | undefined,
) {
  if (!shift) return null;
  if (shift.shift_date) {
    const parsed = parseDateOnly(shift.shift_date);
    if (parsed) return startOfDay(parsed);
  }
  if (!shift.starts_at) return null;
  const parsed = new Date(shift.starts_at);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
}

export function getWeekStart(baseDate: Date, mondayFirst: boolean) {
  const weekdayOffset = mondayFirst ? (baseDate.getDay() + 6) % 7 : baseDate.getDay();
  return addDays(startOfDay(baseDate), -weekdayOffset);
}

export function buildWeekCells(baseDate: Date, mondayFirst: boolean): CalendarCell[] {
  const weekStart = getWeekStart(baseDate, mondayFirst);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    cells.push({ date, label: String(date.getDate()) });
  }
  return cells;
}

export function buildMonthCells(baseDate: Date, mondayFirst: boolean): CalendarCell[] {
  const firstOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const start = getWeekStart(firstOfMonth, mondayFirst);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(start, i);
    cells.push({
      date,
      label: String(date.getDate()),
    });
  }
  return cells;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const directMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) return directMatch[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateWithWeekday(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined) {
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

export function formatTimeOnly(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function format24HourTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function toTimeInputValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function normalizeHexColor(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function getAppointmentKindFromColor(color: string | null | undefined): AppointmentKind {
  const normalized = normalizeHexColor(color);
  if (normalized === APPOINTMENT_COLOR_FOSTER) return "foster";
  if (normalized === APPOINTMENT_COLOR_ADOPTION) return "adoption";
  if (normalized === APPOINTMENT_COLOR_VAX) return "vax";
  if (normalized === APPOINTMENT_COLOR_ORIENTATION) return "orientation";
  return "other";
}

export function normalizePhoneLink(value: string) {
  return value.replace(/[^\d+]/g, "");
}

export function parseStoredSet(raw: string | null) {
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set<string>();
  }
}

export function formatTemplateTime(value: string | null | undefined) {
  if (!value) return "—";
  const [hours, minutes] = value.split(":");
  if (!hours || !minutes) return value;
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  if (Number.isNaN(date.getTime())) return value;
  return timeFormatter.format(date);
}

export function getShiftPeriodLabel(template: ShiftTemplate | undefined) {
  if (!template) return "shift";
  if (/evening/i.test(template.title)) return "evening shift";
  if (/morning/i.test(template.title)) return "morning shift";
  const [hours] = (template.start_time ?? "").split(":");
  const hour = Number(hours);
  if (!Number.isNaN(hour)) {
    return hour >= 12 ? "evening shift" : "morning shift";
  }
  return "shift";
}

export function rankShiftForDisplay(shift: ShiftInstance) {
  if (/lead/i.test(shift.title)) return 0;
  if (/morning/i.test(shift.title)) return 1;
  if (/evening/i.test(shift.title)) return 2;
  return 3;
}

export function getNormalizedRole(role: string | null | undefined) {
  return (role ?? "").trim().toLowerCase();
}

export function isAdminRole(role: string | null | undefined) {
  const normalizedRole = getNormalizedRole(role);
  return normalizedRole === "admin";
}

export function isLeadRole(role: string | null | undefined) {
  const normalizedRole = getNormalizedRole(role);
  return normalizedRole === "lead" || normalizedRole === "lead volunteer";
}

export function isLeadAssignmentRole(role: string | null | undefined) {
  const normalizedRole = getNormalizedRole(role);
  return normalizedRole === "lead" || normalizedRole === "lead volunteer";
}

export function formatTimeRangeFromInstance(start: Date, end: Date) {
  return `${timeFormatter.format(start)} — ${timeFormatter.format(end)}`;
}

export function formatRRule(rrule: string | null | undefined) {
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

export function formatByDay(days: string[] | null | undefined) {
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

export function formatByDayLongList(days: string[] | null | undefined, intervalWeeks = 1) {
  if (!days || days.length === 0) return intervalWeeks === 2 ? "Every other week" : "Every day";
  const dayMap: Record<string, string> = {
    SU: "Sunday",
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
  };
  const prefix = intervalWeeks === 2 ? "Every other week on " : "";
  return `${prefix}${days.map((day) => dayMap[day] ?? day).join(", ")}`;
}

export function formatCompactTemplateTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
) {
  const parse = (value: string | null | undefined) => {
    const match = (value ?? "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const rawHour = Number(match[1]);
    const minute = Number(match[2]);
    if (Number.isNaN(rawHour) || Number.isNaN(minute)) return null;
    const meridiem = rawHour >= 12 ? "PM" : "AM";
    const hour12 = rawHour % 12 || 12;
    const minutePart = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;
    return { meridiem, label: `${hour12}${minutePart}` };
  };

  const start = parse(startTime);
  const end = parse(endTime);
  if (!start || !end) return "—";
  if (start.meridiem === end.meridiem) return `${start.label}-${end.label}${end.meridiem}`;
  return `${start.label}${start.meridiem}-${end.label}${end.meridiem}`;
}

export function formatRepeatPattern(rrule: string | null | undefined) {
  const days = parseRRuleDays(rrule);
  const dayMap: Record<string, string> = {
    SU: "Sunday",
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
  };

  const labels = days.map((day) => dayMap[day] ?? day).filter(Boolean);
  if (labels.length === 0) return "Every day";
  if (labels.length === 1) return `Every ${labels[0]}`;
  if (labels.length === 2) return `Every ${labels[0]} and ${labels[1]}`;
  return `Every ${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function formatRepeatPatternFromDays(days: string[] | null | undefined, intervalWeeks = 1) {
  const dayMap: Record<string, string> = {
    SU: "Sunday",
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
  };

  const labels = (days ?? []).map((day) => dayMap[day] ?? day).filter(Boolean);
  const everyLabel = intervalWeeks === 2 ? "Every other" : "Every";
  if (labels.length === 0) return intervalWeeks === 2 ? "Every other week" : "Every day";
  if (labels.length === 1) return `${everyLabel} ${labels[0]}`;
  if (labels.length === 2) return `${everyLabel} ${labels[0]} and ${labels[1]}`;
  return `${everyLabel} ${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function getDayCode(value: string | null | undefined) {
  if (!value) return null;
  const date = value.includes("T") ? new Date(value) : parseDateOnly(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  const map = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  return map[date.getDay()] ?? null;
}

export function parseRRuleDays(rrule: string | null | undefined) {
  if (!rrule) return [];
  const byday = rrule
    .split(";")
    .find((part) => part.trim().toUpperCase().startsWith("BYDAY="))
    ?.split("=")[1];
  if (!byday) return [];
  return byday
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

export function parseRRuleFreq(rrule: string | null | undefined) {
  if (!rrule) return null;
  const freq = rrule
    .split(";")
    .find((part) => part.trim().toUpperCase().startsWith("FREQ="))
    ?.split("=")[1];
  return freq?.trim().toUpperCase() ?? null;
}

export function toIsoForDateAndTime(date: Date, hhmm: string | null | undefined) {
  if (!hhmm) return null;
  const timeMatch = hhmm.match(/(\d{1,2}):(\d{2})/);
  if (!timeMatch) return null;
  const [, hours, minutes] = timeMatch;
  if (!hours || !minutes) return null;
  const local = new Date(date);
  local.setHours(Number(hours), Number(minutes), 0, 0);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

export function resolveTemplateStartTime(template: ShiftTemplate) {
  const dynamic = template as ShiftTemplate & Record<string, unknown>;
  const candidates = [
    template.start_time,
    typeof dynamic.time_start === "string" ? dynamic.time_start : null,
    typeof dynamic.starts_at === "string" ? dynamic.starts_at : null,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = candidate.match(/(\d{1,2}):(\d{2})/);
    if (parsed) return `${parsed[1].padStart(2, "0")}:${parsed[2]}`;
  }
  if (/evening/i.test(template.title)) return "17:00";
  if (/morning/i.test(template.title)) return "09:00";
  return "09:00";
}

export function resolveTemplateEndTime(template: ShiftTemplate) {
  const dynamic = template as ShiftTemplate & Record<string, unknown>;
  const candidates = [
    template.end_time,
    typeof dynamic.time_end === "string" ? dynamic.time_end : null,
    typeof dynamic.ends_at === "string" ? dynamic.ends_at : null,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = candidate.match(/(\d{1,2}):(\d{2})/);
    if (parsed) return `${parsed[1].padStart(2, "0")}:${parsed[2]}`;
  }
  if (/evening/i.test(template.title)) return "19:00";
  if (/morning/i.test(template.title)) return "11:00";
  return "11:00";
}

export function shouldIncludeDateForTemplate(date: Date, template: ShiftTemplate) {
  if (!template.rrule) return true;
  const byDay = parseRRuleDays(template.rrule);
  const dayCode = getDayCode(getDateKey(date));
  if (!dayCode) return false;

  // Only enforce explicit BYDAY constraints; otherwise render active templates
  // so future weeks do not disappear when RRULE variants differ.
  if (byDay.length > 0) return byDay.includes(dayCode);

  const freq = parseRRuleFreq(template.rrule);
  if (freq === "DAILY" || freq === "WEEKLY" || freq === "MONTHLY") return true;
  return true;
}

export function buildVirtualInstanceId(templateId: string, dayKey: string) {
  const input = `${templateId}-${dayKey}`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return -Math.abs(hash || 1);
}

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 10);
  if (digits.length <= 3) return part1;
  if (digits.length <= 6) return `${part1}-${part2}`;
  return `${part1}-${part2}-${part3}`;
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
