import { useEffect, useState } from "react";
import { getBuildings, createApartment, getApartments, registerSecurityUser, registerResident } from "../services/api";
import api from "../services/api";
import { useStore } from "../store";

// ── tiny helpers ──────────────────────────────────────────────────────────────
const Input = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input {...props} className="w-full border rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
  </div>
);

const Select = ({ label, children, ...props }: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <select {...props} className="w-full border rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white">
      {children}
    </select>
  </div>
);

// ── Step card ─────────────────────────────────────────────────────────────────
function StepCard({ num, title, done, children }: { num: number; title: string; done?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!done);
  return (
    <div className={`bg-white rounded-2xl shadow border-2 transition-colors ${done ? "border-green-300" : "border-blue-200"}`}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-5 text-left">
        <span className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${done ? "bg-green-500 text-white" : "bg-blue-600 text-white"}`}>
          {done ? "✓" : num}
        </span>
        <span className="font-semibold text-gray-800 flex-1">{title}</span>
        <span className="text-gray-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-5 pb-5 border-t pt-4 space-y-4">{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SetupGuide() {
  const { user } = useStore();
  const isRTL = useStore((s) => s.lang === "ar");

  const [buildings, setBuildings] = useState<any[]>([]);
  const [apartments, setApartments] = useState<any[]>([]);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    const [b, a] = await Promise.all([getBuildings().catch(() => []), getApartments().catch(() => [])]);
    setBuildings(b);
    setApartments(a);
  };

  useEffect(() => { loadData(); }, []);

  const ok = (key: string, text: string) => setMsg((m) => ({ ...m, [key]: `✅ ${text}` }));
  const err = (key: string, text: string) => setMsg((m) => ({ ...m, [key]: `❌ ${text}` }));
  const busy = (key: string, v: boolean) => setLoading((l) => ({ ...l, [key]: v }));

  // ── Step 1: Add building ──────────────────────────────────────────────────
  const [bldForm, setBldForm] = useState({ name: "", address: "" });
  const handleAddBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    busy("bld", true);
    try {
      await api.post("/buildings", null, { params: { ...bldForm, group_id: user?.building_group_id } });
      ok("bld", `Building "${bldForm.name}" added`);
      setBldForm({ name: "", address: "" });
      loadData();
    } catch (ex: any) { err("bld", ex?.response?.data?.detail || "Failed"); }
    finally { busy("bld", false); }
  };

  // ── Step 2: Add building admin ────────────────────────────────────────────
  const [baForm, setBaForm] = useState({ username: "", password: "", full_name: "", admin_building_id: "" });
  const handleAddBuildingAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    busy("ba", true);
    try {
      await registerSecurityUser({
        ...baForm,
        role: "building_admin",
        building_group_id: user?.building_group_id,
        admin_building_id: Number(baForm.admin_building_id),
      });
      ok("ba", `Building admin "${baForm.full_name}" created`);
      setBaForm({ username: "", password: "", full_name: "", admin_building_id: "" });
    } catch (ex: any) { err("ba", ex?.response?.data?.detail || "Failed"); }
    finally { busy("ba", false); }
  };

  // ── Step 3: Add guards ────────────────────────────────────────────────────
  const [gForm, setGForm] = useState({ username: "", password: "", full_name: "", role: "gate", assigned_building_id: "" });
  const handleAddGuard = async (e: React.FormEvent) => {
    e.preventDefault();
    busy("guard", true);
    try {
      await registerSecurityUser({
        username: gForm.username,
        password: gForm.password,
        full_name: gForm.full_name,
        role: gForm.role,
        building_group_id: user?.building_group_id,
        assigned_building_id: gForm.assigned_building_id ? Number(gForm.assigned_building_id) : undefined,
      });
      ok("guard", `Guard "${gForm.full_name}" (${gForm.role}) created`);
      setGForm({ username: "", password: "", full_name: "", role: "gate", assigned_building_id: "" });
    } catch (ex: any) { err("guard", ex?.response?.data?.detail || "Failed"); }
    finally { busy("guard", false); }
  };

  // ── Step 4: Add apartment ─────────────────────────────────────────────────
  const [aptForm, setAptForm] = useState({ building_id: "", apartment_number: "", floor: "" });
  const handleAddApartment = async (e: React.FormEvent) => {
    e.preventDefault();
    busy("apt", true);
    try {
      await createApartment({ ...aptForm, building_id: Number(aptForm.building_id) });
      ok("apt", `Apartment ${aptForm.apartment_number} added`);
      setAptForm({ building_id: "", apartment_number: "", floor: "" });
      loadData();
    } catch (ex: any) { err("apt", ex?.response?.data?.detail || "Failed"); }
    finally { busy("apt", false); }
  };

  // ── Step 5: Add resident ──────────────────────────────────────────────────
  const [resForm, setResForm] = useState({ username: "", password: "", full_name: "", phone: "", apartment_id: "", is_primary: true });
  const handleAddResident = async (e: React.FormEvent) => {
    e.preventDefault();
    busy("res", true);
    try {
      await registerResident({ ...resForm, apartment_id: Number(resForm.apartment_id) });
      ok("res", `Resident "${resForm.full_name}" added`);
      setResForm({ username: "", password: "", full_name: "", phone: "", apartment_id: "", is_primary: true });
    } catch (ex: any) { err("res", ex?.response?.data?.detail || "Failed"); }
    finally { busy("res", false); }
  };

  return (
    <div className={`p-4 space-y-4 max-w-2xl mx-auto ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
        <h2 className="text-xl font-bold text-blue-800">⚙️ System Setup Guide</h2>
        <p className="text-blue-600 text-sm mt-1">
          Follow these steps in order to set up your compound. You can always add more later from Manage Users.
        </p>
      </div>

      {/* Step 1 — Buildings */}
      <StepCard num={1} title="Add Buildings" done={buildings.length > 0}>
        <p className="text-sm text-gray-500">Add each building / block in your compound.</p>
        {buildings.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {buildings.map((b) => (
              <span key={b.id} className="bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full font-medium">
                🏢 {b.name}
              </span>
            ))}
          </div>
        )}
        <form onSubmit={handleAddBuilding} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Building Name" value={bldForm.name}
              onChange={(e) => setBldForm({ ...bldForm, name: e.target.value })}
              placeholder="e.g. Building A" required />
            <Input label="Address (optional)" value={bldForm.address}
              onChange={(e) => setBldForm({ ...bldForm, address: e.target.value })}
              placeholder="e.g. Block 3" />
          </div>
          <button type="submit" disabled={loading.bld}
            className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading.bld ? "Adding..." : "+ Add Building"}
          </button>
          {msg.bld && <p className="text-sm">{msg.bld}</p>}
        </form>
      </StepCard>

      {/* Step 2 — Building Admins */}
      <StepCard num={2} title="Add Building Admins (one per building)">
        <p className="text-sm text-gray-500">
          Each building admin can manage their own building — residents, guards, cameras, and visitor logs.
        </p>
        <form onSubmit={handleAddBuildingAdmin} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Full Name" value={baForm.full_name}
              onChange={(e) => setBaForm({ ...baForm, full_name: e.target.value })}
              placeholder="e.g. Mohamed Ali" required />
            <Input label="Username" value={baForm.username}
              onChange={(e) => setBaForm({ ...baForm, username: e.target.value.toLowerCase() })}
              placeholder="e.g. admin_bldA" required />
            <Input label="Password" type="password" value={baForm.password}
              onChange={(e) => setBaForm({ ...baForm, password: e.target.value })}
              placeholder="••••••••" required minLength={6} />
            <Select label="Assigned Building" value={baForm.admin_building_id}
              onChange={(e) => setBaForm({ ...baForm, admin_building_id: e.target.value })} required>
              <option value="">Select building</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <button type="submit" disabled={loading.ba || buildings.length === 0}
            className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading.ba ? "Adding..." : "+ Add Building Admin"}
          </button>
          {buildings.length === 0 && <p className="text-xs text-orange-500">Add buildings first (Step 1)</p>}
          {msg.ba && <p className="text-sm">{msg.ba}</p>}
        </form>
      </StepCard>

      {/* Step 3 — Guards */}
      <StepCard num={3} title="Add Security Guards">
        <p className="text-sm text-gray-500">
          <strong>Gate guards</strong> log visitors in/out of the compound.<br />
          <strong>Building guards</strong> confirm arrivals and departures inside a building.
        </p>
        <form onSubmit={handleAddGuard} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Full Name" value={gForm.full_name}
              onChange={(e) => setGForm({ ...gForm, full_name: e.target.value })}
              placeholder="e.g. Hassan Omar" required />
            <Input label="Username" value={gForm.username}
              onChange={(e) => setGForm({ ...gForm, username: e.target.value.toLowerCase() })}
              placeholder="e.g. guard1" required />
            <Input label="Password" type="password" value={gForm.password}
              onChange={(e) => setGForm({ ...gForm, password: e.target.value })}
              placeholder="••••••••" required minLength={6} />
            <Select label="Role" value={gForm.role}
              onChange={(e) => setGForm({ ...gForm, role: e.target.value })}>
              <option value="gate">🚪 Gate Guard</option>
              <option value="building">🏢 Building Guard</option>
            </Select>
            {gForm.role === "building" && (
              <Select label="Assigned Building" value={gForm.assigned_building_id}
                onChange={(e) => setGForm({ ...gForm, assigned_building_id: e.target.value })} required>
                <option value="">Select building</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            )}
          </div>
          <button type="submit" disabled={loading.guard}
            className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading.guard ? "Adding..." : "+ Add Guard"}
          </button>
          {msg.guard && <p className="text-sm">{msg.guard}</p>}
        </form>
      </StepCard>

      {/* Step 4 — Apartments */}
      <StepCard num={4} title="Add Apartments">
        <p className="text-sm text-gray-500">
          Create one apartment entry per unit. Family members are added in Step 5.
        </p>
        {apartments.length > 0 && (
          <p className="text-xs text-green-600 font-medium">{apartments.length} apartments added so far</p>
        )}
        <form onSubmit={handleAddApartment} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Select label="Building" value={aptForm.building_id}
              onChange={(e) => setAptForm({ ...aptForm, building_id: e.target.value })} required>
              <option value="">Select</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            <Input label="Apt Number" value={aptForm.apartment_number}
              onChange={(e) => setAptForm({ ...aptForm, apartment_number: e.target.value })}
              placeholder="e.g. 4B" required />
            <Input label="Floor (optional)" value={aptForm.floor}
              onChange={(e) => setAptForm({ ...aptForm, floor: e.target.value })}
              placeholder="e.g. 4" />
          </div>
          <button type="submit" disabled={loading.apt || buildings.length === 0}
            className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading.apt ? "Adding..." : "+ Add Apartment"}
          </button>
          {msg.apt && <p className="text-sm">{msg.apt}</p>}
        </form>
      </StepCard>

      {/* Step 5 — Residents */}
      <StepCard num={5} title="Add Residents (Family Members)">
        <p className="text-sm text-gray-500">
          Each family member gets their own login. All members of the same apartment share the same apartment entry.
          Mark one as <strong>Primary</strong> (head of household).
        </p>
        <form onSubmit={handleAddResident} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Full Name" value={resForm.full_name}
              onChange={(e) => setResForm({ ...resForm, full_name: e.target.value })}
              placeholder="e.g. Sara Ahmed" required />
            <Input label="Username" value={resForm.username}
              onChange={(e) => setResForm({ ...resForm, username: e.target.value.toLowerCase() })}
              placeholder="e.g. sara.ahmed" required />
            <Input label="Password" type="password" value={resForm.password}
              onChange={(e) => setResForm({ ...resForm, password: e.target.value })}
              placeholder="••••••••" required minLength={6} />
            <Input label="Phone (optional)" value={resForm.phone}
              onChange={(e) => setResForm({ ...resForm, phone: e.target.value })}
              placeholder="e.g. 01012345678" />
            <Select label="Apartment" value={resForm.apartment_id}
              onChange={(e) => setResForm({ ...resForm, apartment_id: e.target.value })} required>
              <option value="">Select apartment</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.building_name} — Apt {a.apartment_number}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="primary" checked={resForm.is_primary}
                onChange={(e) => setResForm({ ...resForm, is_primary: e.target.checked })}
                className="w-4 h-4" />
              <label htmlFor="primary" className="text-sm text-gray-700 cursor-pointer">
                Primary (head of household)
              </label>
            </div>
          </div>
          <button type="submit" disabled={loading.res || apartments.length === 0}
            className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading.res ? "Adding..." : "+ Add Resident"}
          </button>
          {apartments.length === 0 && <p className="text-xs text-orange-500">Add apartments first (Step 4)</p>}
          {msg.res && <p className="text-sm">{msg.res}</p>}
        </form>
      </StepCard>

      {/* Done */}
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
        <p className="text-green-700 font-medium">
          🎉 Once all steps are done, your system is fully operational.
        </p>
        <p className="text-green-600 text-sm mt-1">
          You can always add more buildings, guards, apartments and residents from <strong>Manage Users</strong>.
        </p>
      </div>
    </div>
  );
}
