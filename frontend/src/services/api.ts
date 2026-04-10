import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = async (username: string, password: string) => {
  const form = new URLSearchParams({ username, password });
  const res = await api.post("/auth/token", form);
  localStorage.setItem("token", res.data.access_token);
  return res.data;
};

export const logout = () => localStorage.removeItem("token");
export const getMe = () => api.get("/auth/me").then((r) => r.data);
export const getSetupStatus = () => api.get("/setup/status").then((r) => r.data);
export const runFirstSetup = (data: object) => api.post("/setup", data).then((r) => r.data);

// ── Persons ───────────────────────────────────────────────────────────────────
export const getPersons = (group_id?: number) =>
  api.get("/persons", { params: { group_id } }).then((r) => r.data);

export const addPerson = (formData: FormData) =>
  api.post("/persons", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    params: Object.fromEntries(
      ["name", "role", "building_group_id"].map((k) => [k, formData.get(k)])
    ),
  }).then((r) => r.data);

export const deletePerson = (id: number) =>
  api.delete(`/persons/${id}`).then((r) => r.data);

// ── Vehicles ──────────────────────────────────────────────────────────────────
export const getVehicles = (group_id?: number) =>
  api.get("/vehicles", { params: { group_id } }).then((r) => r.data);

export const addVehicle = (data: object) =>
  api.post("/vehicles", null, { params: data }).then((r) => r.data);

// ── Buildings ─────────────────────────────────────────────────────────────────
export const getBuildings = (group_id?: number) =>
  api.get("/buildings", { params: { group_id } }).then((r) => r.data);

// ── Cameras ───────────────────────────────────────────────────────────────────
export const getCameras = (building_id?: number) =>
  api.get("/cameras", { params: { building_id } }).then((r) => r.data);

export const startCamera = (id: number) =>
  api.post(`/cameras/${id}/start`).then((r) => r.data);

export const stopCamera = (id: number) =>
  api.post(`/cameras/${id}/stop`).then((r) => r.data);

// ── Visitor Logs ──────────────────────────────────────────────────────────────
export const getVisitorLogs = (params?: { status?: string; building_id?: number }) =>
  api.get("/visitor-logs", { params }).then((r) => r.data);

export const createVisitorLog = (data: object) =>
  api.post("/visitor-logs", data).then((r) => r.data);

export const visitorArrived = (id: number) =>
  api.put(`/visitor-logs/${id}/arrived`).then((r) => r.data);

export const visitorLeftBuilding = (id: number) =>
  api.put(`/visitor-logs/${id}/left-building`).then((r) => r.data);

export const visitorLeftCompound = (id: number) =>
  api.put(`/visitor-logs/${id}/left-compound`).then((r) => r.data);

// ── Alerts ────────────────────────────────────────────────────────────────────
export const getAlerts = (resolved = false) =>
  api.get("/alerts", { params: { resolved } }).then((r) => r.data);

export const resolveAlert = (id: number) =>
  api.put(`/alerts/${id}/resolve`).then((r) => r.data);

// ── Access Logs ───────────────────────────────────────────────────────────────
export const getAccessLogs = (camera_id?: number, limit = 50) =>
  api.get("/access-logs", { params: { camera_id, limit } }).then((r) => r.data);

// ── Admin ─────────────────────────────────────────────────────────────────────
export const triggerWeeklyReset = () =>
  api.post("/admin/reset-weekly").then((r) => r.data);

// ── Security Users (admin management) ────────────────────────────────────────
export const getSecurityUsers = () =>
  api.get("/security-users").then((r) => r.data);

export const updateSecurityUser = (id: number, data: object) =>
  api.put(`/security-users/${id}`, null, { params: data }).then((r) => r.data);

export const deleteSecurityUser = (id: number) =>
  api.delete(`/security-users/${id}`).then((r) => r.data);

export const registerSecurityUser = (data: object) =>
  api.post("/auth/register", null, { params: data }).then((r) => r.data);

// ── Shifts ────────────────────────────────────────────────────────────────────
export const startShift = (data: object) =>
  api.post("/shifts/start", data).then((r) => r.data);

export const endShift = (data: object) =>
  api.post("/shifts/end", data).then((r) => r.data);

export const getActiveShift = () =>
  api.get("/shifts/active").then((r) => r.data);

export const getShifts = () =>
  api.get("/shifts").then((r) => r.data);

// ── Apartments ────────────────────────────────────────────────────────────────
export const getApartments = (building_id?: number) =>
  api.get("/apartments", { params: { building_id } }).then((r) => r.data);

export const createApartment = (data: object) =>
  api.post("/apartments", data).then((r) => r.data);

export const deleteApartment = (id: number) =>
  api.delete(`/apartments/${id}`).then((r) => r.data);

// ── Resident Users ────────────────────────────────────────────────────────────
export const getResidents = (building_id?: number, apartment_id?: number) =>
  api.get("/residents", { params: { building_id, apartment_id } }).then((r) => r.data);

export const registerResident = (data: object) =>
  api.post("/residents/register", data).then((r) => r.data);

export const deleteResident = (id: number) =>
  api.delete(`/residents/${id}`).then((r) => r.data);

// ── Resident portal (uses resident token) ─────────────────────────────────────
export const residentLogin = async (username: string, password: string) => {
  const form = new URLSearchParams({ username, password });
  const res = await api.post("/residents/token", form);
  localStorage.setItem("resident_token", res.data.access_token);
  return res.data;
};

const residentApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000" });
residentApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("resident_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const getResidentMe = () =>
  residentApi.get("/residents/me").then((r) => r.data);

export const announceVisitor = (data: object) =>
  residentApi.post("/residents/visitor-request", data).then((r) => r.data);

export const getMyVisitorRequests = () =>
  residentApi.get("/residents/visitor-requests").then((r) => r.data);

// ── Emergency Logs ────────────────────────────────────────────────────────────
export const logEmergency = (data: object) =>
  api.post("/emergency-logs", data).then((r) => r.data);

export const emergencyLeft = (id: number) =>
  api.put(`/emergency-logs/${id}/left`).then((r) => r.data);

export const getEmergencyLogs = () =>
  api.get("/emergency-logs").then((r) => r.data);
