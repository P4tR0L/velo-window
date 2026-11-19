/**
 * Named-case checks for the ride window matching rules.
 *
 * Run with `npm run check:windows`. No test runner: every case asserts with node:assert
 * and the script exits non-zero on the first failure. All dates are fixed; the real clock
 * is never read. Reference dates: 2026-11-18 is a Wednesday, 2026-11-19 a Thursday.
 */
import assert from "node:assert/strict";

import { DEFAULT_CRITERIA, MIN_TEMP_OPTIONS_C, WIND_LIMIT_OPTIONS_KMH } from "../src/lib/ride-criteria.ts";
import { describeNoMatch } from "../src/lib/weather/describe-no-match.ts";
import { findHazards } from "../src/lib/weather/danger-rules.ts";
import { findRideWindows, isoWeekdayOf, resolveTargetDate } from "../src/lib/weather/match-windows.ts";
import type { HourlySample, LocalNow, RideCriteria } from "../src/types.ts";

const THURSDAY = "2026-11-19";
const NEXT_THURSDAY = "2026-11-26";
const THURSDAY_ISO = 4;

const WEDNESDAY_MORNING: LocalNow = { date: "2026-11-18", hour: 9, minute: 0 };

function sample(date: string, hour: number, overrides: Partial<HourlySample> = {}): HourlySample {
  return {
    date,
    hour,
    tempC: 15,
    windKmh: 10,
    gustKmh: 20,
    weatherCode: 1,
    precipProbability: 0,
    windDirectionDeg: 270,
    ...overrides,
  };
}

/** Samples for `fromHour..toHour` inclusive on one date; `overrides` maps hour to per-hour values. */
function day(
  date: string,
  fromHour: number,
  toHour: number,
  overrides: Record<number, Partial<HourlySample>> = {},
): HourlySample[] {
  const samples: HourlySample[] = [];
  for (let hour = fromHour; hour <= toHour; hour++) samples.push(sample(date, hour, overrides[hour]));
  return samples;
}

function thursdayCriteria(overrides: Partial<RideCriteria> = {}): RideCriteria {
  return { isoWeekday: THURSDAY_ISO, startHour: 15, endHour: 17, maxWindKmh: 25, minTempC: 10, ...overrides };
}

function search(samples: HourlySample[], criteria: RideCriteria, now: LocalNow = WEDNESDAY_MORNING) {
  return findRideWindows({ samples, criteria, now });
}

/** Hours (start inclusive) covered by every window, e.g. ["15-16"]. */
function windowRanges(result: ReturnType<typeof search>): string[] {
  return result.windows.map((window) => `${window.startHour}-${window.endHour}`);
}

interface Case {
  name: string;
  run: () => void;
}

const cases: Case[] = [
  {
    name: "presets: wind and temperature option lists and defaults",
    run: () => {
      assert.deepEqual([...WIND_LIMIT_OPTIONS_KMH], [10, 15, 20, 25, 30, 35]);
      assert.deepEqual([...MIN_TEMP_OPTIONS_C], [0, 5, 10, 15, 20]);
      assert.ok((WIND_LIMIT_OPTIONS_KMH as readonly number[]).includes(DEFAULT_CRITERIA.maxWindKmh));
      assert.ok((MIN_TEMP_OPTIONS_C as readonly number[]).includes(DEFAULT_CRITERIA.minTempC));
      assert.ok(DEFAULT_CRITERIA.endHour > DEFAULT_CRITERIA.startHour);
    },
  },
  {
    name: "run split: hour 15 passes, hour 16 fails wind -> one window 15:00-16:00",
    run: () => {
      const samples = day(THURSDAY, 14, 18, { 15: { windKmh: 10 }, 16: { windKmh: 30 }, 17: { windKmh: 10 } });
      const result = search(samples, thursdayCriteria());
      assert.equal(result.targetDate, THURSDAY);
      assert.deepEqual(windowRanges(result), ["15-16"]);
      assert.equal(result.windows[0].slots.length, 1);
      assert.equal(result.windows[0].slots[0].hour, 15);
      assert.deepEqual(result.noMatchReasons, []);
    },
  },
  {
    name: "run: consecutive passing slots form one window",
    run: () => {
      const result = search(day(THURSDAY, 14, 18), thursdayCriteria({ startHour: 14, endHour: 18 }));
      assert.deepEqual(windowRanges(result), ["14-18"]);
      assert.deepEqual(
        result.windows[0].slots.map((slot) => slot.hour),
        [14, 15, 16, 17],
      );
    },
  },
  {
    name: "range: start inclusive, end exclusive (15-17 means the 15:00 and 16:00 slots)",
    run: () => {
      const result = search(day(THURSDAY, 13, 19), thursdayCriteria());
      assert.deepEqual(windowRanges(result), ["15-17"]);
      assert.deepEqual(
        result.windows[0].slots.map((slot) => slot.hour),
        [15, 16],
      );
    },
  },
  {
    name: "inclusive limits: wind exactly at max passes, one step beyond fails",
    run: () => {
      const atMax = search(day(THURSDAY, 15, 17, { 15: { windKmh: 25 }, 16: { windKmh: 25 } }), thursdayCriteria());
      assert.deepEqual(windowRanges(atMax), ["15-17"]);

      const beyond = search(
        day(THURSDAY, 15, 17, { 15: { windKmh: 25.1 }, 16: { windKmh: 25.1 } }),
        thursdayCriteria(),
      );
      assert.deepEqual(beyond.windows, []);
      assert.equal(beyond.noMatchReasons[0].cause, "wind");
    },
  },
  {
    name: "inclusive limits: temperature exactly at min passes, one step below fails",
    run: () => {
      const atMin = search(day(THURSDAY, 15, 17, { 15: { tempC: 10 }, 16: { tempC: 10 } }), thursdayCriteria());
      assert.deepEqual(windowRanges(atMin), ["15-17"]);

      const below = search(day(THURSDAY, 15, 17, { 15: { tempC: 9.9 }, 16: { tempC: 9.9 } }), thursdayCriteria());
      assert.deepEqual(below.windows, []);
      assert.equal(below.noMatchReasons[0].cause, "temperature");
    },
  },
  {
    name: "wind basis: sustained 20 with gust 45 and max 25 passes",
    run: () => {
      const samples = day(THURSDAY, 15, 16, { 15: { windKmh: 20, gustKmh: 10 }, 16: { windKmh: 20, gustKmh: 45 } });
      const result = search(samples, thursdayCriteria({ endHour: 16 }));
      assert.deepEqual(windowRanges(result), ["15-16"]);
      assert.equal(result.windows[0].slots[0].windKmh, 20);
      assert.equal(result.windows[0].slots[0].gustKmh, 45, "slot gust is the gust at T+1");
    },
  },
  {
    name: "wind direction: a slot carries the direction of its start sample, null stays null",
    run: () => {
      const samples = day(THURSDAY, 15, 17, {
        15: { windDirectionDeg: 45 },
        16: { windDirectionDeg: null },
        17: { windDirectionDeg: 180 },
      });
      const result = search(samples, thursdayCriteria());
      assert.deepEqual(windowRanges(result), ["15-17"]);
      assert.deepEqual(
        result.windows[0].slots.map((slot) => slot.windDirectionDeg),
        [45, null],
      );
    },
  },
  {
    name: "wind basis: the same slot with gust 60 is excluded as danger",
    run: () => {
      const samples = day(THURSDAY, 15, 16, { 15: { windKmh: 20 }, 16: { windKmh: 20, gustKmh: 60 } });
      const result = search(samples, thursdayCriteria({ endHour: 16 }));
      assert.deepEqual(result.windows, []);
      assert.deepEqual(result.noMatchReasons, [
        { cause: "danger", slotsAffected: 1, totalSlots: 1, hazards: ["strong-gusts"] },
      ]);
    },
  },
  {
    name: "wind basis: gust 59.9 passes",
    run: () => {
      const samples = day(THURSDAY, 15, 16, { 15: { windKmh: 20 }, 16: { windKmh: 20, gustKmh: 59.9 } });
      const result = search(samples, thursdayCriteria({ endHour: 16 }));
      assert.deepEqual(windowRanges(result), ["15-16"]);
    },
  },
  {
    name: "wind basis: a gust at T does not affect the slot starting at T",
    run: () => {
      const samples = day(THURSDAY, 15, 16, { 15: { gustKmh: 90 }, 16: { gustKmh: 20 } });
      const result = search(samples, thursdayCriteria({ endHour: 16 }));
      assert.deepEqual(windowRanges(result), ["15-16"]);
    },
  },
  {
    name: "heat: 35 C is dangerous, 34.9 C is not",
    run: () => {
      const hot = search(day(THURSDAY, 15, 16, { 15: { tempC: 35 } }), thursdayCriteria({ endHour: 16, minTempC: 0 }));
      assert.deepEqual(hot.windows, []);
      assert.deepEqual(hot.noMatchReasons, [
        { cause: "danger", slotsAffected: 1, totalSlots: 1, hazards: ["extreme-heat"] },
      ]);

      const warm = search(
        day(THURSDAY, 15, 16, { 15: { tempC: 34.9 } }),
        thursdayCriteria({ endHour: 16, minTempC: 0 }),
      );
      assert.deepEqual(windowRanges(warm), ["15-16"]);
    },
  },
  {
    name: "heat: 35 C at the end sample excludes the slot starting at T",
    run: () => {
      const result = search(
        day(THURSDAY, 15, 16, { 16: { tempC: 35 } }),
        thursdayCriteria({ endHour: 16, minTempC: 0 }),
      );
      assert.deepEqual(result.windows, []);
      assert.equal(result.noMatchReasons[0].cause, "danger");
    },
  },
  {
    name: "weather codes: 95, 96, 99, 56, 57, 66, 67 are dangerous; heavy rain (65) is not",
    run: () => {
      const dangerousCodes = [95, 96, 99, 56, 57, 66, 67];
      for (const code of dangerousCodes) {
        const result = search(day(THURSDAY, 15, 16, { 15: { weatherCode: code } }), thursdayCriteria({ endHour: 16 }));
        assert.deepEqual(result.windows, [], `code ${code} must exclude the slot`);
        assert.equal(result.noMatchReasons[0].cause, "danger", `code ${code} must be a danger reason`);
      }

      const heavyRain = search(
        day(THURSDAY, 15, 16, { 15: { weatherCode: 65 }, 16: { weatherCode: 65 } }),
        thursdayCriteria({ endHour: 16 }),
      );
      assert.deepEqual(windowRanges(heavyRain), ["15-16"]);
    },
  },
  {
    name: "weather codes: thunderstorm and freezing precipitation report the matching hazard",
    run: () => {
      const storm = findHazards(sample(THURSDAY, 15, { weatherCode: 95 }), sample(THURSDAY, 16));
      assert.deepEqual(storm, ["thunderstorm"]);
      const freezing = findHazards(sample(THURSDAY, 15, { weatherCode: 66 }), sample(THURSDAY, 16));
      assert.deepEqual(freezing, ["freezing-precipitation"]);
      assert.deepEqual(findHazards(sample(THURSDAY, 15), sample(THURSDAY, 16)), []);
    },
  },
  {
    name: "end sample danger: a dangerous code at T+1 excludes the slot starting at T",
    run: () => {
      const result = search(day(THURSDAY, 15, 16, { 16: { weatherCode: 95 } }), thursdayCriteria({ endHour: 16 }));
      assert.deepEqual(result.windows, []);
      assert.deepEqual(result.noMatchReasons, [
        { cause: "danger", slotsAffected: 1, totalSlots: 1, hazards: ["thunderstorm"] },
      ]);
    },
  },
  {
    name: "safety invariant: no window ever contains a slot with a danger hazard",
    run: () => {
      const gusts = [0, 30, 59.9, 60, 61, 90];
      const temps = [5, 20, 34.9, 35, 36, 41];
      const codes = [0, 3, 65, 56, 57, 66, 67, 95, 96, 99];
      const dangerousCodes = new Set([95, 96, 99, 56, 57, 66, 67]);
      const permissive = thursdayCriteria({ startHour: 10, endHour: 16, maxWindKmh: 35, minTempC: 0 });
      let combinations = 0;

      for (const gustKmh of gusts) {
        for (const tempC of temps) {
          for (const weatherCode of codes) {
            for (const dangerHour of [10, 12, 13, 16]) {
              const samples = day(THURSDAY, 10, 16, { [dangerHour]: { gustKmh, tempC, weatherCode } });
              const result = search(samples, permissive);
              combinations++;

              for (const window of result.windows) {
                for (const slot of window.slots) {
                  // Independent oracle: literal limits, looked up directly in the raw samples.
                  const atStart = samples.find((s) => s.hour === slot.hour);
                  const atEnd = samples.find((s) => s.hour === slot.hour + 1);
                  assert.ok(atStart && atEnd, `slot ${slot.hour} must have both samples`);
                  assert.ok(atEnd.gustKmh < 60, `gust ${atEnd.gustKmh} in slot ${slot.hour}`);
                  for (const s of [atStart, atEnd]) {
                    assert.ok(s.tempC < 35, `temp ${s.tempC} in slot ${slot.hour}`);
                    assert.ok(!dangerousCodes.has(s.weatherCode), `code ${s.weatherCode} in slot ${slot.hour}`);
                  }
                }
              }

              // Sanity: a fully safe combination must not hide every slot.
              const dangerous = gustKmh >= 60 || tempC >= 35 || dangerousCodes.has(weatherCode);
              if (!dangerous) assert.deepEqual(windowRanges(result), ["10-16"]);
              else assert.ok(result.windows.length > 0 || result.noMatchReasons.length > 0);
            }
          }
        }
      }
      assert.equal(combinations, gusts.length * temps.length * codes.length * 4);
    },
  },
  {
    name: "safety invariant: a slot failing danger is excluded even when it passes the user's limits",
    run: () => {
      const samples = day(THURSDAY, 14, 18, { 16: { gustKmh: 75 } });
      const result = search(samples, thursdayCriteria({ startHour: 14, endHour: 18 }));
      // Gust at 16 is the gust of slot 15; the slot starting at 16 uses the gust at 17 and passes.
      assert.deepEqual(windowRanges(result), ["14-15", "16-18"]);
    },
  },
  {
    name: "missing next sample: a slot without a T+1 sample is excluded",
    run: () => {
      const result = search(day(THURSDAY, 15, 16), thursdayCriteria());
      assert.deepEqual(windowRanges(result), ["15-16"]);
      assert.ok(!result.windows.some((window) => window.slots.some((slot) => slot.hour === 16)));
    },
  },
  {
    name: "missing next sample: nothing evaluable -> forecast gap, not wind or temperature",
    run: () => {
      const lastOnly = search(
        day(THURSDAY, 15, 15, { 15: { windKmh: 99, tempC: -5 } }),
        thursdayCriteria({ endHour: 16 }),
      );
      assert.deepEqual(lastOnly.windows, []);
      assert.deepEqual(lastOnly.noMatchReasons, [{ cause: "forecast-gap", slotsAffected: 1, totalSlots: 1 }]);

      const noSamples = search([], thursdayCriteria());
      assert.deepEqual(noSamples.windows, []);
      assert.deepEqual(noSamples.noMatchReasons, [{ cause: "forecast-gap", slotsAffected: 2, totalSlots: 2 }]);

      const wrongDay = search(day(NEXT_THURSDAY, 14, 18), thursdayCriteria());
      assert.deepEqual(wrongDay.noMatchReasons, [{ cause: "forecast-gap", slotsAffected: 2, totalSlots: 2 }]);
    },
  },
  {
    name: "missing sample inside the range: that slot is a forecast gap and splits runs",
    run: () => {
      const samples = day(THURSDAY, 14, 18).filter((s) => s.hour !== 16);
      const result = search(samples, thursdayCriteria({ startHour: 14, endHour: 18 }));
      // Slot 14 ok (needs 15), slot 15 needs 16 (missing), slot 16 missing, slot 17 ok (needs 18).
      assert.deepEqual(windowRanges(result), ["14-15", "17-18"]);
    },
  },
  {
    name: "missing next sample: hour 23 uses the next date's 00:00 sample",
    run: () => {
      const criteria = thursdayCriteria({ startHour: 22, endHour: 24 });
      const withMidnight = [...day(THURSDAY, 22, 23), sample("2026-11-20", 0)];
      assert.deepEqual(windowRanges(search(withMidnight, criteria)), ["22-24"]);

      const withoutMidnight = day(THURSDAY, 22, 23);
      assert.deepEqual(windowRanges(search(withoutMidnight, criteria)), ["22-23"]);

      const dangerousMidnight = [...day(THURSDAY, 22, 23), sample("2026-11-20", 0, { weatherCode: 99 })];
      assert.deepEqual(windowRanges(search(dangerousMidnight, criteria)), ["22-23"]);
    },
  },
  {
    name: "weekday, today: Thursday 16:30 with range 15-17 searches only the 16:00 slot today",
    run: () => {
      const now: LocalNow = { date: THURSDAY, hour: 16, minute: 30 };
      const result = search(day(THURSDAY, 14, 18), thursdayCriteria(), now);
      assert.equal(result.targetDate, THURSDAY);
      assert.deepEqual(windowRanges(result), ["16-17"]);
    },
  },
  {
    name: "weekday, today: Thursday 16:59 still searches today",
    run: () => {
      const now: LocalNow = { date: THURSDAY, hour: 16, minute: 59 };
      assert.equal(resolveTargetDate(thursdayCriteria(), now), THURSDAY);
      const result = search(day(THURSDAY, 14, 18), thursdayCriteria(), now);
      assert.deepEqual(windowRanges(result), ["16-17"]);
    },
  },
  {
    name: "weekday, today: Thursday 17:00 with range 15-17 moves to next Thursday",
    run: () => {
      const now: LocalNow = { date: THURSDAY, hour: 17, minute: 0 };
      assert.equal(resolveTargetDate(thursdayCriteria(), now), NEXT_THURSDAY);
      const result = search([...day(THURSDAY, 14, 18), ...day(NEXT_THURSDAY, 14, 18)], thursdayCriteria(), now);
      assert.equal(result.targetDate, NEXT_THURSDAY);
      assert.deepEqual(windowRanges(result), ["15-17"]);
    },
  },
  {
    name: "weekday, today: earlier on the chosen weekday keeps today and the full range",
    run: () => {
      const now: LocalNow = { date: THURSDAY, hour: 8, minute: 0 };
      const result = search(day(THURSDAY, 14, 18), thursdayCriteria(), now);
      assert.equal(result.targetDate, THURSDAY);
      assert.deepEqual(windowRanges(result), ["15-17"]);
    },
  },
  {
    name: "weekday, today: the hour in progress counts but a finished hour is dropped",
    run: () => {
      const now: LocalNow = { date: THURSDAY, hour: 15, minute: 0 };
      const result = search(day(THURSDAY, 14, 18), thursdayCriteria(), now);
      assert.deepEqual(windowRanges(result), ["15-17"]);

      // Hour 15 failing wind must be dropped silently at 16:30, not counted in the totals.
      const windy15 = day(THURSDAY, 14, 18, { 15: { windKmh: 40 }, 16: { windKmh: 40 } });
      const late = search(windy15, thursdayCriteria(), { date: THURSDAY, hour: 16, minute: 30 });
      assert.deepEqual(late.noMatchReasons, [{ cause: "wind", slotsAffected: 1, totalSlots: 1 }]);
    },
  },
  {
    name: "weekday, other day: a different weekday resolves to the next date within seven days",
    run: () => {
      const thursdayNow: LocalNow = { date: THURSDAY, hour: 12, minute: 0 };
      const resolve = (isoWeekday: number, now: LocalNow) => resolveTargetDate(thursdayCriteria({ isoWeekday }), now);

      assert.equal(resolve(5, thursdayNow), "2026-11-20", "Friday from Thursday");
      assert.equal(resolve(3, thursdayNow), "2026-11-25", "Wednesday from Thursday");
      assert.equal(resolve(1, thursdayNow), "2026-11-23", "Monday from Thursday");
      assert.equal(resolve(4, { date: THURSDAY, hour: 20, minute: 0 }), NEXT_THURSDAY, "passed same weekday");

      assert.equal(resolve(3, WEDNESDAY_MORNING), "2026-11-18", "Wednesday morning is still today");
      assert.equal(resolve(4, WEDNESDAY_MORNING), THURSDAY, "tomorrow");
      assert.equal(resolve(2, WEDNESDAY_MORNING), "2026-11-24", "Tuesday from Wednesday");
    },
  },
  {
    name: "weekday, other day: month and year boundaries use pure date math",
    run: () => {
      const now: LocalNow = { date: "2026-12-30", hour: 12, minute: 0 };
      assert.equal(isoWeekdayOf("2026-12-30"), 3);
      assert.equal(resolveTargetDate(thursdayCriteria({ isoWeekday: 5 }), now), "2027-01-01");
      assert.equal(isoWeekdayOf("2026-11-22"), 7, "Sunday is ISO 7");
      assert.equal(isoWeekdayOf("2026-11-23"), 1, "Monday is ISO 1");
      assert.equal(isoWeekdayOf("2028-02-29"), 2, "leap day");
    },
  },
  {
    name: "weekday, other day: the other day's whole range is evaluated, nothing is dropped for now",
    run: () => {
      const now: LocalNow = { date: "2026-11-19", hour: 23, minute: 59 };
      const result = search(
        day("2026-11-20", 8, 12),
        thursdayCriteria({ isoWeekday: 5, startHour: 8, endHour: 12 }),
        now,
      );
      assert.equal(result.targetDate, "2026-11-20");
      assert.deepEqual(windowRanges(result), ["8-12"]);
    },
  },
  {
    name: "ordering: two windows (08-10 and 14-16) are returned earliest first",
    run: () => {
      const windy = { windKmh: 40 };
      const samples = day(THURSDAY, 8, 16, { 10: windy, 11: windy, 12: windy, 13: windy });
      const criteria = thursdayCriteria({ startHour: 8, endHour: 16 });

      const result = search(samples, criteria);
      assert.deepEqual(windowRanges(result), ["8-10", "14-16"]);

      const reversed = search([...samples].reverse(), criteria);
      assert.deepEqual(windowRanges(reversed), ["8-10", "14-16"], "input order must not matter");
    },
  },
  {
    name: "no-match reasons: all slots too windy -> wind reason, 'all N slots' and PRD-style sentence",
    run: () => {
      const criteria = thursdayCriteria();
      const result = search(day(THURSDAY, 15, 17, { 15: { windKmh: 30 }, 16: { windKmh: 30 } }), criteria);
      assert.deepEqual(result.windows, []);
      assert.deepEqual(result.noMatchReasons, [{ cause: "wind", slotsAffected: 2, totalSlots: 2 }]);
      assert.equal(
        describeNoMatch(result.noMatchReasons, criteria, result.targetDate),
        "Wind exceeds 25 km/h in all 2 slots on Thursday.",
      );
    },
  },
  {
    name: "no-match reasons: a mix produces 'N of M slots' per cause",
    run: () => {
      const criteria = thursdayCriteria({ startHour: 14, endHour: 18 });
      const samples = day(THURSDAY, 14, 18, {
        14: { windKmh: 40 },
        15: { windKmh: 40 },
        16: { tempC: 2 },
        17: { tempC: 2 },
      });
      const result = search(samples, criteria);
      assert.deepEqual(result.windows, []);
      assert.deepEqual(result.noMatchReasons, [
        { cause: "wind", slotsAffected: 2, totalSlots: 4 },
        { cause: "temperature", slotsAffected: 2, totalSlots: 4 },
      ]);
      assert.equal(
        describeNoMatch(result.noMatchReasons, criteria, result.targetDate),
        "Wind exceeds 25 km/h in 2 of 4 slots on Thursday. Temperature is below 10 °C in 2 of 4 slots on Thursday.",
      );
    },
  },
  {
    name: "no-match reasons: a slot can count under both danger and wind",
    run: () => {
      const criteria = thursdayCriteria({ endHour: 16 });
      const result = search(day(THURSDAY, 15, 16, { 15: { windKmh: 40, weatherCode: 95 } }), criteria);
      assert.deepEqual(result.noMatchReasons, [
        { cause: "wind", slotsAffected: 1, totalSlots: 1 },
        { cause: "danger", slotsAffected: 1, totalSlots: 1, hazards: ["thunderstorm"] },
      ]);
    },
  },
  {
    name: "no-match reasons: a danger-only failure names the hazard",
    run: () => {
      const criteria = thursdayCriteria();
      const result = search(day(THURSDAY, 15, 17, { 15: { weatherCode: 95 }, 16: { weatherCode: 95 } }), criteria);
      assert.deepEqual(result.noMatchReasons, [
        { cause: "danger", slotsAffected: 2, totalSlots: 2, hazards: ["thunderstorm"] },
      ]);
      assert.equal(
        describeNoMatch(result.noMatchReasons, criteria, result.targetDate),
        "Dangerous weather (thunderstorm) in all 2 slots on Thursday.",
      );

      const mixed = search(
        day(THURSDAY, 15, 17, { 15: { tempC: 36 }, 16: { weatherCode: 67 }, 17: { gustKmh: 80 } }),
        criteria,
      );
      assert.equal(
        describeNoMatch(mixed.noMatchReasons, criteria, mixed.targetDate),
        "Dangerous weather (freezing rain or drizzle, strong gusts, extreme heat) in all 2 slots on Thursday.",
      );
    },
  },
  {
    name: "no-match reasons: forecast gap is described as missing data",
    run: () => {
      const criteria = thursdayCriteria();
      const result = search([], criteria);
      assert.equal(
        describeNoMatch(result.noMatchReasons, criteria, result.targetDate),
        "Forecast data is missing for all 2 slots on Thursday.",
      );
    },
  },
  {
    name: "no-match reasons: no windows is never silent, windows leave no reasons",
    run: () => {
      const criteria = thursdayCriteria({ startHour: 14, endHour: 16 });
      const ok = search(day(THURSDAY, 14, 16), criteria);
      assert.equal(ok.windows.length, 1);
      assert.deepEqual(ok.noMatchReasons, []);

      const empty = search([], criteria);
      assert.equal(empty.windows.length, 0);
      assert.ok(empty.noMatchReasons.length > 0);
      assert.equal(describeNoMatch([], criteria, THURSDAY), "No matching windows.");
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
