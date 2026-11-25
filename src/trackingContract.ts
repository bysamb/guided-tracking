// Response types for GET /api/customer-tracking?hbl=<HBL>.
// Same names and fields as customer/contract.ts in the n8n-docs service
// (phase 21 21-CONTRACT.md). Dates arrive as display strings made by the
// server; this page renders date_display verbatim and never re-parses it.

export type TrackingMilestone = {
  // departed_origin, arrived_port, arrived_destination (inland only), gate_out, empty_returned
  key: string;
  label: string;
  date_display: string | null;
  date_local: string | null;
  actual: boolean;
};

export type TrackedResponse = {
  status: "tracked";
  hbl: string;
  route: { origin: string; port: string; destination: string | null; inland: boolean };
  vessel: string | null;
  voyage: string | null;
  carrier: string | null;
  containers: string[];
  milestones: TrackingMilestone[];
  details: {
    last_free_day: { date_display: string; place: string } | null;
    available_for_pickup: boolean | null;
    holds: string[] | null;
    terminal_location: string | null;
  };
  updated: { date_display: string; date_local: string } | null;
};

export type SettingUpResponse = { status: "setting_up"; hbl: string };

export type TrackingAnswer = TrackedResponse | SettingUpResponse;

// Outcomes of the lookup the page has to tell apart.
export type LookupResult =
  | { kind: "tracked"; data: TrackedResponse }
  | { kind: "setting_up"; hbl: string }
  | { kind: "not_found" }
  | { kind: "rate_limited" };
