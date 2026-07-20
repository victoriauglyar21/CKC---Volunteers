export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_MONDAY_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

export const monthJumpFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
});

export const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export const PRIMARY_ADMIN_EMAIL = "victoriauglyar21@gmail.com";

export const NOTIFICATION_SETTING_KEYS = [
  "shift_added",
  "shift_removed",
  "shift_dropped",
  "shift_approved",
  "recurring_added",
  "recurring_removed",
  "shift_reminder",
  "lead_needed",
  "self_test",
] as const;

export type NotificationSettingKey = (typeof NOTIFICATION_SETTING_KEYS)[number];

export const APPOINTMENT_COLOR_FOSTER = "#22c55e";
export const APPOINTMENT_COLOR_ADOPTION = "#a855f7";
export const APPOINTMENT_COLOR_VAX = "#ec4899";
export const APPOINTMENT_COLOR_ORIENTATION = "#ef4444";
export const APPOINTMENT_COLOR_OTHER_DEFAULT = "#f97316";

export const SELF_DROP_REASON_PREFIX = "__self_drop__:";
export const RECURRING_SHIFT_ADDED_REASON = "Recurring shift added";
export const RECURRING_SHIFT_CONTINUED_REASON = "Recurring shift continued";
export const RECURRING_SHIFT_CHANGED_DROP_REASON = "Recurring shift changed";
export const RECURRING_SHIFT_DELETED_DROP_REASON = "Recurring shift deleted";
export const ADMIN_DROPPED_NOTIFICATION_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
export const APPOINTMENT_NOTIFICATION_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
