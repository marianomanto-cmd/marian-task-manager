export type AgencyTimezone = {
  id: "PTY" | "MIA" | "ARG" | "ESP";
  label: string;
  ianaTz: string;
};

export const AGENCY_TIMEZONES: readonly AgencyTimezone[] = [
  { id: "PTY", label: "Panamá", ianaTz: "America/Panama" },
  { id: "MIA", label: "Miami", ianaTz: "America/New_York" },
  { id: "ARG", label: "Buenos Aires", ianaTz: "America/Argentina/Buenos_Aires" },
  { id: "ESP", label: "Madrid", ianaTz: "Europe/Madrid" },
] as const;
