from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict
import sqlite3
import json
import os


app = FastAPI(
    title="VideoCallApp API",
    version="1.0.0"
)


# =========================
# CORS
# =========================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
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

DB = "users.db"


def db():

    return sqlite3.connect(DB)


def init_db():

    con = db()

    cur = con.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users(

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        user_id TEXT UNIQUE,

        phone TEXT,

        display_name TEXT,

        avatar TEXT

    )
    """)

    con.commit()

    con.close()



init_db()



# =========================
# MODELS
# =========================


class RegisterModel(BaseModel):

    user_id: str

    phone: str

    display_name: str




# =========================
# USERS API
# =========================


@app.post("/api/register")
def register(
    user: RegisterModel
):

    con = db()

    cur = con.cursor()


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
        (?,?,?)
        """,

        (
            user.user_id,
            user.phone,
            user.display_name
        )

        )

        con.commit()


    except sqlite3.IntegrityError:

        raise HTTPException(
            400,
            "این شناسه قبلا ثبت شده است"
        )


    cur.execute(
    """
    SELECT
    user_id,
    phone,
    display_name,
    avatar

    FROM users

    WHERE user_id=?
    """,

    (
        user.user_id,
    )

    )


    row = cur.fetchone()

    con.close()


    return {

        "user":{

            "user_id":row[0],

            "phone":row[1],

            "display_name":row[2],

            "avatar":row[3]

        }

    }




@app.get("/api/users")
def users():

    con = db()

    cur = con.cursor()


    cur.execute(
    """
    SELECT
    user_id,
    phone,
    display_name,
    avatar

    FROM users
    """
    )


    rows = cur.fetchall()


    con.close()



    return {

        "users":[

            {

                "user_id":r[0],

                "phone":r[1],

                "display_name":r[2],

                "avatar":r[3]

            }

            for r in rows

        ]

    }





@app.get("/api/users/{user_id}")
def get_user(
    user_id:str
):

    con = db()

    cur = con.cursor()


    cur.execute(
    """
    SELECT

    user_id,
    phone,
    display_name,
    avatar

    FROM users

    WHERE user_id=?

    """,

    (
        user_id,
    )

    )


    row = cur.fetchone()


    con.close()


    if not row:

        raise HTTPException(
            404,
            "کاربر پیدا نشد"
        )


    return {

        "user":{

            "user_id":row[0],

            "phone":row[1],

            "display_name":row[2],

            "avatar":row[3]

        }

    }





# =========================
# WEBSOCKET
# =========================


connections: Dict[str, WebSocket] = {}



@app.websocket("/ws/{user_id}")
async def websocket_endpoint(

    websocket:WebSocket,

    user_id:str

):

    await websocket.accept()


    connections[user_id] = websocket


    try:

        while True:


            data = await websocket.receive_text()


            message = json.loads(data)



            target = (

                message.get(
                    "target_user_id"
                )

                or

                message.get(
                    "to"
                )

            )


            if target in connections:


                await connections[target].send_json(

                    {

                        **message,

                        "from_user_id":
                        user_id

                    }

                )



    except WebSocketDisconnect:


        if user_id in connections:

            del connections[user_id]





# =========================
# HEALTH
# =========================


@app.get("/health")
def health():

    return {

        "status":"online",

        "app":"VideoCallApp",

        "online_users":
        len(connections)

    }