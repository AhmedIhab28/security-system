# Software Requirements Specification (SRS)
## SecureWatch — Residential Compound Security Management System

**Version:** 1.0  
**Date:** April 2026  
**Author:** Ahmed Ihab  

---

## Table of Contents

1. Introduction
2. System Overview
3. User Roles
4. Functional Requirements
5. Non-Functional Requirements
6. System Architecture
7. Database Schema
8. API Reference
9. Frontend Structure
10. Deployment
11. Known Limitations & Future Work

---

## 1. Introduction

### 1.1 Purpose
This document describes the full software requirements for SecureWatch, a residential compound security management system. It is intended for developers who will maintain, extend, or deploy the system.

### 1.2 Scope
SecureWatch manages visitor entry/exit tracking, guard shift logging, resident announcements, emergency vehicle logging, and real-time alerts across a multi-building residential compound. It runs as a web application accessible via browser, a Windows desktop app (Electron), and an Android mobile app (Capacitor).

### 1.3 Definitions

| Term | Definition |
|---|---|
| Compound | The entire residential complex (one BuildingGroup) |
| Building | A single block or tower within the compound |
| Apartment | One residential unit within a building |
| Resident | A person living in an apartment |
| Gate Guard | Security personnel at the compound entrance |
| Building Guard | Security personnel inside a specific building |
| Super Admin | The system owner with full control |
| Building Admin | A manager scoped to one building |
| Visitor Log | A record of an unknown visitor's entry/exit lifecycle |
| Visitor Request | A pre-announcement submitted by a resident |
| Shift Log | A record of a guard's working shift |
| Emergency Log | A record of police/ambulance/fire entry |

---

## 2. System Overview

SecureWatch tracks every person entering and leaving a residential compound through a structured lifecycle:

```
Resident announces visitor (optional)
        ↓
Gate guard logs visitor entering compound
        ↓
Building guard confirms visitor arrived at building
        ↓
Building guard confirms visitor left building
        ↓
Gate guard confirms visitor exited compound

If 10 minutes pass after "left building" with no compound exit:
→ Automatic OVERDUE alert sent to all security staff
```

Emergency vehicles (police, ambulance, fire) are logged separately with no alert — just saved to the database.

---

## 3. User Roles

### 3.1 Super Admin
- One account per compound
- Created during first-time setup wizard
- Full access: add/remove buildings, apartments, residents, guards, building admins
- Can trigger manual weekly data reset
- Uses Windows desktop app primarily

### 3.2 Building Admin
- One per building
- Created by super admin
- Scoped to their assigned building only
- Can manage residents, guards, apartments, and cameras within their building
- Can view shift logs for their building

### 3.3 Gate Guard
- Multiple per compound
- Logs visitors entering/exiting the compound
- Logs emergency vehicles
- Starts/ends shifts with post location and handover notes
- Receives real-time alerts on their mobile

### 3.4 Building Guard
- One or more per building
- Confirms visitor arrival at their building
- Confirms visitor departure from their building
- Starts/ends shifts
- Receives real-time alerts on their mobile

### 3.5 Resident
- Multiple per apartment (one account per family member)
- Pre-announces visitors (notifies building guard + all gate guards)
- Views their apartment info, vehicles, and parking spots
- Uses mobile app or browser

---

## 4. Functional Requirements

### 4.1 First-Time Setup
- FR-01: On first launch, if no super_admin exists, the system shows a setup wizard
- FR-02: Setup wizard collects compound name and super admin credentials
- FR-03: After setup, the wizard never appears again
- FR-04: The `/setup/status` endpoint returns `{"needs_setup": true/false}`

### 4.2 Authentication
- FR-05: All security users authenticate via `/auth/token` (OAuth2 password flow)
- FR-06: Residents authenticate via `/residents/token` (separate endpoint)
- FR-07: JWT tokens expire after 12 hours
- FR-08: Each token contains: user_id, role, building_group_id, assigned_building_id, admin_building_id
- FR-09: The app automatically routes to the correct interface based on role after login

### 4.3 Visitor Management
- FR-10: Gate guard can log a visitor with: name, type, destination building, destination apartment, vehicle plate (optional), notes
- FR-11: Visitor types: visitor, supermarket, shipping, restaurant, maintenance, other
- FR-12: On visitor log creation, a real-time WebSocket notification is sent to all building guards
- FR-13: Building guard can mark visitor as "arrived at building"
- FR-14: Building guard can mark visitor as "left building"
- FR-15: Gate guard can mark visitor as "left compound"
- FR-16: If 10 minutes pass after "left building" with no compound exit, status becomes "overdue" and an alert is broadcast to all security staff
- FR-17: Overdue check runs every 60 seconds on the server

### 4.4 Resident Visitor Requests
- FR-18: Residents can pre-announce a visitor with: name, type, vehicle plate (optional), notes
- FR-19: On submission, a real-time notification is sent to the building guard of the resident's building and all gate guards
- FR-20: Residents can view their own visitor request history

### 4.5 Shift Management
- FR-21: Guards must start a shift before performing any operational actions
- FR-22: Shift start requires: post type (gate/building), gate name or building selection
- FR-23: Shift end requires: optional handover person, optional handover notes
- FR-24: Starting a new shift automatically closes any previously open shift
- FR-25: Super admin and building admin can view full shift history

### 4.6 Emergency Logging
- FR-26: Any guard can log an emergency vehicle entry: type (police/ambulance/fire/other), plate, description, destination building/apartment (all optional)
- FR-27: Emergency logs do NOT trigger any alert — they are saved silently
- FR-28: Any guard can mark an emergency vehicle as "left compound"
- FR-29: Emergency logs are visible to all security staff

### 4.7 Alerts
- FR-30: Alerts are delivered in real-time via WebSocket to all connected security users in the same compound
- FR-31: Alert types: overdue_visitor, resident_visitor_request, visitor_incoming, visitor_left_building
- FR-32: Alerts can be resolved by any security user
- FR-33: Resolved alerts remain in the database until weekly reset

### 4.8 Building & Apartment Management (Admin)
- FR-34: Super admin can add/remove buildings
- FR-35: Super admin or building admin can add apartments to buildings
- FR-36: Each apartment has: building, apartment number, floor (optional), notes (optional)
- FR-37: Multiple family members can be added to one apartment
- FR-38: Each family member has their own login credentials
- FR-39: One member per apartment is marked as "primary" (head of household)
- FR-40: Vehicles belong to the apartment (not individual members): plate, make, model, color, parking spot

### 4.9 Weekly Reset
- FR-41: Every Monday at 00:00 UTC, the system automatically deletes resolved alerts and closed visitor logs older than 7 days
- FR-42: Super admin can trigger a manual reset from the dashboard
- FR-43: Before deleting visitor logs, visitor_request.visitor_log_id is nullified to avoid FK constraint errors

### 4.10 Language Support
- FR-44: The UI supports English and Egyptian Arabic
- FR-45: Language selection is available on the login screen and in the sidebar
- FR-46: Arabic layout uses RTL direction
- FR-47: Arabic uses Cairo font (loaded from Google Fonts)

---

## 5. Non-Functional Requirements

### 5.1 Performance
- NFR-01: API responses must complete within 2 seconds under normal load
- NFR-02: WebSocket alerts must be delivered within 1 second of the triggering event
- NFR-03: The overdue visitor checker runs every 60 seconds

### 5.2 Security
- NFR-04: All passwords are hashed using bcrypt (passlib, bcrypt==4.0.1)
- NFR-05: JWT tokens are signed with HS256 using a SECRET_KEY environment variable
- NFR-06: CORS is set to allow all origins (`*`) — acceptable because all endpoints require JWT authentication
- NFR-07: The `/setup` endpoint is blocked after the first super admin is created

### 5.3 Availability
- NFR-08: Backend hosted on Railway (free tier, $5/month credit)
- NFR-09: Database hosted on Neon (free tier, PostgreSQL, always-on)
- NFR-10: Frontend hosted on Vercel (free tier, always-on)

### 5.4 Compatibility
- NFR-11: Windows app requires Windows 10 or later (x64)
- NFR-12: Android app requires Android 8.0 (API 26) or later
- NFR-13: Web app supports Chrome, Firefox, Safari, Edge (latest versions)

---

## 6. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    CLIENTS                          │
│                                                     │
│  Windows (Electron)  Android (Capacitor)  Browser  │
│         └──────────────────┴──────────────┘        │
│                            │                        │
│              Vercel (React + Vite frontend)         │
└────────────────────────────┬────────────────────────┘
                             │ HTTPS + WebSocket
┌────────────────────────────▼────────────────────────┐
│              Railway (FastAPI backend)               │
│                                                     │
│  REST API  │  WebSocket (/ws/alerts)  │  Scheduler  │
└────────────────────────────┬────────────────────────┘
                             │ SQLAlchemy ORM
┌────────────────────────────▼────────────────────────┐
│              Neon (PostgreSQL database)              │
└─────────────────────────────────────────────────────┘
```

### 6.1 Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Backend | Python / FastAPI | 0.110.0 |
| ORM | SQLAlchemy | 2.0.29 |
| Database | PostgreSQL (Neon) | Latest |
| Auth | python-jose (JWT) + passlib (bcrypt) | — |
| Real-time | WebSocket (FastAPI native) | — |
| Frontend | React + TypeScript + Vite | React 18, Vite 5 |
| Styling | Tailwind CSS | 3.4 |
| State | Zustand (with persist) | 4.5 |
| HTTP client | Axios | 1.6 |
| Desktop | Electron | 30 |
| Mobile | Capacitor | 6 |
| Hosting (backend) | Railway | — |
| Hosting (frontend) | Vercel | — |
| Database hosting | Neon | — |

---

## 7. Database Schema

### 7.1 Tables Overview

| Table | Description |
|---|---|
| `building_groups` | The compound (one per deployment) |
| `buildings` | Individual blocks/towers |
| `apartments` | One row per residential unit |
| `resident_users` | One row per family member |
| `apartment_vehicles` | Vehicles linked to an apartment |
| `security_users` | Guards and admins |
| `shift_logs` | Guard shift records |
| `visitor_logs` | Visitor entry/exit lifecycle |
| `visitor_requests` | Resident pre-announcements |
| `emergency_logs` | Police/ambulance/fire entries |
| `alerts` | System alerts |
| `persons` | Legacy face recognition table (unused in current deployment) |
| `vehicles` | Legacy vehicle registry (unused in current deployment) |
| `cameras` | Legacy camera table (unused in current deployment) |
| `access_logs` | Legacy camera event log (unused in current deployment) |
| `parking_spots` | Legacy parking table (unused in current deployment) |

### 7.2 Key Relationships

```
BuildingGroup (1) ──── (many) Building
Building (1) ──── (many) Apartment
Apartment (1) ──── (many) ResidentUser
Apartment (1) ──── (many) ApartmentVehicle
Apartment (1) ──── (many) VisitorRequest
ResidentUser (1) ──── (many) VisitorRequest
SecurityUser (1) ──── (many) ShiftLog
VisitorLog ──── VisitorRequest (optional link)
```

### 7.3 Visitor Lifecycle States

```
entered_compound → arrived_building → left_building → left_compound
                                           ↓ (after 10 min, no exit)
                                         overdue
```

### 7.4 Important Notes for Developers

- `VisitorRequest.visitor_log_id` uses `use_alter=True` to avoid circular FK during table creation
- `ParkingSpot.assigned_resident_id` is an integer without a FK constraint (to avoid forward reference issue)
- `SecurityUser` has two building FK fields: `assigned_building_id` (for gate/building guards) and `admin_building_id` (for building_admin role)
- Weekly reset nullifies `visitor_request.visitor_log_id` before deleting visitor logs to avoid FK constraint errors

---

## 8. API Reference

### 8.1 Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/token` | None | Security user login (returns JWT) |
| POST | `/auth/register` | None | Register security user |
| GET | `/auth/me` | JWT | Get current user info |
| PUT | `/auth/fcm-token` | JWT | Update FCM push token |
| POST | `/residents/token` | None | Resident login (returns JWT) |
| GET | `/residents/me` | Resident JWT | Get resident profile + vehicles |

### 8.2 Setup

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/setup/status` | None | Check if setup is needed |
| POST | `/setup` | None | First-time setup (blocked after first use) |

### 8.3 Buildings & Apartments

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/buildings` | JWT | List buildings (scoped by role) |
| POST | `/buildings` | super_admin | Create building |
| PUT | `/buildings/{id}` | admin | Update building |
| DELETE | `/buildings/{id}` | super_admin | Delete building |
| GET | `/apartments` | admin | List apartments |
| POST | `/apartments` | admin | Create apartment |
| DELETE | `/apartments/{id}` | super_admin | Deactivate apartment |
| POST | `/apartments/{id}/vehicles` | admin | Add vehicle to apartment |
| GET | `/apartments/{id}/vehicles` | JWT | List apartment vehicles |
| DELETE | `/apartments/{id}/vehicles/{vid}` | admin | Remove vehicle |

### 8.4 Residents

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/residents/register` | admin | Register resident |
| GET | `/residents` | admin | List residents |
| DELETE | `/residents/{id}` | admin | Deactivate resident |
| POST | `/residents/visitor-request` | Resident JWT | Announce visitor |
| GET | `/residents/visitor-requests` | Resident JWT | Get own visitor requests |
| POST | `/residents/vehicles` | Resident JWT | Add vehicle to own apartment |
| DELETE | `/residents/vehicles/{id}` | Resident JWT | Remove own vehicle |

### 8.5 Security Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/security-users` | admin | List security users |
| PUT | `/security-users/{id}` | super_admin | Update user |
| DELETE | `/security-users/{id}` | super_admin | Deactivate user |

### 8.6 Visitor Logs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/visitor-logs` | JWT | Gate guard logs visitor entry |
| GET | `/visitor-logs` | JWT | List visitor logs |
| PUT | `/visitor-logs/{id}/arrived` | JWT | Building guard confirms arrival |
| PUT | `/visitor-logs/{id}/left-building` | JWT | Building guard confirms departure |
| PUT | `/visitor-logs/{id}/left-compound` | JWT | Gate guard confirms compound exit |

### 8.7 Shifts

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/shifts/start` | JWT | Start shift |
| POST | `/shifts/end` | JWT | End shift with handover |
| GET | `/shifts/active` | JWT | Get own active shift |
| GET | `/shifts` | admin | List all shifts |

### 8.8 Emergency Logs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/emergency-logs` | JWT | Log emergency vehicle entry |
| PUT | `/emergency-logs/{id}/left` | JWT | Mark emergency vehicle as left |
| GET | `/emergency-logs` | JWT | List emergency logs |

### 8.9 Alerts

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/alerts` | JWT | List alerts (resolved or open) |
| PUT | `/alerts/{id}/resolve` | JWT | Resolve alert |

### 8.10 Admin

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/admin/reset-weekly` | super_admin | Manual weekly reset |

### 8.11 WebSocket

| Endpoint | Description |
|---|---|
| `WS /ws/alerts?token=<jwt>` | Real-time alert stream for authenticated users |

**WebSocket message types:**

| Type | Sent when | Recipients |
|---|---|---|
| `visitor_incoming` | Gate guard logs visitor | All security users |
| `visitor_arrived` | Building guard confirms arrival | All security users |
| `visitor_left_building` | Building guard confirms departure | All security users |
| `overdue_visitor` | 10 min after left_building, no exit | All security users |
| `resident_visitor_request` | Resident announces visitor | All security users |

---

## 9. Frontend Structure

```
frontend/
├── src/
│   ├── App.tsx              # Root — routing, login, setup wizard check
│   ├── store.ts             # Zustand global state (user, lang, liveAlerts)
│   ├── i18n.ts              # English + Arabic translations
│   ├── main.tsx             # React entry point
│   ├── index.css            # Tailwind + Cairo font
│   ├── services/
│   │   ├── api.ts           # All Axios API calls
│   │   └── websocket.ts     # WebSocket connection manager
│   └── pages/
│       ├── Setup.tsx        # First-time setup wizard (2 steps)
│       ├── SetupGuide.tsx   # Post-login setup guide (5 steps)
│       ├── Dashboard.tsx    # Alert feed + weekly reset
│       ├── AdminUsers.tsx   # Buildings / Apartments / Guards / Shifts tabs
│       ├── GateLog.tsx      # Gate guard: log visitors in/out
│       ├── MyBuilding.tsx   # Building guard: confirm arrivals/departures
│       ├── ShiftCheckIn.tsx # All guards: start/end shift
│       ├── Emergency.tsx    # All guards: log emergency vehicles
│       ├── Alerts.tsx       # Alert history with resolve
│       ├── Residents.tsx    # Legacy persons/vehicles page (admin)
│       └── ResidentPortal.tsx # Resident: announce visitor, view apartment
├── electron.js              # Electron main process
├── capacitor.config.ts      # Capacitor (Android) config
├── vercel.json              # Vercel deployment config
├── vite.config.ts           # Vite config with dev proxy
├── tailwind.config.js       # Tailwind config
└── package.json             # Scripts: dev, build, electron:build, android
```

### 9.1 Role-Based Routing

After login, the app reads `user.role` from the JWT and shows:

| Role | Default route | Available pages |
|---|---|---|
| `super_admin` | `/dashboard` | Dashboard, Setup Guide, Manage Users, Emergency, Alerts |
| `building_admin` | `/dashboard` | Dashboard, Residents, Manage Users, Emergency, Alerts |
| `gate` | `/shift` | My Shift, Gate Log, Emergency, Alerts |
| `building` | `/shift` | My Shift, My Building, Emergency, Alerts |
| `resident` | `/resident` | Resident Portal only |

### 9.2 State Management

Zustand store (`store.ts`) holds:
- `user` — authenticated user object (persisted in localStorage)
- `lang` — current language `"en"` or `"ar"` (persisted)
- `t` — current translation object
- `liveAlerts` — real-time alert queue (max 50, in-memory only)

### 9.3 WebSocket Connection

`services/websocket.ts` manages a single shared WebSocket connection. Multiple components can register handlers. On disconnect it auto-reconnects after 3 seconds.

---

## 10. Deployment

### 10.1 Environment Variables

**Backend (Railway):**

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Railway/Neon) |
| `SECRET_KEY` | Yes | JWT signing secret — use a long random string |
| `FRONTEND_URL` | No | Vercel URL (used for CORS reference) |

**Frontend (Vercel):**

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes | Railway backend URL |

### 10.2 Backend Start Command

```
uvicorn main:app --host 0.0.0.0 --port 8000
```

Set this as the Custom Start Command in Railway Settings → Deploy.

### 10.3 Build Commands

**Windows .exe:**
```bash
cd frontend
npm install
npm run electron:build
# Output: frontend/dist-electron/SecureWatch Setup 1.0.0.exe
```

**Android APK:**
```bash
cd frontend
npm run build
npx cap sync android
npx cap open android
# In Android Studio: Build → Build APK
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

### 10.4 Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev   # runs on http://localhost:3000
```

---

## 11. Known Limitations & Future Work

### 11.1 Current Limitations

- **No camera/AI integration in cloud deployment** — face recognition and vehicle detection libraries (opencv, face_recognition, ultralytics/YOLOv8) were removed from `requirements.txt` because they exceed Railway's 4GB image size limit. The `recognition.py` file still exists with graceful fallback but is inactive.
- **No push notifications** — Firebase FCM is configured in the model (`fcm_token` field) but the `firebase-admin` package is not installed. Push notifications fall back to WebSocket only.
- **Single compound** — the system is designed for one compound per deployment. Multi-compound support would require tenant isolation.
- **No file storage service** — visitor photos are stored on the server disk. On Railway this is ephemeral (lost on redeploy). A future version should use Cloudinary or S3.

### 11.2 Suggested Future Features

1. **Camera AI (local server)** — run the AI recognition on a local Windows PC connected to the compound's CCTV, posting alerts to the cloud backend via API
2. **Firebase push notifications** — add `firebase-admin` to requirements and configure FCM for offline mobile alerts
3. **Blacklist** — a table of banned persons/plates that triggers instant alerts when detected
4. **Daily PDF report** — auto-generated summary of all visitor activity emailed to management
5. **Panic button** — one-tap emergency broadcast to all guards
6. **Offline sync** — cache pending actions on mobile when offline, sync when connection restores
7. **Multi-compound** — tenant isolation for managing multiple compounds from one deployment
8. **Visitor photo capture** — allow gate guard to take a photo of the visitor using the phone camera

---

## 12. Repository Structure

```
security-system/
├── backend/
│   ├── main.py          # FastAPI app — all endpoints
│   ├── models.py        # SQLAlchemy models
│   ├── database.py      # DB engine + session
│   ├── alerts.py        # WebSocket broadcast + FCM
│   ├── recognition.py   # AI recognition (inactive in cloud)
│   ├── requirements.txt # Python dependencies
│   ├── Procfile         # Railway start command
│   └── runtime.txt      # Python version
├── frontend/
│   ├── src/             # React source (see Section 9)
│   ├── electron.js      # Electron main process
│   ├── capacitor.config.ts
│   ├── package.json
│   ├── vercel.json
│   └── vite.config.ts
├── docker-compose.yml   # Local full-stack dev
├── SRS.md               # This document
└── README.md            # Quick deployment guide
```
