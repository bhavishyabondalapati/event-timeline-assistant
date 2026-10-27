// A small, hand-written set of SIMULATED events so each test knows exactly what to expect.
import { insertEvents, openDb } from "../src/db";
import type { PlantEvent } from "../src/types";

export const FIXTURE: PlantEvent[] = [
  { id: "EVT-0001", timestamp: "2026-01-07T08:00:00.000Z", equipment: "Pump-2", type: "alarm", description: "Earlier alarm" },
  { id: "EVT-0002", timestamp: "2026-01-07T09:00:00.000Z", equipment: "Pump-2", type: "sensor_pause", description: "Exactly 60 min before" },
  { id: "EVT-0003", timestamp: "2026-01-07T09:55:00.000Z", equipment: "Pump-2", type: "alarm", description: "Flow low" },
  { id: "EVT-0004", timestamp: "2026-01-07T10:30:00.000Z", equipment: "Pump-2", type: "work_order", description: "WO-1001 opened" },
  { id: "EVT-0005", timestamp: "2026-01-07T11:01:00.000Z", equipment: "Pump-2", type: "batch_step", description: "61 min after" },
  { id: "EVT-0006", timestamp: "2026-01-07T10:00:00.000Z", equipment: "Bioreactor-1", type: "alarm", description: "Other equipment" },
];

// Each test gets a fresh in-memory database, so tests never affect each other or events.db.
export function makeTestDb() {
  const db = openDb(":memory:");
  insertEvents(db, FIXTURE);
  return db;
}

export const AROUND = new Date("2026-01-07T10:00:00Z");
