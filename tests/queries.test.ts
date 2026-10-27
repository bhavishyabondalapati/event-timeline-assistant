import { describe, expect, it } from "vitest";
import { countByType, findEvents, getEvent, similarEvents, timeline } from "../src/queries";
import { AROUND, makeTestDb } from "./fixture";

const ids = (events: { id: string }[]) => events.map((e) => e.id);

describe("findEvents (filters)", () => {
  const db = makeTestDb();

  it("returns everything, sorted by time, with no filters", () => {
    expect(findEvents(db, {})).toHaveLength(6);
    expect(ids(findEvents(db, {}))[0]).toBe("EVT-0001");
  });

  it("filters by equipment and type together", () => {
    expect(ids(findEvents(db, { equipment: "Pump-2", type: "alarm" }))).toEqual(["EVT-0001", "EVT-0003"]);
  });
});

describe("timeline (±minutes window)", () => {
  const db = makeTestDb();

  it("includes events exactly 60 min away, excludes 61 min, and ignores other equipment", () => {
    expect(ids(timeline(db, "Pump-2", AROUND, 60))).toEqual(["EVT-0002", "EVT-0003", "EVT-0004"]);
  });

  it("gets smaller when the window shrinks", () => {
    expect(ids(timeline(db, "Pump-2", AROUND, 10))).toEqual(["EVT-0003"]);
  });

  it("counts events per type with GROUP BY", () => {
    const counts = countByType(db, "Pump-2", AROUND, 60);
    expect(counts).toHaveLength(3);
    expect(counts.every((c) => c.count === 1)).toBe(true);
  });
});

describe("similarEvents", () => {
  it("returns earlier events of the same type on the same equipment", () => {
    const db = makeTestDb();
    const target = getEvent(db, "EVT-0003")!;
    expect(ids(similarEvents(db, target))).toEqual(["EVT-0001"]);
  });
});
