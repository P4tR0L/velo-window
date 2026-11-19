import type { RideSearchState } from "@/components/hooks/useRideWindowSearch";
import { formatFetchedAt, formatHour, formatTargetDate } from "@/components/ride-search/format";
import { cn } from "@/lib/utils";
import type { RecommendationStatus, RecommendedWindow, RideWindowSearchResponse } from "@/types";

const RECOMMENDATION_NOTES: Record<Exclude<RecommendationStatus, "ok">, string> = {
  unavailable: "Recommendation unavailable right now. The weather above is still current.",
  "invalid-output": "We couldn't use the AI answer for this window. The weather above is still current.",
};

function Recommendation({
  recommendation,
  status,
}: {
  recommendation: RecommendedWindow["recommendation"];
  status: RecommendationStatus | null;
}) {
  if (recommendation) {
    return (
      <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-sm break-words text-blue-100/90">
        <p className="font-medium text-white">{recommendation.summary}</p>
        <p>
          <span className="font-medium text-white">Route:</span> {recommendation.routeAdvice}
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {recommendation.styleTips.map((tip, index) => (
            <li key={`${index}-${tip}`}>{tip}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (status === "unavailable" || status === "invalid-output") {
    return (
      <p className="mt-3 border-t border-white/10 pt-3 text-xs break-words text-blue-100/60">
        {RECOMMENDATION_NOTES[status]}
      </p>
    );
  }

  return null;
}

function WindowCard({ window, status }: { window: RecommendedWindow; status: RecommendationStatus | null }) {
  return (
    <li className="rounded-xl border border-white/10 bg-white/5 p-3">
      <h3 className="text-base font-semibold text-white">
        {formatHour(window.startHour)}–{formatHour(window.endHour)}
      </h3>
      <table className="mt-2 w-full table-fixed text-left text-xs text-blue-100/80">
        <caption className="sr-only">Hourly forecast for this window</caption>
        <thead className="text-blue-100/50">
          <tr>
            <th scope="col" className="pb-1 font-normal">
              Hour
            </th>
            <th scope="col" className="pb-1 font-normal">
              Temp
            </th>
            <th scope="col" className="pb-1 font-normal">
              Wind
            </th>
            <th scope="col" className="pb-1 font-normal">
              Gust
            </th>
            <th scope="col" className="pb-1 font-normal">
              Rain
            </th>
          </tr>
        </thead>
        <tbody>
          {window.slots.map((slot) => (
            <tr key={slot.hour} className="border-t border-white/10">
              <th scope="row" className="py-1 font-medium text-white">
                {formatHour(slot.hour)}
              </th>
              <td className="py-1">{Math.round(slot.tempC)} °C</td>
              <td className="py-1">{Math.round(slot.windKmh)} km/h</td>
              <td className="py-1">{Math.round(slot.gustKmh)} km/h</td>
              <td className="py-1">{slot.precipProbability === null ? "n/a" : `${slot.precipProbability}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Recommendation recommendation={window.recommendation} status={status} />
    </li>
  );
}

function SuccessResults({ response }: { response: RideWindowSearchResponse }) {
  const hasWindows = response.windows.length > 0;

  return (
    <div className="space-y-3">
      <div className="min-w-0 text-sm text-blue-100/80">
        <p className="font-semibold break-words text-white">{response.location.label}</p>
        <p>
          Forecast fetched at {formatFetchedAt(response.fetchedAt, response.location.timezone)} (local time of the
          place)
        </p>
        <p>Searched day: {formatTargetDate(response.targetDate)}</p>
      </div>

      {hasWindows ? (
        <ol className="space-y-3">
          {response.windows.map((window) => (
            <WindowCard
              key={`${window.date}-${window.startHour}`}
              window={window}
              status={response.recommendationStatus}
            />
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm break-words text-blue-100/90">
          {response.noMatchMessage ?? "No ride windows match your settings."}
        </p>
      )}
    </div>
  );
}

interface Props {
  state: RideSearchState;
  className?: string;
}

export function RideSearchResults({ state, className }: Props) {
  return (
    <div aria-live="polite" className={cn("min-w-0", className)}>
      {state.status === "success" && <SuccessResults response={state.response} />}
      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm break-words text-red-200"
        >
          {state.message}
          {state.code === "UNAUTHENTICATED" && (
            <>
              {" "}
              <a href="/auth/signin" className="underline">
                Go to sign in
              </a>
              .
            </>
          )}
        </p>
      )}
    </div>
  );
}
