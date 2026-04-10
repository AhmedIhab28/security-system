import { useEffect, useRef, useState } from "react";
import { getPersons, addPerson, deletePerson, getVehicles, addVehicle } from "../services/api";
import { useStore } from "../store";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function Residents() {
  const { t, user } = useStore();
  const isRTL = useStore((s) => s.lang === "ar");
  const [persons, setPersons] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [tab, setTab] = useState<"persons" | "vehicles">("persons");
  const [showForm, setShowForm] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [p, v] = await Promise.all([
      getPersons(user?.building_group_id),
      getVehicles(user?.building_group_id),
    ]);
    setPersons(p);
    setVehicles(v);
  };

  useEffect(() => { load(); }, []);

  const handleAddPerson = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (user?.building_group_id) fd.set("building_group_id", String(user.building_group_id));
    await addPerson(fd);
    setShowForm(false);
    load();
  };

  const handleAddVehicle = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: any = Object.fromEntries(fd.entries());
    if (user?.building_group_id) data.building_group_id = user.building_group_id;
    await addVehicle(data);
    setVehicleForm(false);
    load();
  };

  const tabClass = (active: boolean) =>
    `font-medium pb-2 border-b-2 transition-colors ${active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`;

  return (
    <div className={`p-4 space-y-4 ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex gap-6 border-b">
        <button onClick={() => setTab("persons")} className={tabClass(tab === "persons")}>
          👥 {t.residents}
        </button>
        <button onClick={() => setTab("vehicles")} className={tabClass(tab === "vehicles")}>
          🚗 Vehicles
        </button>
      </div>

      {tab === "persons" && (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">{t.residents}</h2>
            <button onClick={() => setShowForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              {t.addPerson}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleAddPerson}
              className="bg-white rounded-xl shadow p-5 space-y-3 max-w-md border border-blue-100">
              <h3 className="font-semibold">{t.addPerson}</h3>
              <input name="name" placeholder={t.fullName} required
                className="w-full border rounded-lg px-3 py-2" />
              <select name="role" className="w-full border rounded-lg px-3 py-2">
                <option value="resident">{t.resident}</option>
                <option value="staff">{t.staff}</option>
              </select>
              <div>
                <label className="text-sm text-gray-600">{t.photo} (optional)</label>
                <input name="photo" type="file" accept="image/*" ref={photoRef}
                  className="w-full mt-1" />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg">{t.save}</button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="border px-4 py-2 rounded-lg">{t.cancel}</button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {persons.map((p) => (
              <div key={p.id} className="bg-white rounded-xl shadow p-4 flex items-center gap-4">
                {p.photo_path ? (
                  <img src={`${BASE_URL}/snapshots/${p.photo_path.split("/").pop()}`}
                    alt={p.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg flex-shrink-0">
                    {p.name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-sm text-gray-500 capitalize">{(t as any)[p.role] || p.role}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                    {p.is_active ? t.active : t.inactive}
                  </span>
                </div>
                <button onClick={() => deletePerson(p.id).then(load)}
                  className="text-red-400 hover:text-red-600 text-sm flex-shrink-0">{t.remove}</button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "vehicles" && (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Vehicles</h2>
            <button onClick={() => setVehicleForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              {t.addVehicle}
            </button>
          </div>

          {vehicleForm && (
            <form onSubmit={handleAddVehicle}
              className="bg-white rounded-xl shadow p-5 space-y-3 max-w-md border border-blue-100">
              <h3 className="font-semibold">{t.addVehicle}</h3>
              <input name="plate_number" placeholder={t.plate} required className="w-full border rounded-lg px-3 py-2" />
              <input name="make" placeholder={t.make} className="w-full border rounded-lg px-3 py-2" />
              <input name="model" placeholder={t.model} className="w-full border rounded-lg px-3 py-2" />
              <input name="color" placeholder={t.color} className="w-full border rounded-lg px-3 py-2" />
              <input name="owner_id" placeholder={t.owner} type="number" className="w-full border rounded-lg px-3 py-2" />
              <div className="flex gap-2">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg">{t.save}</button>
                <button type="button" onClick={() => setVehicleForm(false)}
                  className="border px-4 py-2 rounded-lg">{t.cancel}</button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-xl shadow overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="p-3 text-left">{t.plate}</th>
                  <th className="p-3 text-left">{t.make} / {t.model}</th>
                  <th className="p-3 text-left">{t.color}</th>
                  <th className="p-3 text-left">{t.owner}</th>
                  <th className="p-3 text-left">{t.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td className="p-3 font-mono font-semibold">{v.plate_number}</td>
                    <td className="p-3">{v.make} {v.model}</td>
                    <td className="p-3">{v.color}</td>
                    <td className="p-3">{v.owner_id ?? "—"}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${v.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                        {v.is_active ? t.active : t.inactive}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
