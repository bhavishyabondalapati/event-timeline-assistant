// Shared types and constants. Everything here describes SIMULATED data.

// `as const` makes TypeScript treat these as fixed literal values, not just string[].
export const EQUIPMENT = ["Bioreactor-1", "Pump-2", "Sensor-DO-3"] as const;
export const EVENT_TYPES = ["alarm", "sensor_pause", "work_order", "batch_step"] as const;

// Derive union types from the arrays, e.g. EventType = "alarm" | "sensor_pause" | ...
export type Equipment = (typeof EQUIPMENT)[number];
export type EventType = (typeof EVENT_TYPES)[number];

// One row in the events table.
export interface PlantEvent {
  id: string; // e.g. "EVT-0042"
  timestamp: string; // ISO 8601 in UTC, e.g. "2026-01-05T08:30:00.000Z"
  equipment: Equipment;
  type: EventType;
  description: string;
}

// Validation result: either ok with a value, or not ok with an error message.
// This is a "discriminated union": checking `ok` tells TypeScript which shape you have.
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
