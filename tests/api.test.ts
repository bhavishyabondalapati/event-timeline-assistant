// API tests: supertest sends real HTTP requests to the Express app without opening a port.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { makeTestDb } from "./fixture";

const app = createApp(makeTestDb()); // no summarizer = "no API key" mode

describe("input validation returns clear 400 errors", () => {
  it.each([
    ["/events?equipment=Pump-9", /equipment must be one of/],
    ["/events?type=explosion", /type must be one of/],
    ["/timeline?around=2026-01-07T10:00:00Z", /equipment must be one of/],
    ["/timeline?equipment=Pump-2&around=tomorrow", /ISO 8601/],
    ["/timeline?equipment=Pump-2&around=2026-01-07T10:00:00", /ISO 8601/], // no timezone
    ["/timeline?equipment=Pump-2&around=2026-01-07T10:00:00Z&minutes=-5", /minutes must be/],
    ["/similar?eventId=42", /eventId must look like/],
  ])("GET %s", async (url, message) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  it("rejects /ask without a question", async () => {
    const res = await request(app).post("/ask").send({ equipment: "Pump-2", around: "2026-01-07T10:00:00Z" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a well-formed but unknown event id", async () => {
    expect((await request(app).get("/similar?eventId=EVT-9999")).status).toBe(404);
  });
});

describe("happy paths", () => {
  it("GET /timeline returns the window and labels data as SIMULATED", async () => {
    const res = await request(app).get("/timeline?equipment=Pump-2&around=2026-01-07T10:00:00Z&minutes=60");
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe("SIMULATED");
    expect(res.body.events).toHaveLength(3);
  });

  it("POST /ask without an API key returns the timeline and no summary", async () => {
    const res = await request(app).post("/ask").send({ question: "What happened?", equipment: "Pump-2", around: "2026-01-07T10:00:00Z" });
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeNull();
    expect(res.body.events).toHaveLength(3);
  });
});
