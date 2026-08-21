import { useState, useEffect, useRef } from "react";
import { Search, Ship, MapPin, Package, Clock, AlertTriangle, Loader2, ArrowLeft, Anchor, Truck, ChevronDown } from "lucide-react";

const N8N_HBL_WEBHOOK = "https://n8n.srv1361720.hstgr.cloud/webhook/hbl-tracking";
const N8N_CUSTOMER_WEBHOOK = "https://n8n.srv1361720.hstgr.cloud/webhook/customer-shipments";

// ── Shared Types ──

type Shipment = {
  item_id: string;
  name: string;
  group: string;
  hbl: string;
  mbl: string;
  sq: string;
  container_number: string;
  status: string;
  pol: string;
  pod: string;
  destination: string;
  vessel: string;
  voyage: string;
  ssl: string;
  incoterm: string;
  mode: string;
};

type Tracking = {
  method: string | null;
  etd: string;
  atd: string;
  eta: string;
  ata: string;
  gate_out: string;
  lfd: string;
  available_for_pickup: string | null;
  holds: string | null;
  terminal_location: string;
  delivery_date: string;
  empty_return: string;
  last_update: string;
  notes: string;
};

type Container = {
  container_number: string;
  equipment: string;
  equipment_type: string;
  equipment_length: string;
  weight_in_lbs: string;
  pol_atd_at: string;
  pod_eta_at: string;
  pod_arrived_at: string;
  pod_discharged_at: string;
  pod_last_free_day: string;
  pod_full_out_at: string;
  empty_terminated_at: string;
  holds_at_pod_terminal: string;
  available_for_pickup: string;
  location_at_pod_terminal: string;
  pod_vessel_name: string;
  pod_voyage_number: string;
};

type TrackingResponse = {
  found: boolean;
  shipment: Shipment;
  tracking: Tracking;
  t49: {
    found: boolean;
    containers: Container[];
  };
};

type CustomerShipment = {
  item_id: string;
  name: string;
  group: string;
  hbl: string;
  mbl: string;
  sq: string;
  container_number: string;
  status: string;
  pol: string;
  pod: string;
  destination: string;
  vessel: string;
  voyage: string;
  ssl: string;
  mode: string;
  etd: string | null;
  atd: string | null;
  eta: string | null;
  ata: string | null;
  gate_out: string | null;
  lfd: string | null;
  delivery_date: string | null;
  available_for_pickup: string | null;
  holds: string | null;
  last_update: string | null;
  terminal_location: string | null;
  empty_return: string | null;
};

type CustomerResponse = {
  found: boolean;
  error?: string;
  customer: {
    name: string;
    email: string;
  };
  shipment_count: number;
  shipments: CustomerShipment[];
};

// ── Shared Utilities ──

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const REQUEST_TIMEOUT_MS = 15000;

// n8n answers in ~3s normally, but a stalled workflow used to leave the page
// spinning forever with no way out. Time out, retry once, and surface a real
// message instead.
async function fetchJson<T>(url: string): Promise<T> {
  let lastError: Error = new Error("Something went wrong");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

      // Client errors are deterministic — retrying only delays the message.
      if (res.status >= 400 && res.status < 500) {
        throw Object.assign(new Error(`Request failed (${res.status})`), { final: true });
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      // A failing workflow can answer 200 with an empty body, which makes
      // res.json() throw a parse error that reads like a bug in this page.
      const text = await res.text();
      if (!text.trim()) throw new Error("The tracking service returned an empty response.");

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error("The tracking service returned an unreadable response.");
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      lastError =
        err.name === "TimeoutError"
          ? new Error("The tracking service took too long to respond.")
          : err;

      if ((err as { final?: boolean }).final) break;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
    }
  }

  throw lastError;
}

const STALE_AFTER_HOURS = 48;

// The Tracking board records a gate-out or empty-return without touching
// last_update on ~26% of shipments, so last_update alone understates freshness.
// Use the most recent milestone we actually know about. ISO date strings sort
// lexicographically, so a plain string compare is safe here.
function effectiveUpdate(t: Tracking): string {
  const valid = (d: string | null | undefined): d is string =>
    !!d && !isNaN(new Date(d + "T00:00:00").getTime());
  const candidates = [t.last_update, t.gate_out, t.empty_return, t.delivery_date].filter(valid);
  return candidates.length ? candidates.reduce((a, b) => (a > b ? a : b)) : "";
}

function freshness(lastUpdate: string | null | undefined): { label: string; stale: boolean } | null {
  if (!lastUpdate) return null;
  const d = new Date(lastUpdate + "T00:00:00");
  if (isNaN(d.getTime())) return null;

  const hours = (Date.now() - d.getTime()) / 36e5;
  if (hours < 24) return { label: "Updated today", stale: false };

  const days = Math.floor(hours / 24);
  return {
    label: `Updated ${days} day${days === 1 ? "" : "s"} ago`,
    stale: hours > STALE_AFTER_HOURS,
  };
}

function statusColor(status: string): { bg: string; text: string; dot: string } {
  const s = status.toLowerCase();
  if (s.includes("delivered") || s.includes("completed")) return { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" };
  if (s.includes("transit")) return { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" };
  if (s.includes("arrived") || s.includes("gated out") || s.includes("destination terminal")) return { bg: "bg-teal-50", text: "text-teal-700", dot: "bg-teal-500" };
  if (s.includes("hold")) return { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" };
  if (s.includes("canceled")) return { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" };
  if (s.includes("pending") || s.includes("booked") || s.includes("awaiting")) return { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" };
  return { bg: "bg-gray-50", text: "text-gray-700", dot: "bg-gray-400" };
}

function StatusBadge({ status }: { status: string }) {
  if (!status) return null;
  const c = statusColor(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between items-baseline py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold text-gray-800 text-right">{value || "—"}</span>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm shadow-gray-100/50 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
        <Icon className="w-4 h-4 text-[#1B2A4A]" />
        <h3 className="text-sm font-bold text-[#1B2A4A]">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ── HBL Tracking Components ──

function TrackingStatusNote({ tracking }: { tracking: Tracking }) {
  const hasAny = !!(
    tracking.etd || tracking.atd || tracking.eta || tracking.ata ||
    tracking.gate_out || tracking.delivery_date || tracking.last_update
  );

  // No milestones at all has two very different causes, and conflating them told
  // customers that working shipments were broken:
  //
  //   method 'Manual'  — tracked by hand, because the consolidator won't release a
  //                      master bill and Terminal49 cannot register a house bill.
  //                      Dates appear when someone enters them. Nothing is wrong.
  //   method 'Pending' — tracking hasn't started yet.
  //   anything else    — a T49-tracked shipment with no milestones, or a method we
  //                      couldn't read. That does suggest a real upstream failure.
  //
  // Only the last case is ours. Telling a customer to refresh and contact us about
  // a correctly-recorded manual shipment manufactures a support ticket.
  if (!hasAny) {
    const method = (tracking.method || "").trim().toLowerCase();

    if (method === "manual" || method === "pending") {
      return (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500">
            {method === "manual"
              ? "This shipment is tracked manually, so milestone dates appear here once they're confirmed rather than updating automatically."
              : "Tracking hasn't started for this shipment yet. Milestone dates will appear here once it's underway."}
          </p>
        </div>
      );
    }

    return (
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          We couldn't load live tracking for this shipment just now. The details below may be
          incomplete — please refresh, or contact us if it keeps happening.
        </p>
      </div>
    );
  }

  // A delivered shipment legitimately stops updating, so age is not a warning
  // sign once the container is out and the empty is returned — only flag
  // staleness while the shipment is still in motion.
  const settled = !!(tracking.delivery_date || tracking.empty_return);
  const asOf = effectiveUpdate(tracking);
  const raw = freshness(asOf);
  const f = raw && settled ? { ...raw, stale: false } : raw;

  if (!f) {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
        <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500">
          We don't have an update time for this shipment, so these dates may have changed.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border ${
        f.stale ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"
      }`}
    >
      {f.stale ? (
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
      ) : (
        <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
      )}
      <p className={`text-xs ${f.stale ? "text-amber-800" : "text-gray-500"}`}>
        <span className="font-semibold">{f.label}</span> · {formatDate(asOf)}
        {f.stale && " — this shipment hasn't updated recently, so these dates may have changed."}
      </p>
    </div>
  );
}

function MilestoneStep({ label, date, completed, active, isLast }: { label: string; date: string; completed: boolean; active: boolean; isLast: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full border-2 mt-0.5 ${completed ? "bg-[#4CAF50] border-[#4CAF50]" : active ? "bg-white border-[#1B2A4A] ring-4 ring-blue-100" : "bg-white border-gray-300"}`} />
        {!isLast && <div className="w-px h-full bg-gray-200 min-h-[24px]" />}
      </div>
      <div className={isLast ? "" : "pb-4"}>
        <p className={`text-xs font-semibold ${completed ? "text-gray-800" : active ? "text-[#1B2A4A]" : "text-gray-400"}`}>{label}</p>
        <p className={`text-xs ${completed || active ? "text-gray-500" : "text-gray-300"}`}>{date}</p>
      </div>
    </div>
  );
}

function TrackingMilestones({ tracking, shipment }: { tracking: Tracking; shipment: Shipment }) {
  const milestones = [
    { label: "Departed Origin", date: formatDate(tracking.atd || tracking.etd), completed: !!tracking.atd, active: !tracking.atd && !!tracking.etd },
    { label: `Arrived at ${shipment.pod || "POD"}`, date: formatDate(tracking.ata || tracking.eta), completed: !!tracking.ata, active: !!tracking.atd && !tracking.ata },
    { label: "Gate Out", date: formatDate(tracking.gate_out), completed: !!tracking.gate_out, active: !!tracking.ata && !tracking.gate_out },
    { label: "Delivered", date: formatDate(tracking.delivery_date), completed: !!tracking.delivery_date, active: !!tracking.gate_out && !tracking.delivery_date },
  ];

  return (
    <div className="pl-1">
      {milestones.map((m, i) => (
        <MilestoneStep key={i} {...m} isLast={i === milestones.length - 1} />
      ))}
    </div>
  );
}

function SearchPage({ onSearch }: { onSearch: (hbl: string) => void }) {
  const [hbl, setHbl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hbl.trim()) onSearch(hbl.trim());
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-[560px]">
        <div className="bg-white rounded-2xl shadow-xl shadow-[#1B2A4A]/[0.08] border border-gray-200/80 overflow-hidden">
          <div className="bg-gradient-to-br from-[#1B2A4A] to-[#131F36] px-6 sm:px-10 pt-8 sm:pt-10 pb-6 sm:pb-8 text-center relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: `radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px), radial-gradient(circle at 60% 80%, white 1px, transparent 1px)`,
                backgroundSize: "100px 100px, 80px 80px, 120px 120px",
              }}
            />
            <div className="relative">
              <h1 className="text-lg sm:text-xl font-extrabold tracking-wide text-white mb-1.5">
                GUIDED IMPORTS
              </h1>
              <div className="w-10 h-[3px] bg-[#4CAF50] mx-auto rounded-full mb-5" />
              <div className="w-16 h-16 rounded-full bg-[#1B2A4A] border-2 border-white/20 flex items-center justify-center mx-auto mb-5">
                <Ship className="w-7 h-7 text-white/80" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                Shipment Tracking
              </h2>
              <p className="text-sm sm:text-base text-gray-300/80 max-w-md mx-auto">
                Enter your HBL number to view real-time tracking details.
              </p>
            </div>
          </div>

          <div className="px-6 sm:px-10 py-6 sm:py-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="hbl" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  HBL Number
                </label>
                <div className="relative">
                  <input
                    id="hbl"
                    type="text"
                    value={hbl}
                    onChange={(e) => setHbl(e.target.value.toUpperCase())}
                    placeholder="e.g. AHMS26010120"
                    className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 focus:border-[#1B2A4A]/40 transition"
                    autoFocus
                  />
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
              <button
                type="submit"
                disabled={!hbl.trim()}
                className="w-full py-3 bg-[#1B2A4A] text-white text-sm font-bold rounded-xl hover:bg-[#131F36] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Track Shipment
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by <span className="font-semibold text-gray-500">Guided Imports</span>
        </p>
      </div>
    </div>
  );
}

function ResultsPage({ data, hbl, onBack }: { data: TrackingResponse; hbl: string; onBack: () => void }) {
  const { shipment, tracking, t49 } = data;

  // The Monday Tracking board is now the deduplicated canonical source (owned by
  // the new tracking service). The raw Terminal49 DataSync sheet below is NOT
  // deduplicated: a re-booked container has several T49 objects sharing one HBL,
  // and the lookup can surface a stale/dead one (e.g. an old ETA the customer
  // misreads as an arrival). So when Monday has tracking data, trust it and
  // suppress the raw T49 block; only fall back to that block when Monday has no
  // tracking at all, so a shipment missing its board link still shows something.
  const hasMondayTracking = !!(tracking.etd || tracking.atd || tracking.eta || tracking.ata);

  return (
    <div className="flex-1 px-4 py-6 sm:py-8">
      <div className="w-full max-w-[720px] mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 transition">
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-[#1B2A4A]">{shipment.hbl || hbl}</h1>
            <p className="text-xs text-gray-500">{shipment.name}</p>
          </div>
          <StatusBadge status={shipment.status} />
        </div>

        <div className="bg-gradient-to-br from-[#1B2A4A] to-[#131F36] rounded-xl p-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div className="text-center flex-1">
              <p className="text-xs text-gray-400 font-medium mb-1">Origin</p>
              <p className="text-base font-bold">{shipment.pol || "—"}</p>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-px bg-white/20" />
              <Ship className="w-5 h-5 text-[#4CAF50] shrink-0" />
              <div className="flex-1 h-px bg-white/20" />
            </div>
            <div className="text-center flex-1">
              <p className="text-xs text-gray-400 font-medium mb-1">Destination</p>
              <p className="text-base font-bold">{shipment.destination || shipment.pod || "—"}</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-white/10 text-xs text-gray-300">
            {shipment.vessel && (
              <span className="flex items-center gap-1.5">
                <Anchor className="w-3 h-3" />
                {shipment.vessel} {shipment.voyage && `/ ${shipment.voyage}`}
              </span>
            )}
            {shipment.ssl && <span>{shipment.ssl}</span>}
            {shipment.mode && <span className="px-2 py-0.5 bg-white/10 rounded-full">{shipment.mode}</span>}
          </div>
        </div>

        <TrackingStatusNote tracking={tracking} />

        {(tracking.etd || tracking.atd) && (
          <Card title="Tracking Progress" icon={MapPin}>
            <TrackingMilestones tracking={tracking} shipment={shipment} />
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Card title="Dates" icon={Clock}>
            <InfoRow label="ETD" value={formatDate(tracking.etd)} />
            <InfoRow label="ATD" value={formatDate(tracking.atd)} />
            <InfoRow label="ETA" value={formatDate(tracking.eta)} />
            <InfoRow label="ATA" value={formatDate(tracking.ata)} />
            {tracking.lfd && <InfoRow label="Last Free Day" value={formatDate(tracking.lfd)} />}
            {tracking.delivery_date && <InfoRow label="Delivery" value={formatDate(tracking.delivery_date)} />}
          </Card>

          <Card title="Shipment Details" icon={Package}>
            <InfoRow label="HBL" value={shipment.hbl} />
            <InfoRow label="Container" value={shipment.container_number} />
            <InfoRow label="Incoterm" value={shipment.incoterm} />
            {tracking.available_for_pickup && <InfoRow label="Available" value={tracking.available_for_pickup} />}
            {tracking.holds && <InfoRow label="Holds" value={tracking.holds} />}
            {tracking.terminal_location && <InfoRow label="Terminal" value={tracking.terminal_location} />}
          </Card>
        </div>

        {!hasMondayTracking && t49.found && t49.containers.length > 0 && (
          <Card title="Container Tracking" icon={Truck}>
            {t49.containers.map((c, i) => (
              <div key={i} className={i > 0 ? "mt-4 pt-4 border-t border-gray-100" : ""}>
                <p className="text-sm font-bold text-gray-800 mb-3">{c.container_number}</p>
                <div className="grid grid-cols-2 gap-x-6">
                  <InfoRow label="Departed" value={formatDate(c.pol_atd_at)} />
                  <InfoRow label="ETA" value={formatDate(c.pod_eta_at)} />
                  <InfoRow label="Arrived" value={formatDate(c.pod_arrived_at)} />
                  <InfoRow label="Discharged" value={formatDate(c.pod_discharged_at)} />
                  <InfoRow label="Last Free Day" value={formatDate(c.pod_last_free_day)} />
                  <InfoRow label="Gate Out" value={formatDate(c.pod_full_out_at)} />
                  {c.holds_at_pod_terminal && <InfoRow label="Holds" value={c.holds_at_pod_terminal} />}
                  {c.available_for_pickup && <InfoRow label="Available" value={c.available_for_pickup} />}
                  {c.location_at_pod_terminal && <InfoRow label="Location" value={c.location_at_pod_terminal} />}
                  {c.equipment && <InfoRow label="Equipment" value={c.equipment} />}
                </div>
              </div>
            ))}
          </Card>
        )}

        <div className="text-center pb-4">
          <p className="text-xs text-gray-400">
            Need help? Contact{" "}
            <a href="mailto:track-trace@guidedimports.com" className="text-[#4CAF50] font-semibold hover:text-[#43A047]">
              track-trace@guidedimports.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Customer Portal Components ──

function CustomerPortalPage({ token }: { token: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "error" | "invalid">("loading");
  const [data, setData] = useState<CustomerResponse | null>(null);
  const [error, setError] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const didLoad = useRef(false);

  const fetchShipments = async (includeCompleted: boolean) => {
    const url = `${N8N_CUSTOMER_WEBHOOK}?token=${encodeURIComponent(token)}${includeCompleted ? "&include_completed=true" : ""}`;
    return await fetchJson<CustomerResponse>(url);
  };

  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;

    fetchShipments(false)
      .then((json) => {
        if (!json.found) {
          setState("invalid");
          return;
        }
        setData(json);
        setState("loaded");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setState("error");
      });
  }, []);

  const handleShowCompleted = async () => {
    setLoadingCompleted(true);
    try {
      const json = await fetchShipments(true);
      if (json.found) setData(json);
      setShowCompleted(true);
    } catch {
      // Silently fail -- they still have active shipments
    }
    setLoadingCompleted(false);
  };

  if (state === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#1B2A4A] animate-spin mx-auto" />
          <p className="text-sm text-gray-500 font-medium">Loading shipments...</p>
        </div>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-800">Invalid Link</h2>
          <p className="text-sm text-gray-500">This tracking link is not valid. Please contact your account representative for an updated link.</p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-800">Something Went Wrong</h2>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const activeShipments = data.shipments.filter((s) => s.group !== "Complete");
  const completedShipments = data.shipments.filter((s) => s.group === "Complete");

  return (
    <div className="flex-1 px-4 py-6 sm:py-8">
      <div className="w-full max-w-[960px] mx-auto space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#1B2A4A] to-[#131F36] rounded-xl p-6 text-white relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)`,
              backgroundSize: "100px 100px, 80px 80px",
            }}
          />
          <div className="relative">
            <p className="text-xs font-bold tracking-widest text-gray-400 mb-1">GUIDED IMPORTS</p>
            <h1 className="text-xl sm:text-2xl font-bold">{data.customer.name}</h1>
            <p className="text-sm text-gray-300 mt-1">
              {activeShipments.length} active shipment{activeShipments.length !== 1 ? "s" : ""}
              {showCompleted && completedShipments.length > 0 && (
                <span className="text-gray-400"> · {completedShipments.length} completed</span>
              )}
            </p>
          </div>
        </div>

        {/* Active Shipments */}
        <ShipmentTable shipments={activeShipments} title="Active Shipments" />

        {/* Completed toggle */}
        {!showCompleted ? (
          <div className="text-center">
            <button
              onClick={handleShowCompleted}
              disabled={loadingCompleted}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition"
            >
              {loadingCompleted ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              Show Completed Shipments
            </button>
          </div>
        ) : completedShipments.length > 0 ? (
          <ShipmentTable shipments={completedShipments} title="Completed Shipments" />
        ) : null}

        {/* Footer */}
        <div className="text-center pb-4">
          <p className="text-xs text-gray-400">
            Need help? Contact{" "}
            <a href="mailto:track-trace@guidedimports.com" className="text-[#4CAF50] font-semibold hover:text-[#43A047]">
              track-trace@guidedimports.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function DateCell({ actual, estimated }: { actual: string | null; estimated: string | null }) {
  if (actual) return <span className="text-xs text-gray-700 font-medium">{formatDate(actual)}</span>;
  if (estimated) return <span className="text-xs text-gray-500 italic">{formatDate(estimated)}</span>;
  return <span className="text-xs text-gray-300">—</span>;
}

function ShipmentRow({ s }: { s: CustomerShipment }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Desktop row */}
      <tr
        className="hidden sm:table-row border-b border-gray-50 hover:bg-gray-50/50 transition cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-5 py-3">
          <a href={`/tracking/${s.hbl}`} className="text-sm font-bold text-[#1B2A4A] hover:underline" onClick={(e) => e.stopPropagation()}>{s.hbl}</a>
          <p className="text-xs text-gray-400">{s.sq}</p>
        </td>
        <td className="px-3 py-3 text-sm text-gray-700">{s.container_number || "—"}</td>
        <td className="px-3 py-3"><StatusBadge status={s.status} /></td>
        <td className="px-3 py-3">
          <p className="text-xs text-gray-600">{s.pol}</p>
          <p className="text-xs text-gray-400">{s.destination || s.pod}</p>
        </td>
        <td className="px-3 py-3"><DateCell actual={s.atd} estimated={s.etd} /></td>
        <td className="px-3 py-3"><DateCell actual={s.ata} estimated={s.eta} /></td>
        <td className="px-3 py-3 text-xs text-gray-700">{s.delivery_date ? formatDate(s.delivery_date) : <span className="text-gray-300">—</span>}</td>
        <td className="px-3 py-3">
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </td>
      </tr>
      {/* Desktop expanded */}
      {expanded && (
        <tr className="hidden sm:table-row border-b border-gray-100 bg-gray-50/30">
          <td colSpan={8} className="px-5 py-4">
            <div className="grid grid-cols-4 gap-x-8 gap-y-1">
              <InfoRow label="Gate Out" value={formatDate(s.gate_out)} />
              <InfoRow label="LFD" value={formatDate(s.lfd)} />
              <InfoRow label="SSL" value={s.ssl || "—"} />
              <InfoRow label="Mode" value={s.mode || "—"} />
            </div>
          </td>
        </tr>
      )}

      {/* Mobile card */}
      <div className="sm:hidden border-b border-gray-100">
        <div
          className="px-5 py-4 cursor-pointer hover:bg-gray-50/50 transition"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <a href={`/tracking/${s.hbl}`} className="text-sm font-bold text-[#1B2A4A]" onClick={(e) => e.stopPropagation()}>{s.hbl}</a>
              <p className="text-xs text-gray-400">{s.container_number}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={s.status} />
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>{s.pol} → {s.destination || s.pod}</span>
            <span className="flex items-center gap-1">Dep <DateCell actual={s.atd} estimated={s.etd} /></span>
            <span className="flex items-center gap-1">Arr <DateCell actual={s.ata} estimated={s.eta} /></span>
          </div>
        </div>
        {expanded && (
          <div className="px-5 pb-4 bg-gray-50/30">
            <div className="grid grid-cols-2 gap-x-6">
              <InfoRow label="Gate Out" value={formatDate(s.gate_out)} />
              <InfoRow label="LFD" value={formatDate(s.lfd)} />
              <InfoRow label="Delivery" value={formatDate(s.delivery_date)} />
              <InfoRow label="SSL" value={s.ssl || "—"} />
              <InfoRow label="Mode" value={s.mode || "—"} />
              <InfoRow label="Vessel" value={s.vessel || "—"} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ShipmentTable({ shipments, title }: { shipments: CustomerShipment[]; title: string }) {
  if (!shipments.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-8 text-center">
        <p className="text-sm text-gray-400">No {title.toLowerCase()} found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm shadow-gray-100/50 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
        <Package className="w-4 h-4 text-[#1B2A4A]" />
        <h3 className="text-sm font-bold text-[#1B2A4A]">{title}</h3>
        <span className="text-xs text-gray-400 ml-auto">{shipments.length} shipment{shipments.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-5 py-3">HBL</th>
              <th className="px-3 py-3">Container</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Route</th>
              <th className="px-3 py-3">Departure</th>
              <th className="px-3 py-3">Arrival</th>
              <th className="px-3 py-3">Delivery</th>
              <th className="px-3 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => (
              <ShipmentRow key={s.item_id} s={s} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden">
        {shipments.map((s) => (
          <ShipmentRow key={s.item_id} s={s} />
        ))}
      </div>
    </div>
  );
}

// ── Router ──

type Route =
  | { page: "search" }
  | { page: "tracking"; hbl: string }
  | { page: "customer"; token: string };

function parseRoute(): Route {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  // Handle old /shipment-tracker/?token=X URL
  if (path.match(/^\/shipment-tracker\/?$/i) && params.get("token")) {
    const token = params.get("token")!;
    window.history.replaceState(null, "", `/customer/${encodeURIComponent(token)}`);
    return { page: "customer", token };
  }

  const customerMatch = path.match(/^\/customer\/(.+)$/i);
  if (customerMatch) return { page: "customer", token: decodeURIComponent(customerMatch[1]) };

  const trackingMatch = path.match(/^\/tracking\/(.+)$/i);
  if (trackingMatch) return { page: "tracking", hbl: decodeURIComponent(trackingMatch[1]).toUpperCase() };

  return { page: "search" };
}

export default function App() {
  const [state, setState] = useState<"search" | "loading" | "results" | "error" | "not_found" | "customer">("search");
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [searchHbl, setSearchHbl] = useState("");
  const [error, setError] = useState("");
  const [customerToken, setCustomerToken] = useState("");

  const didAutoSearch = useRef(false);

  const handleSearch = async (hbl: string) => {
    setSearchHbl(hbl);
    setState("loading");
    setError("");
    window.history.replaceState(null, "", `/tracking/${encodeURIComponent(hbl)}`);

    try {
      const json = await fetchJson<TrackingResponse>(
        `${N8N_HBL_WEBHOOK}?hbl=${encodeURIComponent(hbl)}`
      );

      if (!json.found) {
        setState("not_found");
        return;
      }

      setData(json);
      setState("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setState("error");
    }
  };

  useEffect(() => {
    if (didAutoSearch.current) return;
    didAutoSearch.current = true;

    const route = parseRoute();
    if (route.page === "tracking") {
      handleSearch(route.hbl);
    } else if (route.page === "customer") {
      setCustomerToken(route.token);
      setState("customer");
    }
  }, []);

  const handleBack = () => {
    setState("search");
    setData(null);
    setSearchHbl("");
    window.history.replaceState(null, "", "/tracking");
  };

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      {state === "search" && <SearchPage onSearch={handleSearch} />}

      {state === "loading" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 text-[#1B2A4A] animate-spin mx-auto" />
            <p className="text-sm text-gray-500 font-medium">Looking up {searchHbl}...</p>
          </div>
        </div>
      )}

      {state === "results" && data && (
        <ResultsPage data={data} hbl={searchHbl} onBack={handleBack} />
      )}

      {state === "customer" && customerToken && (
        <CustomerPortalPage token={customerToken} />
      )}

      {state === "not_found" && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 max-w-sm">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">Shipment Not Found</h2>
            <p className="text-sm text-gray-500">
              We couldn't find a shipment with HBL <span className="font-semibold text-gray-700">{searchHbl}</span>. Please check the number and try again.
            </p>
            <button onClick={handleBack} className="px-6 py-2.5 bg-[#1B2A4A] text-white text-sm font-bold rounded-xl hover:bg-[#131F36] transition">
              Try Again
            </button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 max-w-sm">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">Something Went Wrong</h2>
            <p className="text-sm text-gray-500">{error}</p>
            <button onClick={handleBack} className="px-6 py-2.5 bg-[#1B2A4A] text-white text-sm font-bold rounded-xl hover:bg-[#131F36] transition">
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
