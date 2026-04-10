import { useEffect, useState } from "react";
import { residentLogin, getResidentMe, announceVisitor, getMyVisitorRequests } from "../services/api";
import { useStore } from "../store";
import { formatDistanceToNow } from "date-fns";

const VISITOR_TYPES = ["visitor", "supermarket", "shipping", "restaurant", "maintenance", "other"];

export default function ResidentPortal() {
  const { t, lang } = useStore();
  const isRTL = lang === "ar";

  const [authed, setAuthed] = useState(!!localStorage.getItem("resident_token"));
  const [profile, setProfile] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loginError, setLoginError] = useState("");
  const [showAnnounce, setShowAnnounce] = useState(false);
  const [form, setForm] = useState({ visitor_name: "", visitor_type: "visitor", vehicle_plate: "", notes: "" });
  const [success, setSuccess] = useState("");

  const loadProfile = async () => {
    try {
      const [p, r] = await Promise.all([getResidentMe(), getMyVisitorRequests()]);
      setProfile(p);
      setRequests(r);
    } catch {
      localStorage.removeItem("resident_token");
      setAuthed(false);
    }
  };

  useEffect(() => { if (authed) loadProfile(); }, [authed]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await residentLogin(fd.get("username") as string, fd.get("password") as string);
      setAuthed(true);
      setLoginError("");
    } catch {
      setLoginError(t.invalidCredentials);
    }
  };

  const handleAnnounce = async (e: React.FormEvent) => {
    e.preventDefault();
    await announceVisitor(form);
    setSuccess("Visitor announced — security has been notified.");
    setShowAnnounce(false);
    setForm({ visitor_name: "", visitor_type: "visitor", vehicle_plate: "", notes: "" });
    loadProfile();
    setTimeout(() => setSuccess(""), 4000);
  };

  const handleLogout = () => {
    localStorage.removeItem("resident_token");
    setAuthed(false);
    setProfile(null);
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir={isRTL ? "rtl" : "ltr"}>
        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm space-y-4">
          <div className="text-center">
            <div className="text-4xl mb-2">🏠</div>
            <h1 className="text-xl font-bold">{t.myApartment}</h1>
            <p className="text-gray-500 text-sm">Resident Portal</p>
          </div>
          {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
          <input name="username" placeholder={t.username} required
            className="w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input name="password" type="password" placeholder={t.password} required
            className="w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="submit"
            className="w-full bg-blue-600 text-white rounded-xl py-2.5 font-semibold hover:bg-blue-700">
            {t.signIn}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={`p-4 space-y-5 max-w-lg mx-auto ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* Profile card */}
      {profile && (
        <div className="bg-white rounded-2xl shadow p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold">{profile.full_name}</p>
              <p className="text-gray-500 text-sm">
                🏢 {profile.building_name} — {t.apartment} {profile.apartment_number}
              </p>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 text-sm">{t.signOut}</button>
          </div>

          {/* Vehicles */}
          {profile.vehicles?.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-sm font-medium text-gray-600 mb-2">🚗 My Vehicles</p>
              <div className="space-y-1">
                {profile.vehicles.map((v: any) => (
                  <div key={v.id} className="flex items-center gap-3 text-sm">
                    <span className="font-mono font-semibold bg-gray-100 px-2 py-0.5 rounded">{v.plate_number}</span>
                    <span className="text-gray-600">{v.make} {v.model} — {v.color}</span>
                    {v.parking_spot && <span className="text-gray-400">P: {v.parking_spot}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success banner */}
      {success && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-3 text-green-800 text-sm">
          ✅ {success}
        </div>
      )}

      {/* Announce visitor button */}
      <button onClick={() => setShowAnnounce(true)}
        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 flex items-center justify-center gap-2">
        📢 {t.announceVisitor}
      </button>

      {/* Announce form */}
      {showAnnounce && (
        <form onSubmit={handleAnnounce}
          className="bg-white rounded-xl shadow p-5 space-y-3 border border-blue-100">
          <h3 className="font-semibold">{t.announceVisitor}</h3>

          <input value={form.visitor_name}
            onChange={(e) => setForm({ ...form, visitor_name: e.target.value })}
            placeholder={t.visitorName} required className="w-full border rounded-lg px-3 py-2" />

          <select value={form.visitor_type}
            onChange={(e) => setForm({ ...form, visitor_type: e.target.value })}
            className="w-full border rounded-lg px-3 py-2">
            {VISITOR_TYPES.map((vt) => (
              <option key={vt} value={vt}>{(t as any)[vt]}</option>
            ))}
          </select>

          <input value={form.vehicle_plate}
            onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })}
            placeholder={t.vehiclePlate} className="w-full border rounded-lg px-3 py-2" />

          <textarea value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder={t.notes} rows={2} className="w-full border rounded-lg px-3 py-2" />

          <div className="flex gap-2">
            <button type="submit"
              className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700">
              {t.announceVisitor}
            </button>
            <button type="button" onClick={() => setShowAnnounce(false)}
              className="border px-4 py-2 rounded-lg">{t.cancel}</button>
          </div>
        </form>
      )}

      {/* My visitor history */}
      {requests.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-700 mb-3">{t.myVisitors}</h3>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-medium">{r.visitor_name}</p>
                  <p className="text-xs text-gray-500 capitalize">{(t as any)[r.visitor_type] || r.visitor_type}</p>
                  {r.vehicle_plate && <p className="text-xs text-gray-400">🚗 {r.vehicle_plate}</p>}
                </div>
                <p className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
