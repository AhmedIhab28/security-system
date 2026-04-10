import { useEffect, useState } from "react";
import { getAlerts, resolveAlert } from "../services/api";
import { useStore } from "../store";
import { formatDistanceToNow } from "date-fns";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const TYPE_STYLE: Record<string, string> = {
  unknown_person: "border-red-500 bg-red-50",
  unknown_vehicle: "border-orange-500 bg-orange-50",
  overdue_visitor: "border-purple-500 bg-purple-50",
};

const BADGE: Record<string, string> = {
  unknown_person: "bg-red-100 text-red-700",
  unknown_vehicle: "bg-orange-100 text-orange-700",
  overdue_visitor: "bg-purple-100 text-purple-700",
};

export default function Alerts() {
  const { t } = useStore();
  const isRTL = useStore((s) => s.lang === "ar");
  const [alerts, setAlerts] = useState<any[]>([]);
  const [showResolved, setShowResolved] = useState(false);

  const load = () => getAlerts(showResolved).then(setAlerts);
  useEffect(() => { load(); }, [showResolved]);

  const handleResolve = async (id: number) => {
    await resolveAlert(id);
    load();
  };

  return (
    <div className={`p-4 space-y-4 ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">{t.alerts}</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)} />
          {t.showResolved}
        </label>
      </div>

      <div className="space-y-3">
        {alerts.map((a) => (
          <div key={a.id}
            className={`bg-white rounded-xl shadow p-4 flex gap-4 border-l-4 ${TYPE_STYLE[a.alert_type] || "border-gray-300"}`}>
            {a.snapshot_path && (
              <img src={`${BASE_URL}/snapshots/${a.snapshot_path.split("/").pop()}`}
                alt="snapshot" className="w-28 h-20 object-cover rounded-lg flex-shrink-0" />
            )}
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE[a.alert_type] || "bg-gray-100 text-gray-600"}`}>
                  {a.alert_type?.replace(/_/g, " ")}
                </span>
                {a.is_resolved && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{t.resolved}</span>
                )}
              </div>
              <p className="font-semibold text-sm">{a.message}</p>
              <div className="flex gap-3 text-xs text-gray-500 flex-wrap">
                {a.camera_id && <span>📷 #{a.camera_id}</span>}
                {a.building_id && <span>🏢 #{a.building_id}</span>}
                <span>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
              </div>
              {a.is_resolved && a.resolved_by && (
                <p className="text-xs text-gray-400">{t.resolved} by #{a.resolved_by}</p>
              )}
            </div>
            {!a.is_resolved && (
              <button onClick={() => handleResolve(a.id)}
                className="self-start bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 flex-shrink-0">
                {t.resolve}
              </button>
            )}
          </div>
        ))}
        {alerts.length === 0 && (
          <p className="text-center text-gray-400 py-16">{t.noAlerts}</p>
        )}
      </div>
    </div>
  );
}
