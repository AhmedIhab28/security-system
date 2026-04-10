import { useEffect, useState } from "react";
import { getAlerts, resolveAlert, triggerWeeklyReset } from "../services/api";
import { connectAlerts, disconnectAlerts } from "../services/websocket";
import { useStore } from "../store";
import { formatDistanceToNow } from "date-fns";

const ALERT_COLORS: Record<string, string> = {
  overdue_visitor: "bg-purple-700",
  visitor_incoming: "bg-blue-600",
  visitor_left_building: "bg-yellow-600",
  resident_visitor_request: "bg-green-600",
};

export default function Dashboard() {
  const { t, user, liveAlerts, pushAlert, clearAlert } = useStore();
  const isRTL = useStore((s) => s.lang === "ar");
  const [alerts, setAlerts] = useState<any[]>([]);

  const loadData = async () => {
    const a = await getAlerts();
    setAlerts(a);
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
              <div className="flex-1">
                <p className="font-bold text-lg">{a.title}</p>
                <p className="text-sm opacity-90">{a.message}</p>
                {a.visitor_name && <p className="text-xs opacity-70 mt-1">👤 {a.visitor_name}</p>}
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
      <div className="grid grid-cols-2 gap-4">
        <StatCard label={t.openAlerts} value={alerts.length} color="red" />
        <StatCard label="Active Visitors" value={alerts.filter(a => !a.is_resolved).length} color="blue" />
      </div>

      {/* Weekly reset — super admin only */}
      {user?.role === "super_admin" && (
        <div className="flex justify-end">
          <button onClick={handleReset}
            className="text-sm text-red-600 border border-red-300 px-3 py-1 rounded-lg hover:bg-red-50">
            {t.resetNow}
          </button>
        </div>
      )}

      {/* Recent alerts */}
      <section>
        <h2 className="text-xl font-semibold mb-3">{t.alerts}</h2>
        <div className="bg-white rounded-xl shadow divide-y">
          {alerts.slice(0, 20).map((a) => (
            <div key={a.id} className="flex items-center gap-4 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    a.alert_type === "overdue_visitor" ? "bg-purple-100 text-purple-700" :
                    "bg-blue-100 text-blue-700"
                  }`}>{a.alert_type?.replace(/_/g, " ")}</span>
                </div>
                <p className="font-medium text-sm">{a.message}</p>
                <p className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </p>
              </div>
              {!a.is_resolved && (
                <button onClick={() => handleResolve(a.id)}
                  className="text-sm text-blue-600 hover:underline flex-shrink-0">{t.resolve}</button>
              )}
            </div>
          ))}
          {alerts.length === 0 && (
            <p className="p-6 text-gray-400 text-center">{t.noAlerts}</p>
          )}
        </div>
      </section>
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
