from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import sqlite3
import json
import logging

# =========================
# LOGGING
# =========================
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VideoCallApp")

# =========================
# APP
# =========================
app = FastAPI(title="VideoCallApp", version="1.0.0")

# =========================
# CORS
# =========================
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

# =========================
# DATABASE
# =========================
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
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            avatar TEXT DEFAULT ''
        )
    """)
    conn.commit()
    conn.close()


init_db()

# =========================
# MODELS
# =========================
class RegisterRequest(BaseModel):
    user_id: str
    phone: str
    display_name: str


class ProfileUpdate(BaseModel):
    display_name: str
    avatar: str = ""


# =========================
# HELPERS
# =========================
def user_to_dict(row):
    if not row:
        return None
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "phone": row["phone"],
        "display_name": row["display_name"],
        "avatar": row["avatar"],
    }


def find_user(identifier: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM users WHERE user_id = ? OR phone = ? LIMIT 1",
        (identifier, identifier),
    )
    row = cur.fetchone()
    conn.close()
    return user_to_dict(row)


# =========================
# REGISTER
# =========================
@app.post("/api/register")
async def register(data: RegisterRequest):
    if find_user(data.user_id):
        raise HTTPException(status_code=400, detail="این شناسه قبلاً ثبت شده است")

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO users (user_id, phone, display_name) VALUES (?, ?, ?)",
            (data.user_id, data.phone, data.display_name),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="شناسه یا شماره قبلاً استفاده شده")
    conn.close()

    return {"success": True, "user": find_user(data.user_id)}


# =========================
# LOGIN / GET USER
# =========================
@app.get("/api/users/{identifier}")
async def get_user(identifier: str):
    user = find_user(identifier)
    if not user:
        raise HTTPException(status_code=404, detail="کاربر پیدا نشد")
    return {"success": True, "user": user}


# =========================
# USERS LIST
# =========================
@app.get("/api/users")
async def users():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users ORDER BY id DESC")
    rows = cur.fetchall()
    conn.close()
    return {"success": True, "users": [user_to_dict(row) for row in rows]}


# =========================
# PROFILE
# =========================
@app.get("/api/profile/{user_id}")
async def get_profile(user_id: str):
    user = find_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="کاربر پیدا نشد")
    return {"success": True, "user": user}


@app.put("/api/profile/{user_id}")
async def update_profile(user_id: str, data: ProfileUpdate):
    user = find_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="کاربر پیدا نشد")

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "UPDATE users SET display_name = ?, avatar = ? WHERE user_id = ?",
        (data.display_name, data.avatar, user_id),
    )
    conn.commit()
    conn.close()

    return {"success": True, "user": find_user(user_id)}


# =========================
# WEBSOCKET
# =========================
connections: dict[str, WebSocket] = {}


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await websocket.accept()
    connections[user_id] = websocket
    logger.info(f"✅ CONNECTED: {user_id}")

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            target_user_id = data.get("target_user_id")
            if not target_user_id:
                await websocket.send_json({"type": "error", "message": "target_user_id required"})
                continue

            target_socket = connections.get(target_user_id)
            if not target_socket:
                await websocket.send_json({"type": "error", "message": "کاربر آنلاین نیست"})
                continue

            data["from_user_id"] = user_id
            try:
                await target_socket.send_json(data)
            except Exception:
                await websocket.send_json({"type": "error", "message": "ارسال به کاربر مقصد با مشکل مواجه شد"})

    except WebSocketDisconnect:
        logger.info(f"❌ DISCONNECTED: {user_id}")
    except Exception as e:
        logger.error(f"⚠️ WEBSOCKET ERROR ({user_id}): {e}")
    finally:
        connections.pop(user_id, None)


# =========================
# HEALTH
# =========================
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
        "users": users_count,
        "online_users": len(connections),
    }


# =========================
# ROOT
# =========================
@app.get("/")
async def root():
    return {"service": "VideoCallApp", "status": "running"}
