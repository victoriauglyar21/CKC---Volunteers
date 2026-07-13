import { supabase } from "../../supabaseClient";
import {
  APPOINTMENT_COLOR_ADOPTION,
  APPOINTMENT_COLOR_FOSTER,
  APPOINTMENT_COLOR_ORIENTATION,
  APPOINTMENT_COLOR_VAX,
  APPOINTMENT_COLOR_OTHER_DEFAULT,
} from "../constants";
import type { AppointmentKind, ShiftAppointment } from "../types";

const APPOINTMENT_SELECT_WITH_CHECKLIST =
  "id,shift_instance_id,title,description,color,starts_at,ends_at,completed_at,completed_by,completion_note,created_at,updated_at,created_by";
const APPOINTMENT_SELECT_BASE =
  "id,shift_instance_id,title,description,color,starts_at,ends_at,created_at,updated_at,created_by";

function normalizeAppointment(row: Partial<ShiftAppointment>): ShiftAppointment {
  return {
    id: row.id ?? "",
    shift_instance_id: row.shift_instance_id ?? 0,
    title: row.title ?? "",
    description: row.description ?? null,
    color: row.color ?? null,
    starts_at: row.starts_at ?? null,
    ends_at: row.ends_at ?? null,
    completed_at: row.completed_at ?? null,
    completed_by: row.completed_by ?? null,
    completion_note: row.completion_note ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    created_by: row.created_by ?? null,
  };
}

export async function fetchWeekAppointmentsByInstanceIds(instanceIds: number[]) {
  if (instanceIds.length === 0) {
    return {
      data: {} as Record<number, ShiftAppointment[]>,
      error: null,
    };
  }

  let { data, error } = await supabase
    .from("shift_appointments")
    .select(APPOINTMENT_SELECT_WITH_CHECKLIST)
    .in("shift_instance_id", instanceIds)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error && /completed_at|completed_by|completion_note|column/i.test(error.message)) {
    const fallback = await supabase
      .from("shift_appointments")
      .select(APPOINTMENT_SELECT_BASE)
      .in("shift_instance_id", instanceIds)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) {
    return {
      data: {} as Record<number, ShiftAppointment[]>,
      error: error?.message ?? "Unable to load appointments.",
    };
  }

  const map: Record<number, ShiftAppointment[]> = {};
  (data as Partial<ShiftAppointment>[]).map(normalizeAppointment).forEach((appointment) => {
    const instanceId = appointment.shift_instance_id;
    if (!instanceId) return;
    if (!map[instanceId]) map[instanceId] = [];
    map[instanceId].push(appointment);
  });

  return {
    data: map,
    error: null,
  };
}

export type SaveAppointmentInput = {
  id: string | null;
  shiftInstanceId: number;
  kind: AppointmentKind;
  title: string;
  description: string;
  color: string;
  startsAtIso: string | null;
  userId: string;
};

export async function saveAppointment(input: SaveAppointmentInput) {
  const resolvedColor =
    input.kind === "foster"
      ? APPOINTMENT_COLOR_FOSTER
      : input.kind === "adoption"
        ? APPOINTMENT_COLOR_ADOPTION
        : input.kind === "vax"
          ? APPOINTMENT_COLOR_VAX
          : input.kind === "orientation"
            ? APPOINTMENT_COLOR_ORIENTATION
        : input.color || APPOINTMENT_COLOR_OTHER_DEFAULT;

  const payload = {
    shift_instance_id: input.shiftInstanceId,
    title: input.title.trim(),
    description: input.description.trim() || null,
    color: resolvedColor,
    starts_at: input.startsAtIso,
    ends_at: null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("shift_appointments")
      .update(payload)
      .eq("id", input.id)
      .select(APPOINTMENT_SELECT_WITH_CHECKLIST)
      .maybeSingle();
    return { data: data ? normalizeAppointment(data as Partial<ShiftAppointment>) : null, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from("shift_appointments")
    .insert({
      ...payload,
      created_by: input.userId,
    })
    .select(APPOINTMENT_SELECT_WITH_CHECKLIST)
    .maybeSingle();
  return { data: data ? normalizeAppointment(data as Partial<ShiftAppointment>) : null, error: error?.message ?? null };
}

export async function deleteAppointmentById(appointmentId: string) {
  const { error } = await supabase.from("shift_appointments").delete().eq("id", appointmentId);
  return { error: error?.message ?? null };
}

export async function updateAppointmentChecklist({
  appointmentId,
  completed,
  note,
  userId,
}: {
  appointmentId: string;
  completed: boolean;
  note: string;
  userId: string;
}) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("shift_appointments")
    .update({
      completed_at: completed ? now : null,
      completed_by: completed ? userId : null,
      completion_note: note.trim() || null,
      updated_at: now,
    })
    .eq("id", appointmentId);

  return { error: error?.message ?? null };
}
