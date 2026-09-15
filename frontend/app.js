const API_URL =
    "https://videocallapp-api.onrender.com";

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

function avatar(name) {

    const letter =
        String(name || "U")
            .trim()
            .charAt(0)
            .toUpperCase() || "U";

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

function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function toast(message) {

    const box = $("toast");

    if (!box) return;

    box.textContent = message;

    box.classList.add("show");

    clearTimeout(
        window.__toastTimer
    );

    window.__toastTimer =
        setTimeout(() => {

            box.classList.remove(
                "show"
            );

        }, 3000);
}


/* =========================
   PAGE
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
            "خطا در ارتباط با سرور"
        );
    }

    return data;
}


/* =========================
   PROFILE
========================= */

function updateProfile() {

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

    $("myName").textContent =
        name;

    $("myId").textContent =
        "شناسه: " + id;

    $("myAvatar").src =
        currentUser.avatar ||
        avatar(name);
}


/* =========================
   LOGIN
========================= */

async function login() {

    const identifier =
        $("loginIdentifier")
            .value
            .trim();

    $("loginMessage")
        .textContent = "";

    if (!identifier) {

        $("loginMessage")
            .textContent =
            "شناسه یا شماره موبایل را وارد کنید.";

        return;
    }

    const button =
        $("loginButton");

    button.disabled = true;

    button.textContent =
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

        if (!userId) {

            throw new Error(
                "شناسه کاربر دریافت نشد."
            );
        }

        localStorage.setItem(
            "videoCallUserId",
            userId
        );

        /*
         * نکته مهم:
         * اول صفحه اصلی را نشان می‌دهیم.
         * هیچ WebSocket یا API دیگری
         * اجازه ندارد جلوی نمایش صفحه را بگیرد.
         */

        showApp();

        updateProfile();

        $("onlineBox")
            .textContent =
            "🟢 ورود موفق؛ در حال اتصال به تماس آنلاین...";

        /*
         * اتصال‌ها بعد از نمایش صفحه
         * انجام می‌شوند.
         */

        connectWebSocket();

        loadUsers();

        toast("ورود موفق بود");

    } catch (error) {

        console.error(
            "Login:",
            error
        );

        $("loginMessage")
            .textContent =
            error.message ||
            "ورود ناموفق بود.";

    } finally {

        button.disabled =
            false;

        button.textContent =
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

    $("registerMessage")
        .textContent = "";

    if (!userId) {

        $("registerMessage")
            .textContent =
            "شناسه را وارد کنید.";

        return;
    }

    if (!phone) {

        $("registerMessage")
            .textContent =
            "شماره موبایل را وارد کنید.";

        return;
    }

    if (!name) {

        $("registerMessage")
            .textContent =
            "نام نمایشی را وارد کنید.";

        return;
    }

    const button =
        $("registerButton");

    button.disabled = true;

    button.textContent =
        "در حال ثبت‌نام...";

    try {

        const data =
            await api(
                "/api/register",
                {
                    method: "POST",

                    body:
                        JSON.stringify({
                            user_id:
                                userId,

                            phone:
                                phone,

                            display_name:
                                name
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

        updateProfile();

        connectWebSocket();

        loadUsers();

        toast(
            "ثبت‌نام موفق بود"
        );

    } catch (error) {

        console.error(
            "Register:",
            error
        );

        $("registerMessage")
            .textContent =
            error.message ||
            "ثبت‌نام ناموفق بود.";

    } finally {

        button.disabled =
            false;

        button.textContent =
            "ثبت‌نام";
    }
}


/* =========================
   USERS
========================= */

async function loadUsers() {

    const list =
        $("usersList");

    if (!list) return;

    list.innerHTML = `
        <div class="empty">
            در حال دریافت کاربران...
        </div>
    `;

    try {

        const data =
            await api(
                "/api/users"
            );

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
                <div class="empty">
                    هنوز کاربر دیگری وجود ندارد.
                </div>
            `;

            return;
        }

        list.innerHTML = "";

        users.forEach(user => {

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

            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "user-card";

            card.innerHTML = `

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
                        شناسه:
                        ${escapeHtml(id)}
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

                    <button class="audio">
                        📞
                    </button>

                    <button class="video">
                        🎥
                    </button>

                </div>
            `;

            card.querySelector(
                ".audio"
            ).onclick =
                () => startCall(
                    id,
                    "audio"
                );

            card.querySelector(
                ".video"
            ).onclick =
                () => startCall(
                    id,
                    "video"
                );

            list.appendChild(
                card
            );
        });

    } catch (error) {

        console.error(
            "Users:",
            error
        );

        list.innerHTML = `
            <div class="empty">
                اتصال برقرار است، اما
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

        $("searchAvatar").src =
            user.avatar ||
            avatar(name);

        $("searchName")
            .textContent =
            name;

        $("searchId")
            .textContent =
            "شناسه: " + id;

        $("searchPhone")
            .textContent =
            user.phone
                ? "موبایل: " +
                  user.phone
                : "";

        $("searchResult")
            .classList
            .remove("hidden");

        $("audioCallButton")
            .onclick =
            () => startCall(
                id,
                "audio"
            );

        $("videoCallButton")
            .onclick =
            () => startCall(
                id,
                "video"
            );

    } catch {

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
        (
            socket.readyState ===
            WebSocket.OPEN ||

            socket.readyState ===
            WebSocket.CONNECTING
        )
    ) {
        return;
    }

    const url =
        "wss://videocallapp-api.onrender.com/ws/" +
        encodeURIComponent(
            userId
        );

    console.log(
        "Connecting WebSocket:",
        url
    );

    try {

        socket =
            new WebSocket(url);

        socket.onopen =
            () => {

                console.log(
                    "WebSocket connected"
                );

                $("myStatus")
                    .textContent =
                    "🟢 آنلاین";

                $("onlineBox")
                    .textContent =
                    "🟢 اتصال آنلاین برقرار شد";
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
                        "WebSocket message:",
                        error
                    );
                }
            };


        socket.onerror =
            error => {

                console.error(
                    "WebSocket error:",
                    error
                );
            };


        socket.onclose =
            () => {

                console.log(
                    "WebSocket disconnected"
                );

                $("myStatus")
                    .textContent =
                    "🟡 اتصال مجدد...";

                /*
                 * صفحه دست نخورده باقی می‌ماند.
                 */

                setTimeout(
                    () => {

                        if (
                            getUserId()
                        ) {
                            connectWebSocket();
                        }

                    },
                    3000
                );
            };

    } catch (error) {

        console.error(
            error
        );
    }
}


function sendSignal(data) {

    if (
        !socket ||
        socket.readyState !==
        WebSocket.OPEN
    ) {

        toast(
            "ارتباط تماس آماده نیست."
        );

        return false;
    }

    socket.send(
        JSON.stringify(data)
    );

    return true;
}


/* =========================
   WEBRTC
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

            if (!peerConnection)
                return;

            const state =
                peerConnection
                    .connectionState;

            if (
                state ===
                "connected"
            ) {

                $("callStatus")
                    .textContent =
                    "🟢 متصل";
            }

            if (
                state ===
                "connecting"
            ) {

                $("callStatus")
                    .textContent =
                    "در حال اتصال...";
            }
        };
}


/* =========================
   START CALL
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

    $("callPanel")
        .classList
        .remove("hidden");

    $("callStatus")
        .textContent =
        "در حال دسترسی به دوربین و میکروفون...";

    try {

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

        const offer =
            await peerConnection
                .createOffer();

        await peerConnection
            .setLocalDescription(
                offer
            );

        sendSignal({

            type:
                "offer",

            to:
                userId,

            from:
                getUserId(),

            call_type:
                type,

            offer:
                offer

        });

        $("callStatus")
            .textContent =
            "در حال تماس...";

    } catch (error) {

        console.error(
            "Call:",
            error
        );

        toast(
            "دسترسی به دوربین یا میکروفون ممکن نشد."
        );

        cleanupCall();
    }
}


/* =========================
   SIGNAL
========================= */

async function handleSignal(
    data
) {

    if (
        data.type ===
        "offer"
    ) {

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

        return;
    }


    if (
        data.type ===
        "answer"
    ) {

        if (!peerConnection)
            return;

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
   INCOMING
========================= */

async function acceptCall() {

    $("incomingCall")
        .classList
        .add("hidden");

    $("callPanel")
        .classList
        .remove("hidden");

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

            type:
                "answer",

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

        console.error(
            error
        );

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

    if (currentCallUser) {

        sendSignal({

            type:
                "call-rejected",

            to:
                currentCallUser,

            from:
                getUserId()

        });
    }

    incomingOffer =
        null;

    currentCallUser =
        null;
}


/* =========================
   CONTROLS
========================= */

function toggleMicrophone() {

    if (!localStream) {

        toast(
            "تماسی برقرار نیست."
        );

        return;
    }

    const tracks =
        localStream
            .getAudioTracks();

    if (!tracks.length) {

        toast(
            "میکروفون فعال نیست."
        );

        return;
    }

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

    if (!localStream) {

        toast(
            "تماسی برقرار نیست."
        );

        return;
    }

    const tracks =
        localStream
            .getVideoTracks();

    if (!tracks.length) {

        toast(
            "دوربین فعال نیست."
        );

        return;
    }

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

            type:
                "hangup",

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

        try {
            peerConnection.close();
        } catch {}

        peerConnection =
            null;
    }

    if (localStream) {

        localStream
            .getTracks()
            .forEach(
                track => {

                    try {
                        track.stop();
                    } catch {}

                }
            );

        localStream =
            null;
    }

    remoteStream =
        null;

    $("localVideo")
        .srcObject =
        null;

    $("remoteVideo")
        .srcObject =
        null;

    $("remotePlaceholder")
        .classList
        .remove("hidden");

    $("callPanel")
        .classList
        .add("hidden");

    currentCallUser =
        null;

    incomingOffer =
        null;
}


/* =========================
   LOGOUT
========================= */

function logout() {

    cleanupCall();

    if (socket) {

        try {
            socket.close();
        } catch {}

        socket =
            null;
    }

    localStorage.removeItem(
        "videoCallUserId"
    );

    currentUser =
        null;

    showLogin();
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

    $("closeCallButton").onclick =
        hangup;

    $("acceptButton").onclick =
        acceptCall;

    $("rejectButton").onclick =
        rejectCall;

    $("logoutButton").onclick =
        logout;

    $("homeButton").onclick =
        () => window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

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

    /*
     * اول صفحه را نشان می‌دهیم.
     * بنابراین هیچ درخواست شبکه‌ای
     * نمی‌تواند صفحه را خالی کند.
     */

    showApp();

    $("onlineBox")
        .textContent =
        "🟡 در حال اتصال به حساب...";

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

        updateProfile();

    } catch (error) {

        console.error(
            "Profile:",
            error
        );

        /*
         * حتی اگر API موقتاً مشکل داشت،
         * صفحه تماس آنلاین باقی می‌ماند.
         */

        $("myName")
            .textContent =
            "کاربر";

        $("myId")
            .textContent =
            "شناسه: " + savedId;
    }

    /*
     * این‌ها مستقل از نمایش صفحه هستند.
     */

    connectWebSocket();

    loadUsers();
}


document.addEventListener(
    "DOMContentLoaded",
    start
);
