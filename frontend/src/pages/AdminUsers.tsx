import { useEffect, useState } from "react";
import {
  getSecurityUsers, registerSecurityUser, deleteSecurityUser,
  getResidents, registerResident, deleteResident,
  getApartments, createApartment, deleteApartment,
  getBuildings, getShifts,
} from "../services/api";
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

  const [tab, setTab] = useState<"guards" | "apartments" | "shifts">("guards");
  const [guards, setGuards] = useState<any[]>([]);
  const [apartments, setApartments] = useState<any[]>([]);
  const [residents, setResidents] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);

  // Expanded apartment (shows members)
  const [expandedApt, setExpandedApt] = useState<number | null>(null);

  // Forms
  const [showGuardForm, setShowGuardForm] = useState(false);
  const [showAptForm, setShowAptForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState<number | null>(null); // apartment_id

  const [guardForm, setGuardForm] = useState({ username: "", password: "", full_name: "", role: "building", assigned_building_id: "", admin_building_id: "" });
  const [aptForm, setAptForm] = useState({ building_id: "", apartment_number: "", floor: "", notes: "" });
  const [memberForm, setMemberForm] = useState({ username: "", password: "", full_name: "", phone: "", is_primary: false });

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

  const tabClass = (active: boolean) =>
    `font-medium pb-2 border-b-2 transition-colors text-sm ${active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`;

  // Group residents by apartment
  const membersByApt = residents.reduce((acc: Record<number, any[]>, r) => {
    if (!acc[r.apartment_id]) acc[r.apartment_id] = [];
    acc[r.apartment_id].push(r);
    return acc;
  }, {});

  return (
    <div className={`p-4 space-y-4 ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      <h2 className="text-xl font-semibold">{t.manageUsers}</h2>

      <div className="flex gap-6 border-b">
        <button onClick={() => setTab("guards")} className={tabClass(tab === "guards")}>👮 Guards</button>
        <button onClick={() => setTab("apartments")} className={tabClass(tab === "apartments")}>🏠 Apartments</button>
        <button onClick={() => setTab("shifts")} className={tabClass(tab === "shifts")}>🕐 {t.shiftLog}</button>
      </div>

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
              <input value={guardForm.username} onChange={(e) => setGuardForm({ ...guardForm, username: e.target.value })}
                placeholder={t.username} required className="w-full border rounded-lg px-3 py-2" />
              <input value={guardForm.password} onChange={(e) => setGuardForm({ ...guardForm, password: e.target.value })}
                placeholder={t.password} type="password" required className="w-full border rounded-lg px-3 py-2" />
              <input value={guardForm.full_name} onChange={(e) => setGuardForm({ ...guardForm, full_name: e.target.value })}
                placeholder={t.fullName} required className="w-full border rounded-lg px-3 py-2" />
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
                  <option value="">{t.building}</option>
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

      {/* ── Apartments ── */}
      {tab === "apartments" && (
        <>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">{apartments.length} apartments</span>
            <button onClick={() => setShowAptForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
              + Apartment
            </button>
          </div>

          {showAptForm && (
            <form onSubmit={handleAddApartment}
              className="bg-white rounded-xl shadow p-5 space-y-3 max-w-md border border-blue-100">
              <h3 className="font-semibold">New Apartment</h3>
              <select value={aptForm.building_id} onChange={(e) => setAptForm({ ...aptForm, building_id: e.target.value })}
                required className="w-full border rounded-lg px-3 py-2">
                <option value="">{t.building}</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <input value={aptForm.apartment_number} onChange={(e) => setAptForm({ ...aptForm, apartment_number: e.target.value })}
                placeholder="Apartment Number (e.g. 4B)" required className="w-full border rounded-lg px-3 py-2" />
              <input value={aptForm.floor} onChange={(e) => setAptForm({ ...aptForm, floor: e.target.value })}
                placeholder="Floor (optional)" className="w-full border rounded-lg px-3 py-2" />
              <textarea value={aptForm.notes} onChange={(e) => setAptForm({ ...aptForm, notes: e.target.value })}
                placeholder={t.notes} rows={2} className="w-full border rounded-lg px-3 py-2" />
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
                  {/* Apartment header */}
                  <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedApt(isExpanded ? null : apt.id)}>
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-bold flex-shrink-0">
                      {apt.apartment_number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">Apt {apt.apartment_number}</p>
                      <p className="text-xs text-gray-500">
                        🏢 {apt.building_name}
                        {apt.floor ? ` · Floor ${apt.floor}` : ""}
                        · {members.length} member{members.length !== 1 ? "s" : ""}
                        · {apt.vehicle_count} vehicle{apt.vehicle_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); setShowMemberForm(apt.id); }}
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700">
                        + Member
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
                      <h4 className="font-medium text-sm text-green-800">Add Family Member to Apt {apt.apartment_number}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={memberForm.username} onChange={(e) => setMemberForm({ ...memberForm, username: e.target.value })}
                          placeholder={t.username} required className="border rounded-lg px-3 py-2 text-sm" />
                        <input value={memberForm.password} onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })}
                          placeholder={t.password} type="password" required className="border rounded-lg px-3 py-2 text-sm" />
                        <input value={memberForm.full_name} onChange={(e) => setMemberForm({ ...memberForm, full_name: e.target.value })}
                          placeholder={t.fullName} required className="border rounded-lg px-3 py-2 text-sm" />
                        <input value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                          placeholder={t.phone} className="border rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={memberForm.is_primary}
                          onChange={(e) => setMemberForm({ ...memberForm, is_primary: e.target.checked })} />
                        Head of household (primary account)
                      </label>
                      <div className="flex gap-2">
                        <button type="submit" className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm">{t.save}</button>
                        <button type="button" onClick={() => setShowMemberForm(null)} className="border px-3 py-1.5 rounded-lg text-sm">{t.cancel}</button>
                      </div>
                    </form>
                  )}

                  {/* Members list */}
                  {isExpanded && (
                    <div className="border-t divide-y">
                      {members.length === 0 && (
                        <p className="p-4 text-sm text-gray-400 text-center">No members yet</p>
                      )}
                      {members.map((m) => (
                        <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm flex-shrink-0">
                            {m.full_name?.[0] || "?"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{m.full_name}</p>
                              {m.is_primary && (
                                <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Primary</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">@{m.username} {m.phone ? `· ${m.phone}` : ""}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${m.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                            {m.is_active ? t.active : t.inactive}
                          </span>
                          <button onClick={() => deleteResident(m.id).then(load)}
                            className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">{t.deactivate}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {apartments.length === 0 && (
              <p className="text-center text-gray-400 py-8">No apartments yet</p>
            )}
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
                <th className="p-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shifts.map((s) => (
                <tr key={s.id} className={s.is_active ? "bg-green-50" : ""}>
                  <td className="p-3 font-medium">{s.guard_name}</td>
                  <td className="p-3">
                    {s.post_type === "gate" ? `🚪 ${s.post_gate_name || "Gate"}` : `🏢 ${s.post_building}`}
                  </td>
                  <td className="p-3">{format(new Date(s.shift_start), "dd/MM HH:mm")}</td>
                  <td className="p-3">
                    {s.shift_end ? format(new Date(s.shift_end), "dd/MM HH:mm") : <span className="text-green-600 font-medium">Active</span>}
                  </td>
                  <td className="p-3 text-gray-500">{s.handed_over_to || "—"}</td>
                  <td className="p-3 text-gray-400 max-w-xs truncate">{s.handover_notes || "—"}</td>
                </tr>
              ))}
              {shifts.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-gray-400">No shifts recorded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
