const WS_URL = "ws://127.0.0.1:8000";

const userId = localStorage.getItem("user_id");

let targetUser = localStorage.getItem("call_target");

let socket = null;
let peer = null;
let localStream = null;

let incomingOffer = null;
let pendingIncomingCall = false;

let micEnabled = true;
let cameraEnabled = true;

let timerInterval = null;
let callSeconds = 0;


// =========================
// ELEMENTS
// =========================

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


// =========================
// LOGIN CHECK
// =========================

if (!userId) {
    location.href = "login.html";
}


// =========================
// STATUS
// =========================

function setStatus(text) {

    if (statusElement) {
        statusElement.innerText = text;
    }

}


// =========================
// RINGTONE
// =========================

function startRingtone() {

    if (!ringtone) {
        return;
    }

    ringtone.currentTime = 0;

    const promise = ringtone.play();

    if (promise) {

        promise.catch(() => {

            console.log(
                "مرورگر پخش خودکار زنگ را مسدود کرد."
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


// =========================
// INCOMING CALL UI
// =========================

function showIncomingCall(from, offer) {

    targetUser = from;

    incomingOffer = offer;

    pendingIncomingCall = true;


    if (incomingUser) {
        incomingUser.innerText = from;
    }


    if (incomingCall) {
        incomingCall.classList.remove("hidden");
    }


    setStatus("تماس ورودی");

    startRingtone();
}


function hideIncomingCall() {

    if (incomingCall) {
        incomingCall.classList.add("hidden");
    }

    stopRingtone();
}


// =========================
// WEBSOCKET
// =========================

function connectSocket() {

    if (!userId) {
        return;
    }


    socket = new WebSocket(
        `${WS_URL}/ws/user/${encodeURIComponent(userId)}`
    );


    socket.onopen = () => {

        console.log(
            "Call WebSocket connected"
        );

        setStatus("اتصال به سرور برقرار شد");


        /*
         * اگر تماس ورودی از index.html آمده
         * و اطلاعات offer در localStorage ذخیره شده،
         * UI تماس ورودی را نشان می‌دهیم.
         */
        restorePendingIncomingCall();
    };


    socket.onmessage = async (event) => {

        let data;

        try {

            data = JSON.parse(event.data);

        } catch (error) {

            console.error(
                "WebSocket JSON error:",
                error
            );

            return;
        }


        console.log(
            "CALL SOCKET:",
            data
        );


        // =========================
        // INCOMING CALL
        // =========================

        if (data.type === "call_request") {

            showIncomingCall(
                data.from,
                data.offer
            );

            return;
        }


        // =========================
        // ANSWER
        // =========================

        if (data.type === "answer") {

            if (!peer) {
                return;
            }


            try {

                await peer.setRemoteDescription(
                    new RTCSessionDescription(
                        data.answer
                    )
                );


                setStatus("در حال اتصال...");

                startTimer();

            } catch (error) {

                console.error(
                    "Set answer error:",
                    error
                );

                setStatus(
                    "دریافت پاسخ تماس ناموفق بود"
                );

            }

            return;
        }


        // =========================
        // ICE CANDIDATE
        // =========================

        if (data.type === "ice") {

            if (!peer || !data.candidate) {
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
                    "ICE candidate error:",
                    error
                );

            }

            return;
        }


        // =========================
        // CALL REJECTED
        // =========================

        if (data.type === "call_reject") {

            hideIncomingCall();

            setStatus(
                "تماس توسط طرف مقابل رد شد"
            );

            return;
        }


        // =========================
        // CALL ENDED
        // =========================

        if (data.type === "call_end") {

            endCall(false);

            setStatus(
                "طرف مقابل تماس را پایان داد"
            );

            return;
        }


        // =========================
        // USER OFFLINE
        // =========================

        if (data.type === "error") {

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

    };

}


// =========================
// RESTORE PENDING CALL
// =========================

function restorePendingIncomingCall() {

    const raw =
        localStorage.getItem("pending_call");


    if (!raw) {
        return;
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

            pendingIncomingCall = true;


            if (incomingUser) {
                incomingUser.innerText =
                    pending.from;
            }


            if (incomingCall) {
                incomingCall.classList.remove(
                    "hidden"
                );
            }


            setStatus(
                "تماس ورودی"
            );

        }


    } catch (error) {

        console.error(
            "Pending call parse error:",
            error
        );

    }


    localStorage.removeItem(
        "pending_call"
    );

}


// =========================
// SEND SIGNAL
// =========================

function sendSignal(data) {

    if (
        socket &&
        socket.readyState === WebSocket.OPEN
    ) {

        socket.send(
            JSON.stringify(data)
        );

        return true;
    }


    console.warn(
        "WebSocket is not connected"
    );

    return false;
}


// =========================
// MEDIA
// =========================

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
            "getUserMedia error:",
            error
        );


        if (
            error.name ===
            "NotAllowedError"
        ) {

            setStatus(
                "دسترسی دوربین و میکروفن رد شد"
            );

        } else if (
            error.name ===
            "NotFoundError"
        ) {

            setStatus(
                "دوربین یا میکروفن پیدا نشد"
            );

        } else {

            setStatus(
                "دسترسی دوربین و میکروفن ناموفق بود"
            );

        }


        throw error;
    }

}


// =========================
// CREATE PEER
// =========================

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


    if (localStream) {

        localStream
            .getTracks()
            .forEach(track => {

                peer.addTrack(
                    track,
                    localStream
                );

            });

    }


    peer.ontrack =
        (event) => {

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

                    type: "ice",

                    target: targetUser,

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
                "connecting"
            ) {

                setStatus(
                    "در حال برقراری تماس..."
                );

            }


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


    peer.oniceconnectionstatechange =
        () => {

            if (!peer) {
                return;
            }


            console.log(
                "ICE:",
                peer.iceConnectionState
            );

        };


    return peer;
}


// =========================
// START OUTGOING CALL
// =========================

async function startCall() {

    if (!targetUser) {

        setStatus(
            "کاربر مقصد انتخاب نشده است"
        );

        return;
    }


    /*
     * اگر offer ورودی داریم،
     * این تماس خروجی نیست.
     */
    if (incomingOffer) {
        return;
    }


    try {

        hideIncomingCall();

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
                "ارسال درخواست تماس ممکن نشد"
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


// =========================
// ACCEPT INCOMING CALL
// =========================

async function acceptIncomingCall() {

    if (
        !incomingOffer ||
        !targetUser
    ) {

        setStatus(
            "اطلاعات تماس ناقص است"
        );

        return;
    }


    hideIncomingCall();

    pendingIncomingCall = false;


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


        const sent =
            sendSignal({

                type:
                    "answer",

                target:
                    targetUser,

                answer:
                    answer

            });


        if (!sent) {

            setStatus(
                "ارسال پاسخ تماس ناموفق بود"
            );

            return;
        }


        incomingOffer = null;

        localStorage.removeItem(
            "pending_call"
        );


        setStatus(
            "در حال برقراری تماس..."
        );


    } catch (error) {

        console.error(
            "Accept call error:",
            error
        );

        setStatus(
            "قبول تماس ناموفق بود"
        );

    }

}


// =========================
// REJECT INCOMING CALL
// =========================

function rejectIncomingCall() {

    if (targetUser) {

        sendSignal({

            type:
                "call_reject",

            target:
                targetUser

        });

    }


    hideIncomingCall();


    incomingOffer = null;

    pendingIncomingCall = false;


    localStorage.removeItem(
        "pending_call"
    );


    setStatus(
        "تماس رد شد"
    );

}


// =========================
// MICROPHONE
// =========================

if (toggleMicButton) {

    toggleMicButton.onclick =
        () => {

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


// =========================
// CAMERA
// =========================

if (toggleCameraButton) {

    toggleCameraButton.onclick =
        () => {

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


// =========================
// FULLSCREEN
// =========================

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


// =========================
// TIMER
// =========================

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


    callSeconds = 0;


    if (callTimer) {
        callTimer.innerText =
            "00:00";
    }

}


// =========================
// END CALL
// =========================

function endCall(sendMessage = true) {

    stopRingtone();

    hideIncomingCall();

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

        peer.ontrack = null;

        peer.onicecandidate = null;

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


    incomingOffer = null;

    pendingIncomingCall = false;


    localStorage.removeItem(
        "call_target"
    );

    localStorage.removeItem(
        "pending_call"
    );


    setStatus(
        "تماس پایان یافت"
    );

}


// =========================
// END BUTTON
// =========================

if (endCallButton) {

    endCallButton.onclick =
        () => {

            endCall(true);

        };

}


// =========================
// ACCEPT BUTTON
// =========================

if (acceptCallButton) {

    acceptCallButton.onclick =
        async () => {

            await acceptIncomingCall();

        };

}


// =========================
// REJECT BUTTON
// =========================

if (rejectCallButton) {

    rejectCallButton.onclick =
        () => {

            rejectIncomingCall();

        };

}


// =========================
// BACK BUTTON
// =========================

window.addEventListener(
    "beforeunload",
    () => {

        stopRingtone();
        stopTimer();


        if (localStream) {

            localStream
                .getTracks()
                .forEach(track => {

                    track.stop();

                });

        }

    }
);


// =========================
// INITIALIZE
// =========================

connectSocket();


// =========================
// OUTGOING / INCOMING START
// =========================

setTimeout(() => {

    /*
     * اگر تماس ورودی از index.html آمده،
     * نباید startCall اجرا شود.
     */

    if (incomingOffer) {
        return;
    }


    if (targetUser) {

        startCall();

    }

}, 1000);
