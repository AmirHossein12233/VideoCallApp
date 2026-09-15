from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import sqlite3
import logging
import uuid
import secrets
import hashlib
import hmac


# =========================================================
# LOGGING
# =========================================================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VideoCallApp")


# =========================================================
# APP
# =========================================================

app = FastAPI(
    title="VideoCallApp",
    version="5.0.0"
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://videocallapp-web.onrender.com",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# DATABASE
# =========================================================

BASE_DIR = Path(__file__).resolve().parent
DB_FILE = BASE_DIR / "videocall.db"


def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def column_exists(cur, table_name, column_name):
    cur.execute(f"PRAGMA table_info({table_name})")
    columns = cur.fetchall()

    return any(
        row["name"] == column_name
        for row in columns
    )


def init_db():
    conn = get_db()
    cur = conn.cursor()

    # USERS
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            avatar TEXT DEFAULT '',
            password_hash TEXT DEFAULT '',
            password_salt TEXT DEFAULT ''
        )
    """)

    # Migration for old database
    if not column_exists(cur, "users", "password_hash"):
        cur.execute(
            "ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT ''"
        )

    if not column_exists(cur, "users", "password_salt"):
        cur.execute(
            "ALTER TABLE users ADD COLUMN password_salt TEXT DEFAULT ''"
        )

    # MESSAGES
    cur.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,
            receiver TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # SESSIONS
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()


init_db()


# =========================================================
# MODELS
# =========================================================

class RegisterRequest(BaseModel):
    user_id: str
    phone: str
    display_name: str
    password: str


class LoginRequest(BaseModel):
    identifier: str
    password: str


class ProfileUpdate(BaseModel):
    display_name: str
    avatar: str = ""


class MessageRequest(BaseModel):
    sender: str
    receiver: str
    message: str


# =========================================================
# PASSWORD HASHING
# =========================================================

def hash_password(password: str, salt: Optional[bytes] = None):
    if salt is None:
        salt = secrets.token_bytes(16)

    password_bytes = password.encode("utf-8")

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password_bytes,
        salt,
        210_000
    )

    return (
        salt.hex(),
        digest.hex()
    )


def verify_password(
    password: str,
    stored_hash: str,
    stored_salt: str
):
    try:
        salt = bytes.fromhex(stored_salt)

        _, calculated_hash = hash_password(
            password,
            salt
        )

        return hmac.compare_digest(
            calculated_hash,
            stored_hash
        )

    except Exception:
        return False


# =========================================================
# USER HELPERS
# =========================================================

def user_to_dict(row):
    if not row:
        return None

    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "phone": row["phone"],
        "display_name": row["display_name"],
        "avatar": row["avatar"] or "",
        "online": row["user_id"] in online_users,
    }


def find_user(identifier: str):
    identifier = identifier.strip()

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT *
        FROM users
        WHERE user_id = ?
           OR phone = ?
        LIMIT 1
        """,
        (identifier, identifier)
    )

    row = cur.fetchone()
    conn.close()

    return user_to_dict(row)


def get_user_row(identifier: str):
    identifier = identifier.strip()

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT *
        FROM users
        WHERE user_id = ?
           OR phone = ?
        LIMIT 1
        """,
        (identifier, identifier)
    )

    row = cur.fetchone()
    conn.close()

    return row


# =========================================================
# TOKEN / SESSION HELPERS
# =========================================================

def create_session(user_id: str):
    token = secrets.token_urlsafe(48)

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO sessions
        (token, user_id)
        VALUES (?, ?)
        """,
        (
            token,
            user_id
        )
    )

    conn.commit()
    conn.close()

    return token


def get_user_from_token(token: Optional[str]):
    if not token:
        return None

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT users.*
        FROM sessions
        INNER JOIN users
            ON users.user_id = sessions.user_id
        WHERE sessions.token = ?
        LIMIT 1
        """,
        (token,)
    )

    row = cur.fetchone()
    conn.close()

    return user_to_dict(row)


def require_auth(authorization: Optional[str]):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="وارد حساب نشده‌اید"
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="توکن نامعتبر است"
        )

    token = authorization[7:].strip()

    user = get_user_from_token(token)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="نشست شما معتبر نیست"
        )

    return user


# =========================================================
# ROOT
# =========================================================

@app.get("/")
async def root():
    return {
        "success": True,
        "service": "VideoCallApp",
        "status": "running",
        "version": "5.0.0"
    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
async def health():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM users")
    users_count = cur.fetchone()[0]

    conn.close()

    return {
        "success": True,
        "status": "online",
        "service": "VideoCallApp",
        "version": "5.0.0",
        "users": users_count,
        "online_users": len(online_users),
        "rooms": len(rooms)
    }


# =========================================================
# REGISTER
# =========================================================

@app.post("/api/register")
async def register(data: RegisterRequest):
    user_id = data.user_id.strip()
    phone = data.phone.strip()
    display_name = data.display_name.strip()
    password = data.password

    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="شناسه کاربری الزامی است"
        )

    if not phone:
        raise HTTPException(
            status_code=400,
            detail="شماره تلفن الزامی است"
        )

    if not display_name:
        raise HTTPException(
            status_code=400,
            detail="نام نمایشی الزامی است"
        )

    if len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail="رمز عبور باید حداقل ۶ کاراکتر باشد"
        )

    if find_user(user_id):
        raise HTTPException(
            status_code=400,
            detail="این شناسه کاربری قبلاً ثبت شده است"
        )

    conn = get_db()
    cur = conn.cursor()

    salt, password_hash = hash_password(password)

    try:
        cur.execute(
            """
            INSERT INTO users (
                user_id,
                phone,
                display_name,
                password_hash,
                password_salt
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                user_id,
                phone,
                display_name,
                password_hash,
                salt
            )
        )

        conn.commit()

    except sqlite3.IntegrityError as e:

        logger.error(
            f"REGISTER ERROR: {e}"
        )

        text = str(e).lower()

        if "phone" in text:
            raise HTTPException(
                status_code=400,
                detail="این شماره تلفن قبلاً ثبت شده است"
            )

        raise HTTPException(
            status_code=400,
            detail="شناسه یا شماره تلفن قبلاً استفاده شده است"
        )

    finally:
        conn.close()

    token = create_session(user_id)

    return {
        "success": True,
        "message": "ثبت نام موفق بود",
        "token": token,
        "user": find_user(user_id)
    }


# =========================================================
# LOGIN
# =========================================================

@app.post("/api/login")
async def login(data: LoginRequest):

    identifier = data.identifier.strip()

    if not identifier:
        raise HTTPException(
            status_code=400,
            detail="شناسه یا شماره تلفن را وارد کنید"
        )

    if not data.password:
        raise HTTPException(
            status_code=400,
            detail="رمز عبور را وارد کنید"
        )

    row = get_user_row(identifier)

    if not row:
        raise HTTPException(
            status_code=401,
            detail="شناسه یا رمز عبور اشتباه است"
        )

    password_hash = row["password_hash"] or ""
    password_salt = row["password_salt"] or ""

    if not password_hash or not password_salt:
        raise HTTPException(
            status_code=401,
            detail="برای این حساب هنوز رمز عبور تنظیم نشده است"
        )

    if not verify_password(
        data.password,
        password_hash,
        password_salt
    ):
        raise HTTPException(
            status_code=401,
            detail="شناسه یا رمز عبور اشتباه است"
        )

    token = create_session(
        row["user_id"]
    )

    return {
        "success": True,
        "message": "ورود موفق بود",
        "token": token,
        "user": find_user(
            row["user_id"]
        )
    }


# =========================================================
# ME
# =========================================================

@app.get("/api/me")
async def me(
    authorization: Optional[str] = Header(default=None)
):
    user = require_auth(
        authorization
    )

    return {
        "success": True,
        "user": user
    }


# =========================================================
# LOGOUT
# =========================================================

@app.post("/api/logout")
async def logout(
    authorization: Optional[str] = Header(default=None)
):
    if not authorization:
        return {
            "success": True
        }

    token = ""

    if authorization.startswith("Bearer "):
        token = authorization[7:].strip()

    if token:

        conn = get_db()
        cur = conn.cursor()

        cur.execute(
            """
            DELETE FROM sessions
            WHERE token = ?
            """,
            (token,)
        )

        conn.commit()
        conn.close()

    return {
        "success": True,
        "message": "از حساب خارج شدید"
    }


# =========================================================
# USER BY IDENTIFIER
# =========================================================

@app.get("/api/users/{identifier}")
async def get_user(identifier: str):

    user = find_user(identifier)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد"
        )

    return {
        "success": True,
        "user": user
    }


# =========================================================
# USERS LIST
# =========================================================

@app.get("/api/users")
async def users():

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT *
        FROM users
        ORDER BY id DESC
        """
    )

    rows = cur.fetchall()

    conn.close()

    return {
        "success": True,
        "users": [
            user_to_dict(row)
            for row in rows
        ]
    }


# =========================================================
# PROFILE
# =========================================================

@app.get("/api/profile/{user_id}")
async def get_profile(user_id: str):

    user = find_user(user_id)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد"
        )

    return {
        "success": True,
        "user": user
    }


@app.put("/api/profile/{user_id}")
async def update_profile(
    user_id: str,
    data: ProfileUpdate,
    authorization: Optional[str] = Header(default=None)
):
    current_user = require_auth(
        authorization
    )

    if current_user["user_id"] != user_id:
        raise HTTPException(
            status_code=403,
            detail="اجازه تغییر این پروفایل را ندارید"
        )

    display_name = data.display_name.strip()
    avatar = data.avatar.strip()

    if not display_name:
        raise HTTPException(
            status_code=400,
            detail="نام نمایشی نمی‌تواند خالی باشد"
        )

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE users
        SET display_name = ?,
            avatar = ?
        WHERE user_id = ?
        """,
        (
            display_name,
            avatar,
            user_id
        )
    )

    conn.commit()
    conn.close()

    return {
        "success": True,
        "user": find_user(user_id)
    }


# =========================================================
# ONLINE USERS
# =========================================================

online_users: dict[str, WebSocket] = {}


@app.websocket("/ws/user/{user_id}")
async def user_socket(
    websocket: WebSocket,
    user_id: str
):

    await websocket.accept()

    user_id = user_id.strip()

    online_users[user_id] = websocket

    logger.info(
        f"ONLINE: {user_id}"
    )

    try:

        while True:

            data = await websocket.receive_json()

            if not isinstance(data, dict):
                continue

            target = data.get("target")

            if not target:
                await websocket.send_json({
                    "type": "error",
                    "message": "target الزامی است"
                })
                continue

            target = str(target).strip()

            target_socket = online_users.get(
                target
            )

            if not target_socket:

                await websocket.send_json({
                    "type": "error",
                    "message": "کاربر آنلاین نیست",
                    "target": target
                })

                continue

            outgoing = dict(data)

            outgoing["from"] = user_id

            try:

                await target_socket.send_json(
                    outgoing
                )

            except Exception as e:

                logger.error(
                    f"FORWARD ERROR: {e}"
                )

    except WebSocketDisconnect:

        logger.info(
            f"OFFLINE: {user_id}"
        )

    except Exception as e:

        logger.error(
            f"WEBSOCKET ERROR: {e}"
        )

    finally:

        current = online_users.get(
            user_id
        )

        if current is websocket:
            online_users.pop(
                user_id,
                None
            )


# =========================================================
# CHAT
# =========================================================

@app.post("/api/messages")
async def save_message(
    data: MessageRequest,
    authorization: Optional[str] = Header(default=None)
):

    current_user = require_auth(
        authorization
    )

    if current_user["user_id"] != data.sender:
        raise HTTPException(
            status_code=403,
            detail="فرستنده معتبر نیست"
        )

    sender = data.sender.strip()
    receiver = data.receiver.strip()
    message = data.message.strip()

    if not receiver or not message:
        raise HTTPException(
            status_code=400,
            detail="گیرنده و پیام الزامی هستند"
        )

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO messages
        (
            sender,
            receiver,
            message
        )
        VALUES (?, ?, ?)
        """,
        (
            sender,
            receiver,
            message
        )
    )

    message_id = cur.lastrowid

    conn.commit()
    conn.close()

    return {
        "success": True,
        "message_id": message_id
    }


@app.get("/api/messages/{user1}/{user2}")
async def get_messages(
    user1: str,
    user2: str,
    authorization: Optional[str] = Header(default=None)
):

    current_user = require_auth(
        authorization
    )

    if current_user["user_id"] not in [user1, user2]:
        raise HTTPException(
            status_code=403,
            detail="اجازه مشاهده این گفتگو را ندارید"
        )

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            id,
            sender,
            receiver,
            message,
            created_at
        FROM messages
        WHERE
            (sender = ? AND receiver = ?)
            OR
            (sender = ? AND receiver = ?)
        ORDER BY id ASC
        """,
        (
            user1,
            user2,
            user2,
            user1
        )
    )

    rows = cur.fetchall()

    conn.close()

    return {
        "success": True,
        "messages": [
            dict(row)
            for row in rows
        ]
    }


# =========================================================
# ROOMS
# =========================================================

rooms: dict[str, dict[str, WebSocket]] = {}


@app.post("/api/create-room")
async def create_room():
    room_id = str(
        uuid.uuid4()
    )[:8]

    rooms[room_id] = {}

    return {
        "success": True,
        "room_id": room_id
    }


@app.websocket("/ws/call/{room_id}/{user_id}")
async def room_socket(
    websocket: WebSocket,
    room_id: str,
    user_id: str
):

    await websocket.accept()

    room_id = room_id.strip()
    user_id = user_id.strip()

    if room_id not in rooms:
        rooms[room_id] = {}

    rooms[room_id][user_id] = websocket

    try:

        while True:

            data = await websocket.receive_json()

            if not isinstance(data, dict):
                continue

            target = data.get("target")

            if target:

                target_socket = rooms[
                    room_id
                ].get(
                    str(target)
                )

                if target_socket:

                    outgoing = dict(data)

                    outgoing["from"] = user_id

                    await target_socket.send_json(
                        outgoing
                    )

            else:

                for other_user, other_socket in list(
                    rooms[room_id].items()
                ):

                    if other_user == user_id:
                        continue

                    outgoing = dict(data)

                    outgoing["from"] = user_id

                    try:
                        await other_socket.send_json(
                            outgoing
                        )
                    except Exception:
                        pass

    except WebSocketDisconnect:
        pass

    except Exception as e:

        logger.error(
            f"ROOM ERROR: {e}"
        )

    finally:

        room = rooms.get(
            room_id
        )

        if room:

            current = room.get(
                user_id
            )

            if current is websocket:
                room.pop(
                    user_id,
                    None
                )

            if not room:
                rooms.pop(
                    room_id,
                    None
                )
