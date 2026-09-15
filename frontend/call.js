const API_URL = "https://videocallapp-api.onrender.com";
const WS_URL = "wss://videocallapp-api.onrender.com";

const authToken = localStorage.getItem("auth_token");
const userId = localStorage.getItem("user_id");


// =========================================================
// AUTH
// =========================================================

if (!authToken || !userId) {
    location.href = "login.html";
}


// =========================================================
// STATE
// =========================================================

let socket = null;
let peer = null;
let localStream = null;

let targetUser =
    localStorage.getItem("call_target");

let incomingOffer = null;

let micEnabled = true;
let cameraEnabled = true;

let timerInterval = null;
let callSeconds = 0;


// =========================================================
// ELEMENTS
// =========================================================

const localVideo =
    document.getElementById("localVideo");

const remoteVideo =
    document.getElementById("remoteVideo");

const statusElement =
    document.getElementById("status");

const callTimer =
    document.getElementById("callTimer");

const toggleMicButton =
    document.getElementById("toggleMic");

const toggleCameraButton =
    document.getElementById("toggleCamera");

const fullscreenButton =
    document.getElementById("fullscreen");

const endCallButton =
    document.getElementById("endCall");

const incomingCall =
    document.getElementById("incomingCall");

const incomingUser =
    document.getElementById("incomingUser");

const acceptCallButton =
    document.getElementById("acceptCall");

const rejectCallButton =
    document.getElementById("rejectCall");

const ringtone =
    document.getElementById("ringtone");


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

    const promise = ringtone.play();

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
// WEBSOCKET
// =========================================================

function connectSocket() {

    if (!userId) {
        return;
    }


    socket = new WebSocket(
        `${WS_URL}/ws/user/${encodeURIComponent(userId)}`
    );


    socket.onopen = () => {

        console.log(
            "WebSocket connected"
        );

        setStatus(
            "اتصال به سرور برقرار شد"
        );

    };


    socket.onmessage = async (event) => {

        let data;

        try {

            data = JSON.parse(
                event.data
            );

        } catch (error) {

            console.error(
                "WebSocket JSON error:",
                error
            );

            return;
        }


        console.log(
            "CALL WS:",
            data
        );


        // =================================================
        // INCOMING CALL
        // =================================================

        if (
            data.type ===
            "call_request"
        ) {

            targetUser =
                data.from;

            incomingOffer =
                data.offer;


            if (incomingUser) {

                incomingUser.innerText =
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
        // ANSWER
        // =================================================

        if (
            data.type ===
            "answer"
        ) {

            if (!peer) {
                return;
            }


            try {

                await peer.setRemoteDescription(
                    new RTCSessionDescription(
                        data.answer
                    )
                );


                setStatus(
                    "تماس در حال اتصال..."
                );

            } catch (error) {

                console.error(
                    "Answer error:",
                    error
                );

                setStatus(
                    "دریافت پاسخ تماس ناموفق بود"
                );

            }

            return;
        }


        // =================================================
        // ICE
        // =================================================

        if (
            data.type ===
            "ice"
        ) {

            if (
                !peer ||
                !data.candidate
            ) {
                return;
            }


            try {

                await peer.addIceCandidate(
                    new RTCIceCandidate(
                        data.candidate
                    )
                );

            } catch (error) {

                console.error(
                    "ICE error:",
                    error
                );

            }

            return;
        }


        // =================================================
        // REJECT
        // =================================================

        if (
            data.type ===
            "call_reject"
        ) {

            stopRingtone();

            setStatus(
                "طرف مقابل تماس را رد کرد"
            );

            return;
        }


        // =================================================
        // END
        // =================================================

        if (
            data.type ===
            "call_end"
        ) {

            endCall(false);

            setStatus(
                "طرف مقابل تماس را پایان داد"
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
            "خطا در اتصال به سرور"
        );

    };


    socket.onclose = () => {

        console.log(
            "WebSocket closed"
        );

        setStatus(
            "اتصال به سرور قطع شد"
        );

    };

}


// =========================================================
// SEND SIGNAL
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
// MEDIA
// =========================================================

async function startMedia() {

    if (localStream) {
        localVideo.srcObject =
            localStream;

        return;
    }


    try {

        localStream =
            await navigator.mediaDevices
                .getUserMedia({
                    video: true,
                    audio: true
                });


        localVideo.srcObject =
            localStream;


        localVideo
            .play()
            .catch(() => {});


    } catch (error) {

        console.error(
            "Media error:",
            error
        );

        setStatus(
            "دسترسی دوربین یا میکروفن ناموفق بود"
        );

        throw error;
    }

}


// =========================================================
// CREATE PEER
// =========================================================

function createPeer() {

    if (peer) {
        return peer;
    }


    peer =
        new RTCPeerConnection({

            iceServers: [

                {
                    urls:
                        "stun:stun.l.google.com:19302"
                },

                {
                    urls:
                        "stun:stun1.l.google.com:19302"
                },

                {
                    urls:
                        "stun:stun2.l.google.com:19302"
                }

            ]

        });


    localStream
        .getTracks()
        .forEach(track => {

            peer.addTrack(
                track,
                localStream
            );

        });


    peer.ontrack = (event) => {

        if (
            event.streams &&
            event.streams[0]
        ) {

            remoteVideo.srcObject =
                event.streams[0];

        }


        setStatus(
            "تصویر طرف مقابل دریافت شد"
        );

    };


    peer.onicecandidate =
        (event) => {

            if (
                event.candidate &&
                targetUser
            ) {

                sendSignal({

                    type:
                        "ice",

                    target:
                        targetUser,

                    candidate:
                        event.candidate

                });

            }

        };


    peer.onconnectionstatechange =
        () => {

            if (!peer) {
                return;
            }


            console.log(
                "Connection:",
                peer.connectionState
            );


            if (
                peer.connectionState ===
                "connected"
            ) {

                setStatus(
                    "تماس برقرار شد"
                );

                startTimer();

            }


            if (
                peer.connectionState ===
                "connecting"
            ) {

                setStatus(
                    "در حال برقراری تماس..."
                );

            }


            if (
                peer.connectionState ===
                "disconnected"
            ) {

                setStatus(
                    "اتصال موقتاً قطع شد"
                );

            }


            if (
                peer.connectionState ===
                "failed"
            ) {

                setStatus(
                    "اتصال WebRTC ناموفق بود"
                );

            }

        };


    return peer;
}


// =========================================================
// START OUTGOING CALL
// =========================================================

async function startCall() {

    if (!targetUser) {

        setStatus(
            "کاربر مقصد انتخاب نشده است"
        );

        return;
    }


    try {

        await startMedia();

        createPeer();


        const offer =
            await peer.createOffer({

                offerToReceiveAudio: true,

                offerToReceiveVideo: true

            });


        await peer.setLocalDescription(
            offer
        );


        const sent =
            sendSignal({

                type:
                    "call_request",

                target:
                    targetUser,

                offer:
                    offer

            });


        if (!sent) {

            setStatus(
                "ارسال تماس ناموفق بود"
            );

            return;
        }


        setStatus(
            "در انتظار پاسخ..."
        );


    } catch (error) {

        console.error(
            "Start call error:",
            error
        );

        setStatus(
            "شروع تماس ناموفق بود"
        );

    }

}


// =========================================================
// ACCEPT
// =========================================================

async function acceptIncomingCall() {

    if (
        !targetUser ||
        !incomingOffer
    ) {

        setStatus(
            "اطلاعات تماس کامل نیست"
        );

        return;
    }


    stopRingtone();


    if (incomingCall) {

        incomingCall
            .classList
            .add("hidden");

    }


    try {

        await startMedia();

        createPeer();


        await peer.setRemoteDescription(
            new RTCSessionDescription(
                incomingOffer
            )
        );


        const answer =
            await peer.createAnswer({

                offerToReceiveAudio: true,

                offerToReceiveVideo: true

            });


        await peer.setLocalDescription(
            answer
        );


        sendSignal({

            type:
                "answer",

            target:
                targetUser,

            answer:
                answer

        });


        incomingOffer = null;

        localStorage.removeItem(
            "pending_call"
        );


        setStatus(
            "در حال برقراری تماس..."
        );


    } catch (error) {

        console.error(
            "Accept error:",
            error
        );

        setStatus(
            "قبول تماس ناموفق بود"
        );

    }

}


// =========================================================
// REJECT
// =========================================================

function rejectIncomingCall() {

    if (targetUser) {

        sendSignal({

            type:
                "call_reject",

            target:
                targetUser

        });

    }


    stopRingtone();


    if (incomingCall) {

        incomingCall
            .classList
            .add("hidden");

    }


    incomingOffer = null;


    setStatus(
        "تماس رد شد"
    );

}


// =========================================================
// MIC
// =========================================================

if (toggleMicButton) {

    toggleMicButton.onclick = () => {

        if (!localStream) {
            return;
        }


        micEnabled =
            !micEnabled;


        localStream
            .getAudioTracks()
            .forEach(track => {

                track.enabled =
                    micEnabled;

            });


        toggleMicButton.innerText =
            micEnabled
                ? "🎤"
                : "🔇";

    };

}


// =========================================================
// CAMERA
// =========================================================

if (toggleCameraButton) {

    toggleCameraButton.onclick = () => {

        if (!localStream) {
            return;
        }


        cameraEnabled =
            !cameraEnabled;


        localStream
            .getVideoTracks()
            .forEach(track => {

                track.enabled =
                    cameraEnabled;

            });


        toggleCameraButton.innerText =
            cameraEnabled
                ? "📷"
                : "🚫";

    };

}


// =========================================================
// FULLSCREEN
// =========================================================

if (fullscreenButton) {

    fullscreenButton.onclick =
        async () => {

            const videoArea =
                document.querySelector(
                    ".video-area"
                );


            if (!videoArea) {
                return;
            }


            try {

                if (
                    !document.fullscreenElement
                ) {

                    await videoArea.requestFullscreen();

                } else {

                    await document.exitFullscreen();

                }

            } catch (error) {

                console.error(
                    "Fullscreen error:",
                    error
                );

            }

        };

}


// =========================================================
// TIMER
// =========================================================

function startTimer() {

    if (timerInterval) {
        return;
    }


    timerInterval =
        setInterval(() => {

            callSeconds++;


            const minutes =
                Math.floor(
                    callSeconds / 60
                );


            const seconds =
                callSeconds % 60;


            if (callTimer) {

                callTimer.innerText =
                    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

            }

        }, 1000);

}


function stopTimer() {

    if (timerInterval) {

        clearInterval(
            timerInterval
        );

        timerInterval = null;

    }

}


// =========================================================
// END CALL
// =========================================================

function endCall(sendMessage = true) {

    stopRingtone();

    stopTimer();


    if (
        sendMessage &&
        targetUser
    ) {

        sendSignal({

            type:
                "call_end",

            target:
                targetUser

        });

    }


    if (peer) {

        peer.close();

        peer = null;

    }


    if (localStream) {

        localStream
            .getTracks()
            .forEach(track => {

                track.stop();

            });

        localStream = null;

    }


    if (localVideo) {
        localVideo.srcObject = null;
    }


    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }


    if (callTimer) {
        callTimer.innerText =
            "00:00";
    }


    setStatus(
        "تماس پایان یافت"
    );


    localStorage.removeItem(
        "call_target"
    );

    localStorage.removeItem(
        "pending_call"
    );

}


// =========================================================
// END BUTTON
// =========================================================

if (endCallButton) {

    endCallButton.onclick =
        () => {

            endCall(true);

        };

}


// =========================================================
// ACCEPT BUTTON
// =========================================================

if (acceptCallButton) {

    acceptCallButton.onclick =
        async () => {

            await acceptIncomingCall();

        };

}


// =========================================================
// REJECT BUTTON
// =========================================================

if (rejectCallButton) {

    rejectCallButton.onclick =
        () => {

            rejectIncomingCall();

        };

}


// =========================================================
// PENDING INCOMING CALL
// =========================================================

function restorePendingCall() {

    const raw =
        localStorage.getItem(
            "pending_call"
        );


    if (!raw) {
        return false;
    }


    try {

        const pending =
            JSON.parse(raw);


        if (
            pending &&
            pending.from &&
            pending.offer
        ) {

            targetUser =
                pending.from;

            incomingOffer =
                pending.offer;


            if (incomingUser) {

                incomingUser.innerText =
                    pending.from;

            }


            if (incomingCall) {

                incomingCall
                    .classList
                    .remove("hidden");

            }


            localStorage.removeItem(
                "pending_call"
            );


            setStatus(
                "تماس ورودی"
            );


            return true;
        }

    } catch (error) {

        console.error(
            "Pending call error:",
            error
        );

    }


    return false;
}


// =========================================================
// INITIALIZE
// =========================================================

connectSocket();


const hasPendingCall =
    restorePendingCall();


if (
    targetUser &&
    !hasPendingCall &&
    !incomingOffer
) {

    setTimeout(() => {

        startCall();

    }, 1200);

}
