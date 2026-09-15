from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import sqlite3
import logging
import uuid


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
    version="4.0.0"
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
    allow_credentials=True,
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


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            avatar TEXT DEFAULT ''
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,
            receiver TEXT NOT NULL,
            message TEXT NOT NULL,
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


class ProfileUpdate(BaseModel):
    display_name: str
    avatar: str = ""


class MessageRequest(BaseModel):
    sender: str
    receiver: str
    message: str


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


# =========================================================
# ROOT
# =========================================================

@app.get("/")
async def root():
    return {
        "success": True,
        "service": "VideoCallApp",
        "status": "running",
        "version": "4.0.0"
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
        "version": "4.0.0",
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

    existing_by_id = find_user(user_id)

    if existing_by_id:
        raise HTTPException(
            status_code=400,
            detail="این شناسه کاربری قبلاً ثبت شده است"
        )

    conn = get_db()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            INSERT INTO users (
                user_id,
                phone,
                display_name
            )
            VALUES (?, ?, ?)
            """,
            (
                user_id,
                phone,
                display_name
            )
        )

        conn.commit()

    except sqlite3.IntegrityError as e:
        logger.error(f"REGISTER DB ERROR: {e}")

        error_text = str(e).lower()

        if "phone" in error_text:
            raise HTTPException(
                status_code=400,
                detail="این شماره تلفن قبلاً ثبت شده است"
            )

        if "user_id" in error_text:
            raise HTTPException(
                status_code=400,
                detail="این شناسه کاربری قبلاً ثبت شده است"
            )

        raise HTTPException(
            status_code=400,
            detail="شناسه یا شماره تلفن قبلاً استفاده شده است"
        )

    finally:
        conn.close()

    return {
        "success": True,
        "message": "ثبت نام با موفقیت انجام شد",
        "user": find_user(user_id)
    }


# =========================================================
# GET USER BY ID OR PHONE
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

    result = []

    for row in rows:
        user = user_to_dict(row)

        if user:
            result.append({
                **user,
                "online": user["user_id"] in online_users
            })

    return {
        "success": True,
        "users": result
    }


# =========================================================
# PROFILE GET
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


# =========================================================
# PROFILE UPDATE
# =========================================================

@app.put("/api/profile/{user_id}")
async def update_profile(
    user_id: str,
    data: ProfileUpdate
):
    user = find_user(user_id)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد"
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
        "message": "پروفایل بروزرسانی شد",
        "user": find_user(user_id)
    }


# =========================================================
# ONLINE USER WEBSOCKETS
# =========================================================

online_users: dict[str, WebSocket] = {}


@app.websocket("/ws/user/{user_id}")
async def user_socket(
    websocket: WebSocket,
    user_id: str
):
    await websocket.accept()

    user_id = user_id.strip()

    previous_socket: Optional[WebSocket] = online_users.get(user_id)

    if previous_socket and previous_socket is not websocket:
        try:
            await previous_socket.close()
        except Exception:
            pass

    online_users[user_id] = websocket

    logger.info(
        f"ONLINE USER: {user_id}"
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

            target_socket = online_users.get(target)

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
                await target_socket.send_json(outgoing)

            except Exception as e:
                logger.error(
                    f"FORWARD ERROR {user_id} -> {target}: {e}"
                )

                online_users.pop(target, None)

                await websocket.send_json({
                    "type": "error",
                    "message": "ارسال پیام به کاربر مقصد ناموفق بود"
                })

    except WebSocketDisconnect:
        logger.info(
            f"OFFLINE USER: {user_id}"
        )

    except Exception as e:
        logger.error(
            f"USER SOCKET ERROR ({user_id}): {e}"
        )

    finally:
        current = online_users.get(user_id)

        if current is websocket:
            online_users.pop(user_id, None)


# =========================================================
# CHAT
# =========================================================

@app.post("/api/messages")
async def save_message(
    data: MessageRequest
):
    sender = data.sender.strip()
    receiver = data.receiver.strip()
    message = data.message.strip()

    if not sender:
        raise HTTPException(
            status_code=400,
            detail="sender الزامی است"
        )

    if not receiver:
        raise HTTPException(
            status_code=400,
            detail="receiver الزامی است"
        )

    if not message:
        raise HTTPException(
            status_code=400,
            detail="پیام نمی‌تواند خالی باشد"
        )

    if len(message) > 5000:
        raise HTTPException(
            status_code=400,
            detail="پیام خیلی طولانی است"
        )

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO messages (
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
    user2: str
):
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
    room_id = str(uuid.uuid4())[:8]

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

    existing_users = [
        x for x in rooms[room_id]
        if x != user_id
    ]

    rooms[room_id][user_id] = websocket

    logger.info(
        f"ROOM JOIN: {user_id} -> {room_id}"
    )

    for existing_user in existing_users:
        try:
            await websocket.send_json({
                "type": "user_joined",
                "user": existing_user
            })
        except Exception:
            pass

        try:
            await rooms[room_id][existing_user].send_json({
                "type": "user_joined",
                "user": user_id
            })
        except Exception:
            pass

    try:
        while True:
            data = await websocket.receive_json()

            if not isinstance(data, dict):
                continue

            target = data.get("target")

            if target:
                target_socket = rooms[room_id].get(
                    str(target)
                )

                if target_socket:
                    outgoing = dict(data)
                    outgoing["from"] = user_id

                    await target_socket.send_json(
                        outgoing
                    )

                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": "کاربر موردنظر در اتاق نیست"
                    })

            else:
                # پخش پیام به بقیه اعضای اتاق
                for other_user, other_socket in rooms[room_id].items():
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
        logger.info(
            f"ROOM LEAVE: {user_id} -> {room_id}"
        )

    except Exception as e:
        logger.error(
            f"ROOM SOCKET ERROR: {e}"
        )

    finally:
        room = rooms.get(room_id)

        if room:
            current = room.get(user_id)

            if current is websocket:
                room.pop(user_id, None)

            for other_user, other_socket in list(room.items()):
                try:
                    await other_socket.send_json({
                        "type": "user_left",
                        "user": user_id
                    })
                except Exception:
                    pass

            if not room:
                rooms.pop(room_id, None)


# =========================================================
# RUN INFO
# =========================================================

@app.get("/api/status")
async def api_status():
    return {
        "success": True,
        "service": "VideoCallApp",
        "version": "4.0.0",
        "database": str(DB_FILE.name),
        "users": len(await _get_all_users_for_status()),
        "online_users": len(online_users),
        "rooms": len(rooms)
    }


async def _get_all_users_for_status():
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "SELECT user_id FROM users"
    )

    rows = cur.fetchall()
    conn.close()

    return rows