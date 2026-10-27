// Input validation. Query strings and JSON bodies come from the outside world, so their
// type is `unknown` until we check them. Each function returns a Result (see types.ts).
import { EQUIPMENT, EVENT_TYPES, type Equipment, type EventType, type Result } from "./types";

type Input = Record<string, unknown>;

// A full date-time WITH a timezone, e.g. 2026-01-07T10:00:00Z. Rejects vague strings like "tomorrow".
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const EVENT_ID = /^EVT-\d{4}$/;

// Generic check: is `value` one of the allowed strings? <T extends string> keeps the exact type.
function oneOf<T extends string>(name: string, allowed: readonly T[], value: unknown): Result<T> {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return { ok: true, value: value as T };
  }
  return { ok: false, error: `${name} must be one of: ${allowed.join(", ")}` };
}

export const parseEquipment = (value: unknown) => oneOf("equipment", EQUIPMENT, value);
export const parseEventType = (value: unknown) => oneOf("type", EVENT_TYPES, value);

export function parseTimestamp(value: unknown): Result<Date> {
  const date = typeof value === "string" && ISO_DATETIME.test(value) ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { ok: false, error: "around must be an ISO 8601 date-time with timezone, e.g. 2026-01-07T10:00:00Z" };
  }
  return { ok: true, value: date };
}

// minutes is optional (default 60) and must be a whole number from 1 to 1440 (one day).
export function parseMinutes(value: unknown): Result<number> {
  if (value === undefined) return { ok: true, value: 60 };
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 1440) {
    return { ok: false, error: "minutes must be a whole number from 1 to 1440" };
  }
  return { ok: true, value: n };
}

// GET /events: both filters are optional, but if given they must be valid.
export function parseEventsQuery(q: Input): Result<{ equipment?: Equipment; type?: EventType }> {
  const equipment = q.equipment === undefined ? undefined : parseEquipment(q.equipment);
  if (equipment && !equipment.ok) return equipment;
  const type = q.type === undefined ? undefined : parseEventType(q.type);
  if (type && !type.ok) return type;
  return { ok: true, value: { equipment: equipment?.value, type: type?.value } };
}

export interface TimelineInput {
  equipment: Equipment;
  around: Date;
  minutes: number;
}

// GET /timeline: equipment and around are required, minutes is optional.
export function parseTimelineQuery(q: Input): Result<TimelineInput> {
  const equipment = parseEquipment(q.equipment);
  if (!equipment.ok) return equipment;
  const around = parseTimestamp(q.around);
  if (!around.ok) return around;
  const minutes = parseMinutes(q.minutes);
  if (!minutes.ok) return minutes;
  return { ok: true, value: { equipment: equipment.value, around: around.value, minutes: minutes.value } };
}

// GET /similar
export function parseEventId(value: unknown): Result<string> {
  if (typeof value === "string" && EVENT_ID.test(value)) return { ok: true, value };
  return { ok: false, error: "eventId must look like EVT-0042" };
}

// POST /ask: the same fields as /timeline, plus a question.
export function parseAskBody(body: unknown): Result<TimelineInput & { question: string }> {
  const b = (typeof body === "object" && body !== null ? body : {}) as Input;
  if (typeof b.question !== "string" || !b.question.trim() || b.question.length > 500) {
    return { ok: false, error: "question must be a non-empty string of at most 500 characters" };
  }
  const rest = parseTimelineQuery(b);
  if (!rest.ok) return rest;
  return { ok: true, value: { ...rest.value, question: b.question.trim() } };
}
