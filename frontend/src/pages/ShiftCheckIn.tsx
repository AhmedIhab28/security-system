import { useEffect, useState } from "react";
import { startShift, endShift, getActiveShift, getShifts, getBuildings, getSecurityUsers } from "../services/api";
import { useStore } from "../store";
import { formatDistanceToNow, format } from "date-fns";

export default function ShiftCheckIn() {
  const { t, user } = useStore();
  const isRTL = useStore((s) => s.lang === "ar");
  const [active, setActive] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [guards, setGuards] = useState<any[]>([]);
  const [form, setForm] = useState({ post_type: "gate", post_building_id: "", post_gate_name: "" });
  const [endForm, setEndForm] = useState({ handed_over_to_id: "", handover_notes: "" });

  const load = async () => {
    const [a, b, g] = await Promise.all([getActiveShift(), getBuildings(), getSecurityUsers().catch(() => [])]);
    setActive(a);
    setBuildings(b);
    setGuards(g);
    if (user?.role === "super_admin" || user?.role === "building_admin") {
      getShifts().then(setHistory);
    }
  };

  useEffect(() => { load(); }, []);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    await startShift({
      post_type: form.post_type,
      post_building_id: form.post_building_id ? Number(form.post_building_id) : null,
      post_gate_name: form.post_gate_name || null,
    });
    load();
  };

  const handleEnd = async (e: React.FormEvent) => {
    e.preventDefault();
    await endShift({
      handed_over_to_id: endForm.handed_over_to_id ? Number(endForm.handed_over_to_id) : null,
      handover_notes: endForm.handover_notes || null,
    });
    load();
  };

  return (
    <div className={`p-4 space-y-5 max-w-2xl mx-auto ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      <h2 className="text-xl font-semibold">{t.myShift}</h2>

      {/* Active shift banner */}
      {active ? (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="font-semibold text-green-800">{t.shiftActive}</span>
            <span className="text-sm text-green-600 ml-auto">
              {formatDistanceToNow(new Date(active.shift_start), { addSuffix: true })}
            </span>
          </div>
          <div className="text-sm text-gray-700 space-y-1">
            <p>📍 {active.post_type === "gate" ? t.gate_post : t.building_post}
              {active.post_gate_name ? ` — ${active.post_gate_name}` : ""}
              {active.post_building_id ? ` — Building #${active.post_building_id}` : ""}
            </p>
            <p>🕐 {format(new Date(active.shift_start), "PPp")}</p>
          </div>

          {/* End shift form */}
          <form onSubmit={handleEnd} className="space-y-3 pt-2 border-t border-green-200">
            <h3 className="font-medium text-gray-700">{t.endShift}</h3>
            <select value={endForm.handed_over_to_id}
              onChange={(e) => setEndForm({ ...endForm, handed_over_to_id: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">{t.handoverTo} (optional)</option>
              {guards.filter((g) => g.id !== user?.id).map((g) => (
                <option key={g.id} value={g.id}>{g.full_name} ({g.role})</option>
              ))}
            </select>
            <textarea value={endForm.handover_notes}
              onChange={(e) => setEndForm({ ...endForm, handover_notes: e.target.value })}
              placeholder={t.handoverNotes} rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <button type="submit"
              className="w-full bg-red-600 text-white py-2.5 rounded-xl font-semibold hover:bg-red-700">
              {t.endShift}
            </button>
          </form>
        </div>
      ) : (
        /* Start shift form */
        <form onSubmit={handleStart}
          className="bg-white rounded-xl shadow p-5 space-y-4 border border-blue-100">
          <h3 className="font-semibold text-gray-700">{t.startShift}</h3>

          <div>
            <label className="text-sm text-gray-600 block mb-1">{t.postType}</label>
            <div className="flex gap-3">
              {["gate", "building"].map((pt) => (
                <button key={pt} type="button"
                  onClick={() => setForm({ ...form, post_type: pt })}
                  className={`flex-1 py-2.5 rounded-xl border-2 font-medium text-sm transition-colors ${
                    form.post_type === pt
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}>
                  {pt === "gate" ? `🚪 ${t.gate_post}` : `🏢 ${t.building_post}`}
                </button>
              ))}
            </div>
          </div>

          {form.post_type === "gate" && (
            <input value={form.post_gate_name}
              onChange={(e) => setForm({ ...form, post_gate_name: e.target.value })}
              placeholder={`${t.gateName} (e.g. Main Gate)`}
              className="w-full border rounded-lg px-3 py-2" />
          )}

          {form.post_type === "building" && (
            <select value={form.post_building_id}
              onChange={(e) => setForm({ ...form, post_building_id: e.target.value })}
              required className="w-full border rounded-lg px-3 py-2">
              <option value="">{t.selectPost}</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}

          <button type="submit"
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700">
            {t.startShift}
          </button>
        </form>
      )}

      {/* Shift history — admins only */}
      {history.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-700 mb-3">{t.shiftLog}</h3>
          <div className="bg-white rounded-xl shadow overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="p-3 text-left">Guard</th>
                  <th className="p-3 text-left">Post</th>
                  <th className="p-3 text-left">Start</th>
                  <th className="p-3 text-left">End</th>
                  <th className="p-3 text-left">Handover</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((s) => (
                  <tr key={s.id} className={s.is_active ? "bg-green-50" : ""}>
                    <td className="p-3 font-medium">{s.guard_name}</td>
                    <td className="p-3">
                      {s.post_type === "gate" ? `🚪 ${s.post_gate_name || "Gate"}` : `🏢 ${s.post_building}`}
                    </td>
                    <td className="p-3">{format(new Date(s.shift_start), "dd/MM HH:mm")}</td>
                    <td className="p-3">{s.shift_end ? format(new Date(s.shift_end), "dd/MM HH:mm") : <span className="text-green-600 font-medium">Active</span>}</td>
                    <td className="p-3 text-gray-500">{s.handed_over_to || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
