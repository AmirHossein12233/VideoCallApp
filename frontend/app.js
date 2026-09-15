const API_URL = "https://videocallapp-api.onrender.com";
const WS_URL = "wss://videocallapp-api.onrender.com";

const userId = localStorage.getItem("user_id");

let socket = null;

let incomingCaller = null;
let incomingOffer = null;

let ringtone = null;

const statusElement =
    document.getElementById("status");

const incomingCall =
    document.getElementById("incomingCall");

const callerName =
    document.getElementById("callerName");

const acceptIncoming =
    document.getElementById("acceptIncoming");

const rejectIncoming =
    document.getElementById("rejectIncoming");

const ringtoneElement =
    document.getElementById("ringtone");


/* =========================
   LOGIN
========================= */

if (!userId) {

    location.href = "login.html";

}


/* =========================
   STATUS
========================= */

function setStatus(text) {

    if (statusElement) {
        statusElement.innerText = text;
    }

}


/* =========================
   RINGTONE
========================= */

function startRingtone() {

    if (!ringtoneElement) {
        return;
    }

    ringtone = ringtoneElement;

    ringtone.currentTime = 0;

    const result =
        ringtone.play();

    if (result) {

        result.catch(() => {

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

    ringtone = null;

}


/* =========================
   CONNECT USER SOCKET
========================= */

function connectSocket() {

    if (!userId) {
        return;
    }


    socket =
        new WebSocket(
            `${WS_URL}/ws/user/${encodeURIComponent(userId)}`
        );


    socket.onopen = () => {

        console.log(
            "User socket connected"
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
                "WebSocket JSON error:",
                error
            );

            return;

        }


        console.log(
            "Incoming socket:",
            data
        );


        /* =========================
           INCOMING CALL
        ========================= */

        if (data.type === "call_request") {

            incomingCaller =
                data.from;

            incomingOffer =
                data.offer;


            callerName.innerText =
                data.from;


            incomingCall
                .classList
                .remove("hidden");


            setStatus(
                "تماس ورودی"
            );


            startRingtone();

        }


        /* =========================
           CALL REJECTED
        ========================= */

        if (data.type === "call_reject") {

            setStatus(
                "تماس رد شد"
            );

            stopRingtone();

        }


        /* =========================
           CALL ENDED
        ========================= */

        if (data.type === "call_end") {

            setStatus(
                "تماس پایان یافت"
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
            "WebSocket disconnected"
        );

    };

}


/* =========================
   SEND SIGNAL
========================= */

function sendSignal(data) {

    if (
        socket &&
        socket.readyState === WebSocket.OPEN
    ) {

        socket.send(
            JSON.stringify(data)
        );

    }

}


/* =========================
   ACCEPT INCOMING CALL
========================= */

if (acceptIncoming) {

    acceptIncoming.onclick = () => {

        if (
            !incomingCaller ||
            !incomingOffer
        ) {
            return;
        }


        stopRingtone();


        const pendingCall = {

            from:
                incomingCaller,

            offer:
                incomingOffer

        };


        localStorage.setItem(
            "pending_call",
            JSON.stringify(pendingCall)
        );


        localStorage.setItem(
            "call_target",
            incomingCaller
        );


        incomingCall
            .classList
            .add("hidden");


        setStatus(
            "در حال ورود به تماس..."
        );


        /*
         * اتصال WebSocket فعلی را نمی‌بندیم
         * چون call.html یک اتصال جدید می‌سازد.
         */


        location.href =
            "call.html";

    };

}


/* =========================
   REJECT INCOMING CALL
========================= */

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


        incomingCall
            .classList
            .add("hidden");


        setStatus(
            "تماس رد شد"
        );

    };

}


/* =========================
   CREATE ROOM
========================= */

const createRoomButton =
    document.getElementById("createRoom");


if (createRoomButton) {

    createRoomButton.onclick =
        async () => {

            try {

                const response =
                    await fetch(
                        `${API_URL}/api/create-room`,
                        {
                            method: "POST"
                        }
                    );


                const data =
                    await response.json();


                if (!data.success) {

                    throw new Error(
                        "ساخت اتاق ناموفق بود"
                    );

                }


                const roomInput =
                    document.getElementById(
                        "roomId"
                    );


                if (roomInput) {

                    roomInput.value =
                        data.room_id;

                }


                setStatus(
                    `اتاق ${data.room_id} ساخته شد`
                );

            } catch (error) {

                console.error(
                    "Create room error:",
                    error
                );

                setStatus(
                    "ساخت اتاق ناموفق بود"
                );

            }

        };

}


/* =========================
   JOIN ROOM
========================= */

const joinRoomButton =
    document.getElementById("joinRoom");


if (joinRoomButton) {

    joinRoomButton.onclick =
        () => {

            const roomInput =
                document.getElementById(
                    "roomId"
                );


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


            location.href =
                "call.html";

        };

}


/* =========================
   CLEANUP
========================= */

window.addEventListener(
    "beforeunload",
    () => {

        stopRingtone();

    }
);


/* =========================
   START
========================= */

connectSocket();
