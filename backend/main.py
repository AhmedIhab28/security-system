from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional, List
import asyncio
import cv2
import os
import secrets
import pickle

from database import get_db, init_db, SessionLocal
from models import (
    Person, Vehicle, Camera, Building, BuildingGroup,
    AccessLog, Alert, SecurityUser, VisitorLog,
    ShiftLog, ResidentUser, ApartmentVehicle, VisitorRequest,
    Apartment, EmergencyLog, EmergencyType, EmergencyStatus,
    UserRole, PersonRole, VisitorType, VisitorStatus
)
from recognition import encode_face_from_bytes, analyze_frame, save_snapshot
from alerts import broadcast_alert, register_ws, unregister_ws

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

# ── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production-use-a-long-random-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    os.getenv("FRONTEND_URL", "https://security-system-ui.vercel.app"),
]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

app = FastAPI(title="SecureWatch API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/snapshots", StaticFiles(directory="snapshots"), name="snapshots")


@app.on_event("startup")
async def startup():
    init_db()
    asyncio.create_task(_weekly_reset_scheduler())
    asyncio.create_task(_overdue_visitor_checker())


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/setup/status")
def setup_status(db: Session = Depends(get_db)):
    """Returns whether the system has been set up (any super_admin exists)."""
    has_admin = db.query(SecurityUser).filter(
        SecurityUser.role == UserRole.super_admin
    ).first() is not None
    return {"needs_setup": not has_admin}


class SetupBody(BaseModel):
    compound_name: str
    admin_username: str
    admin_password: str
    admin_full_name: str


@app.post("/setup")
def first_time_setup(body: SetupBody, db: Session = Depends(get_db)):
    """One-time endpoint — only works when no super_admin exists yet."""
    if db.query(SecurityUser).filter(SecurityUser.role == UserRole.super_admin).first():
        raise HTTPException(403, "System already set up")
    # Create the compound (building group)
    group = BuildingGroup(name=body.compound_name)
    db.add(group)
    db.flush()
    # Create the super admin
    admin = SecurityUser(
        username=body.admin_username,
        hashed_password=pwd_context.hash(body.admin_password),
        full_name=body.admin_full_name,
        role=UserRole.super_admin,
        building_group_id=group.id,
    )
    db.add(admin)
    db.commit()
    return {"status": "setup complete", "group_id": group.id, "admin_id": admin.id}


# ── Auth ──────────────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str
    user_role: str
    user_id: int
    full_name: str
    assigned_building_id: Optional[int]
    admin_building_id: Optional[int]
    building_group_id: int


def create_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(SecurityUser).filter(SecurityUser.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(current_user: SecurityUser = Depends(get_current_user)):
    if current_user.role != UserRole.super_admin:
        raise HTTPException(status_code=403, detail="Super admin only")
    return current_user


def require_admin_or_building_admin(current_user: SecurityUser = Depends(get_current_user)):
    if current_user.role not in (UserRole.super_admin, UserRole.building_admin):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@app.post("/auth/token", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(SecurityUser).filter(SecurityUser.username == form.username).first()
    if not user or not pwd_context.verify(form.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect credentials")
    token = create_token({"sub": user.username}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_role": user.role,
        "user_id": user.id,
        "full_name": user.full_name,
        "assigned_building_id": user.assigned_building_id,
        "admin_building_id": user.admin_building_id,
        "building_group_id": user.building_group_id,
    }


@app.post("/auth/register")
def register(
    username: str, password: str, full_name: str,
    building_group_id: int, role: UserRole = UserRole.building,
    assigned_building_id: Optional[int] = None,
    admin_building_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    if db.query(SecurityUser).filter(SecurityUser.username == username).first():
        raise HTTPException(status_code=400, detail="Username taken")
    user = SecurityUser(
        username=username,
        hashed_password=pwd_context.hash(password),
        full_name=full_name,
        role=role,
        building_group_id=building_group_id,
        assigned_building_id=assigned_building_id,
        admin_building_id=admin_building_id,
    )
    db.add(user)
    db.commit()
    return {"id": user.id, "username": user.username, "role": user.role}


@app.put("/auth/fcm-token")
def update_fcm_token(fcm_token: str, current_user: SecurityUser = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    current_user.fcm_token = fcm_token
    db.commit()
    return {"status": "updated"}


@app.get("/auth/me")
def me(current_user: SecurityUser = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "building_group_id": current_user.building_group_id,
        "assigned_building_id": current_user.assigned_building_id,
        "admin_building_id": current_user.admin_building_id,
    }


# ── Building Groups & Buildings ───────────────────────────────────────────────

@app.get("/groups")
def list_groups(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(BuildingGroup).all()


@app.post("/groups")
def create_group(name: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    g = BuildingGroup(name=name)
    db.add(g)
    db.commit()
    return {"id": g.id, "name": g.name}


@app.get("/buildings")
def list_buildings(group_id: Optional[int] = None, db: Session = Depends(get_db),
                   current_user: SecurityUser = Depends(get_current_user)):
    q = db.query(Building)
    if current_user.role == UserRole.building_admin:
        # building_admin only sees their own building
        q = q.filter(Building.id == current_user.admin_building_id)
    elif group_id:
        q = q.filter(Building.group_id == group_id)
    return q.all()


@app.post("/buildings")
def create_building(name: str, address: str, group_id: int,
                    db: Session = Depends(get_db), _=Depends(require_admin)):
    b = Building(name=name, address=address, group_id=group_id)
    db.add(b)
    db.commit()
    return {"id": b.id, "name": b.name}


@app.put("/buildings/{building_id}")
def update_building(building_id: int, name: str, address: str,
                    db: Session = Depends(get_db),
                    current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    b = db.query(Building).filter(Building.id == building_id).first()
    if not b:
        raise HTTPException(404, "Building not found")
    if current_user.role == UserRole.building_admin and current_user.admin_building_id != building_id:
        raise HTTPException(403, "Not your building")
    b.name = name
    b.address = address
    db.commit()
    return {"id": b.id, "name": b.name}


@app.delete("/buildings/{building_id}")
def delete_building(building_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    b = db.query(Building).filter(Building.id == building_id).first()
    if not b:
        raise HTTPException(404, "Not found")
    db.delete(b)
    db.commit()
    return {"status": "deleted"}


# ── Cameras ───────────────────────────────────────────────────────────────────

@app.get("/cameras")
def list_cameras(building_id: Optional[int] = None, db: Session = Depends(get_db),
                 current_user: SecurityUser = Depends(get_current_user)):
    q = db.query(Camera)
    if current_user.role == UserRole.building_admin:
        q = q.filter(Camera.building_id == current_user.admin_building_id)
    elif building_id:
        q = q.filter(Camera.building_id == building_id)
    return q.all()


@app.post("/cameras")
def add_camera(name: str, stream_url: str, building_id: int,
               location_description: str = "",
               db: Session = Depends(get_db),
               current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    if current_user.role == UserRole.building_admin and current_user.admin_building_id != building_id:
        raise HTTPException(403, "Not your building")
    cam = Camera(name=name, stream_url=stream_url, building_id=building_id,
                 location_description=location_description)
    db.add(cam)
    db.commit()
    return {"id": cam.id, "name": cam.name}


@app.delete("/cameras/{camera_id}")
def delete_camera(camera_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(404, "Not found")
    db.delete(cam)
    db.commit()
    return {"status": "deleted"}


@app.post("/cameras/{camera_id}/start")
async def start_camera(camera_id: int, db: Session = Depends(get_db),
                       current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(404, "Camera not found")
    if current_user.role == UserRole.building_admin and cam.building_id != current_user.admin_building_id:
        raise HTTPException(403, "Not your building")
    if camera_id in _camera_tasks and not _camera_tasks[camera_id].done():
        return {"status": "already running"}
    building = db.query(Building).filter(Building.id == cam.building_id).first()
    task = asyncio.create_task(
        process_camera_stream(camera_id, cam.stream_url, building.group_id)
    )
    _camera_tasks[camera_id] = task
    return {"status": "started", "camera": cam.name}


@app.post("/cameras/{camera_id}/stop")
async def stop_camera(camera_id: int, _=Depends(require_admin_or_building_admin)):
    task = _camera_tasks.get(camera_id)
    if task and not task.done():
        task.cancel()
    return {"status": "stopped"}


# ── Persons (admin only) ──────────────────────────────────────────────────────

@app.get("/persons")
def list_persons(group_id: Optional[int] = None, db: Session = Depends(get_db),
                 current_user: SecurityUser = Depends(get_current_user)):
    q = db.query(Person)
    if current_user.role == UserRole.building_admin:
        q = q.filter(Person.building_group_id == current_user.building_group_id)
    elif group_id:
        q = q.filter(Person.building_group_id == group_id)
    return [{"id": p.id, "name": p.name, "role": p.role, "is_active": p.is_active,
             "photo_path": p.photo_path} for p in q.all()]


@app.post("/persons")
async def add_person(name: str, role: PersonRole, building_group_id: int,
                     photo: UploadFile = File(...),
                     db: Session = Depends(get_db),
                     current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    photo_bytes = await photo.read()
    enc_bytes = encode_face_from_bytes(photo_bytes)
    photo_path = f"snapshots/person_{name.replace(' ', '_')}_{secrets.token_hex(4)}.jpg"
    with open(photo_path, "wb") as f:
        f.write(photo_bytes)
    person = Person(name=name, role=role, face_encoding=enc_bytes,
                    photo_path=photo_path, building_group_id=building_group_id)
    db.add(person)
    db.commit()
    return {"id": person.id, "name": person.name, "has_face": enc_bytes is not None}


@app.delete("/persons/{person_id}")
def delete_person(person_id: int, db: Session = Depends(get_db),
                  current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    p = db.query(Person).filter(Person.id == person_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    p.is_active = False
    db.commit()
    return {"status": "deactivated"}


# ── Vehicles ──────────────────────────────────────────────────────────────────

@app.get("/vehicles")
def list_vehicles(group_id: Optional[int] = None, db: Session = Depends(get_db),
                  current_user: SecurityUser = Depends(get_current_user)):
    q = db.query(Vehicle)
    if current_user.role == UserRole.building_admin:
        q = q.filter(Vehicle.building_group_id == current_user.building_group_id)
    elif group_id:
        q = q.filter(Vehicle.building_group_id == group_id)
    return q.all()


@app.post("/vehicles")
def add_vehicle(plate_number: str, make: str, model: str, color: str,
                building_group_id: int, owner_id: Optional[int] = None,
                db: Session = Depends(get_db),
                current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    v = Vehicle(plate_number=plate_number, make=make, model=model, color=color,
                building_group_id=building_group_id, owner_id=owner_id)
    db.add(v)
    db.commit()
    return {"id": v.id, "plate_number": v.plate_number}


@app.delete("/vehicles/{vehicle_id}")
def delete_vehicle(vehicle_id: int, db: Session = Depends(get_db),
                   current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not v:
        raise HTTPException(404, "Not found")
    v.is_active = False
    db.commit()
    return {"status": "deactivated"}


# ── Visitor Logs ──────────────────────────────────────────────────────────────

class VisitorLogCreate(BaseModel):
    visitor_name: str
    visitor_type: VisitorType
    destination_building_id: int
    destination_apartment: str
    vehicle_plate: Optional[str] = None
    notes: Optional[str] = None


@app.post("/visitor-logs")
async def create_visitor_log(
    data: VisitorLogCreate,
    photo: Optional[UploadFile] = File(None),
    current_user: SecurityUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Gate guard logs an unknown visitor entering the compound."""
    photo_path = None
    if photo:
        photo_bytes = await photo.read()
        photo_path = f"snapshots/visitor_{secrets.token_hex(6)}.jpg"
        with open(photo_path, "wb") as f:
            f.write(photo_bytes)

    vl = VisitorLog(
        building_group_id=current_user.building_group_id,
        visitor_name=data.visitor_name,
        visitor_type=data.visitor_type,
        photo_path=photo_path,
        vehicle_plate=data.vehicle_plate,
        destination_building_id=data.destination_building_id,
        destination_apartment=data.destination_apartment,
        status=VisitorStatus.entered_compound,
        gate_guard_in_id=current_user.id,
        notes=data.notes,
    )
    db.add(vl)
    db.commit()
    db.refresh(vl)

    # Notify building guards of the incoming visitor
    building = db.query(Building).filter(Building.id == data.destination_building_id).first()
    await broadcast_alert({
        "type": "visitor_incoming",
        "title": "Visitor Incoming",
        "visitor_log_id": vl.id,
        "visitor_name": data.visitor_name,
        "visitor_type": data.visitor_type,
        "destination_building": building.name if building else "",
        "destination_apartment": data.destination_apartment,
        "vehicle_plate": data.vehicle_plate or "",
        "photo": f"/snapshots/{photo_path.split('/')[-1]}" if photo_path else "",
        "timestamp": vl.entered_compound_at.isoformat(),
    }, current_user.building_group_id, db)

    return {"id": vl.id, "status": vl.status}


@app.get("/visitor-logs")
def list_visitor_logs(
    status: Optional[VisitorStatus] = None,
    building_id: Optional[int] = None,
    current_user: SecurityUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(VisitorLog).filter(
        VisitorLog.building_group_id == current_user.building_group_id
    )
    if status:
        q = q.filter(VisitorLog.status == status)
    if building_id:
        q = q.filter(VisitorLog.destination_building_id == building_id)
    logs = q.order_by(VisitorLog.created_at.desc()).limit(100).all()
    result = []
    for vl in logs:
        result.append({
            "id": vl.id,
            "visitor_name": vl.visitor_name,
            "visitor_type": vl.visitor_type,
            "photo_path": vl.photo_path,
            "vehicle_plate": vl.vehicle_plate,
            "destination_building_id": vl.destination_building_id,
            "destination_building": vl.destination_building.name if vl.destination_building else "",
            "destination_apartment": vl.destination_apartment,
            "status": vl.status,
            "entered_compound_at": vl.entered_compound_at.isoformat() if vl.entered_compound_at else None,
            "arrived_building_at": vl.arrived_building_at.isoformat() if vl.arrived_building_at else None,
            "left_building_at": vl.left_building_at.isoformat() if vl.left_building_at else None,
            "left_compound_at": vl.left_compound_at.isoformat() if vl.left_compound_at else None,
            "notes": vl.notes,
        })
    return result


@app.put("/visitor-logs/{log_id}/arrived")
async def visitor_arrived(
    log_id: int,
    current_user: SecurityUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Building guard confirms visitor arrived at the building."""
    vl = db.query(VisitorLog).filter(VisitorLog.id == log_id).first()
    if not vl:
        raise HTTPException(404, "Visitor log not found")
    vl.status = VisitorStatus.arrived_building
    vl.arrived_building_at = datetime.utcnow()
    vl.building_guard_id = current_user.id
    db.commit()
    await broadcast_alert({
        "type": "visitor_arrived",
        "visitor_log_id": log_id,
        "visitor_name": vl.visitor_name,
        "destination_apartment": vl.destination_apartment,
        "timestamp": vl.arrived_building_at.isoformat(),
    }, current_user.building_group_id, db)
    return {"status": vl.status}


@app.put("/visitor-logs/{log_id}/left-building")
async def visitor_left_building(
    log_id: int,
    current_user: SecurityUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Building guard confirms visitor left the building."""
    vl = db.query(VisitorLog).filter(VisitorLog.id == log_id).first()
    if not vl:
        raise HTTPException(404, "Visitor log not found")
    vl.status = VisitorStatus.left_building
    vl.left_building_at = datetime.utcnow()
    db.commit()
    # Notify gate guard to watch for exit
    await broadcast_alert({
        "type": "visitor_left_building",
        "visitor_log_id": log_id,
        "visitor_name": vl.visitor_name,
        "vehicle_plate": vl.vehicle_plate or "",
        "left_building_at": vl.left_building_at.isoformat(),
        "title": "Visitor Left Building",
        "message": f"{vl.visitor_name} left the building — watch for compound exit",
    }, current_user.building_group_id, db)
    return {"status": vl.status}


@app.put("/visitor-logs/{log_id}/left-compound")
async def visitor_left_compound(
    log_id: int,
    current_user: SecurityUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Gate guard confirms visitor exited the compound."""
    vl = db.query(VisitorLog).filter(VisitorLog.id == log_id).first()
    if not vl:
        raise HTTPException(404, "Visitor log not found")
    vl.status = VisitorStatus.left_compound
    vl.left_compound_at = datetime.utcnow()
    vl.gate_guard_out_id = current_user.id
    db.commit()
    return {"status": vl.status}


# ── Alerts ────────────────────────────────────────────────────────────────────

@app.get("/alerts")
def list_alerts(
    resolved: bool = False,
    current_user: SecurityUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Alert).filter(
        Alert.building_group_id == current_user.building_group_id,
        Alert.is_resolved == resolved,
    )
    return q.order_by(Alert.created_at.desc()).limit(100).all()


@app.put("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db),
                  current_user: SecurityUser = Depends(get_current_user)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(404, "Alert not found")
    alert.is_resolved = True
    alert.resolved_by = current_user.id
    db.commit()
    return {"status": "resolved"}


# ── Access Logs ───────────────────────────────────────────────────────────────

@app.get("/access-logs")
def list_access_logs(camera_id: Optional[int] = None, limit: int = 50,
                     db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(AccessLog)
    if camera_id:
        q = q.filter(AccessLog.camera_id == camera_id)
    return q.order_by(AccessLog.timestamp.desc()).limit(limit).all()


# ── Weekly Reset ──────────────────────────────────────────────────────────────

@app.post("/admin/reset-weekly")
def manual_weekly_reset(db: Session = Depends(get_db), _=Depends(require_admin)):
    _do_weekly_reset(db)
    return {"status": "reset complete"}


# ── Security User Management (super_admin only) ───────────────────────────────

@app.get("/security-users")
def list_security_users(db: Session = Depends(get_db),
                        current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    q = db.query(SecurityUser).filter(
        SecurityUser.building_group_id == current_user.building_group_id
    )
    if current_user.role == UserRole.building_admin:
        # building_admin sees only guards assigned to their building
        q = q.filter(SecurityUser.assigned_building_id == current_user.admin_building_id)
    return [{"id": u.id, "username": u.username, "full_name": u.full_name,
             "role": u.role, "assigned_building_id": u.assigned_building_id,
             "admin_building_id": u.admin_building_id, "is_active": u.is_active} for u in q.all()]


@app.put("/security-users/{user_id}")
def update_security_user(user_id: int, full_name: Optional[str] = None,
                         assigned_building_id: Optional[int] = None,
                         admin_building_id: Optional[int] = None,
                         is_active: Optional[bool] = None,
                         db: Session = Depends(get_db), _=Depends(require_admin)):
    u = db.query(SecurityUser).filter(SecurityUser.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    if full_name is not None:
        u.full_name = full_name
    if assigned_building_id is not None:
        u.assigned_building_id = assigned_building_id
    if admin_building_id is not None:
        u.admin_building_id = admin_building_id
    if is_active is not None:
        u.is_active = is_active
    db.commit()
    return {"status": "updated"}


@app.delete("/security-users/{user_id}")
def delete_security_user(user_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    u = db.query(SecurityUser).filter(SecurityUser.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    u.is_active = False
    db.commit()
    return {"status": "deactivated"}


# ── Shift Logs ────────────────────────────────────────────────────────────────

class ShiftStartBody(BaseModel):
    post_type: str          # "gate" | "building"
    post_building_id: Optional[int] = None
    post_gate_name: Optional[str] = None


class ShiftEndBody(BaseModel):
    handed_over_to_id: Optional[int] = None
    handover_notes: Optional[str] = None


@app.post("/shifts/start")
def start_shift(body: ShiftStartBody, db: Session = Depends(get_db),
                current_user: SecurityUser = Depends(get_current_user)):
    # Close any existing open shift for this guard
    db.query(ShiftLog).filter(
        ShiftLog.guard_id == current_user.id,
        ShiftLog.is_active == True,
    ).update({"is_active": False, "shift_end": datetime.utcnow()})
    shift = ShiftLog(
        guard_id=current_user.id,
        building_group_id=current_user.building_group_id,
        post_type=body.post_type,
        post_building_id=body.post_building_id,
        post_gate_name=body.post_gate_name,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return {"id": shift.id, "shift_start": shift.shift_start, "post_type": shift.post_type}


@app.post("/shifts/end")
def end_shift(body: ShiftEndBody, db: Session = Depends(get_db),
              current_user: SecurityUser = Depends(get_current_user)):
    shift = db.query(ShiftLog).filter(
        ShiftLog.guard_id == current_user.id,
        ShiftLog.is_active == True,
    ).first()
    if not shift:
        raise HTTPException(404, "No active shift found")
    shift.shift_end = datetime.utcnow()
    shift.is_active = False
    shift.handed_over_to_id = body.handed_over_to_id
    shift.handover_notes = body.handover_notes
    db.commit()
    return {"status": "shift ended", "duration_minutes": int((shift.shift_end - shift.shift_start).total_seconds() / 60)}


@app.get("/shifts/active")
def get_active_shift(db: Session = Depends(get_db),
                     current_user: SecurityUser = Depends(get_current_user)):
    shift = db.query(ShiftLog).filter(
        ShiftLog.guard_id == current_user.id,
        ShiftLog.is_active == True,
    ).first()
    if not shift:
        return None
    return {
        "id": shift.id,
        "post_type": shift.post_type,
        "post_building_id": shift.post_building_id,
        "post_gate_name": shift.post_gate_name,
        "shift_start": shift.shift_start.isoformat(),
    }


@app.get("/shifts")
def list_shifts(db: Session = Depends(get_db),
                current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    q = db.query(ShiftLog).filter(
        ShiftLog.building_group_id == current_user.building_group_id
    )
    if current_user.role == UserRole.building_admin:
        q = q.filter(ShiftLog.post_building_id == current_user.admin_building_id)
    shifts = q.order_by(ShiftLog.shift_start.desc()).limit(200).all()
    return [{
        "id": s.id,
        "guard_name": s.guard.full_name if s.guard else "",
        "post_type": s.post_type,
        "post_gate_name": s.post_gate_name,
        "post_building": s.post_building.name if s.post_building else "",
        "shift_start": s.shift_start.isoformat(),
        "shift_end": s.shift_end.isoformat() if s.shift_end else None,
        "is_active": s.is_active,
        "handed_over_to": s.handed_over_to.full_name if s.handed_over_to else None,
        "handover_notes": s.handover_notes,
    } for s in shifts]


# ── Apartments ────────────────────────────────────────────────────────────────

class ApartmentCreate(BaseModel):
    building_id: int
    apartment_number: str
    floor: Optional[str] = None
    notes: Optional[str] = None


@app.post("/apartments")
def create_apartment(body: ApartmentCreate, db: Session = Depends(get_db),
                     current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    building = db.query(Building).filter(Building.id == body.building_id).first()
    if not building:
        raise HTTPException(404, "Building not found")
    if current_user.role == UserRole.building_admin and current_user.admin_building_id != body.building_id:
        raise HTTPException(403, "Not your building")
    apt = Apartment(
        building_id=body.building_id,
        building_group_id=building.group_id,
        apartment_number=body.apartment_number,
        floor=body.floor,
        notes=body.notes,
    )
    db.add(apt)
    db.commit()
    db.refresh(apt)
    return {"id": apt.id, "apartment_number": apt.apartment_number, "building_id": apt.building_id}


@app.get("/apartments")
def list_apartments(building_id: Optional[int] = None, db: Session = Depends(get_db),
                    current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    q = db.query(Apartment).filter(Apartment.is_active == True)
    if current_user.role == UserRole.building_admin:
        q = q.filter(Apartment.building_id == current_user.admin_building_id)
    elif building_id:
        q = q.filter(Apartment.building_id == building_id)
    apts = q.order_by(Apartment.apartment_number).all()
    return [{
        "id": a.id,
        "building_id": a.building_id,
        "building_name": a.building.name if a.building else "",
        "apartment_number": a.apartment_number,
        "floor": a.floor,
        "notes": a.notes,
        "member_count": len(a.members),
        "vehicle_count": len([v for v in a.vehicles if v.is_active]),
    } for a in apts]


@app.delete("/apartments/{apt_id}")
def delete_apartment(apt_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    apt = db.query(Apartment).filter(Apartment.id == apt_id).first()
    if not apt:
        raise HTTPException(404, "Not found")
    apt.is_active = False
    db.commit()
    return {"status": "deactivated"}


# ── Resident Users ────────────────────────────────────────────────────────────

class ResidentRegisterBody(BaseModel):
    username: str
    password: str
    full_name: str
    phone: Optional[str] = None
    apartment_id: int
    is_primary: bool = False


@app.post("/residents/register")
def register_resident(body: ResidentRegisterBody, db: Session = Depends(get_db),
                      current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    if db.query(ResidentUser).filter(ResidentUser.username == body.username).first():
        raise HTTPException(400, "Username taken")
    apt = db.query(Apartment).filter(Apartment.id == body.apartment_id).first()
    if not apt:
        raise HTTPException(404, "Apartment not found")
    if current_user.role == UserRole.building_admin and apt.building_id != current_user.admin_building_id:
        raise HTTPException(403, "Not your building")
    r = ResidentUser(
        username=body.username,
        hashed_password=pwd_context.hash(body.password),
        full_name=body.full_name,
        phone=body.phone,
        apartment_id=body.apartment_id,
        building_group_id=apt.building_group_id,
        is_primary=body.is_primary,
    )
    db.add(r)
    db.commit()
    return {"id": r.id, "username": r.username, "apartment_id": r.apartment_id}


@app.get("/residents")
def list_residents(building_id: Optional[int] = None, apartment_id: Optional[int] = None,
                   db: Session = Depends(get_db),
                   current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    q = db.query(ResidentUser).join(Apartment, ResidentUser.apartment_id == Apartment.id)
    if current_user.role == UserRole.building_admin:
        q = q.filter(Apartment.building_id == current_user.admin_building_id)
    elif building_id:
        q = q.filter(Apartment.building_id == building_id)
    if apartment_id:
        q = q.filter(ResidentUser.apartment_id == apartment_id)
    return [{
        "id": r.id, "username": r.username, "full_name": r.full_name,
        "phone": r.phone,
        "apartment_id": r.apartment_id,
        "apartment_number": r.apartment.apartment_number if r.apartment else "",
        "building_id": r.apartment.building_id if r.apartment else None,
        "building_name": r.apartment.building.name if r.apartment and r.apartment.building else "",
        "is_primary": r.is_primary,
        "is_active": r.is_active,
    } for r in q.all()]


@app.delete("/residents/{resident_id}")
def delete_resident(resident_id: int, db: Session = Depends(get_db),
                    current_user: SecurityUser = Depends(require_admin_or_building_admin)):
    r = db.query(ResidentUser).filter(ResidentUser.id == resident_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    if current_user.role == UserRole.building_admin:
        apt = db.query(Apartment).filter(Apartment.id == r.apartment_id).first()
        if apt and apt.building_id != current_user.admin_building_id:
            raise HTTPException(403, "Not your building")
    r.is_active = False
    db.commit()
    return {"status": "deactivated"}


# ── Resident auth (separate token endpoint) ───────────────────────────────────

class ResidentToken(BaseModel):
    access_token: str
    token_type: str
    resident_id: int
    full_name: str
    building_id: int
    apartment_number: str


resident_oauth2 = OAuth2PasswordBearer(tokenUrl="/residents/token")


@app.post("/residents/token", response_model=ResidentToken)
def resident_login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    r = db.query(ResidentUser).filter(ResidentUser.username == form.username,
                                      ResidentUser.is_active == True).first()
    if not r or not pwd_context.verify(form.password, r.hashed_password):
        raise HTTPException(400, "Incorrect credentials")
    token = create_token({"sub": f"resident:{r.username}"},
                         timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return {
        "access_token": token, "token_type": "bearer",
        "resident_id": r.id, "full_name": r.full_name,
        "building_id": r.building_id, "apartment_number": r.apartment_number,
    }


def get_current_resident(token: str = Depends(resident_oauth2), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub: str = payload.get("sub", "")
        if not sub.startswith("resident:"):
            raise HTTPException(401, "Not a resident token")
        username = sub.split(":", 1)[1]
    except JWTError:
        raise HTTPException(401, "Invalid token")
    r = db.query(ResidentUser).filter(ResidentUser.username == username,
                                      ResidentUser.is_active == True).first()
    if not r:
        raise HTTPException(401, "Resident not found")
    return r


@app.get("/residents/me")
def resident_me(current: ResidentUser = Depends(get_current_resident), db: Session = Depends(get_db)):
    apt = current.apartment
    vehicles = db.query(ApartmentVehicle).filter(
        ApartmentVehicle.apartment_id == apt.id,
        ApartmentVehicle.is_active == True,
    ).all() if apt else []
    members = db.query(ResidentUser).filter(
        ResidentUser.apartment_id == apt.id,
        ResidentUser.is_active == True,
    ).all() if apt else []
    return {
        "id": current.id,
        "full_name": current.full_name,
        "is_primary": current.is_primary,
        "apartment_id": apt.id if apt else None,
        "apartment_number": apt.apartment_number if apt else "",
        "floor": apt.floor if apt else "",
        "building_id": apt.building_id if apt else None,
        "building_name": apt.building.name if apt and apt.building else "",
        "members": [{"id": m.id, "full_name": m.full_name, "phone": m.phone,
                     "is_primary": m.is_primary} for m in members],
        "vehicles": [{"id": v.id, "plate_number": v.plate_number, "make": v.make,
                      "model": v.model, "color": v.color, "parking_spot": v.parking_spot}
                     for v in vehicles],
    }


# ── Resident visitor requests ─────────────────────────────────────────────────

class VisitorRequestBody(BaseModel):
    visitor_name: str
    visitor_type: VisitorType
    vehicle_plate: Optional[str] = None
    notes: Optional[str] = None


@app.post("/residents/visitor-request")
async def resident_visitor_request(body: VisitorRequestBody,
                                   current: ResidentUser = Depends(get_current_resident),
                                   db: Session = Depends(get_db)):
    apt = current.apartment
    vr = VisitorRequest(
        resident_id=current.id,
        apartment_id=apt.id,
        building_group_id=current.building_group_id,
        visitor_name=body.visitor_name,
        visitor_type=body.visitor_type,
        vehicle_plate=body.vehicle_plate,
        notes=body.notes,
    )
    db.add(vr)
    db.commit()
    db.refresh(vr)
    await broadcast_alert({
        "type": "resident_visitor_request",
        "title": "Visitor Expected",
        "visitor_request_id": vr.id,
        "visitor_name": body.visitor_name,
        "visitor_type": body.visitor_type,
        "vehicle_plate": body.vehicle_plate or "",
        "from_resident": current.full_name,
        "apartment": apt.apartment_number if apt else "",
        "building_id": apt.building_id if apt else None,
        "building_name": apt.building.name if apt and apt.building else "",
        "timestamp": vr.created_at.isoformat(),
    }, current.building_group_id, db)
    return {"id": vr.id, "status": "notified"}


@app.get("/residents/visitor-requests")
def resident_visitor_requests(current: ResidentUser = Depends(get_current_resident),
                               db: Session = Depends(get_db)):
    reqs = db.query(VisitorRequest).filter(
        VisitorRequest.resident_id == current.id
    ).order_by(VisitorRequest.created_at.desc()).limit(50).all()
    return [{"id": r.id, "visitor_name": r.visitor_name, "visitor_type": r.visitor_type,
             "vehicle_plate": r.vehicle_plate, "notes": r.notes,
             "created_at": r.created_at.isoformat(), "is_active": r.is_active} for r in reqs]


# ── Resident Vehicles ─────────────────────────────────────────────────────────

class ResidentVehicleBody(BaseModel):
    plate_number: str
    make: Optional[str] = None
    model: Optional[str] = None
    color: Optional[str] = None
    parking_spot: Optional[str] = None


@app.post("/residents/vehicles")
def add_resident_vehicle(body: ResidentVehicleBody,
                         current: ResidentUser = Depends(get_current_resident),
                         db: Session = Depends(get_db)):
    v = ApartmentVehicle(
        apartment_id=current.apartment_id,
        plate_number=body.plate_number,
        make=body.make,
        model=body.model,
        color=body.color,
        parking_spot=body.parking_spot,
    )
    db.add(v)
    db.commit()
    return {"id": v.id, "plate_number": v.plate_number}


@app.delete("/residents/vehicles/{vehicle_id}")
def delete_resident_vehicle(vehicle_id: int,
                             current: ResidentUser = Depends(get_current_resident),
                             db: Session = Depends(get_db)):
    v = db.query(ApartmentVehicle).filter(
        ApartmentVehicle.id == vehicle_id,
        ApartmentVehicle.apartment_id == current.apartment_id,
    ).first()
    if not v:
        raise HTTPException(404, "Vehicle not found")
    v.is_active = False
    db.commit()
    return {"status": "deleted"}


# ── Emergency Logs ────────────────────────────────────────────────────────────

class EmergencyBody(BaseModel):
    emergency_type: EmergencyType
    vehicle_plate: Optional[str] = None
    description: Optional[str] = None
    destination_building_id: Optional[int] = None
    destination_apartment: Optional[str] = None


@app.post("/emergency-logs")
def log_emergency(body: EmergencyBody, db: Session = Depends(get_db),
                  current_user: SecurityUser = Depends(get_current_user)):
    el = EmergencyLog(
        building_group_id=current_user.building_group_id,
        emergency_type=body.emergency_type,
        vehicle_plate=body.vehicle_plate,
        description=body.description,
        destination_building_id=body.destination_building_id,
        destination_apartment=body.destination_apartment,
        logged_by_id=current_user.id,
    )
    db.add(el)
    db.commit()
    db.refresh(el)
    return {"id": el.id, "status": el.status, "entered_at": el.entered_at.isoformat()}


@app.put("/emergency-logs/{log_id}/left")
def emergency_left(log_id: int, db: Session = Depends(get_db),
                   current_user: SecurityUser = Depends(get_current_user)):
    el = db.query(EmergencyLog).filter(EmergencyLog.id == log_id).first()
    if not el:
        raise HTTPException(404, "Not found")
    el.status = EmergencyStatus.left
    el.left_at = datetime.utcnow()
    el.closed_by_id = current_user.id
    db.commit()
    return {"status": el.status, "left_at": el.left_at.isoformat()}


@app.get("/emergency-logs")
def list_emergency_logs(db: Session = Depends(get_db),
                        current_user: SecurityUser = Depends(get_current_user)):
    q = db.query(EmergencyLog).filter(
        EmergencyLog.building_group_id == current_user.building_group_id
    )
    if current_user.role == UserRole.building_admin:
        q = q.filter(EmergencyLog.destination_building_id == current_user.admin_building_id)
    logs = q.order_by(EmergencyLog.entered_at.desc()).limit(100).all()
    return [{
        "id": el.id,
        "emergency_type": el.emergency_type,
        "vehicle_plate": el.vehicle_plate,
        "description": el.description,
        "destination_building": el.destination_building.name if el.destination_building else "",
        "destination_apartment": el.destination_apartment,
        "status": el.status,
        "entered_at": el.entered_at.isoformat(),
        "left_at": el.left_at.isoformat() if el.left_at else None,
    } for el in logs]


def _do_weekly_reset(db: Session):
    """Delete resolved alerts and closed visitor logs older than 7 days."""
    cutoff = datetime.utcnow() - timedelta(days=7)
    # Nullify visitor_request links before deleting visitor logs
    db.query(VisitorRequest).filter(
        VisitorRequest.created_at < cutoff
    ).update({"visitor_log_id": None})
    db.query(Alert).filter(Alert.is_resolved == True, Alert.created_at < cutoff).delete()
    db.query(VisitorLog).filter(
        VisitorLog.status == VisitorStatus.left_compound,
        VisitorLog.created_at < cutoff,
    ).delete()
    db.commit()


async def _weekly_reset_scheduler():
    while True:
        now = datetime.utcnow()
        # Next Monday 00:00 UTC
        days_until_monday = (7 - now.weekday()) % 7 or 7
        next_reset = (now + timedelta(days=days_until_monday)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        wait_seconds = (next_reset - now).total_seconds()
        await asyncio.sleep(wait_seconds)
        db = SessionLocal()
        try:
            _do_weekly_reset(db)
        finally:
            db.close()


# ── Overdue Visitor Checker ───────────────────────────────────────────────────

async def _overdue_visitor_checker():
    """Every 60 seconds check for visitors who left the building 10+ min ago without exiting."""
    while True:
        await asyncio.sleep(60)
        db = SessionLocal()
        try:
            cutoff = datetime.utcnow() - timedelta(minutes=10)
            overdue = db.query(VisitorLog).filter(
                VisitorLog.status == VisitorStatus.left_building,
                VisitorLog.left_building_at <= cutoff,
                VisitorLog.overdue_alert_sent == False,
            ).all()
            for vl in overdue:
                vl.status = VisitorStatus.overdue
                vl.overdue_alert_sent = True
                alert = Alert(
                    alert_type="overdue_visitor",
                    visitor_log_id=vl.id,
                    building_group_id=vl.building_group_id,
                    message=f"⚠️ {vl.visitor_name} ({vl.visitor_type}) left building {vl.destination_building.name if vl.destination_building else ''} 10+ min ago but has NOT exited the compound!",
                )
                db.add(alert)
                db.flush()
                await broadcast_alert({
                    "type": "overdue_visitor",
                    "title": "⚠️ Visitor Still in Compound",
                    "message": alert.message,
                    "visitor_log_id": vl.id,
                    "visitor_name": vl.visitor_name,
                    "visitor_type": vl.visitor_type,
                    "vehicle_plate": vl.vehicle_plate or "",
                    "alert_id": alert.id,
                    "timestamp": datetime.utcnow().isoformat(),
                }, vl.building_group_id, db)
            db.commit()
        except Exception as e:
            print(f"[Overdue checker] {e}")
        finally:
            db.close()


# ── Camera Stream Processing ──────────────────────────────────────────────────

_camera_tasks: dict[int, asyncio.Task] = {}


async def process_camera_stream(camera_id: int, stream_url: str, building_group_id: int):
    import cv2
    cap = cv2.VideoCapture(stream_url)
    frame_skip = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            await asyncio.sleep(2)
            cap = cv2.VideoCapture(stream_url)
            continue
        frame_skip += 1
        if frame_skip % 10 != 0:
            await asyncio.sleep(0.03)
            continue
        db = SessionLocal()
        try:
            known = db.query(Person.id, Person.face_encoding).filter(
                Person.building_group_id == building_group_id,
                Person.is_active == True,
                Person.face_encoding != None,
            ).all()
            results = analyze_frame(frame, known)
            for face in results["faces"]:
                if face["is_unknown"]:
                    snapshot = save_snapshot(frame, camera_id)
                    log = AccessLog(camera_id=camera_id, event_type="spotted",
                                    confidence=face["confidence"], snapshot_path=snapshot, is_unknown=True)
                    db.add(log)
                    db.flush()
                    cam = db.query(Camera).filter(Camera.id == camera_id).first()
                    building = db.query(Building).filter(Building.id == cam.building_id).first()
                    alert = Alert(
                        alert_type="unknown_person",
                        access_log_id=log.id,
                        camera_id=camera_id,
                        building_id=cam.building_id,
                        building_group_id=building_group_id,
                        message=f"Unknown person on camera '{cam.name}' at {cam.location_description}",
                        snapshot_path=snapshot,
                    )
                    db.add(alert)
                    db.commit()
                    await broadcast_alert({
                        "type": "unknown_person",
                        "title": "Unknown Person Detected",
                        "message": alert.message,
                        "camera_id": camera_id,
                        "camera_name": cam.name,
                        "location": cam.location_description,
                        "building": building.name if building else "",
                        "snapshot": f"/snapshots/{snapshot.split('/')[-1]}",
                        "alert_id": alert.id,
                        "timestamp": alert.created_at.isoformat(),
                    }, building_group_id, db)
                else:
                    log = AccessLog(person_id=face["person_id"], camera_id=camera_id,
                                    event_type="spotted", confidence=face["confidence"], is_unknown=False)
                    db.add(log)
                    db.commit()
            # Unknown vehicles
            for vehicle in results["vehicles"]:
                if vehicle.get("is_unknown"):
                    snapshot = save_snapshot(frame, camera_id)
                    cam = db.query(Camera).filter(Camera.id == camera_id).first()
                    alert = Alert(
                        alert_type="unknown_vehicle",
                        camera_id=camera_id,
                        building_id=cam.building_id,
                        building_group_id=building_group_id,
                        message=f"Unknown vehicle on camera '{cam.name}'",
                        snapshot_path=snapshot,
                    )
                    db.add(alert)
                    db.commit()
        except Exception as e:
            print(f"[Camera {camera_id}] {e}")
        finally:
            db.close()
        await asyncio.sleep(0.03)


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/alerts")
async def alerts_ws(websocket: WebSocket, token: str, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        user = db.query(SecurityUser).filter(SecurityUser.username == username).first()
        if not user:
            await websocket.close(code=1008)
            return
    except JWTError:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    register_ws(user.id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        unregister_ws(user.id, websocket)
