import { useEffect, useState } from "react";
import { getAlerts, resolveAlert, getCameras, startCamera, stopCamera, getAccessLogs, triggerWeeklyReset } from "../services/api";
import { connectAlerts, disconnectAlerts } from "../services/websocket";
import { useStore } from "../store";
import { formatDistanceToNow } from "date-fns";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const ALERT_COLORS: Record<string, string> = {
  unknown_person: "bg-red-600",
  unknown_vehicle: "bg-orange-600",
  overdue_visitor: "bg-purple-700",
  visitor_incoming: "bg-blue-600",
  visitor_left_building: "bg-yellow-600",
};

export default function Dashboard() {
  const { t, user, liveAlerts, pushAlert, clearAlert } = useStore();
  const isRTL = useStore((s) => s.lang === "ar");
  const [alerts, setAlerts] = useState<any[]>([]);
  const [cameras, setCameras] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  const loadData = async () => {
    const [a, c, l] = await Promise.all([getAlerts(), getCameras(), getAccessLogs()]);
    setAlerts(a);
    setCameras(c);
    setLogs(l);
  };

  useEffect(() => {
    loadData();
    const handler = (payload: any) => { pushAlert(payload); loadData(); };
    connectAlerts(handler);
    return () => disconnectAlerts(handler);
  }, []);

  const handleResolve = async (id: number) => {
    await resolveAlert(id);
    clearAlert(id);
    loadData();
  };

  const handleReset = async () => {
    if (window.confirm(t.resetConfirm)) {
      await triggerWeeklyReset();
      loadData();
    }
  };

  return (
    <div className={`p-4 space-y-6 ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>

      {/* Live alert banners */}
      {liveAlerts.length > 0 && (
        <div className="space-y-2">
          {liveAlerts.map((a, i) => (
            <div key={i}
              className={`flex items-start gap-4 ${ALERT_COLORS[a.type] || "bg-gray-700"} text-white rounded-xl p-4 shadow-lg`}>
              {a.snapshot && (
                <img src={`${BASE_URL}${a.snapshot}`} alt="snapshot"
                  className="w-24 h-16 object-cover rounded-lg flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className="font-bold text-lg">{a.title}</p>
                <p className="text-sm opacity-90">{a.message}</p>
                {a.camera_name && (
                  <p className="text-xs opacity-70 mt-1">
                    📷 {a.camera_name} — {a.location} — {a.building}
                  </p>
                )}
                {a.visitor_name && (
                  <p className="text-xs opacity-70 mt-1">👤 {a.visitor_name}</p>
                )}
                <p className="text-xs opacity-50 mt-1">{new Date(a.timestamp).toLocaleString()}</p>
              </div>
              {a.alert_id && (
                <button onClick={() => handleResolve(a.alert_id!)}
                  className="bg-white text-gray-800 font-semibold px-3 py-1 rounded-lg text-sm flex-shrink-0">
                  {t.resolve}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label={t.activeCameras} value={cameras.filter((c) => c.is_active).length} color="blue" />
        <StatCard label={t.openAlerts} value={alerts.length} color="red" />
        <StatCard label={t.recentEvents} value={logs.length} color="green" />
      </div>

      {/* Admin-only: cameras + weekly reset */}
      {(user?.role === "super_admin" || user?.role === "building_admin") && (
        <>
          <section>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-semibold">{t.activeCameras}</h2>
              {user?.role === "super_admin" && (
                <button onClick={handleReset}
                  className="text-sm text-red-600 border border-red-300 px-3 py-1 rounded-lg hover:bg-red-50">
                  {t.resetNow}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {cameras.map((cam) => (
                <div key={cam.id} className="bg-white rounded-xl shadow p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{cam.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${cam.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {cam.is_active ? t.active : t.inactive}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{cam.location_description}</p>
                  <button onClick={() => (cam.running ? stopCamera(cam.id) : startCamera(cam.id)).then(loadData)}
                    className="w-full text-sm bg-blue-600 text-white rounded-lg py-1.5 hover:bg-blue-700">
                    {cam.running ? t.stopProcessing : t.startProcessing}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Recent alerts */}
      <section>
        <h2 className="text-xl font-semibold mb-3">{t.alerts}</h2>
        <div className="bg-white rounded-xl shadow divide-y">
          {alerts.slice(0, 10).map((a) => (
            <div key={a.id} className="flex items-center gap-4 p-4">
              {a.snapshot_path && (
                <img src={`${BASE_URL}/snapshots/${a.snapshot_path.split("/").pop()}`}
                  alt="snap" className="w-16 h-12 object-cover rounded-lg flex-shrink-0" />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    a.alert_type === "overdue_visitor" ? "bg-purple-100 text-purple-700" :
                    a.alert_type === "unknown_vehicle" ? "bg-orange-100 text-orange-700" :
                    "bg-red-100 text-red-700"
                  }`}>{a.alert_type?.replace("_", " ")}</span>
                </div>
                <p className="font-medium text-sm mt-1">{a.message}</p>
                <p className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </p>
              </div>
              <button onClick={() => handleResolve(a.id)}
                className="text-sm text-blue-600 hover:underline flex-shrink-0">{t.resolve}</button>
            </div>
          ))}
          {alerts.length === 0 && (
            <p className="p-6 text-gray-400 text-center">{t.noAlerts}</p>
          )}
        </div>
      </section>

      {/* Access log — super_admin and building_admin only */}
      {(user?.role === "super_admin" || user?.role === "building_admin") && (
        <section>
          <h2 className="text-xl font-semibold mb-3">{t.accessLog}</h2>
          <div className="bg-white rounded-xl shadow overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="p-3 text-left">{t.time}</th>
                  <th className="p-3 text-left">{t.camera}</th>
                  <th className="p-3 text-left">{t.event}</th>
                  <th className="p-3 text-left">{t.person}</th>
                  <th className="p-3 text-left">{t.confidence}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((l) => (
                  <tr key={l.id} className={l.is_unknown ? "bg-red-50" : ""}>
                    <td className="p-3">{new Date(l.timestamp).toLocaleString()}</td>
                    <td className="p-3">#{l.camera_id}</td>
                    <td className="p-3 capitalize">{l.event_type}</td>
                    <td className="p-3">
                      {l.is_unknown
                        ? <span className="text-red-600 font-semibold">{t.unknown}</span>
                        : `#${l.person_id}`}
                    </td>
                    <td className="p-3">{l.confidence ? `${(l.confidence * 100).toFixed(1)}%` : "—"}</td>
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

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
    green: "bg-green-50 text-green-700",
  };
  return (
    <div className={`rounded-xl p-4 ${colors[color]}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm mt-1">{label}</p>
    </div>
  );
}
