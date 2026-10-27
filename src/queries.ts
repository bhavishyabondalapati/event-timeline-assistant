// All SQL lives here. Every query uses "?" placeholders, so user input is never pasted
// into the SQL string. That is what prevents SQL injection.
import type { DB } from "./db";
import type { Equipment, EventType, PlantEvent } from "./types";

const MINUTE_MS = 60_000;

// GET /events: optional filters. We only add a WHERE condition for filters that were given.
export function findEvents(db: DB, filters: { equipment?: Equipment; type?: EventType }): PlantEvent[] {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filters.equipment) {
    conditions.push("equipment = ?");
    params.push(filters.equipment);
  }
  if (filters.type) {
    conditions.push("type = ?");
    params.push(filters.type);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`SELECT * FROM events ${where} ORDER BY timestamp`).all(...params) as PlantEvent[];
}

// Turn "around ± minutes" into a [from, to] pair of ISO strings.
export function timeWindow(around: Date, minutes: number): { from: string; to: string } {
  const center = around.getTime();
  return {
    from: new Date(center - minutes * MINUTE_MS).toISOString(),
    to: new Date(center + minutes * MINUTE_MS).toISOString(),
  };
}

// GET /timeline: every event on one piece of equipment inside the window (inclusive).
export function timeline(db: DB, equipment: Equipment, around: Date, minutes: number): PlantEvent[] {
  const { from, to } = timeWindow(around, minutes);
  return db
    .prepare("SELECT * FROM events WHERE equipment = ? AND timestamp BETWEEN ? AND ? ORDER BY timestamp")
    .all(equipment, from, to) as PlantEvent[];
}

// Same window, but counted per type with GROUP BY, e.g. [{ type: "alarm", count: 2 }].
export function countByType(db: DB, equipment: Equipment, around: Date, minutes: number) {
  const { from, to } = timeWindow(around, minutes);
  return db
    .prepare(
      "SELECT type, COUNT(*) AS count FROM events WHERE equipment = ? AND timestamp BETWEEN ? AND ? GROUP BY type ORDER BY count DESC",
    )
    .all(equipment, from, to) as { type: EventType; count: number }[];
}

export function getEvent(db: DB, id: string): PlantEvent | undefined {
  return db.prepare("SELECT * FROM events WHERE id = ?").get(id) as PlantEvent | undefined;
}

// GET /similar: earlier events with the same type on the same equipment, newest first.
export function similarEvents(db: DB, target: PlantEvent, limit = 20): PlantEvent[] {
  return db
    .prepare(
      "SELECT * FROM events WHERE equipment = ? AND type = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?",
    )
    .all(target.equipment, target.type, target.timestamp, limit) as PlantEvent[];
}
