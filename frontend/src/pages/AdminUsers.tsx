import { useEffect, useState } from "react";
import {
  getSecurityUsers, registerSecurityUser, deleteSecurityUser,
  getResidents, registerResident, deleteResident,
  getApartments, createApartment, deleteApartment,
  getBuildings, getShifts,
} from "../services/api";
import api from "../services/api";
import { useStore } from "../store";
import { format } from "date-fns";

const ROLES = ["super_admin", "building_admin", "gate", "building"];
const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700",
  building_admin: "bg-blue-100 text-blue-700",
  gate: "bg-yellow-100 text-yellow-700",
  building: "bg-green-100 text-green-700",
};

export default function AdminUsers() {
  const { t, user } = useStore();
  const isRTL = useStore((s) => s.lang === "ar");
  const isSuperAdmin = user?.role === "super_admin";

  const [tab, setTab] = useState<"buildings" | "apartments" | "guards" | "shifts">("buildings");
  const [guards, setGuards] = useState<any[]>([]);
  const [apartments, setApartments] = useState<any[]>([]);
  const [residents, setResidents] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [expandedApt, setExpandedApt] = useState<number | null>(null);

  // Forms
  const [showBldForm, setShowBldForm] = useState(false);
  const [showGuardForm, setShowGuardForm] = useState(false);
  const [showAptForm, setShowAptForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState<number | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState<number | null>(null);

  const [bldForm, setBldForm] = useState({ name: "", address: "" });
  const [guardForm, setGuardForm] = useState({ username: "", password: "", full_name: "", role: "building", assigned_building_id: "", admin_building_id: "" });
  const [aptForm, setAptForm] = useState({ building_id: "", apartment_number: "", floor: "", notes: "" });
  const [memberForm, setMemberForm] = useState({ username: "", password: "", full_name: "", phone: "", is_primary: false });
  const [vehicleForm, setVehicleForm] = useState({ plate_number: "", make: "", model: "", color: "", parking_spot: "" });

  const load = async () => {
    const [g, a, b, r] = await Promise.all([
      getSecurityUsers().catch(() => []),
      getApartments().catch(() => []),
      getBuildings(),
      getResidents().catch(() => []),
    ]);
    setGuards(g);
    setApartments(a);
    setBuildings(b);
    setResidents(r);
    if (tab === "shifts") getShifts().then(setShifts);
  };

  useEffect(() => { load(); }, [tab]);

  const handleAddBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post("/buildings", null, { params: { ...bldForm, group_id: user?.building_group_id } });
    setShowBldForm(false);
    setBldForm({ name: "", address: "" });
    load();
  };

  const handleAddGuard = async (e: React.FormEvent) => {
    e.preventDefault();
    await registerSecurityUser({
      ...guardForm,
      building_group_id: user?.building_group_id,
      assigned_building_id: guardForm.assigned_building_id || undefined,
      admin_building_id: guardForm.admin_building_id || undefined,
    });
    setShowGuardForm(false);
    setGuardForm({ username: "", password: "", full_name: "", role: "building", assigned_building_id: "", admin_building_id: "" });
    load();
  };

  const handleAddApartment = async (e: React.FormEvent) => {
    e.preventDefault();
    await createApartment({ ...aptForm, building_id: Number(aptForm.building_id) });
    setShowAptForm(false);
    setAptForm({ building_id: "", apartment_number: "", floor: "", notes: "" });
    load();
  };

  const handleAddMember = async (e: React.FormEvent, apartment_id: number) => {
    e.preventDefault();
    await registerResident({ ...memberForm, apartment_id });
    setShowMemberForm(null);
    setMemberForm({ username: "", password: "", full_name: "", phone: "", is_primary: false });
    load();
  };

  const handleAddVehicle = async (e: React.FormEvent, apartment_id: number) => {
    e.preventDefault();
    await api.post("/apartments/" + apartment_id + "/vehicles", vehicleForm);
    setShowVehicleForm(null);
    setVehicleForm({ plate_number: "", make: "", model: "", color: "", parking_spot: "" });
    load();
  };

  const tabClass = (active: boolean) =>
    `font-medium pb-2 border-b-2 transition-colors text-sm ${active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`;

  const membersByApt = residents.reduce((acc: Record<number, any[]>, r) => {
    if (!acc[r.apartment_id]) acc[r.apartment_id] = [];
    acc[r.apartment_id].push(r);
    return acc;
  }, {});

  return (
    <div className={`p-4 space-y-4 ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      <h2 className="text-xl font-semibold">{t.manageUsers}</h2>

      <div className="flex gap-4 border-b overflow-x-auto">
        <button onClick={() => setTab("buildings")} className={tabClass(tab === "buildings")}>🏢 Buildings</button>
        <button onClick={() => setTab("apartments")} className={tabClass(tab === "apartments")}>🏠 Apartments</button>
        <button onClick={() => setTab("guards")} className={tabClass(tab === "guards")}>👮 Guards</button>
        <button onClick={() => setTab("shifts")} className={tabClass(tab === "shifts")}>🕐 {t.shiftLog}</button>
      </div>

      {/* ── Buildings ── */}
      {tab === "buildings" && (
        <>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">{buildings.length} buildings</span>
            <button onClick={() => setShowBldForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
              + Add Building
            </button>
          </div>

          {showBldForm && (
            <form onSubmit={handleAddBuilding}
              className="bg-white rounded-xl shadow p-5 space-y-3 max-w-md border border-blue-100">
              <h3 className="font-semibold">New Building</h3>
              <input value={bldForm.name} onChange={(e) => setBldForm({ ...bldForm, name: e.target.value })}
                placeholder="Building name (e.g. Building A)" required className="w-full border rounded-lg px-3 py-2" />
              <input value={bldForm.address} onChange={(e) => setBldForm({ ...bldForm, address: e.target.value })}
                placeholder="Address (optional)" className="w-full border rounded-lg px-3 py-2" />
              <div className="flex gap-2">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg">{t.save}</button>
                <button type="button" onClick={() => setShowBldForm(false)} className="border px-4 py-2 rounded-lg">{t.cancel}</button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {buildings.map((b) => (
              <div key={b.id} className="bg-white rounded-xl shadow p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-bold flex-shrink-0">
                  🏢
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{b.name}</p>
                  {b.address && <p className="text-xs text-gray-400">{b.address}</p>}
                </div>
                <span className="text-xs text-gray-400">
                  {apartments.filter(a => a.building_id === b.id).length} apts
                </span>
              </div>
            ))}
            {buildings.length === 0 && <p className="text-center text-gray-400 py-8">No buildings yet</p>}
          </div>
        </>
      )}

      {/* ── Apartments ── */}
      {tab === "apartments" && (
        <>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">{apartments.length} apartments</span>
            <button onClick={() => setShowAptForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
              + Add Apartment
            </button>
          </div>

          {showAptForm && (
            <form onSubmit={handleAddApartment}
              className="bg-white rounded-xl shadow p-5 space-y-3 max-w-md border border-blue-100">
              <h3 className="font-semibold">New Apartment</h3>
              <select value={aptForm.building_id} onChange={(e) => setAptForm({ ...aptForm, building_id: e.target.value })}
                required className="w-full border rounded-lg px-3 py-2">
                <option value="">Select Building</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <input value={aptForm.apartment_number} onChange={(e) => setAptForm({ ...aptForm, apartment_number: e.target.value })}
                placeholder="Apartment number (e.g. 4B)" required className="w-full border rounded-lg px-3 py-2" />
              <input value={aptForm.floor} onChange={(e) => setAptForm({ ...aptForm, floor: e.target.value })}
                placeholder="Floor (optional)" className="w-full border rounded-lg px-3 py-2" />
              <textarea value={aptForm.notes} onChange={(e) => setAptForm({ ...aptForm, notes: e.target.value })}
                placeholder="Notes (optional)" rows={2} className="w-full border rounded-lg px-3 py-2" />
              <div className="flex gap-2">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg">{t.save}</button>
                <button type="button" onClick={() => setShowAptForm(false)} className="border px-4 py-2 rounded-lg">{t.cancel}</button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {apartments.map((apt) => {
              const members = membersByApt[apt.id] || [];
              const isExpanded = expandedApt === apt.id;
              return (
                <div key={apt.id} className="bg-white rounded-xl shadow overflow-hidden">
                  {/* Header */}
                  <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedApt(isExpanded ? null : apt.id)}>
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                      {apt.apartment_number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">Apt {apt.apartment_number}</p>
                      <p className="text-xs text-gray-500">
                        🏢 {apt.building_name}
                        {apt.floor ? ` · Floor ${apt.floor}` : ""}
                        · {members.length} member{members.length !== 1 ? "s" : ""}
                        · {apt.vehicle_count || 0} vehicle{apt.vehicle_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); setShowMemberForm(apt.id); setShowVehicleForm(null); }}
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700">
                        + Member
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setShowVehicleForm(apt.id); setShowMemberForm(null); }}
                        className="text-xs bg-orange-500 text-white px-2 py-1 rounded-lg hover:bg-orange-600">
                        + Car
                      </button>
                      {isSuperAdmin && (
                        <button onClick={(e) => { e.stopPropagation(); deleteApartment(apt.id).then(load); }}
                          className="text-red-400 hover:text-red-600 text-xs">{t.deactivate}</button>
                      )}
                      <span className="text-gray-400 text-sm">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Add member form */}
                  {showMemberForm === apt.id && (
                    <form onSubmit={(e) => handleAddMember(e, apt.id)}
                      className="border-t p-4 bg-green-50 space-y-3">
                      <h4 className="font-medium text-sm text-green-800">Add Family Member — Apt {apt.apartment_number}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={memberForm.full_name} onChange={(e) => setMemberForm({ ...memberForm, full_name: e.target.value })}
                          placeholder="Full Name" required className="border rounded-lg px-3 py-2 text-sm" />
                        <input value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                          placeholder="Phone (optional)" className="border rounded-lg px-3 py-2 text-sm" />
                        <input value={memberForm.username} onChange={(e) => setMemberForm({ ...memberForm, username: e.target.value })}
                          placeholder="Username" required className="border rounded-lg px-3 py-2 text-sm" />
                        <input value={memberForm.password} onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })}
                          placeholder="Password" type="password" required className="border rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={memberForm.is_primary}
                          onChange={(e) => setMemberForm({ ...memberForm, is_primary: e.target.checked })} />
                        Head of household
                      </label>
                      <div className="flex gap-2">
                        <button type="submit" className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm">{t.save}</button>
                        <button type="button" onClick={() => setShowMemberForm(null)} className="border px-3 py-1.5 rounded-lg text-sm">{t.cancel}</button>
                      </div>
                    </form>
                  )}

                  {/* Add vehicle form */}
                  {showVehicleForm === apt.id && (
                    <form onSubmit={(e) => handleAddVehicle(e, apt.id)}
                      className="border-t p-4 bg-orange-50 space-y-3">
                      <h4 className="font-medium text-sm text-orange-800">Add Vehicle — Apt {apt.apartment_number}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={vehicleForm.plate_number} onChange={(e) => setVehicleForm({ ...vehicleForm, plate_number: e.target.value })}
                          placeholder="Plate Number" required className="border rounded-lg px-3 py-2 text-sm" />
                        <input value={vehicleForm.parking_spot} onChange={(e) => setVehicleForm({ ...vehicleForm, parking_spot: e.target.value })}
                          placeholder="Parking Spot (e.g. B2-14)" className="border rounded-lg px-3 py-2 text-sm" />
                        <input value={vehicleForm.make} onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
                          placeholder="Make (e.g. Toyota)" className="border rounded-lg px-3 py-2 text-sm" />
                        <input value={vehicleForm.model} onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                          placeholder="Model (e.g. Camry)" className="border rounded-lg px-3 py-2 text-sm" />
                        <input value={vehicleForm.color} onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })}
                          placeholder="Color" className="border rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="bg-orange-500 text-white px-4 py-1.5 rounded-lg text-sm">{t.save}</button>
                        <button type="button" onClick={() => setShowVehicleForm(null)} className="border px-3 py-1.5 rounded-lg text-sm">{t.cancel}</button>
                      </div>
                    </form>
                  )}

                  {/* Expanded: members + vehicles */}
                  {isExpanded && (
                    <div className="border-t divide-y">
                      {members.length === 0 && (
                        <p className="p-4 text-sm text-gray-400 text-center">No members yet — click + Member</p>
                      )}
                      {members.map((m) => (
                        <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                            {m.full_name?.[0] || "?"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{m.full_name}</p>
                              {m.is_primary && (
                                <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Primary</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">@{m.username}{m.phone ? ` · ${m.phone}` : ""}</p>
                          </div>
                          <button onClick={() => deleteResident(m.id).then(load)}
                            className="text-red-400 hover:text-red-600 text-xs">{t.deactivate}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {apartments.length === 0 && <p className="text-center text-gray-400 py-8">No apartments yet</p>}
          </div>
        </>
      )}

      {/* ── Guards ── */}
      {tab === "guards" && (
        <>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">{guards.length} users</span>
            {isSuperAdmin && (
              <button onClick={() => setShowGuardForm(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
                {t.addUser}
              </button>
            )}
          </div>

          {showGuardForm && (
            <form onSubmit={handleAddGuard}
              className="bg-white rounded-xl shadow p-5 space-y-3 max-w-md border border-blue-100">
              <h3 className="font-semibold">{t.addUser}</h3>
              <input value={guardForm.full_name} onChange={(e) => setGuardForm({ ...guardForm, full_name: e.target.value })}
                placeholder="Full Name" required className="w-full border rounded-lg px-3 py-2" />
              <input value={guardForm.username} onChange={(e) => setGuardForm({ ...guardForm, username: e.target.value })}
                placeholder={t.username} required className="w-full border rounded-lg px-3 py-2" />
              <input value={guardForm.password} onChange={(e) => setGuardForm({ ...guardForm, password: e.target.value })}
                placeholder={t.password} type="password" required className="w-full border rounded-lg px-3 py-2" />
              <select value={guardForm.role} onChange={(e) => setGuardForm({ ...guardForm, role: e.target.value })}
                className="w-full border rounded-lg px-3 py-2">
                {ROLES.map((r) => <option key={r} value={r}>{(t as any)[r] || r}</option>)}
              </select>
              {(guardForm.role === "building" || guardForm.role === "building_admin") && (
                <select
                  value={guardForm.role === "building_admin" ? guardForm.admin_building_id : guardForm.assigned_building_id}
                  onChange={(e) => guardForm.role === "building_admin"
                    ? setGuardForm({ ...guardForm, admin_building_id: e.target.value })
                    : setGuardForm({ ...guardForm, assigned_building_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="">Select Building</option>
                  {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              <div className="flex gap-2">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg">{t.save}</button>
                <button type="button" onClick={() => setShowGuardForm(false)} className="border px-4 py-2 rounded-lg">{t.cancel}</button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {guards.map((g) => (
              <div key={g.id} className="bg-white rounded-xl shadow p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold flex-shrink-0">
                  {g.full_name?.[0] || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{g.full_name}</p>
                  <p className="text-xs text-gray-400">@{g.username}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[g.role] || "bg-gray-100 text-gray-600"}`}>
                  {(t as any)[g.role] || g.role}
                </span>
                {g.admin_building_id && <span className="text-xs text-gray-400">Bldg #{g.admin_building_id}</span>}
                {isSuperAdmin && g.id !== user?.id && (
                  <button onClick={() => deleteSecurityUser(g.id).then(load)}
                    className="text-red-400 hover:text-red-600 text-sm flex-shrink-0">{t.deactivate}</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Shifts ── */}
      {tab === "shifts" && (
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
              {shifts.map((s) => (
                <tr key={s.id} className={s.is_active ? "bg-green-50" : ""}>
                  <td className="p-3 font-medium">{s.guard_name}</td>
                  <td className="p-3">{s.post_type === "gate" ? `🚪 ${s.post_gate_name || "Gate"}` : `🏢 ${s.post_building}`}</td>
                  <td className="p-3">{format(new Date(s.shift_start), "dd/MM HH:mm")}</td>
                  <td className="p-3">{s.shift_end ? format(new Date(s.shift_end), "dd/MM HH:mm") : <span className="text-green-600 font-medium">Active</span>}</td>
                  <td className="p-3 text-gray-500">{s.handed_over_to || "—"}</td>
                </tr>
              ))}
              {shifts.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-400">No shifts recorded</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
