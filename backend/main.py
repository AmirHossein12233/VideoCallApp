from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pathlib import Path
import sqlite3
import json
import os


# =========================
# APP
# =========================

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
        "http://127.0.0.1:5500",
        "*"
    ],

    allow_credentials=True,

    allow_methods=[
        "*"
    ],

    allow_headers=[
        "*"
    ],
)



# =========================
# DATABASE
# =========================

BASE_DIR = Path(__file__).resolve().parent

DB_FILE = BASE_DIR / "videocall.db"



def get_db():

    conn = sqlite3.connect(
        DB_FILE
    )

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

        "display_name":
            row["display_name"],

        "avatar":
            row["avatar"]

    }




def find_user(identifier):

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
            identifier
        )
    )


    row = cur.fetchone()


    conn.close()


    return user_to_dict(row)




# =========================
# REGISTER
# =========================

@app.post(
    "/api/register"
)
async def register(
    data: RegisterRequest
):


    exists = find_user(
        data.user_id
    )


    if exists:

        raise HTTPException(
            status_code=400,
            detail="این شناسه قبلا ثبت شده است"
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
                display_name
            )

            VALUES
            (
                ?,
                ?,
                ?
            )
            """,

            (
                data.user_id,

                data.phone,

                data.display_name
            )
        )


        conn.commit()


    except sqlite3.IntegrityError:

        conn.close()

        raise HTTPException(
            status_code=400,
            detail="شماره یا شناسه قبلا استفاده شده"
        )



    conn.close()



    user = find_user(
        data.user_id
    )


    return {

        "success": True,

        "user": user

    }




# =========================
# GET USER
# =========================

@app.get(
    "/api/users/{identifier}"
)
async def get_user(
    identifier: str
):

    user = find_user(
        identifier
    )


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
# USERS LIST
# =========================

@app.get(
    "/api/users"
)
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
# HEALTH
# =========================

@app.get(
    "/health"
)
async def health():

    return {

        "success": True,

        "status": "online",

        "service": "VideoCallApp"

    }
# =========================
# WEBSOCKET CALL SERVER
# =========================


connections = {}



@app.websocket(
    "/ws/{user_id}"
)
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str
):

    await websocket.accept()


    connections[user_id] = websocket


    print(
        "WebSocket connected:",
        user_id
    )


    try:

        while True:


            message = await websocket.receive_text()


            data = json.loads(
                message
            )


            target_user_id = (
                data.get(
                    "target_user_id"
                )
            )


            if target_user_id:


                target_socket = (
                    connections.get(
                        target_user_id
                    )
                )


                if target_socket:


                    data["from_user_id"] = (
                        user_id
                    )


                    await target_socket.send_json(
                        data
                    )

                else:

                    await websocket.send_json({

                        "type":
                        "error",

                        "message":
                        "کاربر مقصد آنلاین نیست"

                    })



    except WebSocketDisconnect:


        print(
            "WebSocket disconnected:",
            user_id
        )


        if (
            user_id in connections
        ):

            del connections[user_id]





    except Exception as error:


        print(
            "WebSocket error:",
            error
        )


        if (
            user_id in connections
        ):

            del connections[user_id]





# =========================
# ROOT
# =========================


@app.get("/")
async def root():

    return {

        "service":
        "VideoCallApp",

        "status":
        "running"

    }