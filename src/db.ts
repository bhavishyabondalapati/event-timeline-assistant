// Database layer: opens SQLite, creates the schema, and loads the SIMULATED seed data.
import Database from "better-sqlite3";
import type { PlantEvent } from "./types";

export type DB = Database.Database;

// Timestamps are stored as ISO 8601 UTC text. Because every value has the same format,
// sorting/comparing them as text gives the same order as sorting by time.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    timestamp   TEXT NOT NULL,
    equipment   TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('alarm', 'sensor_pause', 'work_order', 'batch_step')),
    description TEXT NOT NULL
  );
  -- Most queries filter by equipment and a time range, so index those two columns together.
  CREATE INDEX IF NOT EXISTS idx_events_equipment_time ON events (equipment, timestamp);
`;

// Open (or create) a database file. Pass ":memory:" for a throwaway in-memory DB (used in tests).
export function openDb(path: string): DB {
  const db = new Database(path);
  db.exec(SCHEMA);
  return db;
}

// Replace all rows with the given events, inside one transaction (all-or-nothing, and fast).
export function insertEvents(db: DB, events: PlantEvent[]): void {
  const insert = db.prepare(
    "INSERT INTO events (id, timestamp, equipment, type, description) VALUES (@id, @timestamp, @equipment, @type, @description)",
  );
  db.transaction(() => {
    db.exec("DELETE FROM events");
    for (const e of events) insert.run(e);
  })();
}
