const API_URL = "https://videocallapp-api.onrender.com";
const WS_URL = "wss://videocallapp-api.onrender.com";

const authToken =
    localStorage.getItem("auth_token");

const userId =
    localStorage.getItem("user_id");


// =========================================================
// AUTH CHECK
// =========================================================

if (!authToken || !userId) {
    location.href = "login.html";
}


// =========================================================
// ELEMENTS
// =========================================================

const statusElement =
    document.getElementById("status");

const roomInput =
    document.getElementById("roomId");

const createRoomButton =
    document.getElementById("createRoom");

const joinRoomButton =
    document.getElementById("joinRoom");

const usersList =
    document.getElementById("usersList");

const incomingCall =
    document.getElementById("incomingCall");

const callerName =
    document.getElementById("callerName");

const acceptIncoming =
    document.getElementById("acceptIncoming");

const rejectIncoming =
    document.getElementById("rejectIncoming");

const ringtone =
    document.getElementById("ringtone");


// =========================================================
// SOCKET
// =========================================================

let socket = null;

let incomingCaller = null;
let incomingOffer = null;

let reconnectTimer = null;


// =========================================================
// STATUS
// =========================================================

function setStatus(text) {

    if (statusElement) {
        statusElement.innerText = text;
    }

}


// =========================================================
// RINGTONE
// =========================================================

function startRingtone() {

    if (!ringtone) {
        return;
    }

    ringtone.currentTime = 0;

    const promise =
        ringtone.play();

    if (promise) {

        promise.catch(() => {

            console.log(
                "پخش خودکار زنگ توسط مرورگر مسدود شد."
            );

        });

    }

}


function stopRingtone() {

    if (!ringtone) {
        return;
    }

    ringtone.pause();
    ringtone.currentTime = 0;

}


// =========================================================
// CONNECT SOCKET
// =========================================================

function connectSocket() {

    if (!userId) {
        return;
    }


    if (
        socket &&
        (
            socket.readyState ===
            WebSocket.OPEN ||

            socket.readyState ===
            WebSocket.CONNECTING
        )
    ) {
        return;
    }


    socket =
        new WebSocket(
            `${WS_URL}/ws/user/${encodeURIComponent(userId)}`
        );


    socket.onopen = () => {

        console.log(
            "WebSocket connected"
        );

        setStatus(
            "آنلاین"
        );

    };


    socket.onmessage = (event) => {

        let data;

        try {

            data =
                JSON.parse(event.data);

        } catch (error) {

            console.error(
                "Invalid WebSocket data",
                error
            );

            return;
        }


        console.log(
            "WS:",
            data
        );


        // =================================================
        // INCOMING CALL
        // =================================================

        if (
            data.type ===
            "call_request"
        ) {

            incomingCaller =
                data.from;

            incomingOffer =
                data.offer;


            if (callerName) {

                callerName.innerText =
                    data.from;

            }


            if (incomingCall) {

                incomingCall
                    .classList
                    .remove("hidden");

            }


            startRingtone();


            setStatus(
                "تماس ورودی"
            );


            return;
        }


        // =================================================
        // CALL REJECT
        // =================================================

        if (
            data.type ===
            "call_reject"
        ) {

            stopRingtone();


            if (incomingCall) {

                incomingCall
                    .classList
                    .add("hidden");

            }


            setStatus(
                "تماس رد شد"
            );


            return;
        }


        // =================================================
        // CALL END
        // =================================================

        if (
            data.type ===
            "call_end"
        ) {

            setStatus(
                "تماس پایان یافت"
            );


            return;
        }


        // =================================================
        // CHAT
        // =================================================

        if (
            data.type ===
            "chat"
        ) {

            window.dispatchEvent(
                new CustomEvent(
                    "videocall-chat-message",
                    {
                        detail: data
                    }
                )
            );

            return;
        }


        // =================================================
        // ERROR
        // =================================================

        if (
            data.type ===
            "error"
        ) {

            setStatus(
                data.message ||
                "خطایی رخ داد"
            );

        }

    };


    socket.onerror = (error) => {

        console.error(
            "WebSocket error:",
            error
        );

        setStatus(
            "خطا در اتصال"
        );

    };


    socket.onclose = () => {

        console.log(
            "WebSocket closed"
        );

        setStatus(
            "اتصال قطع شد"
        );


        clearTimeout(
            reconnectTimer
        );


        reconnectTimer =
            setTimeout(() => {

                connectSocket();

            }, 3000);

    };

}


// =========================================================
// SEND SOCKET
// =========================================================

function sendSignal(data) {

    if (
        socket &&
        socket.readyState ===
        WebSocket.OPEN
    ) {

        socket.send(
            JSON.stringify(data)
        );

        return true;
    }

    return false;
}


// =========================================================
// ACCEPT INCOMING CALL
// =========================================================

if (acceptIncoming) {

    acceptIncoming.onclick = () => {

        if (
            !incomingCaller ||
            !incomingOffer
        ) {
            return;
        }


        stopRingtone();


        localStorage.setItem(
            "call_target",
            incomingCaller
        );


        localStorage.setItem(
            "pending_call",
            JSON.stringify({
                from:
                    incomingCaller,

                offer:
                    incomingOffer
            })
        );


        if (incomingCall) {

            incomingCall
                .classList
                .add("hidden");

        }


        location.href =
            "call.html";

    };

}


// =========================================================
// REJECT INCOMING CALL
// =========================================================

if (rejectIncoming) {

    rejectIncoming.onclick = () => {

        if (incomingCaller) {

            sendSignal({

                type:
                    "call_reject",

                target:
                    incomingCaller

            });

        }


        stopRingtone();


        incomingCaller = null;
        incomingOffer = null;


        if (incomingCall) {

            incomingCall
                .classList
                .add("hidden");

        }


        setStatus(
            "تماس رد شد"
        );

    };

}


// =========================================================
// CREATE ROOM
// =========================================================

if (createRoomButton) {

    createRoomButton.onclick =
        async () => {

            try {

                const response =
                    await fetch(
                        `${API_URL}/api/create-room`,
                        {
                            method:
                                "POST"
                        }
                    );


                const data =
                    await response.json();


                if (!response.ok) {

                    throw new Error(
                        data.detail ||
                        "ساخت اتاق ناموفق بود"
                    );

                }


                if (roomInput) {

                    roomInput.value =
                        data.room_id;

                }


                setStatus(
                    `اتاق ساخته شد: ${data.room_id}`
                );

            } catch (error) {

                console.error(
                    error
                );

                setStatus(
                    "ساخت اتاق ناموفق بود"
                );

            }

        };

}


// =========================================================
// JOIN ROOM
// =========================================================

if (joinRoomButton) {

    joinRoomButton.onclick =
        () => {

            if (!roomInput) {
                return;
            }


            const roomId =
                roomInput.value.trim();


            if (!roomId) {

                setStatus(
                    "کد اتاق را وارد کنید"
                );

                return;
            }


            localStorage.setItem(
                "room_id",
                roomId
            );


            localStorage.removeItem(
                "call_target"
            );

            localStorage.removeItem(
                "pending_call"
            );


            location.href =
                "call.html";

        };

}


// =========================================================
// LOAD USERS
// =========================================================

async function loadUsers() {

    if (!usersList) {
        return;
    }


    try {

        const response =
            await fetch(
                `${API_URL}/api/users`
            );


        const data =
            await response.json();


        if (!response.ok) {
            throw new Error(
                data.detail ||
                "خطا در دریافت کاربران"
            );
        }


        usersList.innerHTML = "";


        data.users.forEach(user => {

            if (
                user.user_id ===
                userId
            ) {
                return;
            }


            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "user-card";


            const onlineText =
                user.online
                    ? "آنلاین"
                    : "آفلاین";


            const onlineClass =
                user.online
                    ? "online-status"
                    : "offline-status";


            const avatar =
                user.avatar ||
                "https://via.placeholder.com/55";


            card.innerHTML = `

                <img
                    class="avatar"
                    src="${escapeHtml(avatar)}"
                    alt="avatar">

                <div class="user-info">

                    <b>
                        ${escapeHtml(
                            user.display_name
                        )}
                    </b>

                    <small>
                        @${escapeHtml(
                            user.user_id
                        )}
                    </small>

                    <small class="${onlineClass}">
                        ${onlineText}
                    </small>

                </div>

                <button
                    class="call-button"
                    type="button"
                    data-user="${escapeHtml(
                        user.user_id
                    )}">

                    📞

                </button>
            `;


            const callButton =
                card.querySelector(
                    ".call-button"
                );


            callButton.addEventListener(
                "click",
                () => {

                    openCall(
                        user.user_id
                    );

                }
            );


            usersList.appendChild(
                card
            );

        });


    } catch (error) {

        console.error(
            "Users error:",
            error
        );

    }

}


// =========================================================
// ESCAPE HTML
// =========================================================

function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


// =========================================================
// OPEN CALL
// =========================================================

function openCall(target) {

    localStorage.setItem(
        "call_target",
        target
    );


    localStorage.removeItem(
        "pending_call"
    );


    location.href =
        "call.html";

}


// =========================================================
// LOGOUT
// =========================================================

async function logout() {

    const token =
        localStorage.getItem(
            "auth_token"
        );


    try {

        if (token) {

            await fetch(
                `${API_URL}/api/logout`,
                {
                    method:
                        "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`
                    }
                }
            );

        }

    } catch (error) {

        console.error(
            "Logout error:",
            error
        );

    }


    localStorage.removeItem(
        "auth_token"
    );

    localStorage.removeItem(
        "user_id"
    );

    localStorage.removeItem(
        "call_target"
    );

    localStorage.removeItem(
        "pending_call"
    );

    localStorage.removeItem(
        "room_id"
    );


    location.href =
        "login.html";

}


// =========================================================
// GLOBAL LOGOUT
// =========================================================

window.logout =
    logout;


// =========================================================
// INITIALIZE
// =========================================================

connectSocket();

loadUsers();


// refresh users every 5 seconds
setInterval(
    loadUsers,
    5000
);
