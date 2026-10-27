import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { checkCitations } from "../src/citations";
import type { Summarizer } from "../src/gemini";
import { FIXTURE, makeTestDb } from "./fixture";

const timeline = FIXTURE.slice(1, 4); // EVT-0002, EVT-0003, EVT-0004

describe("checkCitations", () => {
  it("accepts a summary that only cites real ids", () => {
    const result = checkCitations("Flow dropped [EVT-0003], then a work order [EVT-0004].", timeline);
    expect(result).toEqual({ cited: ["EVT-0003", "EVT-0004"], invalid: [], verified: true });
  });

  it("catches an invented event id", () => {
    const result = checkCitations("Pump failed [EVT-0003] and was replaced [EVT-0777].", timeline);
    expect(result.invalid).toEqual(["EVT-0777"]);
    expect(result.verified).toBe(false);
  });

  it("flags a real id that is outside this timeline", () => {
    expect(checkCitations("See [EVT-0001].", timeline).invalid).toEqual(["EVT-0001"]);
  });

  it("is not verified when nothing is cited", () => {
    expect(checkCitations("Everything looks fine.", timeline).verified).toBe(false);
  });
});

describe("POST /ask with a fake AI that hallucinates", () => {
  it("returns the summary but flags the invented id", async () => {
    // A fake Summarizer: no network, no API key, always cites one real and one fake id.
    const fakeAi: Summarizer = async () => "Flow was low [EVT-0003]; root cause was a leak [EVT-0999].";
    const app = createApp(makeTestDb(), { summarize: fakeAi });

    const res = await request(app).post("/ask").send({ question: "Why?", equipment: "Pump-2", around: "2026-01-07T10:00:00Z" });
    expect(res.status).toBe(200);
    expect(res.body.citations.invalid).toEqual(["EVT-0999"]);
    expect(res.body.citations.verified).toBe(false);
  });
});
