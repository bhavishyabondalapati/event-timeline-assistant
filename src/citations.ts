// The AI is asked to cite event ids like [EVT-0042]. An LLM can still make ids up
// ("hallucinate"), so we never trust it: plain code checks every cited id.
import type { PlantEvent } from "./types";

// \b = word boundary, so "EVT-12345" is not read as "EVT-1234". The g flag finds all matches.
const ID_PATTERN = /\bEVT-\d{4}\b/g;

export interface CitationCheck {
  cited: string[]; // every unique id mentioned in the summary
  invalid: string[]; // cited ids that are NOT in the timeline we gave the model
  verified: boolean; // true only if it cited at least one id and every id is real
}

export function checkCitations(summary: string, timeline: PlantEvent[]): CitationCheck {
  const cited = [...new Set(summary.match(ID_PATTERN) ?? [])];
  const known = new Set(timeline.map((e) => e.id));
  const invalid = cited.filter((id) => !known.has(id));
  return { cited, invalid, verified: cited.length > 0 && invalid.length === 0 };
}
