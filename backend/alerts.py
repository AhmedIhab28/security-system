"""
Push notification dispatcher — Firebase Cloud Messaging (FCM).
Falls back to WebSocket broadcast if FCM is not configured.
"""
import asyncio
import json
import os
from typing import Set
from fastapi import WebSocket

# Active WebSocket connections keyed by security user id
_connections: dict[int, Set[WebSocket]] = {}


def register_ws(user_id: int, ws: WebSocket):
    _connections.setdefault(user_id, set()).add(ws)


def unregister_ws(user_id: int, ws: WebSocket):
    if user_id in _connections:
        _connections[user_id].discard(ws)


async def broadcast_alert(payload: dict, building_group_id: int, db):
    """Send alert to all security users watching this building group."""
    from models import SecurityUser
    users = db.query(SecurityUser).filter(
        SecurityUser.building_group_id == building_group_id,
        SecurityUser.is_active == True,
    ).all()

    message = json.dumps(payload)

    for user in users:
        # WebSocket push
        for ws in list(_connections.get(user.id, [])):
            try:
                await ws.send_text(message)
            except Exception:
                unregister_ws(user.id, ws)

        # FCM push (optional — requires GOOGLE_APPLICATION_CREDENTIALS env var)
        if user.fcm_token:
            await _send_fcm(user.fcm_token, payload)


async def _send_fcm(token: str, payload: dict):
    try:
        import firebase_admin
        from firebase_admin import messaging, credentials

        if not firebase_admin._apps:
            cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            if not cred_path:
                return
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)

        message = messaging.Message(
            notification=messaging.Notification(
                title=payload.get("title", "Security Alert"),
                body=payload.get("message", ""),
            ),
            data={k: str(v) for k, v in payload.items()},
            token=token,
        )
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, messaging.send, message)
    except Exception as e:
        print(f"[FCM] Failed to send notification: {e}")
