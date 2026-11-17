import { useRideWindowSearch } from "@/components/hooks/useRideWindowSearch";
import { RideSearchForm } from "@/components/ride-search/RideSearchForm";
import { RideSearchResults } from "@/components/ride-search/RideSearchResults";

export default function RideSearch() {
  const { state, search } = useRideWindowSearch();

  let busyLabel: string | null = null;
  if (state.status === "locating") busyLabel = "Getting your location…";
  else if (state.status === "loading") busyLabel = "Searching…";

  return (
    <div className="space-y-6">
      <RideSearchForm busyLabel={busyLabel} onSearch={search} />
      <RideSearchResults state={state} />
    </div>
  );
}
