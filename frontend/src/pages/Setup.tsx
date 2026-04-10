import { useState } from "react";
import { runFirstSetup, login, getMe } from "../services/api";
import { useStore } from "../store";
import type { Lang } from "../i18n";

const STEPS = ["compound", "admin", "done"] as const;
type Step = typeof STEPS[number];

export default function Setup({ onDone }: { onDone: () => void }) {
  const { lang, setLang, t, setUser } = useStore();
  const isRTL = lang === "ar";

  const [step, setStep] = useState<Step>("compound");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    compound_name: "",
    admin_username: "",
    admin_password: "",
    admin_password_confirm: "",
    admin_full_name: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.admin_password !== form.admin_password_confirm) {
      setError("Passwords do not match");
      return;
    }
    if (form.admin_password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await runFirstSetup({
        compound_name: form.compound_name,
        admin_username: form.admin_username,
        admin_password: form.admin_password,
        admin_full_name: form.admin_full_name,
      });
      // Auto-login
      await login(form.admin_username, form.admin_password);
      const me = await getMe();
      setUser(me);
      setStep("done");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4"
      dir={isRTL ? "rtl" : "ltr"}>
      <div className="w-full max-w-lg space-y-4">

        {/* Language */}
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

        {step !== "done" ? (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="bg-gray-900 px-8 py-6 text-center">
              <div className="text-5xl mb-2">🔒</div>
              <h1 className="text-2xl font-bold text-white">{t.appName}</h1>
              <p className="text-gray-400 text-sm mt-1">
                {isRTL ? "الإعداد الأول للنظام" : "First-time system setup"}
              </p>
            </div>

            {/* Progress */}
            <div className="flex border-b">
              {[
                { key: "compound", label: isRTL ? "المجمع" : "Compound", num: 1 },
                { key: "admin", label: isRTL ? "المدير" : "Admin Account", num: 2 },
              ].map((s) => (
                <div key={s.key}
                  className={`flex-1 py-3 text-center text-sm font-medium border-b-2 transition-colors ${
                    step === s.key
                      ? "border-blue-600 text-blue-600"
                      : STEPS.indexOf(step as Step) > STEPS.indexOf(s.key as Step)
                        ? "border-green-500 text-green-600"
                        : "border-transparent text-gray-400"
                  }`}>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs mr-2 ${
                    step === s.key ? "bg-blue-600 text-white" :
                    STEPS.indexOf(step as Step) > STEPS.indexOf(s.key as Step) ? "bg-green-500 text-white" :
                    "bg-gray-200 text-gray-500"
                  }`}>{s.num}</span>
                  {s.label}
                </div>
              ))}
            </div>

            <form onSubmit={step === "admin" ? handleSubmit : (e) => { e.preventDefault(); setStep("admin"); }}
              className="p-8 space-y-4">

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Step 1 — Compound */}
              {step === "compound" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {isRTL ? "اسم المجمع السكني" : "Compound / Complex Name"}
                    </label>
                    <input
                      value={form.compound_name}
                      onChange={(e) => setForm({ ...form, compound_name: e.target.value })}
                      placeholder={isRTL ? "مثال: مجمع النيل" : "e.g. Nile Compound"}
                      required
                      className="w-full border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {isRTL ? "هذا هو الاسم الذي سيظهر في كل أنحاء النظام"
                        : "This name appears throughout the system"}
                    </p>
                  </div>
                  <button type="submit"
                    className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 text-lg">
                    {isRTL ? "التالي ←" : "Next →"}
                  </button>
                </>
              )}

              {/* Step 2 — Admin account */}
              {step === "admin" && (
                <>
                  <p className="text-sm text-gray-500 -mt-1">
                    {isRTL
                      ? "هذا هو حساب المدير العام — يملك صلاحية كاملة على النظام"
                      : "This is the Super Admin account — full control over the entire system"}
                  </p>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {isRTL ? "الاسم الكامل" : "Full Name"}
                      </label>
                      <input value={form.admin_full_name}
                        onChange={(e) => setForm({ ...form, admin_full_name: e.target.value })}
                        placeholder={isRTL ? "مثال: أحمد سليمان" : "e.g. Ahmed Soliman"}
                        required
                        className="w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {isRTL ? "اسم المستخدم" : "Username"}
                      </label>
                      <input value={form.admin_username}
                        onChange={(e) => setForm({ ...form, admin_username: e.target.value.toLowerCase().replace(/\s/g, "") })}
                        placeholder="admin"
                        required
                        className="w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {isRTL ? "كلمة المرور" : "Password"}
                      </label>
                      <input value={form.admin_password}
                        onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                        type="password" placeholder="••••••••" required minLength={6}
                        className="w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {isRTL ? "تأكيد كلمة المرور" : "Confirm Password"}
                      </label>
                      <input value={form.admin_password_confirm}
                        onChange={(e) => setForm({ ...form, admin_password_confirm: e.target.value })}
                        type="password" placeholder="••••••••" required
                        className="w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setStep("compound")}
                      className="flex-1 border border-gray-300 text-gray-600 rounded-xl py-3 font-medium hover:bg-gray-50">
                      {isRTL ? "→ رجوع" : "← Back"}
                    </button>
                    <button type="submit" disabled={loading}
                      className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {loading
                        ? (isRTL ? "جاري الإعداد..." : "Setting up...")
                        : (isRTL ? "إنشاء النظام ✓" : "Create System ✓")}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        ) : (
          /* Done screen */
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
            <div className="text-6xl">✅</div>
            <h2 className="text-2xl font-bold text-gray-800">
              {isRTL ? "تم الإعداد بنجاح!" : "System Ready!"}
            </h2>
            <p className="text-gray-500">
              {isRTL
                ? `تم إنشاء مجمع "${form.compound_name}" وحساب المدير العام بنجاح.`
                : `Compound "${form.compound_name}" and Super Admin account created.`}
            </p>

            <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 text-sm">
              <p className="font-semibold text-gray-700">
                {isRTL ? "الخطوات التالية:" : "Next steps:"}
              </p>
              <ol className="space-y-1 text-gray-600 list-decimal list-inside">
                <li>{isRTL ? "أضف المباني من صفحة إدارة المستخدمين" : "Add buildings from Manage Users"}</li>
                <li>{isRTL ? "أضف مدير لكل مبنى (building_admin)" : "Add a building admin per building"}</li>
                <li>{isRTL ? "أضف حراس البوابة والمبنى" : "Add gate and building guards"}</li>
                <li>{isRTL ? "أضف الشقق وأفراد العائلة" : "Add apartments and family members"}</li>
                <li>{isRTL ? "أضف الكاميرات وابدأ المراقبة" : "Add cameras and start monitoring"}</li>
              </ol>
            </div>

            <button onClick={onDone}
              className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 text-lg">
              {isRTL ? "الدخول إلى النظام 🔒" : "Enter System 🔒"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
