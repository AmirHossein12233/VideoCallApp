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
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# DATABASE
# =========================================================

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "videocall.db"


def get_db() -> sqlite3.Connection:
    db = sqlite3.connect(
        DB_PATH,
        check_same_thread=False,
    )

    db.row_factory = sqlite3.Row

    return db


def now_iso() -> str:
    return datetime.now(
        timezone.utc
    ).isoformat()


def initialize_database() -> None:
    db = get_db()

    try:
        # =====================================================
        # USERS
        # =====================================================

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

        user_columns = {
            row["name"]
            for row in db.execute(
                "PRAGMA table_info(users)"
            ).fetchall()
        }

        if "user_id" not in user_columns:
            db.execute(
                """
                ALTER TABLE users
                ADD COLUMN user_id TEXT DEFAULT ''
                """
            )

        if "phone" not in user_columns:
            db.execute(
                """
                ALTER TABLE users
                ADD COLUMN phone TEXT DEFAULT ''
                """
            )

        if "display_name" not in user_columns:
            db.execute(
                """
                ALTER TABLE users
                ADD COLUMN display_name TEXT DEFAULT ''
                """
            )

        if "avatar" not in user_columns:
            db.execute(
                """
                ALTER TABLE users
                ADD COLUMN avatar TEXT DEFAULT ''
                """
            )

        if "created_at" not in user_columns:
            db.execute(
                """
                ALTER TABLE users
                ADD COLUMN created_at TEXT DEFAULT ''
                """
            )

        db.execute(
            """
            UPDATE users
            SET created_at = ?
            WHERE created_at IS NULL
               OR created_at = ''
            """,
            (now_iso(),),
        )

        # =====================================================
        # CONTACTS
        # =====================================================

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

        contact_columns = {
            row["name"]
            for row in db.execute(
                "PRAGMA table_info(contacts)"
            ).fetchall()
        }

        if "owner_user_id" not in contact_columns:
            db.execute(
                """
                ALTER TABLE contacts
                ADD COLUMN owner_user_id TEXT DEFAULT ''
                """
            )

        if "contact_user_id" not in contact_columns:
            db.execute(
                """
                ALTER TABLE contacts
                ADD COLUMN contact_user_id TEXT DEFAULT ''
                """
            )

        if "created_at" not in contact_columns:
            db.execute(
                """
                ALTER TABLE contacts
                ADD COLUMN created_at TEXT DEFAULT ''
                """
            )

        db.execute(
            """
            UPDATE contacts
            SET created_at = ?
            WHERE created_at IS NULL
               OR created_at = ''
            """,
            (now_iso(),),
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
    display_name: str
    avatar: str = ""


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

    keys = set(row.keys())

    return {
        "id": row["id"] if "id" in keys else None,
        "user_id": row["user_id"] if "user_id" in keys else "",
        "phone": row["phone"] if "phone" in keys else "",
        "display_name": (
            row["display_name"]
            if "display_name" in keys
            else ""
        ),
        "avatar": (
            row["avatar"]
            if "avatar" in keys and row["avatar"]
            else ""
        ),
        "created_at": (
            row["created_at"]
            if "created_at" in keys
            else ""
        ),
    }


def get_user_by_id(
    user_id: str,
) -> dict[str, Any] | None:

    db = get_db()

    try:
        row = db.execute(
            """
            SELECT
                id,
                user_id,
                phone,
                display_name,
                avatar,
                created_at
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

    identifier = identifier.strip()

    db = get_db()

    try:
        row = db.execute(
            """
            SELECT
                id,
                user_id,
                phone,
                display_name,
                avatar,
                created_at
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

        old_connection = self.connections.get(
            user_id
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

    def disconnect(
        self,
        user_id: str,
        websocket: WebSocket | None = None,
    ) -> None:

        current = self.connections.get(
            user_id
        )

        if (
            websocket is None
            or current is websocket
        ):
            self.connections.pop(
                user_id,
                None,
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
            self.disconnect(
                user_id,
                websocket,
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

        dead_users: list[str] = []

        for (
            target_user_id,
            websocket,
        ) in list(
            self.connections.items()
        ):

            try:
                await websocket.send_json(
                    message
                )

            except Exception:
                dead_users.append(
                    target_user_id
                )

        for dead_user in dead_users:
            self.disconnect(
                dead_user
            )

    async def broadcast_profile_update(
        self,
        user: dict[str, Any],
    ) -> None:

        message = {
            "type": "profile_updated",
            "user": user,
        }

        dead_users: list[str] = []

        for (
            target_user_id,
            websocket,
        ) in list(
            self.connections.items()
        ):

            try:
                await websocket.send_json(
                    message
                )

            except Exception:
                dead_users.append(
                    target_user_id
                )

        for dead_user in dead_users:
            self.disconnect(
                dead_user
            )


manager = ConnectionManager()


# =========================================================
# ROOT
# =========================================================

@app.get("/")
async def root():

    return {
        "success": True,
        "app": "VideoCallApp",
        "status": "online",
        "version": "1.0.0",
    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
async def health():

    db = get_db()

    try:

        users_count = db.execute(
            "SELECT COUNT(*) FROM users"
        ).fetchone()[0]

        contacts_count = db.execute(
            "SELECT COUNT(*) FROM contacts"
        ).fetchone()[0]

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
            SELECT id
            FROM users
            WHERE user_id = ?
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()

        if existing_user:

            raise HTTPException(
                status_code=400,
                detail="این شناسه قبلاً ثبت شده است",
            )

        existing_phone = db.execute(
            """
            SELECT id
            FROM users
            WHERE phone = ?
            LIMIT 1
            """,
            (phone,),
        ).fetchone()

        if existing_phone:

            raise HTTPException(
                status_code=400,
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
            SELECT
                id,
                user_id,
                phone,
                display_name,
                avatar,
                created_at
            FROM users
            WHERE id = ?
            LIMIT 1
            """,
            (cursor.lastrowid,),
        ).fetchone()

        user = row_to_user(row)

        return {
            "success": True,
            "message": "ثبت‌نام با موفقیت انجام شد",
            "user": user,
        }

    finally:
        db.close()


# =========================================================
# FIND USER
# =========================================================

@app.get("/api/users/{identifier}")
async def find_user(
    identifier: str,
):

    user = get_user_by_identifier(
        identifier
    )

    if user is None:
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
# USERS LIST
# =========================================================

@app.get("/api/users")
async def users_list():

    db = get_db()

    try:

        rows = db.execute(
            """
            SELECT
                id,
                user_id,
                phone,
                display_name,
                avatar,
                created_at
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
async def online_users():

    users = []

    for user_id in manager.connections:

        user = get_user_by_id(
            user_id
        )

        if user:
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

    if user is None:
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


# =========================================================
# UPDATE PROFILE
# =========================================================

@app.put("/api/profile/{user_id}")
async def update_profile(
    user_id: str,
    request: ProfileUpdateRequest,
):

    display_name = request.display_name.strip()

    if not display_name:
        raise HTTPException(
            status_code=400,
            detail="نام نمایشی نمی‌تواند خالی باشد",
        )

    user = get_user_by_id(
        user_id
    )

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد",
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
                request.avatar or "",
                user_id,
            ),
        )

        db.commit()

        row = db.execute(
            """
            SELECT
                id,
                user_id,
                phone,
                display_name,
                avatar,
                created_at
            FROM users
            WHERE user_id = ?
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()

        updated_user = row_to_user(
            row
        )

    finally:
        db.close()

    if updated_user is None:
        raise HTTPException(
            status_code=500,
            detail="خطا در دریافت پروفایل",
        )

    await manager.broadcast_profile_update(
        updated_user
    )

    return {
        "success": True,
        "message": "پروفایل ذخیره شد",
        "user": updated_user,
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

    if owner is None:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد",
        )

    db = get_db()

    try:

        rows = db.execute(
            """
            SELECT
                u.id,
                u.user_id,
                u.phone,
                u.display_name,
                u.avatar,
                u.created_at
            FROM contacts c
            JOIN users u
                ON u.user_id =
                   c.contact_user_id
            WHERE c.owner_user_id = ?
            ORDER BY c.id DESC
            """,
            (user_id,),
        ).fetchall()

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

    finally:
        db.close()


# =========================================================
# ADD CONTACT
# =========================================================

@app.post("/api/contacts/{user_id}")
async def add_contact(
    user_id: str,
    request: ContactRequest,
):

    identifier = request.identifier.strip()

    if not identifier:
        raise HTTPException(
            status_code=400,
            detail="شناسه یا شماره موبایل را وارد کنید",
        )

    owner = get_user_by_id(
        user_id
    )

    if owner is None:
        raise HTTPException(
            status_code=404,
            detail="کاربر اصلی پیدا نشد",
        )

    contact = get_user_by_identifier(
        identifier
    )

    if contact is None:
        raise HTTPException(
            status_code=404,
            detail="کاربر موردنظر پیدا نشد",
        )

    if contact["user_id"] == user_id:
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

            return {
                "success": True,
                "message": "این کاربر قبلاً در مخاطبین است",
                "contact": contact,
            }

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

        return {
            "success": True,
            "message": "مخاطب اضافه شد",
            "contact": contact,
        }

    finally:
        db.close()


# =========================================================
# DELETE CONTACT
# =========================================================

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


# =========================================================
# CHECK CONTACT
# =========================================================

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

            data = await websocket.receive_json()

            message_type = data.get(
                "type"
            )

            # =================================================
            # PING
            # =================================================

            if message_type == "ping":

                await websocket.send_json(
                    {
                        "type": "pong"
                    }
                )

                continue

            # =================================================
            # OFFER
            # =================================================

            if message_type == "offer":

                target_user_id = str(
                    data.get(
                        "target_user_id",
                        "",
                    )
                )

                if not target_user_id:
                    continue

                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": "offer",
                        "from_user_id": user_id,
                        "offer": data.get(
                            "offer"
                        ),
                        "call_type": data.get(
                            "call_type",
                            "video",
                        ),
                    },
                )

                continue

            # =================================================
            # ANSWER
            # =================================================

            if message_type == "answer":

                target_user_id = str(
                    data.get(
                        "target_user_id",
                        "",
                    )
                )

                if not target_user_id:
                    continue

                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": "answer",
                        "from_user_id": user_id,
                        "answer": data.get(
                            "answer"
                        ),
                    },
                )

                continue

            # =================================================
            # ICE CANDIDATE
            # =================================================

            if message_type == "ice-candidate":

                target_user_id = str(
                    data.get(
                        "target_user_id",
                        "",
                    )
                )

                if not target_user_id:
                    continue

                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": "ice-candidate",
                        "from_user_id": user_id,
                        "candidate": data.get(
                            "candidate"
                        ),
                    },
                )

                continue

            # =================================================
            # CALL REJECTED
            # =================================================

            if message_type == "call-rejected":

                target_user_id = str(
                    data.get(
                        "target_user_id",
                        "",
                    )
                )

                if not target_user_id:
                    continue

                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": "call-rejected",
                        "from_user_id": user_id,
                    },
                )

                continue

            # =================================================
            # HANGUP
            # =================================================

            if message_type == "hangup":

                target_user_id = str(
                    data.get(
                        "target_user_id",
                        "",
                    )
                )

                if not target_user_id:
                    continue

                await manager.send_to_user(
                    target_user_id,
                    {
                        "type": "hangup",
                        "from_user_id": user_id,
                    },
                )

                continue

    except WebSocketDisconnect:

        manager.disconnect(
            user_id,
            websocket,
        )

        await manager.broadcast_online_status(
            user_id,
            False,
        )

    except Exception:

        manager.disconnect(
            user_id,
            websocket,
        )

        await manager.broadcast_online_status(
            user_id,
            False,
        )


# =========================================================
# STARTUP
# =========================================================

@app.on_event("startup")
async def startup_event():
    initialize_database()