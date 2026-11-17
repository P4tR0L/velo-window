import type {
  Hazard,
  HourlySample,
  LocalNow,
  NoMatchReason,
  RideCriteria,
  RideWindow,
  WindowSearchResult,
  WindowSlot,
} from "../../types.ts";
import { findHazards, HAZARD_ORDER } from "./danger-rules.ts";

const MS_PER_DAY = 86_400_000;

function dateToUtcMs(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

/** ISO weekday (1 = Monday ... 7 = Sunday) of a `YYYY-MM-DD` date, independent of the local timezone. */
export function isoWeekdayOf(date: string): number {
  const day = new Date(dateToUtcMs(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** `YYYY-MM-DD` date shifted by a whole number of days. */
export function addDays(date: string, days: number): string {
  return new Date(dateToUtcMs(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * The date a search refers to.
 *
 * Today when it is the chosen weekday and any hour of the range is still ahead
 * (range end in minutes is after the current minute of the day); otherwise the next
 * date after today with that weekday, within the next seven days.
 */
export function resolveTargetDate(criteria: RideCriteria, now: LocalNow): string {
  if (isoWeekdayOf(now.date) === criteria.isoWeekday && criteria.endHour * 60 > now.hour * 60 + now.minute) {
    return now.date;
  }

  for (let offset = 1; offset <= 7; offset++) {
    const candidate = addDays(now.date, offset);
    if (isoWeekdayOf(candidate) === criteria.isoWeekday) return candidate;
  }

  // Unreachable for a valid ISO weekday (1-7): seven consecutive days cover every weekday.
  throw new RangeError(`Invalid ISO weekday: ${criteria.isoWeekday}`);
}

function sampleKey(date: string, hour: number): string {
  return `${date}T${hour}`;
}

/**
 * Find ride windows: unbroken runs of passing hourly slots inside the user's range.
 *
 * A slot starting at T covers T to T+1. Temperature and wind limits use the sample at T
 * (sustained wind only); danger uses both samples and the gust at T+1. A slot without a
 * sample at T or T+1 is not evaluable and is excluded, never assumed safe.
 */
export function findRideWindows(input: {
  samples: readonly HourlySample[];
  criteria: RideCriteria;
  now: LocalNow;
}): WindowSearchResult {
  const { samples, criteria, now } = input;
  const targetDate = resolveTargetDate(criteria, now);

  const index = new Map<string, HourlySample>();
  for (const sample of samples) index.set(sampleKey(sample.date, sample.hour), sample);

  const nowMinutes = now.hour * 60 + now.minute;
  const targetIsToday = targetDate === now.date;

  const windows: RideWindow[] = [];
  let run: WindowSlot[] = [];
  const closeRun = () => {
    if (run.length > 0) {
      windows.push({
        date: targetDate,
        startHour: run[0].hour,
        endHour: run[run.length - 1].hour + 1,
        slots: run,
      });
      run = [];
    }
  };

  let totalSlots = 0;
  let windFailures = 0;
  let temperatureFailures = 0;
  let dangerFailures = 0;
  let gapFailures = 0;
  const hazardsSeen = new Set<Hazard>();

  for (let hour = criteria.startHour; hour < criteria.endHour; hour++) {
    // Drop hours already finished today; the hour in progress still counts.
    if (targetIsToday && (hour + 1) * 60 <= nowMinutes) continue;

    totalSlots++;

    const start = index.get(sampleKey(targetDate, hour));
    const end =
      hour < 23 ? index.get(sampleKey(targetDate, hour + 1)) : index.get(sampleKey(addDays(targetDate, 1), 0));

    if (!start || !end) {
      gapFailures++;
      closeRun();
      continue;
    }

    const hazards = findHazards(start, end);
    const tooWindy = start.windKmh > criteria.maxWindKmh;
    const tooCold = start.tempC < criteria.minTempC;

    if (hazards.length > 0) {
      dangerFailures++;
      for (const hazard of hazards) hazardsSeen.add(hazard);
    }
    if (tooWindy) windFailures++;
    if (tooCold) temperatureFailures++;

    if (hazards.length > 0 || tooWindy || tooCold) {
      closeRun();
      continue;
    }

    run.push({
      date: targetDate,
      hour,
      tempC: start.tempC,
      windKmh: start.windKmh,
      gustKmh: end.gustKmh,
      precipProbability: start.precipProbability,
    });
  }
  closeRun();

  if (windows.length > 0) {
    return { targetDate, windows, noMatchReasons: [] };
  }

  const noMatchReasons: NoMatchReason[] = [];
  if (windFailures > 0) noMatchReasons.push({ cause: "wind", slotsAffected: windFailures, totalSlots });
  if (temperatureFailures > 0) {
    noMatchReasons.push({ cause: "temperature", slotsAffected: temperatureFailures, totalSlots });
  }
  if (dangerFailures > 0) {
    noMatchReasons.push({
      cause: "danger",
      slotsAffected: dangerFailures,
      totalSlots,
      hazards: HAZARD_ORDER.filter((hazard) => hazardsSeen.has(hazard)),
    });
  }
  if (gapFailures > 0) noMatchReasons.push({ cause: "forecast-gap", slotsAffected: gapFailures, totalSlots });
  if (noMatchReasons.length === 0) {
    // No slot in range is left to evaluate: report it as missing forecast, never as a match.
    noMatchReasons.push({ cause: "forecast-gap", slotsAffected: totalSlots, totalSlots });
  }

  return { targetDate, windows, noMatchReasons };
}
