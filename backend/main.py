from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# =========================
# CONFIG
# =========================

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "videocall.db"


app = FastAPI(
    title="VideoCallApp API",
    version="1.0.0",
)


# =========================
# CORS
# =========================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# DATABASE
# =========================

def get_db():
    db = sqlite3.connect(
        DB_PATH,
        check_same_thread=False,
    )

    db.row_factory = sqlite3.Row

    return db


def initialize_database():
    db = get_db()

    try:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL UNIQUE,
                phone TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                avatar TEXT DEFAULT '',
                created_at TEXT NOT NULL
            )
            """
        )

        db.execute(
            """
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_user_id TEXT NOT NULL,
                contact_user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(owner_user_id, contact_user_id)
            )
            """
        )

        db.commit()

    finally:
        db.close()


initialize_database()


# =========================
# MODELS
# =========================

class RegisterRequest(BaseModel):
    user_id: str = Field(
        min_length=2,
        max_length=50,
    )

    phone: str = Field(
        min_length=5,
        max_length=30,
    )

    display_name: str = Field(
        min_length=1,
        max_length=100,
    )


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(
        default=None,
        max_length=100,
    )

    avatar: str | None = None


class ContactRequest(BaseModel):
    identifier: str = Field(
        min_length=1,
        max_length=100,
    )


# =========================
# HELPERS
# =========================

def now_iso() -> str:
    return datetime.now(
        timezone.utc
    ).isoformat()


def row_to_user(
    row: sqlite3.Row | None,
) -> dict[str, Any] | None:

    if row is None:
        return None

    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "phone": row["phone"],
        "display_name": row["display_name"],
        "avatar": row["avatar"] or "",
        "created_at": row["created_at"],
    }


def get_user_by_id(
    user_id: str,
):
    db = get_db()

    try:
        return db.execute(
            """
            SELECT *
            FROM users
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

    finally:
        db.close()


def get_user_by_identifier(
    identifier: str,
):
    db = get_db()

    try:
        return db.execute(
            """
            SELECT *
            FROM users
            WHERE user_id = ?
               OR phone = ?
            LIMIT 1
            """,
            (
                identifier,
                identifier,
            ),
        ).fetchone()

    finally:
        db.close()


# =========================
# CONNECTION MANAGER
# =========================

class ConnectionManager:

    def __init__(self):
        self.connections: dict[
            str,
            WebSocket,
        ] = {}

    async def connect(
        self,
        user_id: str,
        websocket: WebSocket,
    ):
        await websocket.accept()

        old_socket = self.connections.get(
            user_id
        )

        if old_socket:
            try:
                await old_socket.close()
            except Exception:
                pass

        self.connections[user_id] = websocket

        await self.broadcast_online_status(
            user_id,
            True,
        )

    def disconnect(
        self,
        user_id: str,
    ):
        self.connections.pop(
            user_id,
            None,
        )

    async def send_to_user(
        self,
        user_id: str,
        message: dict,
    ) -> bool:

        websocket = self.connections.get(
            user_id
        )

        if websocket is None:
            return False

        try:
            await websocket.send_json(
                message
            )

            return True

        except Exception:
            self.disconnect(user_id)
            return False

    async def broadcast_online_status(
        self,
        user_id: str,
        online: bool,
    ):
        message = {
            "type": "online_status",
            "user_id": user_id,
            "online": online,
        }

        disconnected = []

        for (
            target_id,
            websocket,
        ) in list(
            self.connections.items()
        ):

            if target_id == user_id:
                continue

            try:
                await websocket.send_json(
                    message
                )

            except Exception:
                disconnected.append(
                    target_id
                )

        for target_id in disconnected:
            self.disconnect(target_id)

    async def broadcast_profile_update(
        self,
        user: dict[str, Any],
    ):
        message = {
            "type": "profile_updated",
            "user": user,
        }

        disconnected = []

        for (
            target_id,
            websocket,
        ) in list(
            self.connections.items()
        ):

            try:
                await websocket.send_json(
                    message
                )

            except Exception:
                disconnected.append(
                    target_id
                )

        for target_id in disconnected:
            self.disconnect(target_id)


manager = ConnectionManager()


# =========================
# ROOT
# =========================

@app.get("/")
def root():
    return {
        "success": True,
        "status": "online",
        "app": "VideoCallApp",
        "message": "VideoCallApp API is running",
    }


# =========================
# HEALTH
# =========================

@app.get("/health")
def health():

    db = get_db()

    try:
        users_count = db.execute(
            "SELECT COUNT(*) FROM users"
        ).fetchone()[0]

        contacts_count = db.execute(
            "SELECT COUNT(*) FROM contacts"
        ).fetchone()[0]

    finally:
        db.close()

    return {
        "success": True,
        "status": "ok",
        "app": "VideoCallApp",
        "users": users_count,
        "contacts": contacts_count,
        "online": len(
            manager.connections
        ),
    }


# =========================
# REGISTER
# =========================

@app.post("/api/register")
def register(
    request: RegisterRequest,
):

    user_id = request.user_id.strip()
    phone = request.phone.strip()
    display_name = request.display_name.strip()

    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="شناسه الزامی است.",
        )

    if not phone:
        raise HTTPException(
            status_code=400,
            detail="شماره موبایل الزامی است.",
        )

    if not display_name:
        raise HTTPException(
            status_code=400,
            detail="نام نمایشی الزامی است.",
        )

    db = get_db()

    try:

        existing_user = db.execute(
            """
            SELECT user_id
            FROM users
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="این شناسه قبلاً ثبت شده است.",
            )

        existing_phone = db.execute(
            """
            SELECT user_id
            FROM users
            WHERE phone = ?
            """,
            (phone,),
        ).fetchone()

        if existing_phone:
            raise HTTPException(
                status_code=400,
                detail="این شماره موبایل قبلاً ثبت شده است.",
            )

        created_at = now_iso()

        db.execute(
            """
            INSERT INTO users (
                user_id,
                phone,
                display_name,
                avatar,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                user_id,
                phone,
                display_name,
                "",
                created_at,
            ),
        )

        db.commit()

        row = db.execute(
            """
            SELECT *
            FROM users
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

        user = row_to_user(row)

        return {
            "success": True,
            "user": user,
        }

    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=400,
            detail="شناسه یا شماره موبایل قبلاً ثبت شده است.",
        )

    finally:
        db.close()


# =========================
# SEARCH USER
# =========================

@app.get("/api/users/{identifier}")
def search_user(
    identifier: str,
):

    identifier = identifier.strip()

    row = get_user_by_identifier(
        identifier
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد.",
        )

    user = row_to_user(row)

    return {
        "success": True,
        "user": user,
        "online": user["user_id"]
        in manager.connections,
    }


# =========================
# ALL USERS
# =========================

@app.get("/api/users")
def get_users():

    db = get_db()

    try:
        rows = db.execute(
            """
            SELECT *
            FROM users
            ORDER BY id DESC
            """
        ).fetchall()

    finally:
        db.close()

    users = []

    for row in rows:

        user = row_to_user(row)

        if user is None:
            continue

        user["online"] = (
            user["user_id"]
            in manager.connections
        )

        users.append(user)

    return {
        "success": True,
        "users": users,
    }


# =========================
# ONLINE USERS
# =========================

@app.get("/api/online")
def get_online_users():

    return {
        "success": True,
        "users": list(
            manager.connections.keys()
        ),
    }


# =========================
# PROFILE
# =========================

@app.get("/api/profile/{user_id}")
def get_profile(
    user_id: str,
):

    row = get_user_by_id(
        user_id
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد.",
        )

    user = row_to_user(row)

    return {
        "success": True,
        "user": user,
        "online": user_id
        in manager.connections,
    }


# =========================
# UPDATE PROFILE
# =========================

@app.put("/api/profile/{user_id}")
async def update_profile(
    user_id: str,
    request: ProfileUpdateRequest,
):

    row = get_user_by_id(
        user_id
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد.",
        )

    current_name = row["display_name"]
    current_avatar = row["avatar"] or ""

    if request.display_name is not None:
        display_name = (
            request.display_name.strip()
        )
    else:
        display_name = current_name

    if request.avatar is not None:
        avatar = request.avatar
    else:
        avatar = current_avatar

    if not display_name:
        raise HTTPException(
            status_code=400,
            detail="نام نمایشی نمی‌تواند خالی باشد.",
        )

    db = get_db()

    try:

        db.execute(
            """
            UPDATE users
            SET display_name = ?,
                avatar = ?
            WHERE user_id = ?
            """,
            (
                display_name,
                avatar,
                user_id,
            ),
        )

        db.commit()

        updated_row = db.execute(
            """
            SELECT *
            FROM users
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

    finally:
        db.close()

    user = row_to_user(
        updated_row
    )

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد.",
        )

    await manager.broadcast_profile_update(
        user
    )

    return {
        "success": True,
        "user": user,
    }


# =========================
# CONTACTS
# =========================

@app.get("/api/contacts/{user_id}")
def get_contacts(
    user_id: str,
):

    if get_user_by_id(user_id) is None:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد.",
        )

    db = get_db()

    try:

        rows = db.execute(
            """
            SELECT u.*
            FROM contacts c
            JOIN users u
              ON u.user_id = c.contact_user_id
            WHERE c.owner_user_id = ?
            ORDER BY c.id DESC
            """,
            (user_id,),
        ).fetchall()

    finally:
        db.close()

    contacts = []

    for row in rows:

        user = row_to_user(row)

        if user is None:
            continue

        user["online"] = (
            user["user_id"]
            in manager.connections
        )

        contacts.append(user)

    return {
        "success": True,
        "contacts": contacts,
    }


# =========================
# ADD CONTACT
# =========================

@app.post("/api/contacts/{user_id}")
def add_contact(
    user_id: str,
    request: ContactRequest,
):

    if get_user_by_id(user_id) is None:
        raise HTTPException(
            status_code=404,
            detail="کاربر اصلی پیدا نشد.",
        )

    identifier = request.identifier.strip()

    if not identifier:
        raise HTTPException(
            status_code=400,
            detail="شناسه یا شماره موبایل را وارد کنید.",
        )

    contact = get_user_by_identifier(
        identifier
    )

    if contact is None:
        raise HTTPException(
            status_code=404,
            detail="کاربر موردنظر پیدا نشد.",
        )

    contact_user_id = contact["user_id"]

    if contact_user_id == user_id:
        raise HTTPException(
            status_code=400,
            detail="نمی‌توانید خودتان را اضافه کنید.",
        )

    db = get_db()

    try:

        existing = db.execute(
            """
            SELECT id
            FROM contacts
            WHERE owner_user_id = ?
              AND contact_user_id = ?
            """,
            (
                user_id,
                contact_user_id,
            ),
        ).fetchone()

        if existing:
            raise HTTPException(
                status_code=400,
                detail="این کاربر قبلاً در مخاطبین شماست.",
            )

        db.execute(
            """
            INSERT INTO contacts (
                owner_user_id,
                contact_user_id,
                created_at
            )
            VALUES (?, ?, ?)
            """,
            (
                user_id,
                contact_user_id,
                now_iso(),
            ),
        )

        db.commit()

    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=400,
            detail="این کاربر قبلاً در مخاطبین شماست.",
        )

    finally:
        db.close()

    user = row_to_user(contact)

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد.",
        )

    user["online"] = (
        contact_user_id
        in manager.connections
    )

    return {
        "success": True,
        "contact": user,
    }


# =========================
# DELETE CONTACT
# =========================

@app.delete(
    "/api/contacts/{user_id}/{contact_user_id}"
)
def delete_contact(
    user_id: str,
    contact_user_id: str,
):

    db = get_db()

    try:

        result = db.execute(
            """
            DELETE FROM contacts
            WHERE owner_user_id = ?
              AND contact_user_id = ?
            """,
            (
                user_id,
                contact_user_id,
            ),
        )

        db.commit()

    finally:
        db.close()

    if result.rowcount == 0:
        raise HTTPException(
            status_code=404,
            detail="مخاطب پیدا نشد.",
        )

    return {
        "success": True,
        "message": "مخاطب حذف شد.",
    }


# =========================
# CHECK CONTACT
# =========================

@app.get(
    "/api/contacts/{user_id}/check/{contact_user_id}"
)
def check_contact(
    user_id: str,
    contact_user_id: str,
):

    db = get_db()

    try:

        row = db.execute(
            """
            SELECT id
            FROM contacts
            WHERE owner_user_id = ?
              AND contact_user_id = ?
            """,
            (
                user_id,
                contact_user_id,
            ),
        ).fetchone()

    finally:
        db.close()

    return {
        "success": True,
        "is_contact": row is not None,
    }


# =========================
# WEBSOCKET
# =========================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
):

    user = get_user_by_id(
        user_id
    )

    if user is None:
        await websocket.close(
            code=1008
        )
        return

    await manager.connect(
        user_id,
        websocket,
    )

    try:

        while True:

            message = (
                await websocket.receive_json()
            )

            message_type = message.get(
                "type"
            )

            if message_type == "ping":
                await websocket.send_json(
                    {
                        "type": "pong"
                    }
                )
                continue

            if message_type == "pong":
                continue

            allowed_types = {
                "offer",
                "answer",
                "ice-candidate",
                "call-rejected",
                "hangup",
            }

            if message_type not in allowed_types:
                continue

            target_user_id = message.get(
                "target_user_id"
            )

            if not target_user_id:
                continue

            message["from_user_id"] = user_id

            await manager.send_to_user(
                target_user_id,
                message,
            )

    except WebSocketDisconnect:

        manager.disconnect(
            user_id
        )

        await manager.broadcast_online_status(
            user_id,
            False,
        )

    except Exception:

        manager.disconnect(
            user_id
        )

        await manager.broadcast_online_status(
            user_id,
            False,
        )