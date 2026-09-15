const API_URL = "https://videocallapp-api.onrender.com";

let currentUser = null;
let socket = null;

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let currentCallUser = null;
let currentCallType = "video";
let incomingOffer = null;

let pendingIceCandidates = [];
let reconnectTimer = null;


// =========================
// ابزارها
// =========================

function $(id) {
    return document.getElementById(id);
}

function getUserId() {
    return localStorage.getItem("videoCallUserId");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function makeAvatar(name) {
    const letter =
        String(name || "U")
            .trim()
            .charAt(0)
            .toUpperCase() || "U";

    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
        '<circle cx="50" cy="50" r="50" fill="#111"/>' +
        '<text x="50" y="64" text-anchor="middle" ' +
        'font-size="44" font-family="Arial" fill="white">' +
        escapeHtml(letter) +
        "</text></svg>";

    return (
        "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(svg)
    );
}

function toast(message) {
    const box = $("toast");

    if (!box) {
        console.log(message);
        return;
    }

    box.textContent = message;
    box.classList.add("show");

    setTimeout(function () {
        box.classList.remove("show");
    }, 3000);
}


// =========================
// صفحه‌ها
// =========================

function showLogin() {
    $("loginPage")?.classList.remove("hidden");
    $("registerPage")?.classList.add("hidden");
    $("appPage")?.classList.add("hidden");
}

function showRegister() {
    $("loginPage")?.classList.add("hidden");
    $("registerPage")?.classList.remove("hidden");
    $("appPage")?.classList.add("hidden");
}

function showApp() {
    $("loginPage")?.classList.add("hidden");
    $("registerPage")?.classList.add("hidden");
    $("appPage")?.classList.remove("hidden");
}


// =========================
// API
// =========================

async function api(path, options) {
    const config = options || {};

    const headers = {
        "Content-Type": "application/json",
        ...(config.headers || {})
    };

    const response = await fetch(
        API_URL + path,
        {
            ...config,
            headers: headers
        }
    );

    let data = {};

    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data.detail ||
            data.message ||
            "خطا در ارتباط با سرور"
        );
    }

    return data;
}


// =========================
// اطلاعات کاربر
// =========================

function updateProfile() {
    if (!currentUser) {
        return;
    }

    const name =
        currentUser.display_name ||
        currentUser.user_id ||
        "کاربر";

    if ($("myName")) {
        $("myName").textContent = name;
    }

    if ($("myId")) {
        $("myId").textContent =
            "شناسه: " +
            (currentUser.user_id || "-");
    }

    if ($("myAvatar")) {
        $("myAvatar").src =
            currentUser.avatar ||
            makeAvatar(name);
    }

    if ($("myStatus")) {
        $("myStatus").textContent =
            "🟡 در حال اتصال...";
    }
}

async function loadCurrentUser() {
    const id = getUserId();

    if (!id) {
        return false;
    }

    try {
        const data = await api(
            "/api/users/" +
            encodeURIComponent(id)
        );

        currentUser =
            data.user || data;

        updateProfile();

        return true;
    } catch (error) {
        console.error(
            "Load user error:",
            error
        );

        localStorage.removeItem(
            "videoCallUserId"
        );

        currentUser = null;

        return false;
    }
}


// =========================
// ثبت نام
// =========================

async function register() {
    const userId =
        $("registerUserId")?.value.trim() || "";

    const phone =
        $("registerPhone")?.value.trim() || "";

    const name =
        $("registerName")?.value.trim() || "";

    const message =
        $("registerMessage");

    if (!userId) {
        if (message) {
            message.textContent =
                "شناسه را وارد کنید";
        }
        return;
    }

    if (!phone) {
        if (message) {
            message.textContent =
                "شماره موبایل را وارد کنید";
        }
        return;
    }

    if (!name) {
        if (message) {
            message.textContent =
                "نام را وارد کنید";
        }
        return;
    }

    try {
        if (message) {
            message.textContent =
                "در حال ثبت نام...";
        }

        const data = await api(
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
            data.user || data;

        localStorage.setItem(
            "videoCallUserId",
            currentUser.user_id
        );

        showApp();
        updateProfile();

        connectWebSocket();
        await loadUsers();

        toast("ثبت نام موفق بود");
    } catch (error) {
        console.error(
            "Register error:",
            error
        );

        if (message) {
            message.textContent =
                error.message;
        }
    }
}


// =========================
// ورود
// =========================

async function login() {
    const identifier =
        $("loginIdentifier")?.value.trim() || "";

    const message =
        $("loginMessage");

    if (!identifier) {
        if (message) {
            message.textContent =
                "شناسه یا شماره موبایل را وارد کنید";
        }
        return;
    }

    try {
        if (message) {
            message.textContent =
                "در حال ورود...";
        }

        const data = await api(
            "/api/users/" +
            encodeURIComponent(identifier)
        );

        currentUser =
            data.user || data;

        localStorage.setItem(
            "videoCallUserId",
            currentUser.user_id
        );

        showApp();
        updateProfile();

        connectWebSocket();
        await loadUsers();

        toast("ورود موفق بود");
    } catch (error) {
        console.error(
            "Login error:",
            error
        );

        if (message) {
            message.textContent =
                error.message;
        }
    }
}


// =========================
// لیست کاربران
// =========================

async function loadUsers() {
    const box = $("usersList");

    if (!box) {
        return;
    }

    box.innerHTML =
        '<div class="loading">در حال دریافت کاربران...</div>';

    try {
        const data =
            await api("/api/users");

        const users =
            Array.isArray(data.users)
                ? data.users
                : [];

        box.innerHTML = "";

        let visibleUsers = 0;

        users.forEach(function (user) {
            if (
                currentUser &&
                user.user_id === currentUser.user_id
            ) {
                return;
            }

            visibleUsers++;

            const card =
                document.createElement("div");

            card.className =
                "user-card";

            const image =
                user.avatar ||
                makeAvatar(
                    user.display_name
                );

            card.innerHTML =
                '<img class="avatar" src="' +
                image +
                '" alt="avatar">' +

                '<div class="user-info">' +
                "<b>" +
                escapeHtml(
                    user.display_name ||
                    "کاربر"
                ) +
                "</b>" +

                "<small>" +
                escapeHtml(
                    user.user_id || ""
                ) +
                "</small>" +

                "</div>" +

                '<button class="audio-call" type="button">📞</button>' +

                '<button class="video-call" type="button">🎥</button>';

            const audioButton =
                card.querySelector(
                    ".audio-call"
                );

            const videoButton =
                card.querySelector(
                    ".video-call"
                );

            if (audioButton) {
                audioButton.addEventListener(
                    "click",
                    function () {
                        startCall(
                            user.user_id,
                            "audio"
                        );
                    }
                );
            }

            if (videoButton) {
                videoButton.addEventListener(
                    "click",
                    function () {
                        startCall(
                            user.user_id,
                            "video"
                        );
                    }
                );
            }

            box.appendChild(card);
        });

        if (visibleUsers === 0) {
            box.innerHTML =
                '<div class="loading">کاربر دیگری ثبت نشده است</div>';
        }
    } catch (error) {
        console.error(
            "Users error:",
            error
        );

        box.innerHTML =
            '<div class="loading">دریافت کاربران ناموفق بود</div>';
    }
}


// =========================
// جستجوی کاربر
// =========================

async function searchUser() {
    const input =
        $("searchInput");

    const result =
        $("searchResult");

    if (!input || !result) {
        return;
    }

    const identifier =
        input.value.trim();

    if (!identifier) {
        result.classList.add("hidden");
        return;
    }

    try {
        const data =
            await api(
                "/api/users/" +
                encodeURIComponent(identifier)
            );

        const user =
            data.user || data;

        if (
            currentUser &&
            user.user_id === currentUser.user_id
        ) {
            result.classList.add("hidden");

            toast(
                "این حساب خودتان است"
            );

            return;
        }

        result.classList.remove(
            "hidden"
        );

        if ($("searchAvatar")) {
            $("searchAvatar").src =
                user.avatar ||
                makeAvatar(
                    user.display_name
                );
        }

        if ($("searchName")) {
            $("searchName").textContent =
                user.display_name ||
                "کاربر";
        }

        if ($("searchId")) {
            $("searchId").textContent =
                "شناسه: " +
                (user.user_id || "-");
        }

        if ($("searchPhone")) {
            $("searchPhone").textContent =
                "موبایل: " +
                (user.phone || "-");
        }

        $("audioCallButton")?.addEventListener(
            "click",
            function () {
                startCall(
                    user.user_id,
                    "audio"
                );
            },
            { once: true }
        );

        $("videoCallButton")?.addEventListener(
            "click",
            function () {
                startCall(
                    user.user_id,
                    "video"
                );
            },
            { once: true }
        );
    } catch (error) {
        console.error(
            "Search error:",
            error
        );

        result.classList.add(
            "hidden"
        );

        toast(
            error.message ||
            "کاربر پیدا نشد"
        );
    }
}


// =========================
// WebSocket
// =========================

function connectWebSocket() {
    const id = getUserId();

    if (!id) {
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

    if (reconnectTimer) {
        clearTimeout(
            reconnectTimer
        );

        reconnectTimer = null;
    }

    if ($("myStatus")) {
        $("myStatus").textContent =
            "🟡 در حال اتصال...";
    }

    try {
        socket =
            new WebSocket(
                "wss://videocallapp-api.onrender.com/ws/" +
                encodeURIComponent(id)
            );
    } catch (error) {
        console.error(
            "WebSocket error:",
            error
        );

        reconnectWebSocket();
        return;
    }

    socket.onopen = function () {
        console.log(
            "WebSocket connected"
        );

        if ($("myStatus")) {
            $("myStatus").textContent =
                "🟢 آنلاین";
        }
    };

    socket.onmessage = async function (event) {
        try {
            const data =
                JSON.parse(
                    event.data
                );

            await handleSignal(data);
        } catch (error) {
            console.error(
                "Message error:",
                error
            );
        }
    };

    socket.onerror = function (error) {
        console.error(
            "WebSocket connection error:",
            error
        );
    };

    socket.onclose = function () {
        console.log(
            "WebSocket disconnected"
        );

        if ($("myStatus")) {
            $("myStatus").textContent =
                "⚪ آفلاین";
        }

        reconnectWebSocket();
    };
}

function reconnectWebSocket() {
    if (!getUserId()) {
        return;
    }

    if (reconnectTimer) {
        return;
    }

    reconnectTimer =
        setTimeout(
            function () {
                reconnectTimer = null;
                connectWebSocket();
            },
            3000
        );
}

function sendSignal(data) {
    if (
        !socket ||
        socket.readyState !==
        WebSocket.OPEN
    ) {
        toast(
            "اتصال تماس آماده نیست"
        );

        return false;
    }

    try {
        socket.send(
            JSON.stringify(data)
        );

        return true;
    } catch (error) {
        console.error(
            "Send signal error:",
            error
        );

        return false;
    }
}


// =========================
// WebRTC
// =========================

function createPeerConnection() {
    if (peerConnection) {
        try {
            peerConnection.close();
        } catch (error) {
            console.log(error);
        }
    }

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
        function (event) {
            if (
                event.candidate &&
                currentCallUser
            ) {
                sendSignal({
                    type:
                        "ice-candidate",

                    target_user_id:
                        currentCallUser,

                    candidate:
                        event.candidate
                });
            }
        };

    peerConnection.ontrack =
        function (event) {
            if (!remoteStream) {
                remoteStream =
                    new MediaStream();
            }

            if (
                event.streams &&
                event.streams[0]
            ) {
                event.streams[0]
                    .getTracks()
                    .forEach(function (track) {
                        remoteStream.addTrack(
                            track
                        );
                    });
            }

            if ($("remoteVideo")) {
                $("remoteVideo").srcObject =
                    remoteStream;

                $("remoteVideo")
                    .play()
                    .catch(function () {});
            }

            $("remotePlaceholder")
                ?.classList
                .add("hidden");
        };

    peerConnection.onconnectionstatechange =
        function () {
            if (!peerConnection) {
                return;
            }

            const state =
                peerConnection.connectionState;

            if ($("callStatus")) {
                if (state === "connected") {
                    $("callStatus").textContent =
                        "🟢 تماس برقرار است";
                } else if (
                    state === "connecting"
                ) {
                    $("callStatus").textContent =
                        "🟡 در حال اتصال...";
                } else if (
                    state === "failed"
                ) {
                    $("callStatus").textContent =
                        "🔴 اتصال ناموفق بود";
                }
            }
        };
}


// =========================
// شروع تماس
// =========================

async function startCall(
    userId,
    type
) {
    if (!userId) {
        return;
    }

    if (
        currentUser &&
        userId === currentUser.user_id
    ) {
        toast(
            "نمی‌توانید با خودتان تماس بگیرید"
        );

        return;
    }

    currentCallUser = userId;

    currentCallType =
        type === "audio"
            ? "audio"
            : "video";

    pendingIceCandidates = [];

    $("callPanel")
        ?.classList
        .remove("hidden");

    if ($("callStatus")) {
        $("callStatus").textContent =
            "🟡 در حال آماده‌سازی تماس...";
    }

    try {
        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {
            throw new Error(
                "دسترسی دوربین و میکروفون در این مرورگر فعال نیست"
            );
        }

        localStream =
            await navigator.mediaDevices
                .getUserMedia({
                    audio: true,
                    video:
                        currentCallType ===
                        "video"
                });

        if ($("localVideo")) {
            $("localVideo").srcObject =
                localStream;

            $("localVideo")
                .play()
                .catch(function () {});
        }

        createPeerConnection();

        localStream
            .getTracks()
            .forEach(function (track) {
                peerConnection.addTrack(
                    track,
                    localStream
                );
            });

        const offer =
            await peerConnection.createOffer();

        await peerConnection
            .setLocalDescription(
                offer
            );

        const sent =
            sendSignal({
                type: "offer",
                target_user_id: userId,
                call_type:
                    currentCallType,
                offer: offer
            });

        if (!sent) {
            throw new Error(
                "اتصال سرور برقرار نیست"
            );
        }

        if ($("callStatus")) {
            $("callStatus").textContent =
                "📞 در حال تماس...";
        }
    } catch (error) {
        console.error(
            "Start call error:",
            error
        );

        toast(
            error.message ||
            "شروع تماس ناموفق بود"
        );

        cleanupCall();
    }
}


// =========================
// سیگنال‌ها
// =========================

async function handleSignal(data) {
    if (!data || !data.type) {
        return;
    }

    if (data.type === "offer") {
        incomingOffer =
            data.offer;

        currentCallUser =
            data.from_user_id;

        currentCallType =
            data.call_type === "audio"
                ? "audio"
                : "video";

        if ($("incomingName")) {
            $("incomingName").textContent =
                currentCallUser ||
                "کاربر";
        }

        $("incomingCall")
            ?.classList
            .remove("hidden");

        return;
    }

    if (data.type === "answer") {
        if (!peerConnection) {
            return;
        }

        try {
            await peerConnection
                .setRemoteDescription(
                    new RTCSessionDescription(
                        data.answer
                    )
                );

            await flushIce();
        } catch (error) {
            console.error(
                "Answer error:",
                error
            );
        }

        return;
    }

    if (data.type === "ice-candidate") {
        if (!data.candidate) {
            return;
        }

        if (
            peerConnection &&
            peerConnection.remoteDescription
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
                    "ICE error:",
                    error
                );
            }
        } else {
            pendingIceCandidates.push(
                data.candidate
            );
        }

        return;
    }

    if (data.type === "hangup") {
        toast(
            "تماس پایان یافت"
        );

        cleanupCall();
        return;
    }

    if (data.type === "call-rejected") {
        toast(
            "تماس رد شد"
        );

        cleanupCall();
        return;
    }

    if (data.type === "error") {
        toast(
            data.message ||
            "خطای تماس"
        );
    }
}

async function flushIce() {
    if (
        !peerConnection ||
        !peerConnection.remoteDescription
    ) {
        return;
    }

    const list =
        pendingIceCandidates;

    pendingIceCandidates = [];

    for (
        const candidate
        of list
    ) {
        try {
            await peerConnection
                .addIceCandidate(
                    new RTCIceCandidate(
                        candidate
                    )
                );
        } catch (error) {
            console.error(
                "Queued ICE error:",
                error
            );
        }
    }
}


// =========================
// قبول تماس
// =========================

async function acceptCall() {
    $("incomingCall")
        ?.classList
        .add("hidden");

    $("callPanel")
        ?.classList
        .remove("hidden");

    try {
        if (!incomingOffer) {
            throw new Error(
                "اطلاعات تماس موجود نیست"
            );
        }

        localStream =
            await navigator.mediaDevices
                .getUserMedia({
                    audio: true,
                    video:
                        currentCallType ===
                        "video"
                });

        if ($("localVideo")) {
            $("localVideo").srcObject =
                localStream;

            $("localVideo")
                .play()
                .catch(function () {});
        }

        createPeerConnection();

        localStream
            .getTracks()
            .forEach(function (track) {
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

        await flushIce();

        const answer =
            await peerConnection.createAnswer();

        await peerConnection
            .setLocalDescription(
                answer
            );

        sendSignal({
            type: "answer",
            target_user_id:
                currentCallUser,
            answer: answer
        });

        if ($("callStatus")) {
            $("callStatus").textContent =
                "🟡 در حال اتصال...";
        }
    } catch (error) {
        console.error(
            "Accept call error:",
            error
        );

        toast(
            error.message ||
            "پاسخ به تماس ناموفق بود"
        );

        cleanupCall();
    }
}


// =========================
// رد تماس
// =========================

function rejectCall() {
    if (currentCallUser) {
        sendSignal({
            type:
                "call-rejected",
            target_user_id:
                currentCallUser
        });
    }

    $("incomingCall")
        ?.classList
        .add("hidden");

    incomingOffer = null;
    currentCallUser = null;
}


// =========================
// میکروفون
// =========================

function toggleMicrophone() {
    if (!localStream) {
        return;
    }

    const tracks =
        localStream.getAudioTracks();

    if (!tracks.length) {
        return;
    }

    tracks.forEach(function (track) {
        track.enabled =
            !track.enabled;
    });

    const enabled =
        tracks.some(function (track) {
            return track.enabled;
        });

    if ($("microphoneButton")) {
        $("microphoneButton").textContent =
            enabled ? "🎙️" : "🔇";
    }
}


// =========================
// دوربین
// =========================

function toggleCamera() {
    if (!localStream) {
        return;
    }

    const tracks =
        localStream.getVideoTracks();

    if (!tracks.length) {
        toast(
            "این تماس تصویری نیست"
        );

        return;
    }

    tracks.forEach(function (track) {
        track.enabled =
            !track.enabled;
    });

    const enabled =
        tracks.some(function (track) {
            return track.enabled;
        });

    if ($("cameraButton")) {
        $("cameraButton").textContent =
            enabled ? "📹" : "🚫";
    }
}


// =========================
// پایان تماس
// =========================

function hangup() {
    if (currentCallUser) {
        sendSignal({
            type: "hangup",
            target_user_id:
                currentCallUser
        });
    }

    cleanupCall();
}

function cleanupCall() {
    if (peerConnection) {
        try {
            peerConnection.close();
        } catch (error) {
            console.log(error);
        }

        peerConnection = null;
    }

    if (localStream) {
        localStream
            .getTracks()
            .forEach(function (track) {
                try {
                    track.stop();
                } catch (error) {
                    console.log(error);
                }
            });

        localStream = null;
    }

    if ($("localVideo")) {
        $("localVideo").srcObject = null;
    }

    if ($("remoteVideo")) {
        $("remoteVideo").srcObject = null;
    }

    $("callPanel")
        ?.classList
        .add("hidden");

    $("incomingCall")
        ?.classList
        .add("hidden");

    $("remotePlaceholder")
        ?.classList
        .remove("hidden");

    currentCallUser = null;
    currentCallType = "video";
    incomingOffer = null;
    remoteStream = null;
    pendingIceCandidates = [];
}


// =========================
// رویدادها
// =========================

function setupEvents() {
    $("loginButton")?.addEventListener(
        "click",
        login
    );

    $("registerButton")?.addEventListener(
        "click",
        register
    );

    $("showRegisterButton")?.addEventListener(
        "click",
        showRegister
    );

    $("showLoginButton")?.addEventListener(
        "click",
        showLogin
    );

    $("refreshButton")?.addEventListener(
        "click",
        loadUsers
    );

    $("searchButton")?.addEventListener(
        "click",
        searchUser
    );

    $("searchInput")?.addEventListener(
        "keydown",
        function (event) {
            if (event.key === "Enter") {
                searchUser();
            }
        }
    );

    $("acceptButton")?.addEventListener(
        "click",
        acceptCall
    );

    $("rejectButton")?.addEventListener(
        "click",
        rejectCall
    );

    $("hangupButton")?.addEventListener(
        "click",
        hangup
    );

    $("closeCallButton")?.addEventListener(
        "click",
        hangup
    );

    $("microphoneButton")?.addEventListener(
        "click",
        toggleMicrophone
    );

    $("cameraButton")?.addEventListener(
        "click",
        toggleCamera
    );

    $("logoutButton")?.addEventListener(
        "click",
        function () {
            try {
                if (socket) {
                    socket.close();
                }
            } catch (error) {
                console.log(error);
            }

            cleanupCall();

            localStorage.removeItem(
                "videoCallUserId"
            );

            currentUser = null;

            location.reload();
        }
    );

    $("homeButton")?.addEventListener(
        "click",
        function () {
            $("onlineBox")?.scrollIntoView({
                behavior: "smooth"
            });
        }
    );

    $("contactsButton")?.addEventListener(
        "click",
        function () {
            location.href =
                "contacts.html";
        }
    );

    $("profileButton")?.addEventListener(
        "click",
        function () {
            location.href =
                "profile.html";
        }
    );

    $("settingsButton")?.addEventListener(
        "click",
        function () {
            location.href =
                "settings.html";
        }
    );
}


// =========================
// شروع برنامه
// =========================

async function start() {
    setupEvents();

    const id =
        getUserId();

    if (!id) {
        showLogin();
        return;
    }

    showApp();

    if ($("myStatus")) {
        $("myStatus").textContent =
            "🟡 دریافت اطلاعات...";
    }

    const loaded =
        await loadCurrentUser();

    if (!loaded) {
        showLogin();
        return;
    }

    updateProfile();

    connectWebSocket();

    await loadUsers();
}


// =========================
// اجرا
// =========================

document.addEventListener(
    "DOMContentLoaded",
    start
);