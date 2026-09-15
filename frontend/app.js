const API_URL = "https://videocallapp-api.onrender.com";

let currentUser = null;
let socket = null;

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let currentCallUser = null;
let currentCallType = "video";
let incomingOffer = null;


/* =========================
   HELPERS
========================= */

function $(id) {
    return document.getElementById(id);
}

function getUserId() {
    return localStorage.getItem(
        "videoCallUserId"
    );
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function avatar(name) {

    const letter =
        String(name || "U")
            .trim()
            .charAt(0)
            .toUpperCase();

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg"
             width="100"
             height="100">

            <rect
                width="100"
                height="100"
                rx="50"
                fill="#7c3aed"
            />

            <text
                x="50"
                y="62"
                text-anchor="middle"
                font-size="42"
                font-family="Arial"
                fill="white"
            >
                ${letter}
            </text>

        </svg>
    `;

    return (
        "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(svg)
    );
}

function toast(message) {

    const element = $("toast");

    if (!element) return;

    element.textContent = message;

    element.classList.add("show");

    clearTimeout(
        window.toastTimer
    );

    window.toastTimer =
        setTimeout(() => {

            element.classList.remove(
                "show"
            );

        }, 3000);
}


/* =========================
   API
========================= */

async function api(
    path,
    options = {}
) {

    const response =
        await fetch(
            API_URL + path,
            {
                ...options,

                headers: {
                    "Content-Type":
                        "application/json",

                    ...(options.headers || {})
                }
            }
        );

    let data = null;

    try {
        data =
            await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {

        throw new Error(
            data?.detail ||
            data?.message ||
            "خطا در ارتباط با سرور"
        );
    }

    return data;
}


/* =========================
   PAGES
========================= */

function showLogin() {

    $("loginPage")
        .classList
        .remove("hidden");

    $("registerPage")
        .classList
        .add("hidden");

    $("appPage")
        .classList
        .add("hidden");
}

function showRegister() {

    $("loginPage")
        .classList
        .add("hidden");

    $("registerPage")
        .classList
        .remove("hidden");

    $("appPage")
        .classList
        .add("hidden");
}

function showApp() {

    $("loginPage")
        .classList
        .add("hidden");

    $("registerPage")
        .classList
        .add("hidden");

    $("appPage")
        .classList
        .remove("hidden");
}


/* =========================
   LOGIN
========================= */

async function login() {

    const identifier =
        $("loginIdentifier")
            .value
            .trim();

    const message =
        $("loginMessage");

    message.textContent = "";

    if (!identifier) {

        message.textContent =
            "شناسه یا شماره موبایل را وارد کنید.";

        return;
    }

    $("loginButton").disabled = true;

    $("loginButton").textContent =
        "در حال ورود...";

    try {

        const data =
            await api(
                "/api/users/" +
                encodeURIComponent(
                    identifier
                )
            );

        currentUser =
            data.user ||
            data;

        const userId =
            currentUser.user_id ||
            currentUser.id;

        localStorage.setItem(
            "videoCallUserId",
            userId
        );

        /*
         * مهم:
         * قبل از دریافت کاربران
         * صفحه اصلی را نمایش می‌دهیم.
         */

        showApp();

        updateMyProfile();

        await loadUsers();

        connectWebSocket();

        toast("ورود موفق بود");

    } catch (error) {

        console.error(error);

        message.textContent =
            error.message ||
            "ورود ناموفق بود.";

    } finally {

        $("loginButton").disabled =
            false;

        $("loginButton").textContent =
            "ورود";
    }
}


/* =========================
   REGISTER
========================= */

async function register() {

    const userId =
        $("registerUserId")
            .value
            .trim();

    const phone =
        $("registerPhone")
            .value
            .trim();

    const name =
        $("registerName")
            .value
            .trim();

    const message =
        $("registerMessage");

    message.textContent = "";

    if (!userId) {

        message.textContent =
            "شناسه را وارد کنید.";

        return;
    }

    if (!phone) {

        message.textContent =
            "شماره موبایل را وارد کنید.";

        return;
    }

    if (!name) {

        message.textContent =
            "نام نمایشی را وارد کنید.";

        return;
    }

    $("registerButton").disabled =
        true;

    $("registerButton").textContent =
        "در حال ثبت‌نام...";

    try {

        const data =
            await api(
                "/api/register",
                {
                    method: "POST",

                    body: JSON.stringify({
                        user_id: userId,
                        phone: phone,
                        display_name: name
                    })
                }
            );

        currentUser =
            data.user ||
            data;

        const savedId =
            currentUser.user_id ||
            currentUser.id ||
            userId;

        localStorage.setItem(
            "videoCallUserId",
            savedId
        );

        showApp();

        updateMyProfile();

        await loadUsers();

        connectWebSocket();

        toast(
            "ثبت‌نام با موفقیت انجام شد"
        );

    } catch (error) {

        console.error(error);

        message.textContent =
            error.message ||
            "ثبت‌نام ناموفق بود.";

    } finally {

        $("registerButton").disabled =
            false;

        $("registerButton").textContent =
            "ثبت‌نام";
    }
}


/* =========================
   PROFILE
========================= */

function updateMyProfile() {

    if (!currentUser) return;

    const name =
        currentUser.display_name ||
        currentUser.name ||
        currentUser.user_id ||
        "کاربر";

    const id =
        currentUser.user_id ||
        currentUser.id ||
        "";

    const image =
        currentUser.avatar ||
        avatar(name);

    $("myName").textContent =
        name;

    $("myId").textContent =
        "شناسه: " + id;

    $("myAvatar").src =
        image;
}


/* =========================
   USERS
========================= */

async function loadUsers() {

    const list =
        $("usersList");

    list.innerHTML = `
        <div class="loading">
            در حال دریافت کاربران...
        </div>
    `;

    try {

        const data =
            await api("/api/users");

        let users =
            Array.isArray(data)
                ? data
                : (
                    data.users ||
                    data.items ||
                    []
                );

        const myId =
            getUserId();

        users =
            users.filter(user => {

                const id =
                    user.user_id ||
                    user.id;

                return String(id) !==
                    String(myId);
            });

        if (!users.length) {

            list.innerHTML = `
                <div class="loading">
                    هنوز کاربر دیگری ثبت‌نام نکرده است.
                </div>
            `;

            return;
        }

        list.innerHTML = "";

        users.forEach(
            user => {

                const id =
                    user.user_id ||
                    user.id ||
                    "";

                const name =
                    user.display_name ||
                    user.name ||
                    id;

                const phone =
                    user.phone ||
                    "";

                const image =
                    user.avatar ||
                    avatar(name);

                const item =
                    document.createElement(
                        "div"
                    );

                item.className =
                    "user-card";

                item.innerHTML = `
                    <img
                        class="user-avatar"
                        src="${image}"
                        alt=""
                    >

                    <div class="user-info">

                        <div class="user-name">
                            ${escapeHtml(name)}
                        </div>

                        <div class="user-id">
                            شناسه: ${escapeHtml(id)}
                        </div>

                        ${
                            phone
                                ? `
                                <div class="user-phone">
                                    ${escapeHtml(phone)}
                                </div>
                                `
                                : ""
                        }

                        <div class="user-status">
                            🟢 آماده تماس
                        </div>

                    </div>

                    <div class="user-actions">

                        <button
                            class="audio-button"
                        >
                            📞
                        </button>

                        <button
                            class="video-button"
                        >
                            🎥
                        </button>

                    </div>
                `;

                item
                    .querySelector(
                        ".audio-button"
                    )
                    .onclick =
                    () => startCall(
                        id,
                        "audio"
                    );

                item
                    .querySelector(
                        ".video-button"
                    )
                    .onclick =
                    () => startCall(
                        id,
                        "video"
                    );

                list.appendChild(
                    item
                );
            }
        );

    } catch (error) {

        console.error(error);

        list.innerHTML = `
            <div class="loading">
                دریافت کاربران ناموفق بود.
            </div>
        `;
    }
}


/* =========================
   SEARCH
========================= */

async function searchUser() {

    const identifier =
        $("searchInput")
            .value
            .trim();

    if (!identifier) {

        toast(
            "شناسه یا شماره موبایل را وارد کنید."
        );

        return;
    }

    try {

        const data =
            await api(
                "/api/users/" +
                encodeURIComponent(
                    identifier
                )
            );

        const user =
            data.user ||
            data;

        const id =
            user.user_id ||
            user.id ||
            "";

        const name =
            user.display_name ||
            user.name ||
            id;

        const phone =
            user.phone ||
            "";

        $("searchAvatar").src =
            user.avatar ||
            avatar(name);

        $("searchName").textContent =
            name;

        $("searchId").textContent =
            "شناسه: " + id;

        $("searchPhone").textContent =
            phone
                ? "موبایل: " + phone
                : "";

        $("searchResult")
            .classList
            .remove("hidden");

        $("audioCallButton").onclick =
            () => startCall(
                id,
                "audio"
            );

        $("videoCallButton").onclick =
            () => startCall(
                id,
                "video"
            );

    } catch (error) {

        $("searchResult")
            .classList
            .add("hidden");

        toast(
            "کاربر پیدا نشد."
        );
    }
}


/* =========================
   WEBSOCKET
========================= */

function connectWebSocket() {

    const userId =
        getUserId();

    if (!userId) return;

    if (
        socket &&
        socket.readyState ===
        WebSocket.OPEN
    ) {
        return;
    }

    const ws =
        "wss://videocallapp-api.onrender.com/ws/" +
        encodeURIComponent(
            userId
        );

    try {

        socket =
            new WebSocket(ws);

        socket.onopen = () => {

            $("myStatus").textContent =
                "🟢 آنلاین";
        };

        socket.onmessage =
            async event => {

                try {

                    const data =
                        JSON.parse(
                            event.data
                        );

                    await handleSignal(
                        data
                    );

                } catch (error) {

                    console.error(
                        error
                    );
                }
            };

        socket.onclose = () => {

            $("myStatus").textContent =
                "⚪ آفلاین";

            setTimeout(
                () => {

                    if (getUserId()) {
                        connectWebSocket();
                    }

                },
                3000
            );
        };

        socket.onerror =
            error => {

                console.error(
                    "WebSocket:",
                    error
                );
            };

    } catch (error) {

        console.error(error);
    }
}

function sendSignal(data) {

    if (
        !socket ||
        socket.readyState !==
        WebSocket.OPEN
    ) {

        toast(
            "ارتباط تماس با سرور برقرار نیست."
        );

        return false;
    }

    socket.send(
        JSON.stringify(data)
    );

    return true;
}


/* =========================
   CALL
========================= */

async function startCall(
    userId,
    type
) {

    if (
        String(userId) ===
        String(getUserId())
    ) {

        toast(
            "نمی‌توانید با خودتان تماس بگیرید."
        );

        return;
    }

    currentCallUser =
        userId;

    currentCallType =
        type;

    try {

        $("callPanel")
            .classList
            .remove("hidden");

        $("callStatus").textContent =
            "در حال دسترسی به دوربین و میکروفون...";

        const constraints =
            type === "audio"
                ? {
                    audio: true,
                    video: false
                }
                : {
                    audio: true,
                    video: true
                };

        localStream =
            await navigator
                .mediaDevices
                .getUserMedia(
                    constraints
                );

        $("localVideo").srcObject =
            localStream;

        createPeerConnection();

        localStream
            .getTracks()
            .forEach(track => {

                peerConnection.addTrack(
                    track,
                    localStream
                );
            });

        const offer =
            await peerConnection
                .createOffer();

        await peerConnection
            .setLocalDescription(
                offer
            );

        sendSignal({
            type: "offer",

            to: userId,

            from: getUserId(),

            call_type: type,

            offer: offer
        });

        $("callStatus").textContent =
            "در حال تماس...";

    } catch (error) {

        console.error(error);

        toast(
            "دسترسی به دوربین یا میکروفون ممکن نشد."
        );

        cleanupCall();
    }
}


/* =========================
   PEER
========================= */

function createPeerConnection() {

    peerConnection =
        new RTCPeerConnection({
            iceServers: [
                {
                    urls:
                        "stun:stun.l.google.com:19302"
                },
                {
                    urls:
                        "stun:stun1.l.google.com:19302"
                }
            ]
        });

    peerConnection.onicecandidate =
        event => {

            if (
                event.candidate &&
                currentCallUser
            ) {

                sendSignal({
                    type:
                        "ice-candidate",

                    to:
                        currentCallUser,

                    from:
                        getUserId(),

                    candidate:
                        event.candidate
                });
            }
        };

    peerConnection.ontrack =
        event => {

            if (!remoteStream) {
                remoteStream =
                    new MediaStream();
            }

            event.streams[0]
                .getTracks()
                .forEach(track => {

                    remoteStream.addTrack(
                        track
                    );
                });

            $("remoteVideo")
                .srcObject =
                remoteStream;

            $("remotePlaceholder")
                .classList
                .add("hidden");
        };

    peerConnection.onconnectionstatechange =
        () => {

            const state =
                peerConnection
                    .connectionState;

            if (state === "connected") {

                $("callStatus")
                    .textContent =
                    "🟢 متصل";
            }

            if (state === "connecting") {

                $("callStatus")
                    .textContent =
                    "در حال اتصال...";
            }

            if (
                state === "disconnected" ||
                state === "failed"
            ) {

                $("callStatus")
                    .textContent =
                    "اتصال قطع شد";
            }
        };
}


/* =========================
   SIGNALS
========================= */

async function handleSignal(data) {

    if (data.type === "offer") {

        await receiveOffer(
            data
        );

        return;
    }

    if (data.type === "answer") {

        if (!peerConnection) {
            return;
        }

        await peerConnection
            .setRemoteDescription(
                new RTCSessionDescription(
                    data.answer
                )
            );

        return;
    }

    if (
        data.type ===
        "ice-candidate"
    ) {

        if (
            peerConnection &&
            data.candidate
        ) {

            try {

                await peerConnection
                    .addIceCandidate(
                        new RTCIceCandidate(
                            data.candidate
                        )
                    );

            } catch (error) {

                console.error(
                    error
                );
            }
        }

        return;
    }

    if (
        data.type ===
        "call-rejected"
    ) {

        toast(
            "تماس رد شد."
        );

        cleanupCall();

        return;
    }

    if (
        data.type ===
        "hangup"
    ) {

        toast(
            "تماس پایان یافت."
        );

        cleanupCall();
    }
}


/* =========================
   INCOMING CALL
========================= */

async function receiveOffer(data) {

    incomingOffer =
        data.offer;

    currentCallUser =
        data.from;

    currentCallType =
        data.call_type ||
        "video";

    $("incomingName")
        .textContent =
        "کاربر " +
        currentCallUser +
        " با شما تماس گرفته است.";

    $("incomingCall")
        .classList
        .remove("hidden");
}

async function acceptCall() {

    $("incomingCall")
        .classList
        .add("hidden");

    try {

        const constraints =
            currentCallType === "audio"
                ? {
                    audio: true,
                    video: false
                }
                : {
                    audio: true,
                    video: true
                };

        localStream =
            await navigator
                .mediaDevices
                .getUserMedia(
                    constraints
                );

        $("callPanel")
            .classList
            .remove("hidden");

        $("localVideo")
            .srcObject =
            localStream;

        createPeerConnection();

        localStream
            .getTracks()
            .forEach(track => {

                peerConnection.addTrack(
                    track,
                    localStream
                );
            });

        await peerConnection
            .setRemoteDescription(
                new RTCSessionDescription(
                    incomingOffer
                )
            );

        const answer =
            await peerConnection
                .createAnswer();

        await peerConnection
            .setLocalDescription(
                answer
            );

        sendSignal({
            type: "answer",

            to:
                currentCallUser,

            from:
                getUserId(),

            answer:
                answer
        });

        $("callStatus")
            .textContent =
            "در حال اتصال...";

    } catch (error) {

        console.error(error);

        toast(
            "پاسخ به تماس ناموفق بود."
        );

        cleanupCall();
    }
}

function rejectCall() {

    $("incomingCall")
        .classList
        .add("hidden");

    sendSignal({
        type:
            "call-rejected",

        to:
            currentCallUser,

        from:
            getUserId()
    });

    incomingOffer = null;
    currentCallUser = null;
}


/* =========================
   CONTROLS
========================= */

function toggleMicrophone() {

    if (!localStream) return;

    const tracks =
        localStream
            .getAudioTracks();

    if (!tracks.length) return;

    tracks.forEach(
        track => {
            track.enabled =
                !track.enabled;
        }
    );

    toast(
        tracks[0].enabled
            ? "میکروفون روشن شد"
            : "میکروفون خاموش شد"
    );
}

function toggleCamera() {

    if (!localStream) return;

    const tracks =
        localStream
            .getVideoTracks();

    if (!tracks.length) return;

    tracks.forEach(
        track => {
            track.enabled =
                !track.enabled;
        }
    );

    toast(
        tracks[0].enabled
            ? "دوربین روشن شد"
            : "دوربین خاموش شد"
    );
}

function hangup() {

    if (currentCallUser) {

        sendSignal({
            type: "hangup",

            to:
                currentCallUser,

            from:
                getUserId()
        });
    }

    cleanupCall();

    toast(
        "تماس پایان یافت."
    );
}

function cleanupCall() {

    if (peerConnection) {

        peerConnection.close();

        peerConnection = null;
    }

    if (localStream) {

        localStream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );

        localStream = null;
    }

    remoteStream = null;

    $("localVideo").srcObject =
        null;

    $("remoteVideo").srcObject =
        null;

    $("remotePlaceholder")
        .classList
        .remove("hidden");

    $("callPanel")
        .classList
        .add("hidden");

    currentCallUser = null;
    incomingOffer = null;
}


/* =========================
   LOGOUT
========================= */

function logout() {

    if (socket) {

        try {
            socket.close();
        } catch {}

        socket = null;
    }

    cleanupCall();

    localStorage.removeItem(
        "videoCallUserId"
    );

    currentUser = null;

    showLogin();

    toast(
        "از حساب خارج شدید."
    );
}


/* =========================
   EVENTS
========================= */

function setupEvents() {

    $("loginButton").onclick =
        login;

    $("registerButton").onclick =
        register;

    $("showRegisterButton").onclick =
        showRegister;

    $("showLoginButton").onclick =
        showLogin;

    $("searchButton").onclick =
        searchUser;

    $("refreshButton").onclick =
        loadUsers;

    $("microphoneButton").onclick =
        toggleMicrophone;

    $("cameraButton").onclick =
        toggleCamera;

    $("hangupButton").onclick =
        hangup;

    $("acceptButton").onclick =
        acceptCall;

    $("rejectButton").onclick =
        rejectCall;

    $("logoutButton").onclick =
        logout;

    $("contactsButton").onclick =
        () => {
            location.href =
                "contacts.html";
        };

    $("profileButton").onclick =
        () => {
            location.href =
                "profile.html";
        };

    $("settingsButton").onclick =
        () => {
            location.href =
                "settings.html";
        };
}


/* =========================
   START
========================= */

async function start() {

    setupEvents();

    const savedId =
        getUserId();

    if (!savedId) {

        showLogin();

        return;
    }

    try {

        const data =
            await api(
                "/api/users/" +
                encodeURIComponent(
                    savedId
                )
            );

        currentUser =
            data.user ||
            data;

        showApp();

        updateMyProfile();

        await loadUsers();

        connectWebSocket();

    } catch (error) {

        console.error(error);

        localStorage.removeItem(
            "videoCallUserId"
        );

        showLogin();
    }
}

document.addEventListener(
    "DOMContentLoaded",
    start
);