import type { Session } from "@supabase/supabase-js";

export type ShiftTemplate = {
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

export type ShiftInstance = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  templateId: string;
  instanceId: number;
  isVirtual?: boolean;
};

export type ShiftAssignmentDetail = {
  id: string;
  created_at?: string | null;
  dropped_at?: string | null;
  status?: "active" | "dropped" | "pending";
  dropped_reason?: string | null;
  notes?: string | null;
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

export type CalendarCell = {
  date: Date | null;
  label: string;
};

export type ProfileRecord = {
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
  notification_settings?: Record<string, boolean> | null;
  created_at?: string | null;
};

export type VolunteerRow = {
  id: string;
  full_name: string | null;
  preferred_name: string | null;
  pronouns: string | null;
  role: "Regular Volunteer" | "Lead" | "Admin";
  joined_at: string | null;
  date_of_birth: string | null;
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status: string | null;
  internal_notes: string | null;
  interests: string[] | null;
  training_completed: boolean | null;
  training_completed_at: string | null;
  notification_pref?: "email_only" | "push_and_email" | null;
  created_at?: string | null;
};

export type RecurringAssignment = {
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

export type ShiftAssignment = {
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

export type ShiftAppointment = {
  id: string;
  shift_instance_id: number;
  title: string;
  description: string | null;
  color: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
};

export type AppointmentKind = "foster" | "adoption" | "other";

export type DropDayLeadAssignment = {
  volunteer_id: string;
  assignment_role: string | null;
  volunteer:
    | {
        id: string;
        role: string | null;
      }
    | {
        id: string;
        role: string | null;
      }[]
    | null;
};

export type PersonalAssignment = {
  shift_date: string | null;
  starts_at: string | null;
  template_id: string | null;
};

export type ShiftInstanceRow = {
  id: number;
  starts_at: string | null;
  ends_at: string | null;
  shift_date: string | null;
  template: {
    id: string;
    title: string;
  } | null;
};

export type AuthedAppProps = {
  session: Session;
  profile: ProfileRecord | null;
};
