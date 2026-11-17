import React, { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RideSearchInput } from "@/components/hooks/useRideWindowSearch";
import { formatHour } from "@/components/ride-search/format";
import { DEFAULT_CRITERIA, MIN_TEMP_OPTIONS_C, WIND_LIMIT_OPTIONS_KMH } from "@/lib/ride-criteria";
import { cn } from "@/lib/utils";
import type { RideCriteria } from "@/types";

interface Option {
  value: number;
  label: string;
}

const WEEKDAY_OPTIONS: Option[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
  (label, index) => ({ value: index + 1, label }),
);
const START_HOUR_OPTIONS: Option[] = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: formatHour(hour),
}));
const END_HOUR_OPTIONS: Option[] = Array.from({ length: 24 }, (_, index) => ({
  value: index + 1,
  label: formatHour(index + 1),
}));
const WIND_OPTIONS: Option[] = WIND_LIMIT_OPTIONS_KMH.map((value) => ({ value, label: `${value} km/h` }));
const TEMP_OPTIONS: Option[] = MIN_TEMP_OPTIONS_C.map((value) => ({ value, label: `${value} °C` }));

const controlBase =
  "h-11 w-full min-w-0 rounded-lg border bg-white/10 px-3 text-base text-white transition-colors focus:ring-2 focus:outline-none";

function controlClass(hasError?: boolean) {
  return cn(controlBase, hasError ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400");
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: number;
  options: Option[];
  onChange: (value: number) => void;
  error?: string;
}

function SelectField({ id, label, value, options, onChange, error }: SelectFieldProps) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm text-blue-100/80">
        {label}
      </label>
      <select
        id={id}
        name={id}
        value={value}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(controlClass(Boolean(error)), "scheme-dark")}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-slate-900 text-white">
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs break-words text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

interface Props {
  busyLabel: string | null;
  onSearch: (input: RideSearchInput) => void;
}

export function RideSearchForm({ busyLabel, onSearch }: Props) {
  const [criteria, setCriteria] = useState<RideCriteria>(DEFAULT_CRITERIA);
  const [place, setPlace] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);

  function update<K extends keyof RideCriteria>(key: K, value: RideCriteria[K]) {
    setCriteria((prev) => ({ ...prev, [key]: value }));
    if (key === "startHour" || key === "endHour") setRangeError(null);
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (criteria.endHour <= criteria.startHour) {
      setRangeError("End hour must be later than the start hour.");
      return;
    }
    setRangeError(null);
    onSearch({ criteria, place });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <SelectField
        id="weekday"
        label="Day of the week"
        value={criteria.isoWeekday}
        options={WEEKDAY_OPTIONS}
        onChange={(v) => {
          update("isoWeekday", v);
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          id="start-hour"
          label="From"
          value={criteria.startHour}
          options={START_HOUR_OPTIONS}
          onChange={(v) => {
            update("startHour", v);
          }}
        />
        <SelectField
          id="end-hour"
          label="Until"
          value={criteria.endHour}
          options={END_HOUR_OPTIONS}
          onChange={(v) => {
            update("endHour", v);
          }}
          error={rangeError ?? undefined}
        />
      </div>
      <p className="-mt-2 text-xs text-blue-100/60">Times are local to the searched place.</p>

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          id="max-wind"
          label="Max wind (km/h)"
          value={criteria.maxWindKmh}
          options={WIND_OPTIONS}
          onChange={(v) => {
            update("maxWindKmh", v);
          }}
        />
        <SelectField
          id="min-temp"
          label="Min temperature (°C)"
          value={criteria.minTempC}
          options={TEMP_OPTIONS}
          onChange={(v) => {
            update("minTempC", v);
          }}
        />
      </div>

      <div className="min-w-0">
        <label htmlFor="place" className="mb-1 block text-sm text-blue-100/80">
          Place (optional)
        </label>
        <input
          id="place"
          name="place"
          type="text"
          value={place}
          maxLength={100}
          autoComplete="off"
          placeholder="e.g. Kraków"
          onChange={(e) => {
            setPlace(e.target.value);
          }}
          aria-describedby="place-help"
          className={cn(controlClass(), "placeholder-white/40")}
        />
        <p id="place-help" className="mt-1 text-xs text-blue-100/60">
          Leave empty to use your current device location.
        </p>
      </div>

      <Button
        type="submit"
        disabled={busyLabel !== null}
        className="h-11 w-full rounded-lg bg-purple-600 px-4 font-medium text-white transition-colors hover:bg-purple-500"
      >
        {busyLabel ? (
          <span className="flex items-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            {busyLabel}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Search className="size-4" />
            Find ride windows
          </span>
        )}
      </Button>
    </form>
  );
}
