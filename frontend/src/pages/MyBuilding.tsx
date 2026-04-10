import { useEffect, useState } from "react";
import { getVisitorLogs, visitorArrived, visitorLeftBuilding } from "../services/api";
import { useStore } from "../store";
import { formatDistanceToNow } from "date-fns";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function MyBuilding() {
  const { t, user } = useStore();
  const isRTL = useStore((s) => s.lang === "ar");
  const [logs, setLogs] = useState<any[]>([]);

  const load = async () => {
    // Building guard only sees visitors heading to their assigned building
    const all = await getVisitorLogs({ building_id: user?.assigned_building_id ?? undefined });
    setLogs(all.filter((l: any) => l.status !== "left_compound"));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const handleArrived = async (id: number) => {
    await visitorArrived(id);
    load();
  };

  const handleLeftBuilding = async (id: number) => {
    await visitorLeftBuilding(id);
    load();
  };

  const statusColor: Record<string, string> = {
    entered_compound: "bg-yellow-100 text-yellow-800",
    arrived_building: "bg-blue-100 text-blue-800",
    left_building: "bg-orange-100 text-orange-800",
    overdue: "bg-red-100 text-red-800",
  };

  const incoming = logs.filter((l) => l.status === "entered_compound");
  const inside = logs.filter((l) => l.status === "arrived_building");
  const leftBuilding = logs.filter((l) => l.status === "left_building" || l.status === "overdue");

  return (
    <div className={`p-4 space-y-5 ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      <h2 className="text-xl font-semibold">{t.myBuilding}</h2>

      {/* Incoming — gate guard just logged them */}
      <Section title={`${t.incomingVisitor} (${incoming.length})`} color="yellow">
        {incoming.map((vl) => (
          <VisitorRow key={vl.id} vl={vl} t={t} statusColor={statusColor}
            action={
              <button onClick={() => handleArrived(vl.id)}
                className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 whitespace-nowrap">
                {t.confirmArrived}
              </button>
            }
          />
        ))}
        {incoming.length === 0 && <Empty />}
      </Section>

      {/* Inside the building */}
      <Section title={`Inside (${inside.length})`} color="blue">
        {inside.map((vl) => (
          <VisitorRow key={vl.id} vl={vl} t={t} statusColor={statusColor}
            action={
              <button onClick={() => handleLeftBuilding(vl.id)}
                className="bg-orange-500 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-orange-600 whitespace-nowrap">
                {t.confirmLeftBuilding}
              </button>
            }
          />
        ))}
        {inside.length === 0 && <Empty />}
      </Section>

      {/* Left building — waiting for gate exit */}
      {leftBuilding.length > 0 && (
        <Section title={`Left Building (${leftBuilding.length})`} color="orange">
          {leftBuilding.map((vl) => (
            <VisitorRow key={vl.id} vl={vl} t={t} statusColor={statusColor} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const border: Record<string, string> = {
    yellow: "border-yellow-300",
    blue: "border-blue-300",
    orange: "border-orange-300",
  };
  return (
    <div className={`border-l-4 ${border[color]} pl-3`}>
      <h3 className="font-semibold text-gray-700 mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Empty() {
  return <p className="text-gray-400 text-sm py-2">—</p>;
}

function VisitorRow({ vl, t, statusColor, action }: any) {
  const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
  return (
    <div className={`bg-white rounded-xl shadow p-4 flex gap-3 items-center ${
      vl.status === "overdue" ? "ring-2 ring-red-400" : ""
    }`}>
      {vl.photo_path && (
        <img src={`${BASE_URL}/snapshots/${vl.photo_path.split("/").pop()}`}
          alt="visitor" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold truncate">{vl.visitor_name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[vl.status]}`}>
            {(t as any)[vl.status]}
          </span>
        </div>
        <p className="text-sm text-gray-600">{t.apartment}: {vl.destination_apartment}</p>
        <p className="text-xs text-gray-400 capitalize">{(t as any)[vl.visitor_type]}</p>
        {vl.vehicle_plate && <p className="text-xs text-gray-500">🚗 {vl.vehicle_plate}</p>}
        <p className="text-xs text-gray-400">
          {formatDistanceToNow(new Date(vl.entered_compound_at), { addSuffix: true })}
        </p>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
