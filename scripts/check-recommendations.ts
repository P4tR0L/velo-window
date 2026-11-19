/**
 * Named-case checks for the recommendation core: compass points, the prompt builder and the
 * model output contract.
 *
 * Run with `npm run check:recommendations`. No test runner: every case asserts with node:assert
 * and the script exits non-zero on the first failure. Nothing here touches the network.
 */
import assert from "node:assert/strict";

import { compassPoint } from "../src/lib/recommendation/compass.ts";
import {
  parseRecommendations,
  RECOMMENDATION_JSON_SCHEMA,
  RECOMMENDATION_LIMITS,
} from "../src/lib/recommendation/output-schema.ts";
import { buildRecommendationPrompt } from "../src/lib/recommendation/prompt.ts";
import type { RideSearchRequest } from "../src/lib/schemas/ride-search-request.ts";
import type { RideCriteria, RideWindow, WindowSlot } from "../src/types.ts";

const THURSDAY = "2026-11-19";

const CRITERIA: RideCriteria = { isoWeekday: 4, startHour: 8, endHour: 18, maxWindKmh: 25, minTempC: 10 };

/** A search request with a place and coordinates; none of it may reach the prompt. */
const PLACE_REQUEST: RideSearchRequest = {
  ...CRITERIA,
  location: { kind: "place", query: "Wroclaw Stabłowice" },
};
const COORDS_REQUEST: RideSearchRequest = {
  ...CRITERIA,
  location: { kind: "coords", latitude: 51.107883, longitude: 17.038538 },
};
const LOCATION_FIXTURE_TEXTS = ["Wroclaw", "Stabłowice", "Your current location", "51.10", "17.03"];

function slot(hour: number, overrides: Partial<WindowSlot> = {}): WindowSlot {
  return {
    date: THURSDAY,
    hour,
    tempC: 14,
    windKmh: 12,
    gustKmh: 23,
    precipProbability: 15,
    windDirectionDeg: 315,
    ...overrides,
  };
}

function windowOf(startHour: number, endHour: number, overrides: Partial<WindowSlot> = {}): RideWindow {
  const slots: WindowSlot[] = [];
  for (let hour = startHour; hour < endHour; hour++) slots.push(slot(hour, overrides));
  return { date: THURSDAY, startHour, endHour, slots };
}

function promptFor(windows: readonly RideWindow[]) {
  return buildRecommendationPrompt({ windows, criteria: CRITERIA });
}

function entry(windowIndex: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    windowIndex,
    summary: "Mild and fairly calm, good for a steady ride.",
    routeAdvice: "Start into the wind and finish with it behind you.",
    styleTips: ["Keep a steady cadence.", "Layer up for the cooler start."],
    ...overrides,
  };
}

function answer(entries: Record<string, unknown>[]): string {
  return JSON.stringify({ recommendations: entries });
}

function repeat(length: number): string {
  return "a".repeat(length);
}

interface Case {
  name: string;
  run: () => void;
}

const cases: Case[] = [
  {
    name: "compass points: cardinal and intercardinal bearings",
    run: () => {
      assert.equal(compassPoint(0), "N");
      assert.equal(compassPoint(45), "NE");
      assert.equal(compassPoint(90), "E");
      assert.equal(compassPoint(135), "SE");
      assert.equal(compassPoint(180), "S");
      assert.equal(compassPoint(225), "SW");
      assert.equal(compassPoint(270), "W");
      assert.equal(compassPoint(315), "NW");
    },
  },
  {
    name: "compass points: all 16 points at their centres",
    run: () => {
      const points = [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
      ];
      points.forEach((point, index) => {
        assert.equal(compassPoint(index * 22.5), point);
      });
    },
  },
  {
    name: "compass points: boundaries 348.75 -> N, 11.24 -> N, 11.25 -> NNE, 360 -> N",
    run: () => {
      assert.equal(compassPoint(348.75), "N");
      assert.equal(compassPoint(348.74), "NNW");
      assert.equal(compassPoint(11.24), "N");
      assert.equal(compassPoint(11.25), "NNE");
      assert.equal(compassPoint(360), "N");
    },
  },
  {
    name: "compass points: bearings are normalised to 0-360",
    run: () => {
      assert.equal(compassPoint(720), "N");
      assert.equal(compassPoint(-90), "W");
      assert.equal(compassPoint(405), "NE");
    },
  },
  {
    name: "compass points: null direction -> unknown",
    run: () => {
      assert.equal(compassPoint(null), "unknown");
    },
  },
  {
    name: "prompt, weather only: temperature, wind, gust, 'wind from' point and rain probability per hour",
    run: () => {
      const { user } = promptFor([windowOf(15, 17, { tempC: 14.4, windKmh: 12.2, gustKmh: 22.6 })]);
      assert.match(user, /14 °C/);
      assert.match(user, /sustained wind 12 km\/h/);
      assert.match(user, /gusts 23 km\/h/);
      assert.match(user, /wind from NW/);
      assert.match(user, /rain probability 15%/);
      assert.match(user, /15:00-16:00/);
      assert.match(user, /16:00-17:00/);
    },
  },
  {
    name: "prompt, weather only: weekday and the user's wind and temperature limits",
    run: () => {
      const { user } = promptFor([windowOf(15, 16)]);
      assert.match(user, /Thursday/);
      assert.match(user, /maximum sustained wind 25 km\/h/);
      assert.match(user, /minimum temperature 10 °C/);
    },
  },
  {
    name: "prompt, weather only: null direction -> 'unknown', null rain probability -> 'n/a'",
    run: () => {
      const { user } = promptFor([windowOf(15, 16, { windDirectionDeg: null, precipProbability: null })]);
      assert.match(user, /wind direction unknown/);
      assert.match(user, /rain probability n\/a/);
      assert.doesNotMatch(user, /wind from/);
    },
  },
  {
    name: "prompt, no location: no place names, coordinates or latitude/longitude wording",
    run: () => {
      // The search requests exist only to prove none of their location data can leak: the
      // builder accepts windows and criteria and has no place or coordinate input.
      assert.equal(PLACE_REQUEST.location.kind, "place");
      assert.equal(COORDS_REQUEST.location.kind, "coords");

      const { system, user } = promptFor([windowOf(9, 11), windowOf(14, 16, { windDirectionDeg: null })]);
      for (const text of [system, user]) {
        for (const fragment of LOCATION_FIXTURE_TEXTS) {
          assert.ok(!text.includes(fragment), `prompt must not contain "${fragment}"`);
        }
        assert.doesNotMatch(text, /-?\d{1,3}\.\d{3,}/, "no coordinate-like number");
        assert.doesNotMatch(text, /latitude|longitude|coordinates/i);
      }
    },
  },
  {
    name: "prompt, matched windows only: two windows -> indices 0 and 1 with only their hours",
    run: () => {
      const { user } = promptFor([windowOf(9, 11), windowOf(14, 15)]);
      assert.match(user, /Window 0: 09:00-11:00/);
      assert.match(user, /Window 1: 14:00-15:00/);
      assert.doesNotMatch(user, /Window 2/);

      for (const hour of ["09:00-10:00", "10:00-11:00", "14:00-15:00"]) {
        assert.ok(user.includes(hour), `${hour} must be listed`);
      }
      for (const hour of ["08:00", "11:00-12:00", "12:00", "13:00", "15:00-16:00", "16:00", "17:00"]) {
        assert.ok(!user.includes(hour), `${hour} is outside the windows and must not appear`);
      }
    },
  },
  {
    name: "prompt, matched windows only: any number of windows is accepted",
    run: () => {
      assert.match(promptFor([windowOf(9, 10)]).user, /Window 0:/);
      const many = promptFor([windowOf(1, 2), windowOf(3, 4), windowOf(5, 6), windowOf(7, 8)]);
      assert.match(many.user, /Window 3: 07:00-08:00/);
      assert.match(many.user, /Write one recommendation for each of the 4 windows/);
    },
  },
  {
    name: "system guardrails: supplied windows only, no invented roads or places, no location mention",
    run: () => {
      const { system } = promptFor([windowOf(9, 10)]);
      assert.match(system, /Advise only for the supplied windows and hours/);
      assert.match(system, /Never suggest riding at other hours/);
      assert.match(system, /conditions beyond the supplied numbers/);
      assert.match(system, /Never name places, roads, trails or routes you cannot know/);
      assert.match(system, /Never mention or guess the user's location/);
      assert.match(system, /direction the wind comes from/);
      assert.match(system, /JSON only/);
    },
  },
  {
    name: "output, valid: two windows parse into two recommendations ordered by index",
    run: () => {
      const content = answer([
        entry(1, { summary: "  Second window.  ", styleTips: [" tip a ", "tip b"] }),
        entry(0, { summary: "First window." }),
      ]);
      const result = parseRecommendations(content, 2);
      assert.ok(result);
      assert.equal(result.length, 2);
      assert.equal(result[0].summary, "First window.");
      assert.equal(result[1].summary, "Second window.", "text is trimmed");
      assert.deepEqual(result[1].styleTips, ["tip a", "tip b"]);
      assert.deepEqual(Object.keys(result[0]).sort(), ["routeAdvice", "styleTips", "summary"]);
    },
  },
  {
    name: "output, valid: values exactly at every limit are accepted",
    run: () => {
      const result = parseRecommendations(
        answer([
          entry(0, {
            summary: repeat(200),
            routeAdvice: repeat(400),
            styleTips: [repeat(160), repeat(160), repeat(160), repeat(160)],
          }),
        ]),
        1,
      );
      assert.ok(result);
      assert.equal(result[0].styleTips.length, 4);
    },
  },
  {
    name: "output, rejection: invalid JSON",
    run: () => {
      assert.equal(parseRecommendations("not json", 1), null);
      assert.equal(parseRecommendations("", 1), null);
      assert.equal(parseRecommendations('{"recommendations": [', 1), null);
    },
  },
  {
    name: "output, rejection: wrong top-level shape",
    run: () => {
      assert.equal(parseRecommendations("[]", 1), null);
      assert.equal(parseRecommendations("null", 1), null);
      assert.equal(parseRecommendations("{}", 1), null);
    },
  },
  {
    name: "output, rejection: missing field",
    run: () => {
      for (const field of ["windowIndex", "summary", "routeAdvice", "styleTips"]) {
        const { [field]: _removed, ...incomplete } = entry(0);
        assert.equal(parseRecommendations(answer([incomplete]), 1), null, `missing ${field}`);
      }
    },
  },
  {
    name: "output, rejection: extra field",
    run: () => {
      assert.equal(parseRecommendations(answer([entry(0, { hour: 9 })]), 1), null, "extra field on an entry");
      assert.equal(
        parseRecommendations(JSON.stringify({ recommendations: [entry(0)], note: "hi" }), 1),
        null,
        "extra top-level field",
      );
    },
  },
  {
    name: "output, rejection: empty text",
    run: () => {
      assert.equal(parseRecommendations(answer([entry(0, { summary: "" })]), 1), null, "empty summary");
      assert.equal(parseRecommendations(answer([entry(0, { summary: "   " })]), 1), null, "blank summary");
      assert.equal(parseRecommendations(answer([entry(0, { routeAdvice: "" })]), 1), null, "empty routeAdvice");
      assert.equal(parseRecommendations(answer([entry(0, { styleTips: ["ok", ""] })]), 1), null, "empty tip");
    },
  },
  {
    name: "output, rejection: summary over 200 characters",
    run: () => {
      assert.equal(parseRecommendations(answer([entry(0, { summary: repeat(201) })]), 1), null);
    },
  },
  {
    name: "output, rejection: routeAdvice over 400 characters",
    run: () => {
      assert.equal(parseRecommendations(answer([entry(0, { routeAdvice: repeat(401) })]), 1), null);
    },
  },
  {
    name: "output, rejection: fewer than 2 tips",
    run: () => {
      assert.equal(parseRecommendations(answer([entry(0, { styleTips: ["only one"] })]), 1), null);
      assert.equal(parseRecommendations(answer([entry(0, { styleTips: [] })]), 1), null);
    },
  },
  {
    name: "output, rejection: more than 4 tips",
    run: () => {
      assert.equal(parseRecommendations(answer([entry(0, { styleTips: ["a", "b", "c", "d", "e"] })]), 1), null);
    },
  },
  {
    name: "output, rejection: a tip over 160 characters",
    run: () => {
      assert.equal(parseRecommendations(answer([entry(0, { styleTips: ["ok", repeat(161)] })]), 1), null);
    },
  },
  {
    name: "output, rejection: wrong type for a field",
    run: () => {
      assert.equal(parseRecommendations(answer([entry(0, { summary: 5 })]), 1), null, "number summary");
      assert.equal(parseRecommendations(answer([entry(0, { styleTips: "a, b" })]), 1), null, "string tips");
      assert.equal(parseRecommendations(answer([entry(0, { windowIndex: "0" })]), 1), null, "string index");
      assert.equal(parseRecommendations(answer([entry(0, { windowIndex: 0.5 })]), 1), null, "fractional index");
    },
  },
  {
    name: "output, rejection: wrong count (fewer or more entries than windows)",
    run: () => {
      assert.equal(parseRecommendations(answer([entry(0)]), 2), null, "fewer");
      assert.equal(parseRecommendations(answer([entry(0), entry(1), entry(2)]), 2), null, "more");
      assert.equal(parseRecommendations(answer([]), 1), null, "none");
    },
  },
  {
    name: "output, rejection: duplicate index",
    run: () => {
      assert.equal(parseRecommendations(answer([entry(0), entry(0)]), 2), null);
    },
  },
  {
    name: "output, rejection: out-of-range index",
    run: () => {
      assert.equal(parseRecommendations(answer([entry(0), entry(2)]), 2), null, "index equals count");
      assert.equal(parseRecommendations(answer([entry(-1)]), 1), null, "negative index");
      assert.equal(parseRecommendations(answer([entry(5)]), 1), null, "far out of range");
    },
  },
  {
    name: "output, all-or-nothing: one bad entry rejects the whole answer",
    run: () => {
      assert.equal(parseRecommendations(answer([entry(0), entry(1, { summary: "" })]), 2), null);
    },
  },
  {
    name: "output, JSON schema: strict, additionalProperties false at every object level",
    run: () => {
      const schema = RECOMMENDATION_JSON_SCHEMA;
      assert.equal(schema.type, "object");
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual([...schema.required], ["recommendations"]);

      const items = schema.properties.recommendations.items;
      assert.equal(items.type, "object");
      assert.equal(items.additionalProperties, false);
      assert.deepEqual([...items.required].sort(), ["routeAdvice", "styleTips", "summary", "windowIndex"]);
      assert.deepEqual(Object.keys(items.properties).sort(), [...items.required].sort());

      // Every object in the schema, found by walking it, is closed.
      let objects = 0;
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        if (typeof node !== "object" || node === null) return;
        const record = node as Record<string, unknown>;
        if (record.type === "object") {
          objects++;
          assert.equal(record.additionalProperties, false);
        }
        Object.values(record).forEach(walk);
      };
      walk(schema);
      assert.equal(objects, 2);
    },
  },
  {
    name: "output, JSON schema: limits match the zod schema",
    run: () => {
      const props = RECOMMENDATION_JSON_SCHEMA.properties.recommendations.items.properties;
      assert.equal(props.summary.maxLength, 200);
      assert.equal(props.routeAdvice.maxLength, 400);
      assert.equal(props.styleTips.minItems, 2);
      assert.equal(props.styleTips.maxItems, 4);
      assert.equal(props.styleTips.items.maxLength, 160);
      for (const text of [props.summary, props.routeAdvice, props.styleTips.items]) assert.equal(text.minLength, 1);

      // The zod schema accepts exactly the schema's bounds and rejects one step beyond them.
      assert.ok(parseRecommendations(answer([entry(0, { summary: repeat(props.summary.maxLength) })]), 1));
      assert.equal(parseRecommendations(answer([entry(0, { summary: repeat(props.summary.maxLength + 1) })]), 1), null);
      assert.ok(parseRecommendations(answer([entry(0, { routeAdvice: repeat(props.routeAdvice.maxLength) })]), 1));
      assert.equal(
        parseRecommendations(answer([entry(0, { routeAdvice: repeat(props.routeAdvice.maxLength + 1) })]), 1),
        null,
      );
      const tip = (length: number) => repeat(length);
      const tips = (count: number) => Array.from({ length: count }, () => tip(props.styleTips.items.maxLength));
      assert.ok(parseRecommendations(answer([entry(0, { styleTips: tips(props.styleTips.minItems) })]), 1));
      assert.ok(parseRecommendations(answer([entry(0, { styleTips: tips(props.styleTips.maxItems) })]), 1));
      assert.equal(
        parseRecommendations(answer([entry(0, { styleTips: tips(props.styleTips.minItems - 1) })]), 1),
        null,
      );
      assert.equal(
        parseRecommendations(answer([entry(0, { styleTips: tips(props.styleTips.maxItems + 1) })]), 1),
        null,
      );
      assert.equal(
        parseRecommendations(answer([entry(0, { styleTips: ["ok", tip(props.styleTips.items.maxLength + 1)] })]), 1),
        null,
      );

      assert.equal(RECOMMENDATION_LIMITS.summaryMaxLength, props.summary.maxLength);
    },
  },
];

function runAll(): void {
  let passed = 0;

  for (const { name, run } of cases) {
    try {
      run();
    } catch (error) {
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      process.stderr.write(`FAIL ${name}\n${detail}\n`);
      process.stderr.write(`${passed} of ${cases.length} cases passed before the first failure\n`);
      process.exitCode = 1;
      return;
    }
    passed++;
    process.stdout.write(`ok   ${name}\n`);
  }

  process.stdout.write(`\n${passed} of ${cases.length} cases passed\n`);
}

runAll();
