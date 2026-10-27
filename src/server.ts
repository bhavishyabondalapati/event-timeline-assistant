// Entry point: read settings from .env, open the database, start listening for HTTP requests.
import "dotenv/config";
import { createApp } from "./app";
import { openDb } from "./db";
import { makeGeminiSummarizer } from "./gemini";

const port = Number(process.env.PORT ?? 3000);
const db = openDb(process.env.DB_PATH ?? "events.db");

// The AI summary is optional: no key means no summarizer.
const apiKey = process.env.GEMINI_API_KEY;
const summarize = apiKey ? makeGeminiSummarizer(apiKey, process.env.GEMINI_MODEL ?? "gemini-3.5-flash") : undefined;

createApp(db, { summarize }).listen(port, () => {
  console.log(`event-timeline-assistant (SIMULATED data) on http://localhost:${port}`);
  console.log(summarize ? "AI summary: on" : "AI summary: off (no GEMINI_API_KEY)");
});
