import { supabase } from "../../supabaseClient";
import {
  APPOINTMENT_COLOR_ADOPTION,
  APPOINTMENT_COLOR_FOSTER,
  APPOINTMENT_COLOR_OTHER_DEFAULT,
} from "../constants";
import type { AppointmentKind, ShiftAppointment } from "../types";

export async function fetchWeekAppointmentsByInstanceIds(instanceIds: number[]) {
  if (instanceIds.length === 0) {
    return {
      data: {} as Record<number, ShiftAppointment[]>,
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("shift_appointments")
    .select(
      "id,shift_instance_id,title,description,color,starts_at,ends_at,created_at,updated_at,created_by",
    )
    .in("shift_instance_id", instanceIds)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error || !data) {
    return {
      data: {} as Record<number, ShiftAppointment[]>,
      error: error?.message ?? "Unable to load appointments.",
    };
  }

  const map: Record<number, ShiftAppointment[]> = {};
  (data as ShiftAppointment[]).forEach((appointment) => {
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
    const { error } = await supabase.from("shift_appointments").update(payload).eq("id", input.id);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("shift_appointments").insert({
    ...payload,
    created_by: input.userId,
  });
  return { error: error?.message ?? null };
}

export async function deleteAppointmentById(appointmentId: string) {
  const { error } = await supabase.from("shift_appointments").delete().eq("id", appointmentId);
  return { error: error?.message ?? null };
}
