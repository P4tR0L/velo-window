import type { RideCriteria, RideWindow, WindowSlot } from "../../types.ts";
import { compassPoint } from "./compass.ts";

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/**
 * System message: the guardrails that keep the model inside the supplied weather.
 * Plain language on purpose, so a reviewer can read it as the policy it enforces.
 */
const SYSTEM_PROMPT = [
  "You are a cycling advisor. You write short, practical advice for road and gravel cyclists.",
  "",
  "You are given one or more ride windows with an hourly weather forecast. Follow these rules strictly:",
  "- Advise only for the supplied windows and hours. Never suggest riding at other hours, in other windows, or in conditions beyond the supplied numbers.",
  "- Base every statement on the supplied weather: temperature, sustained wind, gusts, wind direction and rain probability. Do not invent weather, and do not claim to know the road surface, traffic or daylight.",
  "- Never name places, roads, trails or routes you cannot know. Give route-style advice in general terms only, such as the kind of ride, which way to face the wind, and pacing.",
  "- Never mention or guess the user's location, town, region or country.",
  '- Wind direction is the direction the wind comes from: "wind from NW" blows from the north-west, so riding towards the north-west is into a headwind and riding away from it is a tailwind. If the direction is unknown, do not give direction-specific advice.',
  "- Write plain text only. No markdown, no HTML, no links, no emoji.",
  "",
  "Answer with JSON only, in exactly this shape: an object with a recommendations array that has exactly one entry per window.",
  "Each entry has: windowIndex (the zero-based index of the window as listed), summary (one sentence, at most 200 characters), routeAdvice (at most 400 characters), styleTips (2 to 4 short riding-style tips, each at most 160 characters).",
  "Do not add any other fields.",
].join("\n");

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatSlot(slot: WindowSlot): string {
  const direction = compassPoint(slot.windDirectionDeg);
  const windFrom = direction === "unknown" ? "wind direction unknown" : `wind from ${direction}`;
  const rain = slot.precipProbability === null ? "n/a" : `${Math.round(slot.precipProbability)}%`;
  return [
    `  - ${formatHour(slot.hour)}-${formatHour(slot.hour + 1)}:`,
    `${Math.round(slot.tempC)} °C,`,
    `sustained wind ${Math.round(slot.windKmh)} km/h,`,
    `gusts ${Math.round(slot.gustKmh)} km/h,`,
    `${windFrom},`,
    `rain probability ${rain}`,
  ].join(" ");
}

function formatWindow(window: RideWindow, index: number): string {
  const lines = [`Window ${index}: ${formatHour(window.startHour)}-${formatHour(window.endHour)}`];
  for (const slot of window.slots) lines.push(formatSlot(slot));
  return lines.join("\n");
}

/**
 * Build the system and user messages from matched windows and the user's limits.
 *
 * The input deliberately has no place or coordinates: the model only ever sees weather.
 */
export function buildRecommendationPrompt(input: { windows: readonly RideWindow[]; criteria: RideCriteria }): {
  system: string;
  user: string;
} {
  const { windows, criteria } = input;
  const weekday = WEEKDAY_NAMES[criteria.isoWeekday - 1] ?? "the chosen day";

  const user = [
    `Day: ${weekday}.`,
    `The rider's limits: maximum sustained wind ${criteria.maxWindKmh} km/h, minimum temperature ${criteria.minTempC} °C.`,
    "",
    `Ride windows (${windows.length}), each listed by zero-based index with its hourly forecast:`,
    "",
    windows.map(formatWindow).join("\n\n"),
    "",
    `Write one recommendation for each of the ${windows.length} windows.`,
  ].join("\n");

  return { system: SYSTEM_PROMPT, user };
}
