from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    HTTPException,
    Header,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import sqlite3
import logging
import secrets
import hashlib
import hmac
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
    version="6.0.0",
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


def column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()

    return any(
        row["name"] == column_name
        for row in columns
    )


def init_db():
    conn = get_db()
    cur = conn.cursor()

    # -------------------------
    # USERS
    # -------------------------

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            avatar TEXT DEFAULT '',
            password_hash TEXT DEFAULT '',
            password_salt TEXT DEFAULT ''
        )
        """
    )

    # Migration برای دیتابیس‌های قبلی
    if not column_exists(
        cur,
        "users",
        "password_hash",
    ):
        cur.execute(
            """
            ALTER TABLE users
            ADD COLUMN password_hash TEXT DEFAULT ''
            """
        )

    if not column_exists(
        cur,
        "users",
        "password_salt",
    ):
        cur.execute(
            """
            ALTER TABLE users
            ADD COLUMN password_salt TEXT DEFAULT ''
            """
        )

    # -------------------------
    # MESSAGES
    # -------------------------

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,
            receiver TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # -------------------------
    # SESSIONS
    # -------------------------

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

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
# PASSWORD
# =========================================================

def hash_password(
    password: str,
    salt: Optional[bytes] = None,
):
    if salt is None:
        salt = secrets.token_bytes(16)

    password_bytes = password.encode("utf-8")

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password_bytes,
        salt,
        210_000,
    )

    return (
        salt.hex(),
        digest.hex(),
    )


def verify_password(
    password: str,
    stored_hash: str,
    stored_salt: str,
):
    try:
        salt = bytes.fromhex(
            stored_salt
        )

        _, calculated_hash = hash_password(
            password,
            salt,
        )

        return hmac.compare_digest(
            calculated_hash,
            stored_hash,
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
        (
            identifier,
            identifier,
        ),
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
        (
            identifier,
            identifier,
        ),
    )

    row = cur.fetchone()

    conn.close()

    return row


# =========================================================
# SESSION
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
            user_id,
        ),
    )

    conn.commit()
    conn.close()

    return token


def get_user_from_token(
    token: Optional[str],
):
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
        (token,),
    )

    row = cur.fetchone()

    conn.close()

    return user_to_dict(row)


def require_auth(
    authorization: Optional[str],
):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="وارد حساب نشده‌اید",
        )

    if not authorization.startswith(
        "Bearer "
    ):
        raise HTTPException(
            status_code=401,
            detail="توکن نامعتبر است",
        )

    token = authorization[7:].strip()

    user = get_user_from_token(token)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="نشست شما معتبر نیست",
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
        "version": "6.0.0",
        "status": "running",
    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
async def health():
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "SELECT COUNT(*) FROM users"
    )

    users_count = cur.fetchone()[0]

    conn.close()

    return {
        "success": True,
        "service": "VideoCallApp",
        "version": "6.0.0",
        "status": "online",
        "users": users_count,
        "online_users": len(online_users),
        "rooms": len(rooms),
    }


# =========================================================
# REGISTER
# =========================================================

@app.post("/api/register")
async def register(
    data: RegisterRequest,
):
    user_id = data.user_id.strip()
    phone = data.phone.strip()
    display_name = data.display_name.strip()
    password = data.password

    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="شناسه کاربری الزامی است",
        )

    if not phone:
        raise HTTPException(
            status_code=400,
            detail="شماره تلفن الزامی است",
        )

    if not display_name:
        raise HTTPException(
            status_code=400,
            detail="نام نمایشی الزامی است",
        )

    if len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail="رمز عبور باید حداقل ۶ کاراکتر باشد",
        )

    if find_user(user_id):
        raise HTTPException(
            status_code=400,
            detail="این شناسه کاربری قبلاً ثبت شده است",
        )

    salt, password_hash = hash_password(
        password
    )

    conn = get_db()
    cur = conn.cursor()

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
                salt,
            ),
        )

        conn.commit()

    except sqlite3.IntegrityError as error:

        logger.error(
            f"REGISTER ERROR: {error}"
        )

        text = str(error).lower()

        if "phone" in text:
            raise HTTPException(
                status_code=400,
                detail="این شماره تلفن قبلاً ثبت شده است",
            )

        raise HTTPException(
            status_code=400,
            detail="شناسه یا شماره تلفن قبلاً استفاده شده است",
        )

    finally:
        conn.close()

    token = create_session(
        user_id
    )

    return {
        "success": True,
        "message": "ثبت نام موفق بود",
        "token": token,
        "user": find_user(user_id),
    }


# =========================================================
# LOGIN
# =========================================================

@app.post("/api/login")
async def login(
    data: LoginRequest,
):
    identifier = data.identifier.strip()

    if not identifier:
        raise HTTPException(
            status_code=400,
            detail="شناسه یا شماره تلفن را وارد کنید",
        )

    if not data.password:
        raise HTTPException(
            status_code=400,
            detail="رمز عبور را وارد کنید",
        )

    row = get_user_row(
        identifier
    )

    if not row:
        raise HTTPException(
            status_code=401,
            detail="شناسه یا رمز عبور اشتباه است",
        )

    stored_hash = (
        row["password_hash"] or ""
    )

    stored_salt = (
        row["password_salt"] or ""
    )

    if (
        not stored_hash
        or not stored_salt
    ):
        raise HTTPException(
            status_code=401,
            detail="این حساب رمز عبور ندارد؛ یک حساب جدید بسازید",
        )

    if not verify_password(
        data.password,
        stored_hash,
        stored_salt,
    ):
        raise HTTPException(
            status_code=401,
            detail="شناسه یا رمز عبور اشتباه است",
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
        ),
    }


# =========================================================
# ME
# =========================================================

@app.get("/api/me")
async def me(
    authorization: Optional[str] = Header(
        default=None
    ),
):
    user = require_auth(
        authorization
    )

    return {
        "success": True,
        "user": user,
    }


# =========================================================
# LOGOUT
# =========================================================

@app.post("/api/logout")
async def logout(
    authorization: Optional[str] = Header(
        default=None
    ),
):
    if not authorization:
        return {
            "success": True
        }

    if not authorization.startswith(
        "Bearer "
    ):
        return {
            "success": True
        }

    token = authorization[7:].strip()

    if token:

        conn = get_db()
        cur = conn.cursor()

        cur.execute(
            """
            DELETE FROM sessions
            WHERE token = ?
            """,
            (token,),
        )

        conn.commit()
        conn.close()

    return {
        "success": True,
        "message": "از حساب خارج شدید",
    }


# =========================================================
# USER BY ID / PHONE
# =========================================================

@app.get("/api/users/{identifier}")
async def get_user(
    identifier: str,
):
    user = find_user(
        identifier
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد",
        )

    return {
        "success": True,
        "user": user,
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
        ],
    }


# =========================================================
# PROFILE
# =========================================================

@app.get("/api/profile/{user_id}")
async def get_profile(
    user_id: str,
):
    user = find_user(
        user_id
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد",
        )

    return {
        "success": True,
        "user": user,
    }


@app.put("/api/profile/{user_id}")
async def update_profile(
    user_id: str,
    data: ProfileUpdate,
    authorization: Optional[str] = Header(
        default=None
    ),
):
    current_user = require_auth(
        authorization
    )

    if current_user["user_id"] != user_id:
        raise HTTPException(
            status_code=403,
            detail="اجازه تغییر این پروفایل را ندارید",
        )

    display_name = data.display_name.strip()
    avatar = data.avatar.strip()

    if not display_name:
        raise HTTPException(
            status_code=400,
            detail="نام نمایشی نمی‌تواند خالی باشد",
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
            user_id,
        ),
    )

    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": "پروفایل بروزرسانی شد",
        "user": find_user(
            user_id
        ),
    }


# =========================================================
# ONLINE USER SOCKETS
# =========================================================

online_users: dict[str, WebSocket] = {}


@app.websocket("/ws/user/{user_id}")
async def user_socket(
    websocket: WebSocket,
    user_id: str,
):

    await websocket.accept()

    user_id = user_id.strip()

    # -----------------------------------------
    # TOKEN FROM QUERY STRING
    # -----------------------------------------

    token = websocket.query_params.get(
        "token"
    )

    if not token:
        await websocket.send_json({
            "type": "auth_error",
            "message": "توکن ورود ارسال نشده است",
        })

        await websocket.close(
            code=1008
        )

        return


    authenticated_user = (
        get_user_from_token(token)
    )


    if not authenticated_user:

        await websocket.send_json({
            "type": "auth_error",
            "message": "توکن معتبر نیست",
        })

        await websocket.close(
            code=1008
        )

        return


    # -----------------------------------------
    # CHECK USER ID
    # -----------------------------------------

    if (
        authenticated_user["user_id"]
        != user_id
    ):

        await websocket.send_json({
            "type": "auth_error",
            "message": "شناسه کاربر با توکن مطابقت ندارد",
        })

        await websocket.close(
            code=1008
        )

        return


    # -----------------------------------------
    # CLOSE PREVIOUS CONNECTION
    # -----------------------------------------

    previous_socket = online_users.get(
        user_id
    )

    if (
        previous_socket
        and previous_socket is not websocket
    ):

        try:
            await previous_socket.close()
        except Exception:
            pass


    online_users[user_id] = websocket

    logger.info(
        f"AUTHENTICATED ONLINE: {user_id}"
    )


    try:

        while True:

            data = (
                await websocket.receive_json()
            )

            if not isinstance(
                data,
                dict,
            ):
                continue


            target = data.get(
                "target"
            )


            if not target:

                await websocket.send_json({
                    "type": "error",
                    "message": "target الزامی است",
                })

                continue


            target = str(
                target
            ).strip()


            target_socket = (
                online_users.get(
                    target
                )
            )


            if not target_socket:

                await websocket.send_json({
                    "type": "error",
                    "message": "کاربر آنلاین نیست",
                    "target": target,
                })

                continue


            outgoing = dict(
                data
            )

            outgoing["from"] = user_id


            try:

                await target_socket.send_json(
                    outgoing
                )

            except Exception as error:

                logger.error(
                    f"FORWARD ERROR "
                    f"{user_id} -> {target}: "
                    f"{error}"
                )


    except WebSocketDisconnect:

        logger.info(
            f"OFFLINE: {user_id}"
        )


    except Exception as error:

        logger.error(
            f"WEBSOCKET ERROR "
            f"({user_id}): {error}"
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
    authorization: Optional[str] = Header(
        default=None
    ),
):
    current_user = require_auth(
        authorization
    )


    if (
        current_user["user_id"]
        != data.sender
    ):

        raise HTTPException(
            status_code=403,
            detail="فرستنده معتبر نیست",
        )


    sender = data.sender.strip()
    receiver = data.receiver.strip()
    message = data.message.strip()


    if not receiver:
        raise HTTPException(
            status_code=400,
            detail="گیرنده الزامی است",
        )


    if not message:
        raise HTTPException(
            status_code=400,
            detail="پیام نمی‌تواند خالی باشد",
        )


    if len(message) > 5000:

        raise HTTPException(
            status_code=400,
            detail="پیام خیلی طولانی است",
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
            message,
        ),
    )


    message_id = cur.lastrowid


    conn.commit()
    conn.close()


    return {
        "success": True,
        "message_id": message_id,
    }


@app.get(
    "/api/messages/{user1}/{user2}"
)
async def get_messages(
    user1: str,
    user2: str,
    authorization: Optional[str] = Header(
        default=None
    ),
):
    current_user = require_auth(
        authorization
    )


    if current_user["user_id"] not in [
        user1,
        user2,
    ]:

        raise HTTPException(
            status_code=403,
            detail="اجازه مشاهده این گفتگو را ندارید",
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
            user1,
        ),
    )


    rows = cur.fetchall()

    conn.close()


    return {
        "success": True,
        "messages": [
            dict(row)
            for row in rows
        ],
    }


# =========================================================
# ROOMS
# =========================================================

rooms: dict[
    str,
    dict[str, WebSocket]
] = {}


@app.post("/api/create-room")
async def create_room():

    room_id = str(
        uuid.uuid4()
    )[:8]


    rooms[room_id] = {}


    return {
        "success": True,
        "room_id": room_id,
    }


@app.websocket(
    "/ws/call/{room_id}/{user_id}"
)
async def room_socket(
    websocket: WebSocket,
    room_id: str,
    user_id: str,
):

    await websocket.accept()


    room_id = room_id.strip()
    user_id = user_id.strip()


    # -----------------------------------------
    # ROOM TOKEN
    # -----------------------------------------

    token = websocket.query_params.get(
        "token"
    )


    if not token:

        await websocket.send_json({
            "type": "auth_error",
            "message": "توکن ورود ارسال نشده است",
        })

        await websocket.close(
            code=1008
        )

        return


    authenticated_user = (
        get_user_from_token(token)
    )


    if not authenticated_user:

        await websocket.send_json({
            "type": "auth_error",
            "message": "توکن معتبر نیست",
        })

        await websocket.close(
            code=1008
        )

        return


    if (
        authenticated_user["user_id"]
        != user_id
    ):

        await websocket.send_json({
            "type": "auth_error",
            "message": "کاربر مجاز نیست",
        })

        await websocket.close(
            code=1008
        )

        return


    # -----------------------------------------
    # CREATE ROOM IF MISSING
    # -----------------------------------------

    if room_id not in rooms:
        rooms[room_id] = {}


    # -----------------------------------------
    # SAVE SOCKET
    # -----------------------------------------

    rooms[room_id][user_id] = websocket


    logger.info(
        f"ROOM JOIN: "
        f"{user_id} -> {room_id}"
    )


    # -----------------------------------------
    # NOTIFY MEMBERS
    # -----------------------------------------

    existing_users = [
        existing_user
        for existing_user
        in rooms[room_id]
        if existing_user != user_id
    ]


    for existing_user in existing_users:

        existing_socket = (
            rooms[room_id]
            .get(existing_user)
        )


        if existing_socket:

            try:

                await existing_socket.send_json({

                    "type":
                        "user_joined",

                    "user":
                        user_id,

                })

            except Exception:
                pass


        try:

            await websocket.send_json({

                "type":
                    "user_joined",

                "user":
                    existing_user,

            })

        except Exception:
            pass


    try:

        while True:

            data = (
                await websocket.receive_json()
            )


            if not isinstance(
                data,
                dict,
            ):
                continue


            target = data.get(
                "target"
            )


            if target:

                target = str(
                    target
                ).strip()


                target_socket = (
                    rooms[
                        room_id
                    ].get(
                        target
                    )
                )


                if target_socket:

                    outgoing = dict(
                        data
                    )

                    outgoing["from"] = (
                        user_id
                    )


                    await target_socket.send_json(
                        outgoing
                    )


                else:

                    await websocket.send_json({

                        "type":
                            "error",

                        "message":
                            "کاربر موردنظر در اتاق نیست",

                    })


            else:

                for (
                    other_user,
                    other_socket
                ) in list(
                    rooms[
                        room_id
                    ].items()
                ):

                    if (
                        other_user
                        == user_id
                    ):
                        continue


                    outgoing = dict(
                        data
                    )

                    outgoing["from"] = (
                        user_id
                    )


                    try:

                        await other_socket.send_json(
                            outgoing
                        )

                    except Exception:
                        pass


    except WebSocketDisconnect:

        logger.info(
            f"ROOM LEAVE: "
            f"{user_id} -> {room_id}"
        )


    except Exception as error:

        logger.error(
            f"ROOM ERROR: {error}"
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


            for (
                other_user,
                other_socket
            ) in list(
                room.items()
            ):

                try:

                    await other_socket.send_json({

                        "type":
                            "user_left",

                        "user":
                            user_id,

                    })

                except Exception:
                    pass


            if not room:

                rooms.pop(
                    room_id,
                    None
                )
