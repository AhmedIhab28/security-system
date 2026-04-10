# SecureWatch — Complete Security Management System

## User Roles

| Role | Platform | What they do |
|---|---|---|
| `admin` | Windows desktop | Full access — cameras, residents, vehicles, all logs, weekly reset |
| `gate` | Mobile (Android) | Logs unknown visitors entering/exiting the compound |
| `building` | Mobile (Android) | Confirms visitor arrival and departure from their building |

---

## Visitor Lifecycle

```
Gate guard logs visitor → [entered_compound]
        ↓  (broadcast to building guards)
Building guard confirms arrival → [arrived_building]
        ↓
Building guard confirms departure → [left_building]
        ↓  (broadcast to gate guards — watch for exit)
Gate guard confirms compound exit → [left_compound]

If 10 minutes pass after [left_building] with no compound exit:
→ Status becomes [overdue]
→ Alert sent to ALL security staff on the compound
→ Saved to database
```

## Visitor Types
Gate guards can select: Visitor, Supermarket, Shipping, Restaurant Delivery, Maintenance, Other

## Alert Types
- `unknown_person` — camera AI spotted unrecognized face
- `unknown_vehicle` — camera AI spotted unregistered vehicle
- `overdue_visitor` — visitor left building 10+ min ago, not yet exited compound

## Weekly Reset
Every Monday 00:00 UTC the system automatically deletes:
- Resolved alerts older than 7 days
- Closed visitor logs (left_compound) older than 7 days
Admin can also trigger this manually from the Dashboard.

## Languages
English and Egyptian Arabic — user selects on login screen and sidebar. Full RTL layout for Arabic.

---

## Deployment

### Step 1 — Push to GitHub
```bash
cd security-system
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ahmedsoliman2812006/security-system.git
git push -u origin main
```

### Step 2 — Backend on Railway
1. [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Root directory: `backend`
3. Add PostgreSQL plugin (auto-injects `DATABASE_URL`)
4. Environment variables:
   ```
   SECRET_KEY=<long random string>
   FRONTEND_URL=https://<your-vercel-url>.vercel.app
   ```

### Step 3 — Frontend on Vercel
1. [vercel.com](https://vercel.com) → New Project → Import repo
2. Root directory: `frontend`
3. Environment variable: `VITE_API_URL=https://<your-railway-url>.up.railway.app`
4. Deploy

### Step 4 — Windows .exe
Update `PROD_URL` in `electron.js` with your Vercel URL, then:
```bash
cd frontend && npm install && npm run electron:build
```
Installer → `frontend/dist-electron/`

---

## First-Time Setup (API calls after deploy)

```bash
# 1. Create building group
POST /groups?name=Compound A

# 2. Create buildings
POST /buildings?name=Building 1&address=...&group_id=1
POST /buildings?name=Building 2&address=...&group_id=1

# 3. Create admin account
POST /auth/register?username=admin&password=secret&full_name=Admin&building_group_id=1&role=admin

# 4. Create gate guard account
POST /auth/register?username=gate1&password=secret&full_name=Gate Guard&building_group_id=1&role=gate

# 5. Create building guard account
POST /auth/register?username=guard1&password=secret&full_name=Building Guard&building_group_id=1&role=building&assigned_building_id=1

# 6. Add cameras (admin)
POST /cameras?name=Main Gate&stream_url=rtsp://...&building_id=1&location_description=Main Entrance

# 7. Register residents with face photos (admin, multipart)
POST /persons  [name, role=resident, building_group_id=1, photo=<file>]

# 8. Register vehicles (admin)
POST /vehicles?plate_number=ABC123&make=Toyota&model=Camry&color=White&building_group_id=1&owner_id=1

# 9. Start camera AI processing (admin)
POST /cameras/1/start
```

---

## Tips for Better Security

1. **Shift handover log** — add a `ShiftLog` model so guards can leave notes when changing shifts
2. **Panic button** — a single-tap button on mobile that broadcasts an emergency alert to all guards
3. **Blacklist** — a separate table for banned persons/plates that triggers instant alerts
4. **Visitor photo at gate** — the gate guard form supports uploading a photo of the visitor for the building guard to verify identity before opening the door
5. **Two-factor for admin** — add TOTP (Google Authenticator) for the Windows admin account
6. **Offline mode** — cache pending visitor log actions locally on mobile and sync when connection restores
7. **Daily report** — auto-generate a PDF summary of all visitor activity each day and email it to management
