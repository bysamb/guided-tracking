import { useState } from "react";
import { Search, Ship, MapPin, Package, Clock, AlertTriangle, Loader2, ArrowLeft, Anchor, Truck } from "lucide-react";

const N8N_WEBHOOK = "https://n8n.srv1361720.hstgr.cloud/webhook/hbl-tracking";

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

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusColor(status: string): { bg: string; text: string; dot: string } {
  const s = status.toLowerCase();
  if (s.includes("delivered") || s.includes("completed")) return { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" };
  if (s.includes("transit")) return { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" };
  if (s.includes("arrived") || s.includes("gated out")) return { bg: "bg-teal-50", text: "text-teal-700", dot: "bg-teal-500" };
  if (s.includes("hold")) return { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" };
  if (s.includes("canceled")) return { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" };
  if (s.includes("pending") || s.includes("booked") || s.includes("awaiting")) return { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" };
  return { bg: "bg-gray-50", text: "text-gray-700", dot: "bg-gray-400" };
}

function StatusBadge({ status }: { status: string }) {
  if (!status) return null;
  const c = statusColor(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
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

  return (
    <div className="flex-1 px-4 py-6 sm:py-8">
      <div className="w-full max-w-[720px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 transition">
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-[#1B2A4A]">
              {shipment.hbl || hbl}
            </h1>
            <p className="text-xs text-gray-500">{shipment.name}</p>
          </div>
          <StatusBadge status={shipment.status} />
        </div>

        {/* Route summary */}
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

        {/* Milestones */}
        {(tracking.etd || tracking.atd) && (
          <Card title="Tracking Progress" icon={MapPin}>
            <TrackingMilestones tracking={tracking} shipment={shipment} />
          </Card>
        )}

        {/* Key dates */}
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

        {/* T49 Container details */}
        {t49.found && t49.containers.length > 0 && (
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

export default function App() {
  const [state, setState] = useState<"search" | "loading" | "results" | "error" | "not_found">("search");
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [searchHbl, setSearchHbl] = useState("");
  const [error, setError] = useState("");

  const handleSearch = async (hbl: string) => {
    setSearchHbl(hbl);
    setState("loading");
    setError("");

    try {
      const res = await fetch(`${N8N_WEBHOOK}?hbl=${encodeURIComponent(hbl)}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const json: TrackingResponse = await res.json();

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

  const handleBack = () => {
    setState("search");
    setData(null);
    setSearchHbl("");
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
