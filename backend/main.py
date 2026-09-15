from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import sqlite3
import logging
import uuid


# =========================
# LOG
# =========================

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger("VideoCallApp")



# =========================
# APP
# =========================

app = FastAPI(
    title="VideoCallApp",
    version="3.0.0"
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
    ]
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

    conn=get_db()

    cur=conn.cursor()


    cur.execute("""
    CREATE TABLE IF NOT EXISTS users(

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        user_id TEXT UNIQUE NOT NULL,

        phone TEXT UNIQUE NOT NULL,

        display_name TEXT NOT NULL,

        avatar TEXT DEFAULT ''

    )
    """)



    cur.execute("""
    CREATE TABLE IF NOT EXISTS messages(

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





# =========================
# MODELS
# =========================


class RegisterRequest(BaseModel):

    user_id:str

    phone:str

    display_name:str





class ProfileUpdate(BaseModel):

    display_name:str

    avatar:str=""





class MessageRequest(BaseModel):

    sender:str

    receiver:str

    message:str





# =========================
# USER HELPERS
# =========================


def user_dict(row):

    if not row:

        return None


    return {

        "id":row["id"],

        "user_id":row["user_id"],

        "phone":row["phone"],

        "display_name":row["display_name"],

        "avatar":row["avatar"]

    }





def find_user(value):

    conn=get_db()

    cur=conn.cursor()


    cur.execute(
        """
        SELECT *
        FROM users
        WHERE user_id=?
        OR phone=?
        LIMIT 1
        """,

        (
            value,
            value
        )

    )


    row=cur.fetchone()

    conn.close()


    return user_dict(row)






# =========================
# REGISTER
# =========================


@app.post("/api/register")
async def register(data:RegisterRequest):


    if find_user(data.user_id):

        raise HTTPException(
            400,
            "کاربر وجود دارد"
        )



    conn=get_db()

    cur=conn.cursor()


    try:

        cur.execute(

        """
        INSERT INTO users
        (
        user_id,
        phone,
        display_name
        )
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

            user_dict(x)

            for x in rows

        ]

    }






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







# =========================
# ONLINE USERS SOCKET
# =========================


online_users={}





@app.websocket("/ws/user/{user_id}")
async def user_socket(
    websocket:WebSocket,
    user_id:str
):


    await websocket.accept()


    online_users[user_id]=websocket


    logger.info(
        f"ONLINE {user_id}"
    )



    try:


        while True:


            data=await websocket.receive_json()



            target=data.get(
                "target"
            )



            if target in online_users:


                data["from"]=user_id


                await online_users[target].send_json(
                    data
                )



            else:


                await websocket.send_json({

                    "type":"error",

                    "message":"کاربر آنلاین نیست"

                })



    except WebSocketDisconnect:


        online_users.pop(
            user_id,
            None
        )


        logger.info(
            f"OFFLINE {user_id}"
        )






# =========================
# CHAT
# =========================


@app.post("/api/messages")
async def save_message(
    data:MessageRequest
):


    conn=get_db()

    cur=conn.cursor()



    cur.execute(

    """
    INSERT INTO messages

    (
    sender,
    receiver,
    message
    )

    VALUES(?,?,?)

    """,

    (
        data.sender,
        data.receiver,
        data.message
    )

    )



    conn.commit()

    conn.close()



    return {

        "success":True

    }







@app.get("/api/messages/{a}/{b}")
async def messages(
    a:str,
    b:str
):


    conn=get_db()

    cur=conn.cursor()



    cur.execute(

    """
    SELECT *

    FROM messages

    WHERE

    (sender=? AND receiver=?)

    OR

    (sender=? AND receiver=?)

    ORDER BY id ASC

    """,

    (
        a,
        b,
        b,
        a
    )

    )



    rows=cur.fetchall()



    conn.close()



    return {

        "success":True,

        "messages":[dict(x) for x in rows]

    }







# =========================
# ROOMS
# =========================


rooms={}



@app.post("/api/create-room")
async def create_room():


    room_id=str(
        uuid.uuid4()
    )[:8]


    rooms[room_id]=[]



    return {

        "success":True,

        "room_id":room_id

    }







@app.websocket("/ws/call/{room}/{user}")
async def call_socket(
    websocket:WebSocket,
    room:str,
    user:str
):


    await websocket.accept()


    if room not in rooms:

        rooms[room]=[]



    rooms[room].append(websocket)



    try:


        while True:


            data=await websocket.receive_json()



            for client in rooms[room]:


                if client != websocket:

                    await client.send_json(data)



    except WebSocketDisconnect:


        rooms[room].remove(websocket)







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

        "online_users":len(online_users)

    }







@app.get("/")
async def root():

    return {

        "service":"VideoCallApp",

        "status":"running"

    }