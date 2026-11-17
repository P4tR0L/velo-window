import { z } from "zod";
import { MIN_TEMP_OPTIONS_C, WIND_LIMIT_OPTIONS_KMH } from "../ride-criteria.ts";

function isOneOf(options: readonly number[]) {
  return (value: number) => options.includes(value);
}

const locationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("place"),
    query: z.string().trim().min(1).max(100),
  }),
  z.object({
    kind: z.literal("coords"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
]);

/** Body of the ride window search request. */
export const rideSearchRequestSchema = z
  .object({
    isoWeekday: z.number().int().min(1).max(7),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    maxWindKmh: z.number().refine(isOneOf(WIND_LIMIT_OPTIONS_KMH), { message: "Unsupported wind limit." }),
    minTempC: z.number().refine(isOneOf(MIN_TEMP_OPTIONS_C), { message: "Unsupported minimum temperature." }),
    location: locationSchema,
  })
  .refine((request) => request.endHour > request.startHour, {
    message: "endHour must be greater than startHour.",
    path: ["endHour"],
  });

export type RideSearchRequest = z.infer<typeof rideSearchRequestSchema>;
