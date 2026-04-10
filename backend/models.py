from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, LargeBinary, Enum, Text
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import enum

Base = declarative_base()


# ── Enums ─────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    super_admin = "super_admin"        # One account — full compound control, add/remove anything
    building_admin = "building_admin"  # One per building — sees everything in their building
    gate = "gate"                      # Gate guard — logs visitors in/out of compound
    building = "building"              # Building guard — confirms arrivals/departures
    resident = "resident"              # Tenant — announces visitors, sees own activity


class PersonRole(str, enum.Enum):
    resident = "resident"
    staff = "staff"
    unknown = "unknown"


class VisitorType(str, enum.Enum):
    visitor = "visitor"
    supermarket = "supermarket"
    shipping = "shipping"
    restaurant = "restaurant"
    maintenance = "maintenance"
    other = "other"


class VisitorStatus(str, enum.Enum):
    entered_compound = "entered_compound"
    arrived_building = "arrived_building"
    left_building = "left_building"
    left_compound = "left_compound"
    overdue = "overdue"


class EmergencyType(str, enum.Enum):
    police = "police"
    ambulance = "ambulance"
    fire = "fire"
    other = "other"


class EmergencyStatus(str, enum.Enum):
    entered = "entered"
    left = "left"


# ── Core tables ───────────────────────────────────────────────────────────────

class BuildingGroup(Base):
    __tablename__ = "building_groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    buildings = relationship("Building", back_populates="group")


class Building(Base):
    __tablename__ = "buildings"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String)
    group_id = Column(Integer, ForeignKey("building_groups.id"))
    cameras = relationship("Camera", back_populates="building")
    group = relationship("BuildingGroup", back_populates="buildings")


class Person(Base):
    """Registered residents/staff for face recognition."""
    __tablename__ = "persons"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(Enum(PersonRole), default=PersonRole.resident)
    face_encoding = Column(LargeBinary)
    photo_path = Column(String)
    building_group_id = Column(Integer, ForeignKey("building_groups.id"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    vehicles = relationship("Vehicle", back_populates="owner")
    access_logs = relationship("AccessLog", back_populates="person")


class Vehicle(Base):
    __tablename__ = "vehicles"
    id = Column(Integer, primary_key=True, index=True)
    plate_number = Column(String, unique=True, nullable=False)
    make = Column(String)
    model = Column(String)
    color = Column(String)
    owner_id = Column(Integer, ForeignKey("persons.id"), nullable=True)
    building_group_id = Column(Integer, ForeignKey("building_groups.id"))
    is_active = Column(Boolean, default=True)
    owner = relationship("Person", back_populates="vehicles")


class ParkingSpot(Base):
    __tablename__ = "parking_spots"
    id = Column(Integer, primary_key=True, index=True)
    spot_number = Column(String, nullable=False)
    building_group_id = Column(Integer, ForeignKey("building_groups.id"))
    assigned_vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    assigned_resident_id = Column(Integer, nullable=True)   # FK set after ResidentUser
    vehicle = relationship("Vehicle", foreign_keys=[assigned_vehicle_id])


class Camera(Base):
    __tablename__ = "cameras"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location_description = Column(String)
    stream_url = Column(String, nullable=False)
    building_id = Column(Integer, ForeignKey("buildings.id"))
    is_active = Column(Boolean, default=True)
    building = relationship("Building", back_populates="cameras")
# ── Security users (guards + admin) ──────────────────────────────────────────

class SecurityUser(Base):
    __tablename__ = "security_users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    role = Column(Enum(UserRole), default=UserRole.building)
    building_group_id = Column(Integer, ForeignKey("building_groups.id"))
    assigned_building_id = Column(Integer, ForeignKey("buildings.id"), nullable=True)
    # building_admin only: the building they manage
    admin_building_id = Column(Integer, ForeignKey("buildings.id"), nullable=True)
    fcm_token = Column(String)
    is_active = Column(Boolean, default=True)
    shifts = relationship("ShiftLog", back_populates="guard", foreign_keys="ShiftLog.guard_id")


class ShiftLog(Base):
    """Records every guard shift: login time, location, logout time, handover."""
    __tablename__ = "shift_logs"
    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("security_users.id"), nullable=False)
    building_group_id = Column(Integer, ForeignKey("building_groups.id"))

    # Where they are posted this shift
    post_type = Column(String, nullable=False)          # "gate" | "building"
    post_building_id = Column(Integer, ForeignKey("buildings.id"), nullable=True)  # null = gate
    post_gate_name = Column(String, nullable=True)       # e.g. "Main Gate", "Back Gate"

    # Timing
    shift_start = Column(DateTime, default=datetime.utcnow)
    shift_end = Column(DateTime, nullable=True)

    # Handover
    handed_over_to_id = Column(Integer, ForeignKey("security_users.id"), nullable=True)
    handover_notes = Column(Text, nullable=True)

    is_active = Column(Boolean, default=True)   # True = currently on shift
    created_at = Column(DateTime, default=datetime.utcnow)

    guard = relationship("SecurityUser", back_populates="shifts", foreign_keys=[guard_id])
    handed_over_to = relationship("SecurityUser", foreign_keys=[handed_over_to_id])
    post_building = relationship("Building", foreign_keys=[post_building_id])


# ── Apartment (primary entity — one per unit) ─────────────────────────────────

class Apartment(Base):
    """One apartment = one unit. Multiple family members share this."""
    __tablename__ = "apartments"
    id = Column(Integer, primary_key=True, index=True)
    building_id = Column(Integer, ForeignKey("buildings.id"), nullable=False)
    building_group_id = Column(Integer, ForeignKey("building_groups.id"), nullable=False)
    apartment_number = Column(String, nullable=False)   # e.g. "4B", "12", "Floor 3 - Left"
    floor = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    building = relationship("Building", foreign_keys=[building_id])
    members = relationship("ResidentUser", back_populates="apartment")
    vehicles = relationship("ApartmentVehicle", back_populates="apartment")
    visitor_requests = relationship("VisitorRequest", back_populates="apartment")


# ── Resident users (family members — many per apartment) ──────────────────────

class ResidentUser(Base):
    """One account per family member. All members of the same apartment share the same apartment_id."""
    __tablename__ = "resident_users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    phone = Column(String)
    # Link to apartment (shared by all family members)
    apartment_id = Column(Integer, ForeignKey("apartments.id"), nullable=False)
    # Denormalized for quick access
    building_group_id = Column(Integer, ForeignKey("building_groups.id"))
    fcm_token = Column(String)
    is_active = Column(Boolean, default=True)
    is_primary = Column(Boolean, default=False)   # head of household
    created_at = Column(DateTime, default=datetime.utcnow)

    apartment = relationship("Apartment", back_populates="members")
    visitor_requests = relationship("VisitorRequest", back_populates="resident")


class ApartmentVehicle(Base):
    """Vehicles belong to the apartment, not individual members."""
    __tablename__ = "apartment_vehicles"
    id = Column(Integer, primary_key=True, index=True)
    apartment_id = Column(Integer, ForeignKey("apartments.id"), nullable=False)
    plate_number = Column(String, nullable=False)
    make = Column(String)
    model = Column(String)
    color = Column(String)
    parking_spot = Column(String)   # e.g. "B2-14"
    is_active = Column(Boolean, default=True)
    apartment = relationship("Apartment", back_populates="vehicles")


# ── Visitor requests (resident-initiated) ─────────────────────────────────────

class VisitorRequest(Base):
    """Resident pre-announces a visitor — notifies building + gate guards."""
    __tablename__ = "visitor_requests"
    id = Column(Integer, primary_key=True, index=True)
    resident_id = Column(Integer, ForeignKey("resident_users.id"), nullable=False)   # who submitted
    apartment_id = Column(Integer, ForeignKey("apartments.id"), nullable=False)       # which apartment
    building_group_id = Column(Integer, ForeignKey("building_groups.id"))

    visitor_name = Column(String, nullable=False)
    visitor_type = Column(Enum(VisitorType), nullable=False)
    vehicle_plate = Column(String)
    notes = Column(Text)

    # Linked to a VisitorLog once the guard logs them in
    visitor_log_id = Column(Integer, ForeignKey("visitor_logs.id", use_alter=True, name="fk_vr_visitor_log"), nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    resident = relationship("ResidentUser", back_populates="visitor_requests")
    apartment = relationship("Apartment", back_populates="visitor_requests")
    visitor_log = relationship("VisitorLog", foreign_keys=[visitor_log_id])


# ── Visitor logs (guard-managed) ──────────────────────────────────────────────

class VisitorLog(Base):
    __tablename__ = "visitor_logs"
    id = Column(Integer, primary_key=True, index=True)
    building_group_id = Column(Integer, ForeignKey("building_groups.id"), nullable=False)

    visitor_name = Column(String, nullable=False)
    visitor_type = Column(Enum(VisitorType), nullable=False)
    photo_path = Column(String)
    vehicle_plate = Column(String)

    destination_building_id = Column(Integer, ForeignKey("buildings.id"), nullable=False)
    destination_apartment = Column(String, nullable=False)

    # Linked resident request (if pre-announced)
    visitor_request_id = Column(Integer, ForeignKey("visitor_requests.id"), nullable=True)

    status = Column(Enum(VisitorStatus), default=VisitorStatus.entered_compound)
    entered_compound_at = Column(DateTime, default=datetime.utcnow)
    arrived_building_at = Column(DateTime)
    left_building_at = Column(DateTime)
    left_compound_at = Column(DateTime)

    gate_guard_in_id = Column(Integer, ForeignKey("security_users.id"))
    building_guard_id = Column(Integer, ForeignKey("security_users.id"), nullable=True)
    gate_guard_out_id = Column(Integer, ForeignKey("security_users.id"), nullable=True)

    overdue_alert_sent = Column(Boolean, default=False)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    destination_building = relationship("Building", foreign_keys=[destination_building_id])
    gate_guard_in = relationship("SecurityUser", foreign_keys=[gate_guard_in_id])
    building_guard = relationship("SecurityUser", foreign_keys=[building_guard_id])
    gate_guard_out = relationship("SecurityUser", foreign_keys=[gate_guard_out_id])


# ── Emergency log ─────────────────────────────────────────────────────────────

class EmergencyLog(Base):
    """Police / ambulance / fire entries — saved silently, no unknown alert."""
    __tablename__ = "emergency_logs"
    id = Column(Integer, primary_key=True, index=True)
    building_group_id = Column(Integer, ForeignKey("building_groups.id"), nullable=False)

    emergency_type = Column(Enum(EmergencyType), nullable=False)
    vehicle_plate = Column(String)
    description = Column(Text)
    destination_building_id = Column(Integer, ForeignKey("buildings.id"), nullable=True)
    destination_apartment = Column(String)

    status = Column(Enum(EmergencyStatus), default=EmergencyStatus.entered)
    entered_at = Column(DateTime, default=datetime.utcnow)
    left_at = Column(DateTime, nullable=True)

    logged_by_id = Column(Integer, ForeignKey("security_users.id"))
    closed_by_id = Column(Integer, ForeignKey("security_users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    destination_building = relationship("Building", foreign_keys=[destination_building_id])
    logged_by = relationship("SecurityUser", foreign_keys=[logged_by_id])
    closed_by = relationship("SecurityUser", foreign_keys=[closed_by_id])


# ── Access log + alerts ───────────────────────────────────────────────────────

class AccessLog(Base):
    __tablename__ = "access_logs"
    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("persons.id"), nullable=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=True)
    event_type = Column(String)
    confidence = Column(Float)
    snapshot_path = Column(String)
    is_unknown = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    person = relationship("Person", back_populates="access_logs")


class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    alert_type = Column(String, default="unknown_person")
    access_log_id = Column(Integer, ForeignKey("access_logs.id"), nullable=True)
    visitor_log_id = Column(Integer, ForeignKey("visitor_logs.id"), nullable=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=True)
    building_id = Column(Integer, ForeignKey("buildings.id"), nullable=True)
    building_group_id = Column(Integer, ForeignKey("building_groups.id"))
    message = Column(String)
    snapshot_path = Column(String)
    is_resolved = Column(Boolean, default=False)
    resolved_by = Column(Integer, ForeignKey("security_users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
