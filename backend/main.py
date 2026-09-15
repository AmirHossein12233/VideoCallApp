from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import sqlite3
import logging
import uuid


# =========================
# LOGGING
# =========================

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger("VideoCallApp")



# =========================
# APP
# =========================

app = FastAPI(
    title="VideoCallApp",
    version="2.0.0"
)



# =========================
# CORS
# =========================

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://videocallapp-web.onrender.com",
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

    user_id:str

    phone:str

    display_name:str




class ProfileUpdate(BaseModel):

    display_name:str

    avatar:str = ""





# =========================
# USER FUNCTIONS
# =========================


def user_to_dict(row):

    if not row:

        return None


    return {

        "id": row["id"],

        "user_id": row["user_id"],

        "phone": row["phone"],

        "display_name": row["display_name"],

        "avatar": row["avatar"]

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
async def register(data:RegisterRequest):


    if find_user(data.user_id):

        raise HTTPException(
            400,
            "این کاربر وجود دارد"
        )



    conn = get_db()

    cur = conn.cursor()


    try:


        cur.execute(

            """
            INSERT INTO users
            (user_id,phone,display_name)

            VALUES(?,?,?)
            """,

            (
                data.user_id,
                data.phone,
                data.display_name
            )

        )


        conn.commit()



    except sqlite3.IntegrityError:


        raise HTTPException(
            400,
            "اطلاعات تکراری است"
        )


    finally:

        conn.close()



    return {

        "success":True,

        "user":find_user(data.user_id)

    }




# =========================
# USERS
# =========================


@app.get("/api/users")
async def users():


    conn=get_db()

    cur=conn.cursor()


    cur.execute(
        "SELECT * FROM users ORDER BY id DESC"
    )


    rows=cur.fetchall()


    conn.close()


    return {

        "success":True,

        "users":[
            user_to_dict(row)
            for row in rows
        ]

    }





# =========================
# PROFILE
# =========================


@app.get("/api/profile/{user_id}")
async def profile(user_id:str):


    user=find_user(user_id)


    if not user:

        raise HTTPException(
            404,
            "کاربر پیدا نشد"
        )


    return {

        "success":True,

        "user":user

    }





@app.put("/api/profile/{user_id}")
async def update_profile(
    user_id:str,
    data:ProfileUpdate
):


    conn=get_db()

    cur=conn.cursor()


    cur.execute(

        """
        UPDATE users

        SET display_name=?,
            avatar=?

        WHERE user_id=?

        """,

        (

            data.display_name,

            data.avatar,

            user_id

        )

    )


    conn.commit()

    conn.close()



    return {

        "success":True,

        "user":find_user(user_id)

    }





# ==================================================
# WEBRTC SIGNALING
# ==================================================


rooms = {}




@app.post("/api/create-room")
async def create_room():


    room_id = str(uuid.uuid4())[:8]


    rooms[room_id] = {}



    return {

        "success":True,

        "room_id":room_id

    }







@app.websocket("/ws/call/{room_id}/{user_id}")
async def call_socket(
    websocket:WebSocket,
    room_id:str,
    user_id:str
):


    await websocket.accept()



    if room_id not in rooms:

        rooms[room_id]={}



    rooms[room_id][user_id]=websocket



    logger.info(
        f"{user_id} joined {room_id}"
    )




    # اطلاع به افراد اتاق

    for old_user, socket in rooms[room_id].items():


        if old_user != user_id:


            await websocket.send_json({

                "type":"user_joined",

                "user":old_user

            })


            await socket.send_json({

                "type":"user_joined",

                "user":user_id

            })





    try:


        while True:


            data = await websocket.receive_json()


            target=data.get("target")



            if target:


                target_socket = rooms[room_id].get(target)



                if target_socket:


                    await target_socket.send_json({

                        **data,

                        "from":user_id

                    })



    except WebSocketDisconnect:


        logger.info(
            f"{user_id} left {room_id}"
        )



        if room_id in rooms:


            rooms[room_id].pop(
                user_id,
                None
            )


            for socket in rooms[room_id].values():

                await socket.send_json({

                    "type":"user_left",

                    "user":user_id

                })



            if not rooms[room_id]:

                rooms.pop(room_id)





# =========================
# HEALTH
# =========================


@app.get("/health")
async def health():


    conn=get_db()

    cur=conn.cursor()


    cur.execute(
        "SELECT COUNT(*) FROM users"
    )


    count=cur.fetchone()[0]


    conn.close()



    return {

        "success":True,

        "status":"online",

        "service":"VideoCallApp",

        "users":count,

        "rooms":len(rooms)

    }





# =========================
# ROOT
# =========================


@app.get("/")
async def root():

    return {

        "service":"VideoCallApp",

        "status":"running"

    }