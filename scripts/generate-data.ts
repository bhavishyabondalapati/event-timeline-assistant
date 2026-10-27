// Generates data/events.json: ~200 SIMULATED events over 7 days for 3 pieces of equipment.
// It uses a seeded random generator, so running it again gives the exact same file.
import { writeFileSync } from "node:fs";
import { EQUIPMENT, type Equipment, type EventType, type PlantEvent } from "../src/types";

const START = Date.parse("2026-01-05T00:00:00Z"); // Monday, start of the simulated week
const MINUTE = 60_000;
const TOTAL = 200;

// mulberry32: a tiny deterministic pseudo-random number generator (returns 0..1).
function makeRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRandom(42);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;

const ALARMS: Record<Equipment, string[]> = {
  "Bioreactor-1": ["High temperature 38.4 C (limit 37.5 C)", "Low pH 6.6 (limit 6.8)", "Agitation speed deviation"],
  "Pump-2": ["Flow rate low 1.2 L/min (setpoint 2.0)", "Motor overcurrent", "Discharge pressure high"],
  "Sensor-DO-3": ["Dissolved oxygen low 18% (limit 30%)", "DO signal out of range", "Sensor drift detected"],
};
const STEPS = ["Media fill", "Inoculation", "Feed start", "Sampling", "Temperature shift", "Harvest"];

const events: Omit<PlantEvent, "id">[] = [];
const add = (minute: number, equipment: Equipment, type: EventType, description: string) =>
  events.push({ timestamp: new Date(START + minute * MINUTE).toISOString(), equipment, type, description });

// 1) Routine batch steps: every 4 hours on each piece of equipment (42 x 3 = 126 events).
for (let hour = 0; hour < 7 * 24; hour += 4) {
  EQUIPMENT.forEach((eq, i) => add(hour * 60 + i * 7, eq, "batch_step", `Batch B-${100 + Math.floor(hour / 24)}: ${pick(STEPS)}`));
}

// 2) Incidents: a sensor pause, then an alarm, then (usually) a work order, close together in time.
let workOrder = 1000;
while (events.length < TOTAL) {
  const eq = pick(EQUIPMENT);
  const t = Math.floor(rand() * (7 * 24 * 60 - 120)); // leave room for follow-up events
  add(t, eq, "sensor_pause", `Data stream paused for ${5 + Math.floor(rand() * 20)} min`);
  add(t + 3 + Math.floor(rand() * 10), eq, "alarm", pick(ALARMS[eq]));
  if (rand() < 0.7) add(t + 20 + Math.floor(rand() * 40), eq, "work_order", `WO-${workOrder++} opened: inspect ${eq}`);
}

// Trim the last incident's extra events to exactly TOTAL, sort by time,
// and give ids in time order: EVT-0001, EVT-0002, ...
const final: PlantEvent[] = events
  .slice(0, TOTAL)
  .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  .map((e, i) => ({ id: `EVT-${String(i + 1).padStart(4, "0")}`, ...e }));

const file = { _note: "SIMULATED DATA for a learning project. Not from any real plant.", events: final };
writeFileSync("data/events.json", JSON.stringify(file, null, 2) + "\n");
console.log(`Wrote ${final.length} SIMULATED events to data/events.json`);
