// Seed script: `npm run seed` loads data/events.json (SIMULATED) into the SQLite file.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { openDb, insertEvents } from "./db";
import type { PlantEvent } from "./types";

const path = process.env.DB_PATH ?? "events.db";
const file = JSON.parse(readFileSync("data/events.json", "utf8")) as { events: PlantEvent[] };

const db = openDb(path);
insertEvents(db, file.events);
console.log(`Seeded ${file.events.length} SIMULATED events into ${path}`);
db.close();
