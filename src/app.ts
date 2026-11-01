// The Express app: maps HTTP routes to validation + SQL queries and returns JSON.
// createApp() does not start a server, so tests can call it with an in-memory database.
import path from "node:path";
import express, { type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { checkCitations } from "./citations";
import type { DB } from "./db";
import type { Summarizer } from "./gemini";
import { countByType, findEvents, getEvent, similarEvents, timeline, timeWindow } from "./queries";
import { parseAskBody, parseEventId, parseEventsQuery, parseTimelineQuery } from "./validate";

const dataSource = "SIMULATED"; // included in every response so nobody mistakes it for real data

export interface AppOptions {
  summarize?: Summarizer; // leave out (no API key) and /ask returns the timeline without a summary
  askPerMinute?: number; // max POST /ask calls per client IP per minute (each may call the paid Gemini API)
}

// 400 Bad Request = "your input is wrong". The message says exactly what to fix.
function badRequest(res: Response, error: string): void {
  res.status(400).json({ error });
}

export function createApp(db: DB, options: AppOptions = {}) {
  const app = express();
  // Security headers (no X-Powered-By, nosniff, frame blocking, CSP). The UI uses one inline <script>.
  app.use(helmet({ contentSecurityPolicy: { directives: { "script-src": ["'self'", "'unsafe-inline'"] } } }));
  app.use(express.json({ limit: "10kb" })); // parse JSON request bodies into req.body; requests are small
  app.use(express.static(path.join(__dirname, "..", "public"))); // serves the UI at "/"

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/events", (req, res) => {
    const input = parseEventsQuery(req.query);
    if (!input.ok) return badRequest(res, input.error);
    const events = findEvents(db, input.value);
    res.json({ dataSource, count: events.length, events });
  });

  app.get("/timeline", (req, res) => {
    const input = parseTimelineQuery(req.query);
    if (!input.ok) return badRequest(res, input.error);
    const { equipment, around, minutes } = input.value;
    res.json({
      dataSource,
      equipment,
      window: timeWindow(around, minutes),
      countsByType: countByType(db, equipment, around, minutes),
      events: timeline(db, equipment, around, minutes),
    });
  });

  app.get("/similar", (req, res) => {
    const id = parseEventId(req.query.eventId);
    if (!id.ok) return badRequest(res, id.error);
    const target = getEvent(db, id.value);
    if (!target) {
      res.status(404).json({ error: `No event with id ${id.value}` });
      return;
    }
    const events = similarEvents(db, target);
    res.json({ dataSource, target, count: events.length, events });
  });

  // async because it may wait on the Gemini API. Express 5 also catches errors from async handlers.
  // 429 Too Many Requests once a client goes over the limit, so one caller can't run up the Gemini bill.
  const askLimit = rateLimit({ windowMs: 60_000, limit: options.askPerMinute ?? 10, standardHeaders: "draft-8", legacyHeaders: false });
  app.post("/ask", askLimit, async (req, res) => {
    const input = parseAskBody(req.body);
    if (!input.ok) return badRequest(res, input.error);
    const { question, equipment, around, minutes } = input.value;
    const events = timeline(db, equipment, around, minutes);

    if (!options.summarize || events.length === 0) {
      const note = options.summarize ? "No events in this window to summarize." : "No GEMINI_API_KEY set, so no AI summary.";
      res.json({ dataSource, events, summary: null, note });
      return;
    }
    try {
      const summary = await options.summarize(question, events);
      res.json({ dataSource, events, summary, citations: checkCitations(summary, events) });
    } catch (err) {
      // 502 Bad Gateway = "a service we depend on failed". Still return the timeline.
      res.status(502).json({ error: `AI summary failed: ${(err as Error).message}`, events });
    }
  });

  return app;
}
