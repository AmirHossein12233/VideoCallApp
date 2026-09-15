from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import sqlite3
import json


app = FastAPI(
    title="VideoCallApp",
    version="1.0.0"
)


# =========================
# CORS
# =========================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://videocallapp-web.onrender.com",
        "http://localhost:5500",
        "http://127.0.0.1:5500"
    ],
    allow_credentials=False,
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

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users(

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id TEXT UNIQUE NOT NULL,

            phone TEXT UNIQUE NOT NULL,

            display_name TEXT NOT NULL,

            avatar TEXT DEFAULT ''

        )
        """
    )

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

        "avatar": row["avatar"] or ""

    }




def find_user(identifier):

    conn = get_db()

    cur = conn.cursor()


    cur.execute(
        """
        SELECT *
        FROM users
        WHERE user_id=?
        OR phone=?
        LIMIT 1
        """,
        (
            identifier,
            identifier
        )
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

        raise HTTPException(
            400,
            "این شناسه قبلا ثبت شده است"
        )



    conn = get_db()

    cur = conn.cursor()


    try:

        cur.execute(
            """
            INSERT INTO users
            (
                user_id,
                phone,
                display_name,
                avatar
            )

            VALUES
            (?,?,?,?)
            """,
            (
                data.user_id,
                data.phone,
                data.display_name,
                ""
            )
        )


        conn.commit()


    except sqlite3.IntegrityError:

        conn.close()

        raise HTTPException(
            400,
            "شماره یا شناسه قبلا استفاده شده"
        )



    conn.close()


    return {

        "success": True,

        "user": find_user(data.user_id)

    }



# =========================
# USER LOGIN
# =========================


@app.get("/api/users/{identifier}")
async def login(identifier: str):


    user = find_user(identifier)


    if not user:

        raise HTTPException(
            404,
            "کاربر پیدا نشد"
        )


    return {

        "success": True,

        "user": user

    }



# =========================
# USERS LIST
# =========================


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

        "users":
        [
            user_to_dict(row)
            for row in rows
        ]

    }
# =========================
# PROFILE GET
# =========================

@app.get("/api/profile/{identifier}")
async def get_profile(identifier: str):

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


# =========================
# PROFILE UPDATE
# =========================

@app.put("/api/profile/{identifier}")
async def update_profile(
    identifier: str,
    data: ProfileUpdate
):

    display_name = data.display_name.strip()
    avatar = data.avatar or ""

    if not display_name:
        raise HTTPException(
            status_code=400,
            detail="نام نمایشی را وارد کنید"
        )

    user = find_user(identifier)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="کاربر پیدا نشد"
        )

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE users
        SET
            display_name = ?,
            avatar = ?
        WHERE user_id = ?
        """,
        (
            display_name,
            avatar,
            user["user_id"]
        )
    )

    conn.commit()
    conn.close()

    updated_user = find_user(
        user["user_id"]
    )

    return {
        "success": True,
        "user": updated_user
    }


# =========================
# HEALTH
# =========================

@app.get("/health")
async def health():

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "SELECT COUNT(*) AS count FROM users"
    )

    row = cur.fetchone()

    conn.close()

    return {
        "success": True,
        "status": "online",
        "service": "VideoCallApp",
        "users": row["count"]
    }


# =========================
# WEBSOCKET
# =========================

connections = {}


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str
):

    await websocket.accept()

    old_socket = connections.get(user_id)

    if old_socket:

        try:
            await old_socket.close()
        except Exception:
            pass

    connections[user_id] = websocket

    print(
        "WebSocket connected:",
        user_id
    )

    try:

        while True:

            message = await websocket.receive_text()

            try:

                data = json.loads(message)

            except json.JSONDecodeError:

                await websocket.send_json({
                    "type": "error",
                    "message": "پیام نامعتبر است"
                })

                continue


            target_user_id = data.get(
                "target_user_id"
            )

            if not target_user_id:
                continue


            target_user_id = str(
                target_user_id
            )


            target_socket = connections.get(
                target_user_id
            )


            if target_socket:

                data["from_user_id"] = user_id

                try:

                    await target_socket.send_json(
                        data
                    )

                except Exception:

                    connections.pop(
                        target_user_id,
                        None
                    )

                    await websocket.send_json({
                        "type": "error",
                        "message": "ارتباط با کاربر مقصد قطع شد"
                    })

            else:

                await websocket.send_json({
                    "type": "error",
                    "message": "کاربر مقصد آنلاین نیست"
                })


    except WebSocketDisconnect:

        print(
            "WebSocket disconnected:",
            user_id
        )

        if connections.get(user_id) is websocket:

            connections.pop(
                user_id,
                None
            )


    except Exception as error:

        print(
            "WebSocket error:",
            error
        )

        if connections.get(user_id) is websocket:

            connections.pop(
                user_id,
                None
            )


# =========================
# ROOT
# =========================

@app.get("/")
async def root():

    return {
        "service": "VideoCallApp",
        "status": "running",
        "version": "1.0.0"
    }