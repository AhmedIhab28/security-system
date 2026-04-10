import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Residents from "./pages/Residents";
import Alerts from "./pages/Alerts";
import GateLog from "./pages/GateLog";
import MyBuilding from "./pages/MyBuilding";
import ShiftCheckIn from "./pages/ShiftCheckIn";
import Emergency from "./pages/Emergency";
import AdminUsers from "./pages/AdminUsers";
import ResidentPortal from "./pages/ResidentPortal";
import Setup from "./pages/Setup";
import SetupGuide from "./pages/SetupGuide";
import { login, logout, getMe, getSetupStatus } from "./services/api";
import { useStore } from "./store";
import { connectAlerts } from "./services/websocket";
import type { Lang } from "./i18n";

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({ onLogin }: { onLogin: () => void }) {
  const { t, lang, setLang } = useStore();
  const [error, setError] = useState("");
  const isRTL = lang === "ar";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await login(fd.get("username") as string, fd.get("password") as string);
      onLogin();
    } catch {
      setError(t.invalidCredentials);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex justify-center gap-2">
          {(["en", "ar"] as Lang[]).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                lang === l ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}>
              {l === "en" ? "English" : "العربية"}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} dir={isRTL ? "rtl" : "ltr"}
          className="bg-white rounded-2xl shadow-xl p-8 space-y-4">
          <div className="text-center">
            <div className="text-5xl mb-2">🔒</div>
            <h1 className="text-2xl font-bold">{t.appName}</h1>
          </div>
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
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
    </div>
  );
}

// ── Role badge colors ─────────────────────────────────────────────────────────
const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-purple-700 text-purple-100",
  building_admin: "bg-blue-700 text-blue-100",
  gate: "bg-yellow-700 text-yellow-100",
  building: "bg-green-700 text-green-100",
  resident: "bg-gray-600 text-gray-100",
};

// ── Layout ────────────────────────────────────────────────────────────────────
function Layout({ onLogout }: { onLogout: () => void }) {
  const { t, user, liveAlerts, lang, setLang } = useStore();
  const isRTL = lang === "ar";
  const role = user?.role ?? "";

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
      isActive ? "bg-blue-700 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white"
    }`;

  const alertBadge = liveAlerts.filter((a) =>
    a.type !== "visitor_incoming" && a.type !== "visitor_arrived"
  ).length;

  // Nav items per role
  const navItems = (): { to: string; icon: string; label: string; badge?: number }[] => {
    const shiftItem = { to: "/shift", icon: "🕐", label: t.myShift };
    const alertItem = { to: "/alerts", icon: "🚨", label: t.alerts, badge: alertBadge };
    const emergencyItem = { to: "/emergency", icon: "🚨", label: t.emergency };

    if (role === "super_admin") return [
      { to: "/dashboard", icon: "📊", label: t.dashboard },
      { to: "/setup-guide", icon: "⚙️", label: "Setup Guide" },
      { to: "/residents-db", icon: "👥", label: t.residents },
      { to: "/users", icon: "👮", label: t.manageUsers },
      { to: "/emergency", icon: "🚑", label: t.emergency },
      { to: "/alerts", icon: "🔔", label: t.alerts, badge: alertBadge },
    ];
    if (role === "building_admin") return [
      { to: "/dashboard", icon: "📊", label: t.dashboard },
      { to: "/residents-db", icon: "👥", label: t.residents },
      { to: "/users", icon: "👮", label: t.manageUsers },
      { to: "/emergency", icon: "🚑", label: t.emergency },
      { to: "/alerts", icon: "🔔", label: t.alerts, badge: alertBadge },
    ];
    if (role === "gate") return [
      shiftItem,
      { to: "/gate", icon: "🚪", label: t.gateLog },
      emergencyItem,
      alertItem,
    ];
    if (role === "building") return [
      shiftItem,
      { to: "/building", icon: "🏢", label: t.myBuilding },
      emergencyItem,
      alertItem,
    ];
    return [alertItem];
  };

  const defaultRoute = () => {
    if (role === "super_admin" || role === "building_admin") return "/dashboard";
    if (role === "gate") return "/shift";
    if (role === "building") return "/shift";
    return "/alerts";
  };

  return (
    <div className={`flex h-screen bg-gray-100 ${isRTL ? "flex-row-reverse" : ""}`}>
      <aside className="w-60 bg-gray-900 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-700">
          <p className="text-white font-bold text-lg">🔒 {t.appName}</p>
          <p className="text-gray-300 text-sm mt-0.5 truncate">{user?.full_name}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${ROLE_BADGE[role] || "bg-gray-600 text-gray-100"}`}>
            {(t as any)[role] || role}
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems().map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>
              <span>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                  {item.badge}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-700 space-y-2">
          <p className="text-gray-500 text-xs px-1">{t.language}</p>
          <div className="flex gap-2">
            {(["en", "ar"] as Lang[]).map((l) => (
              <button key={l} onClick={() => setLang(l)}
                className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${
                  lang === l ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                }`}>
                {l === "en" ? "EN" : "ع"}
              </button>
            ))}
          </div>
          <button onClick={onLogout}
            className="w-full text-gray-400 hover:text-white text-sm py-2 rounded-lg hover:bg-gray-700 transition-colors">
            {t.signOut}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/setup-guide" element={<SetupGuide />} />
          <Route path="/residents-db" element={<Residents />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/gate" element={<GateLog />} />
          <Route path="/building" element={<MyBuilding />} />
          <Route path="/shift" element={<ShiftCheckIn />} />
          <Route path="/emergency" element={<Emergency />} />
          <Route path="/users" element={<AdminUsers />} />
          <Route path="/resident" element={<ResidentPortal />} />
          <Route path="*" element={<Navigate to={defaultRoute()} />} />
        </Routes>
      </main>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { setUser } = useStore();
  const [authed, setAuthed] = useState(!!localStorage.getItem("token"));
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null); // null = loading

  // On first load: check if system needs setup
  useEffect(() => {
    getSetupStatus()
      .then(({ needs_setup }) => setNeedsSetup(needs_setup))
      .catch(() => setNeedsSetup(false)); // if backend unreachable, show login

    if (localStorage.getItem("token")) {
      getMe().then((me) => {
        setUser(me);
        setAuthed(true);
        connectAlerts(() => {});
      }).catch(() => {
        logout();
        setAuthed(false);
      });
    }
  }, []);

  const handleLogin = async () => {
    try {
      const me = await getMe();
      setUser(me);
      setAuthed(true);
      connectAlerts(() => {});
    } catch {
      logout();
    }
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setAuthed(false);
  };

  // Still checking
  if (needsSetup === null) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-lg animate-pulse">🔒 Loading...</div>
      </div>
    );
  }

  // First-time setup
  if (needsSetup) {
    return <Setup onDone={() => { setNeedsSetup(false); setAuthed(true); }} />;
  }

  if (!authed) return <Login onLogin={handleLogin} />;

  return (
    <BrowserRouter>
      <Layout onLogout={handleLogout} />
    </BrowserRouter>
  );
}
