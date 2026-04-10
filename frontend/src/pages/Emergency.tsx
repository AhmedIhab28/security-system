import { useEffect, useState } from "react";
import { logEmergency, emergencyLeft, getEmergencyLogs, getBuildings } from "../services/api";
import { useStore } from "../store";
import { formatDistanceToNow, format } from "date-fns";

const EMERGENCY_ICONS: Record<string, string> = {
  police: "🚔", ambulance: "🚑", fire: "🚒", other: "🚨",
};

export default function Emergency() {
  const { t, user } = useStore();
  const isRTL = useStore((s) => s.lang === "ar");
  const [logs, setLogs] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    emergency_type: "police",
    vehicle_plate: "",
    description: "",
    destination_building_id: "",
    destination_apartment: "",
  });

  const load = async () => {
    const [l, b] = await Promise.all([getEmergencyLogs(), getBuildings()]);
    setLogs(l);
    setBuildings(b);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await logEmergency({
      ...form,
      destination_building_id: form.destination_building_id ? Number(form.destination_building_id) : null,
    });
    setShowForm(false);
    setForm({ emergency_type: "police", vehicle_plate: "", description: "", destination_building_id: "", destination_apartment: "" });
    load();
  };

  const handleLeft = async (id: number) => {
    await emergencyLeft(id);
    load();
  };

  const active = logs.filter((l) => l.status === "entered");
  const done = logs.filter((l) => l.status === "left");

  return (
    <div className={`p-4 space-y-4 ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          🚨 {t.emergency}
        </h2>
        <button onClick={() => setShowForm(true)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium">
          + {t.logEmergency}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow p-5 space-y-3 max-w-lg border-2 border-red-200">
          <h3 className="font-semibold text-red-700">{t.logEmergency}</h3>

          <div className="grid grid-cols-2 gap-2">
            {["police", "ambulance", "fire", "other"].map((et) => (
              <button key={et} type="button"
                onClick={() => setForm({ ...form, emergency_type: et })}
                className={`py-3 rounded-xl border-2 font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
                  form.emergency_type === et
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}>
                {EMERGENCY_ICONS[et]} {(t as any)[et]}
              </button>
            ))}
          </div>

          <input value={form.vehicle_plate}
            onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })}
            placeholder={`${t.plate} (optional)`} className="w-full border rounded-lg px-3 py-2" />

          <select value={form.destination_building_id}
            onChange={(e) => setForm({ ...form, destination_building_id: e.target.value })}
            className="w-full border rounded-lg px-3 py-2">
            <option value="">{t.destinationBuilding} (optional)</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <input value={form.destination_apartment}
            onChange={(e) => setForm({ ...form, destination_apartment: e.target.value })}
            placeholder={`${t.apartment} (optional)`} className="w-full border rounded-lg px-3 py-2" />

          <textarea value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={t.notes} rows={2} className="w-full border rounded-lg px-3 py-2" />

          <div className="flex gap-2">
            <button type="submit"
              className="bg-red-600 text-white px-5 py-2 rounded-lg hover:bg-red-700 font-medium">
              {t.emergencyEntered}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="border px-4 py-2 rounded-lg">{t.cancel}</button>
          </div>
        </form>
      )}

      {/* Active */}
      <section>
        <h3 className="font-semibold text-gray-700 mb-2">Active ({active.length})</h3>
        <div className="space-y-3">
          {active.map((el) => (
            <div key={el.id}
              className="bg-white rounded-xl shadow p-4 flex gap-4 border-l-4 border-red-500">
              <div className="text-3xl">{EMERGENCY_ICONS[el.emergency_type]}</div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold capitalize">{(t as any)[el.emergency_type]}</span>
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                    {t.emergencyEntered}
                  </span>
                </div>
                {el.vehicle_plate && <p className="text-sm text-gray-600">🚗 {el.vehicle_plate}</p>}
                {el.destination_building && (
                  <p className="text-sm text-gray-600">
                    🏢 {el.destination_building}
                    {el.destination_apartment ? ` — Apt ${el.destination_apartment}` : ""}
                  </p>
                )}
                {el.description && <p className="text-sm text-gray-500">{el.description}</p>}
                <p className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(el.entered_at), { addSuffix: true })}
                </p>
              </div>
              <button onClick={() => handleLeft(el.id)}
                className="self-center bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-green-700 whitespace-nowrap">
                {t.confirmEmergencyLeft}
              </button>
            </div>
          ))}
          {active.length === 0 && <p className="text-gray-400 text-center py-4">—</p>}
        </div>
      </section>

      {/* History */}
      {done.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-500 mb-2">History ({done.length})</h3>
          <div className="space-y-2">
            {done.slice(0, 20).map((el) => (
              <div key={el.id}
                className="bg-white rounded-xl shadow p-3 flex gap-3 items-center opacity-70">
                <div className="text-2xl">{EMERGENCY_ICONS[el.emergency_type]}</div>
                <div className="flex-1 text-sm">
                  <span className="font-medium capitalize">{(t as any)[el.emergency_type]}</span>
                  {el.vehicle_plate && <span className="text-gray-500 ml-2">🚗 {el.vehicle_plate}</span>}
                  <p className="text-xs text-gray-400">
                    In: {format(new Date(el.entered_at), "dd/MM HH:mm")}
                    {el.left_at ? ` → Out: ${format(new Date(el.left_at), "HH:mm")}` : ""}
                  </p>
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {t.emergencyLeft}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
