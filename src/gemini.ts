// Optional AI summary using Google's Gemini REST API (called with plain fetch, no SDK).
import type { PlantEvent } from "./types";

// A Summarizer is any async function that turns a question + events into text.
// The app depends on this type, not on Gemini, so tests can pass in a fake one.
export type Summarizer = (question: string, events: PlantEvent[]) => Promise<string>;

// Only the parts of Gemini's JSON response that we read. `?` marks fields that may be missing.
interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

// "Grounding": give the model ONLY the retrieved events and tell it to cite them.
export function buildPrompt(question: string, events: PlantEvent[]): string {
  const lines = events.map((e) => `[${e.id}] ${e.timestamp} ${e.type}: ${e.description}`);
  return [
    "You are helping an engineer review SIMULATED equipment events.",
    "Answer using ONLY the events listed below. Do not use any outside knowledge.",
    "Cite the event id in square brackets after each claim, for example [EVT-0042].",
    "If the events do not answer the question, say so. Keep it under 120 words.",
    "",
    "EVENTS:",
    ...lines,
    "",
    `QUESTION: ${question}`,
  ].join("\n");
}

export function makeGeminiSummarizer(apiKey: string, model: string): Summarizer {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  return async (question, events) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(question, events) }] }],
        generationConfig: { temperature: 0.2 }, // low temperature = less creative, more factual
      }),
      signal: AbortSignal.timeout(20_000), // give up after 20 seconds
    });
    if (!response.ok) throw new Error(`Gemini API returned HTTP ${response.status}`);
    const data = (await response.json()) as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  };
}
