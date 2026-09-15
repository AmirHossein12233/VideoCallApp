from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# =========================================================
# APP
# =========================================================

app = FastAPI(
    title="VideoCallApp API",
    version="1.0.0",
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://videocallapp-web.onrender.com",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# DATABASE
# =========================================================

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "videocall.db"


def get_db() -> sqlite3.Connection:
    connection = sqlite3.connect(
        DATABASE_PATH,
        check_same_thread=False,
    )

    connection.row_factory = sqlite3.Row

    return connection


def now_iso() -> str:
    return datetime.now(
        timezone.utc
    ).isoformat()


def initialize_database() -> None:
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


# =========================================================
# MODELS
# =========================================================

class RegisterRequest(BaseModel):
    user_id: str
    phone: str
    display_name: str


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    avatar: str | None = None


class ContactRequest(BaseModel):
    identifier: str


# =========================================================
# USER HELPERS
# =========================================================

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
) -> dict[str, Any] | None:
    db = get_db()

    try:
        row = db.execute(
            """
            SELECT *
            FROM users
            WHERE user_id = ?
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()

        return row_to_user(row)

    finally:
        db.close()


def get_user_by_identifier(
    identifier: str,
) -> dict[str, Any] | None:
    db = get_db()

    try:
        row = db.execute(
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

        return row_to_user(row)

    finally:
        db.close()


# =========================================================
# WEBSOCKET MANAGER
# =========================================================

class ConnectionManager:

    def __init__(self) -> None:
        self.connections: dict[
            str,
            WebSocket,
        ] = {}

    async def connect(
        self,
        user_id: str,
        websocket: WebSocket,
    ) -> None:
        await websocket.accept()

        old_connection = (
            self.connections.get(user_id)
        )

        if old_connection is not None:
            try:
                await old_connection.close()
            except Exception:
                pass

        self.connections[user_id] = websocket

        await self.broadcast_online_status(
            user_id,
            True,
        )

    async def disconnect(
        self,
        user_id: str,
        websocket: WebSocket,
    ) -> None:
        current = self.connections.get(
            user_id
        )

        if current is websocket:
            self.connections.pop(
                user_id,
                None,
            )

            await self.broadcast_online_status(
                user_id,
                False,
            )

    async def send_to_user(
        self,
        user_id: str,
        message: dict[str, Any],
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
            self.connections.pop(
                user_id,
                None,
            )

            return False

    async def broadcast_online_status(
        self,
        user_id: str,
        online: bool,
    ) -> None:
        message = {
            "type": "online_status",
            "user_id": user_id,
            "online": online,
        }

        disconnected = []

        for connected_user_id, websocket in list(
            self.connections.items()
        ):
            try:
                await websocket.send_json(
                    message
                )
            except Exception:
                disconnected.append(
                    connected_user_id
                )

        for connected_user_id in disconnected:
            self.connections.pop(
                connected_user_id,
                None,
            )

    async def broadcast_profile_update(
        self,
        user: dict[str, Any],
    ) -> None:
        message = {
            "type": "profile_updated",
            "user": user,
        }

        disconnected = []

        for connected_user_id, websocket in list(
            self.connections.items()
        ):
            try:
                await websocket.send_json(
                    message
                )
            except Exception:
                disconnected.append(
                    connected_user_id
                )

        for connected_user_id in disconnected:
            self.connections.pop(
                connected_user_id,
                None,
            )


manager = ConnectionManager()


# =========================================================
# BASIC ROUTES
# =========================================================

@app.get("/")
async def root():
    return {
        "success": True,
        "app": "VideoCallApp",
        "status": "online",
    }


@app.get("/health")
async def health():
    db = get_db()

    try:
        users_count = db.execute(
            "SELECT COUNT(*) AS count FROM users"
        ).fetchone()["count"]

        contacts_count = db.execute(
            "SELECT COUNT(*) AS count FROM contacts"
        ).fetchone()["count"]

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

    finally:
        db.close()


# =========================================================
# REGISTER
# =========================================================

@app.post("/api/register")
async def register(
    request: RegisterRequest,
):
    user_id = request.user_id.strip()
    phone = request.phone.strip()
    display_name = request.display_name.strip()

    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="شناسه الزامی است",
        )

    if not phone:
        raise HTTPException(
            status_code=400,
            detail="شماره موبایل الزامی است",
        )

    if not display_name:
        raise HTTPException(
            status_code=400,
            detail="نام نمایشی الزامی است",
        )

    if len(user_id) < 3:
        raise HTTPException(
            status_code=400,
            detail="شناسه باید حداقل ۳ کاراکتر باشد",
        )

    db = get_db()

    try:
        existing_user = db.execute(
            """
            SELECT *
            FROM users
            WHERE user_id = ?
               OR phone = ?
            LIMIT 1
            """,
            (
                user_id,
                phone,
            ),
        ).fetchone()

        if existing_user:
            if (
                existing_user["user_id"]
                == user_id
            ):
                raise HTTPException(
                    status_code=409,
                    detail="این شناسه قبلاً ثبت شده است",
                )

            raise HTTPException(
                status_code=409,
                detail="این شماره موبایل قبلاً ثبت شده است",
            )

        cursor = db.execute(
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
                now_iso(),
            ),
        )

        db.commit()

        row = db.execute(
            """
            SELECT *
            FROM users
            WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

        user = row_to_user(row)

        return {
            "success": True,
            "user": user,
        }

    except HTTPException:
        raise

    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="شناسه یا شماره موبایل قبلاً ثبت شده است",
        )

    finally:
        db.close()


# =========================================================
# FIND USER
# =========================================================

@app.get("/api/users/{identifier}")
async def find_user(
    identifier: str,
):
    identifier = identifier.strip()

    if not identifier:
        raise HTTPException(
            status_code=400,
            detail="شناسه یا شماره موبایل الزامی است",
        )

    user = get_user_by_identifier(
        identifier
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد",
        )

    user["online"] = (
        user["user_id"]
        in manager.connections
    )

    return {
        "success": True,
        "user": user,
    }


# =========================================================
# ALL USERS
# =========================================================

@app.get("/api/users")
async def get_users():
    db = get_db()

    try:
        rows = db.execute(
            """
            SELECT *
            FROM users
            ORDER BY id DESC
            """
        ).fetchall()

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

    finally:
        db.close()


# =========================================================
# ONLINE USERS
# =========================================================

@app.get("/api/online")
async def get_online_users():
    users = []

    for user_id in manager.connections:
        user = get_user_by_id(
            user_id
        )

        if user:
            user["online"] = True
            users.append(user)

    return {
        "success": True,
        "users": users,
    }


# =========================================================
# PROFILE
# =========================================================

@app.get("/api/profile/{user_id}")
async def get_profile(
    user_id: str,
):
    user = get_user_by_id(
        user_id
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد",
        )

    user["online"] = (
        user_id
        in manager.connections
    )

    return {
        "success": True,
        "user": user,
    }


@app.put("/api/profile/{user_id}")
async def update_profile(
    user_id: str,
    request: ProfileUpdateRequest,
):
    existing_user = get_user_by_id(
        user_id
    )

    if not existing_user:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد",
        )

    display_name = (
        request.display_name
        if request.display_name is not None
        else existing_user["display_name"]
    )

    avatar = (
        request.avatar
        if request.avatar is not None
        else existing_user["avatar"]
    )

    display_name = display_name.strip()

    if not display_name:
        raise HTTPException(
            status_code=400,
            detail="نام نمایشی نمی‌تواند خالی باشد",
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
                avatar or "",
                user_id,
            ),
        )

        db.commit()

    finally:
        db.close()

    user = get_user_by_id(
        user_id
    )

    if user:
        user["online"] = (
            user_id
            in manager.connections
        )

        await manager.broadcast_profile_update(
            user
        )

    return {
        "success": True,
        "user": user,
    }


# =========================================================
# CONTACTS
# =========================================================

@app.get("/api/contacts/{user_id}")
async def get_contacts(
    user_id: str,
):
    owner = get_user_by_id(
        user_id
    )

    if not owner:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد",
        )

    db = get_db()

    try:
        rows = db.execute(
            """
            SELECT
                u.*
            FROM contacts c
            JOIN users u
              ON u.user_id = c.contact_user_id
            WHERE c.owner_user_id = ?
            ORDER BY c.id DESC
            """,
            (user_id,),
        ).fetchall()

        contacts = []

        for row in rows:
            user = row_to_user(row)

            if user:
                user["online"] = (
                    user["user_id"]
                    in manager.connections
                )

                contacts.append(user)

        return {
            "success": True,
            "contacts": contacts,
        }

    finally:
        db.close()


@app.post("/api/contacts/{user_id}")
async def add_contact(
    user_id: str,
    request: ContactRequest,
):
    owner = get_user_by_id(
        user_id
    )

    if not owner:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد",
        )

    identifier = (
        request.identifier.strip()
    )

    if not identifier:
        raise HTTPException(
            status_code=400,
            detail="شناسه یا شماره موبایل را وارد کنید",
        )

    contact = get_user_by_identifier(
        identifier
    )

    if not contact:
        raise HTTPException(
            status_code=404,
            detail="کاربر موردنظر پیدا نشد",
        )

    if (
        contact["user_id"]
        == user_id
    ):
        raise HTTPException(
            status_code=400,
            detail="نمی‌توانید خودتان را اضافه کنید",
        )

    db = get_db()

    try:
        existing = db.execute(
            """
            SELECT id
            FROM contacts
            WHERE owner_user_id = ?
              AND contact_user_id = ?
            LIMIT 1
            """,
            (
                user_id,
                contact["user_id"],
            ),
        ).fetchone()

        if existing:
            raise HTTPException(
                status_code=409,
                detail="این کاربر قبلاً در مخاطبین شماست",
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
                contact["user_id"],
                now_iso(),
            ),
        )

        db.commit()

        contact["online"] = (
            contact["user_id"]
            in manager.connections
        )

        return {
            "success": True,
            "contact": contact,
        }

    except HTTPException:
        raise

    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="این کاربر قبلاً در مخاطبین شماست",
        )

    finally:
        db.close()


@app.delete(
    "/api/contacts/{user_id}/{contact_user_id}"
)
async def delete_contact(
    user_id: str,
    contact_user_id: str,
):
    db = get_db()

    try:
        cursor = db.execute(
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

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="مخاطب پیدا نشد",
            )

        return {
            "success": True,
            "message": "مخاطب حذف شد",
        }

    finally:
        db.close()


@app.get(
    "/api/contacts/{user_id}/check/{contact_user_id}"
)
async def check_contact(
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
            LIMIT 1
            """,
            (
                user_id,
                contact_user_id,
            ),
        ).fetchone()

        return {
            "success": True,
            "is_contact": row is not None,
        }

    finally:
        db.close()


# =========================================================
# WEBSOCKET
# =========================================================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
):
    user_id = user_id.strip()

    user = get_user_by_id(
        user_id
    )

    if not user:
        await websocket.close(
            code=1008,
            reason="User not found",
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

            # -------------------------
            # PING
            # -------------------------

            if message_type == "ping":
                await websocket.send_json(
                    {
                        "type": "pong"
                    }
                )

                continue

            # -------------------------
            # TARGET
            # -------------------------

            target_user_id = message.get(
                "target_user_id"
            )

            if (
                not target_user_id
                and message_type
                not in (
                    "ping",
                    "pong",
                )
            ):
                continue

            # -------------------------
            # OFFER
            # -------------------------

            if message_type == "offer":
                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": "offer",
                        "caller_user_id": user_id,
                        "from_user_id": user_id,
                        "offer": message.get(
                            "offer"
                        ),
                        "call_type": message.get(
                            "call_type",
                            "audio",
                        ),
                    },
                )

            # -------------------------
            # ANSWER
            # -------------------------

            elif message_type == "answer":
                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": "answer",
                        "from_user_id": user_id,
                        "answer": message.get(
                            "answer"
                        ),
                    },
                )

            # -------------------------
            # ICE
            # -------------------------

            elif message_type == "ice-candidate":
                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": "ice-candidate",
                        "from_user_id": user_id,
                        "candidate": message.get(
                            "candidate"
                        ),
                    },
                )

            # -------------------------
            # REJECT
            # -------------------------

            elif message_type == "call-rejected":
                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": "call-rejected",
                        "from_user_id": user_id,
                    },
                )

            # -------------------------
            # HANGUP
            # -------------------------

            elif message_type == "hangup":
                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": "hangup",
                        "from_user_id": user_id,
                    },
                )

    except WebSocketDisconnect:
        await manager.disconnect(
            user_id,
            websocket,
        )

    except Exception as error:
        print(
            "WebSocket error:",
            error,
        )

        await manager.disconnect(
            user_id,
            websocket,
        )