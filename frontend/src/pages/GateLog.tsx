import { useEffect, useState } from "react";
import { getVisitorLogs, createVisitorLog, visitorLeftCompound, getBuildings } from "../services/api";
import { useStore } from "../store";
import { formatDistanceToNow } from "date-fns";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const VISITOR_TYPES = ["visitor", "supermarket", "shipping", "restaurant", "maintenance", "other"];

export default function GateLog() {
  const { t, user } = useStore();
  const isRTL = useStore((s) => s.lang === "ar");
  const [logs, setLogs] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    visitor_name: "",
    visitor_type: "visitor",
    destination_building_id: "",
    destination_apartment: "",
    vehicle_plate: "",
    notes: "",
  });

  const load = async () => {
    const [l, b] = await Promise.all([
      getVisitorLogs(),
      getBuildings(user?.building_group_id),
    ]);
    setLogs(l);
    setBuildings(b);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createVisitorLog({
        ...form,
        destination_building_id: Number(form.destination_building_id),
      });
      setShowForm(false);
      setForm({ visitor_name: "", visitor_type: "visitor", destination_building_id: "", destination_apartment: "", vehicle_plate: "", notes: "" });
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeftCompound = async (id: number) => {
    await visitorLeftCompound(id);
    load();
  };

  const statusColor: Record<string, string> = {
    entered_compound: "bg-yellow-100 text-yellow-800",
    arrived_building: "bg-blue-100 text-blue-800",
    left_building: "bg-orange-100 text-orange-800",
    left_compound: "bg-green-100 text-green-800",
    overdue: "bg-red-100 text-red-800",
  };

  const active = logs.filter((l) => l.status !== "left_compound");
  const done = logs.filter((l) => l.status === "left_compound");

  return (
    <div className={`p-4 space-y-4 ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">{t.gateLog}</h2>
        <button onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium">
          + {t.logVisitor}
        </button>
      </div>

      {/* New visitor form */}
      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-md p-5 space-y-3 max-w-lg border border-blue-100">
          <h3 className="font-semibold text-lg">{t.logVisitor}</h3>

          <input value={form.visitor_name} onChange={(e) => setForm({ ...form, visitor_name: e.target.value })}
            placeholder={t.visitorName} required className="w-full border rounded-lg px-3 py-2" />

          <select value={form.visitor_type} onChange={(e) => setForm({ ...form, visitor_type: e.target.value })}
            className="w-full border rounded-lg px-3 py-2">
            {VISITOR_TYPES.map((vt) => (
              <option key={vt} value={vt}>{(t as any)[vt]}</option>
            ))}
          </select>

          <select value={form.destination_building_id}
            onChange={(e) => setForm({ ...form, destination_building_id: e.target.value })}
            required className="w-full border rounded-lg px-3 py-2">
            <option value="">{t.destinationBuilding}</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <input value={form.destination_apartment}
            onChange={(e) => setForm({ ...form, destination_apartment: e.target.value })}
            placeholder={t.apartment} required className="w-full border rounded-lg px-3 py-2" />

          <input value={form.vehicle_plate}
            onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })}
            placeholder={t.vehiclePlate} className="w-full border rounded-lg px-3 py-2" />

          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder={t.notes} rows={2} className="w-full border rounded-lg px-3 py-2" />

          <div className="flex gap-2">
            <button type="submit" disabled={submitting}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg disabled:opacity-50">
              {t.enterCompound}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="border px-4 py-2 rounded-lg">{t.cancel}</button>
          </div>
        </form>
      )}

      {/* Active visitors */}
      <section>
        <h3 className="font-semibold text-gray-700 mb-2">Active ({active.length})</h3>
        <div className="space-y-3">
          {active.map((vl) => (
            <VisitorCard key={vl.id} vl={vl} t={t} statusColor={statusColor}
              isRTL={isRTL}
              action={vl.status === "left_building" || vl.status === "overdue" ? (
                <button onClick={() => handleLeftCompound(vl.id)}
                  className="bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-700">
                  {t.confirmLeftCompound}
                </button>
              ) : null}
            />
          ))}
          {active.length === 0 && <p className="text-gray-400 text-center py-6">—</p>}
        </div>
      </section>

      {/* Completed */}
      {done.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-500 mb-2">Completed today ({done.length})</h3>
          <div className="space-y-2">
            {done.slice(0, 10).map((vl) => (
              <VisitorCard key={vl.id} vl={vl} t={t} statusColor={statusColor} isRTL={isRTL} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function VisitorCard({ vl, t, statusColor, isRTL, action }: any) {
  const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
  return (
    <div className={`bg-white rounded-xl shadow p-4 flex gap-4 border-l-4 ${
      vl.status === "overdue" ? "border-red-500" :
      vl.status === "left_building" ? "border-orange-400" :
      vl.status === "left_compound" ? "border-green-400" : "border-blue-400"
    }`}>
      {vl.photo_path && (
        <img src={`${BASE_URL}/snapshots/${vl.photo_path.split("/").pop()}`}
          alt="visitor" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
      )}
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">{vl.visitor_name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[vl.status]}`}>
            {(t as any)[vl.status]}
          </span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {(t as any)[vl.visitor_type]}
          </span>
        </div>
        <p className="text-sm text-gray-600">
          {t.building}: {vl.destination_building} — {t.apartment}: {vl.destination_apartment}
        </p>
        {vl.vehicle_plate && (
          <p className="text-sm text-gray-500">🚗 {vl.vehicle_plate}</p>
        )}
        <p className="text-xs text-gray-400">
          {formatDistanceToNow(new Date(vl.entered_compound_at), { addSuffix: true })}
        </p>
      </div>
      {action && <div className="flex items-center">{action}</div>}
    </div>
  );
}
