"use strict";

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


// ==============================
// HELPERS
// ==============================

function $(id) {
    return document.getElementById(id);
}

function getUserId() {
    return localStorage.getItem("videoCallUserId");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function makeAvatar(name) {
    const letter =
        String(name || "U")
            .trim()
            .charAt(0)
            .toUpperCase() || "U";

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
            <circle cx="50" cy="50" r="50" fill="#111"/>
            <text
                x="50"
                y="63"
                text-anchor="middle"
                font-size="45"
                font-family="Arial"
                fill="white"
            >${escapeHtml(letter)}</text>
        </svg>
    `;

    return "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(svg);
}

function toast(message) {
    const box = $("toast");

    if (!box) {
        return;
    }

    box.textContent = message;
    box.classList.add("show");

    setTimeout(() => {
        box.classList.remove("show");
    }, 3000);
}


// ==============================
// PAGE
// ==============================

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


// ==============================
// API
// ==============================

async function api(path, options = {}) {
    const fetchOptions = {
        method: options.method || "GET",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    };

    if (options.body !== undefined) {
        fetchOptions.body = options.body;
    }

    const response = await fetch(
        API_URL + path,
        fetchOptions
    );

    let data = {};

    try {
        data = await response.json();
    } catch {
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


// ==============================
// PROFILE
// ==============================

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
        $("myStatus").textContent = "⚪ آفلاین";
    }
}


// ==============================
// CALL HISTORY
// ==============================

function getCallHistory() {
    try {
        const value =
            localStorage.getItem("videoCallHistory");

        if (!value) {
            return [];
        }

        const history = JSON.parse(value);

        return Array.isArray(history)
            ? history
            : [];
    } catch {
        return [];
    }
}

function saveCallHistory(history) {
    localStorage.setItem(
        "videoCallHistory",
        JSON.stringify(history.slice(0, 50))
    );
}

function addCallHistory(
    userId,
    type,
    direction,
    status
) {
    if (!userId) {
        return;
    }

    const history = getCallHistory();

    history.unshift({
        user_id: userId,
        type: type === "audio"
            ? "audio"
            : "video",
        direction: direction || "outgoing",
        status: status || "completed",
        time: new Date().toLocaleString("fa-IR")
    });

    saveCallHistory(history);
    renderCallHistory();
}

function renderCallHistory() {
    const box = $("callsList");

    if (!box) {
        return;
    }

    const history = getCallHistory();

    if (history.length === 0) {
        box.innerHTML =
            '<div class="empty">هنوز تماسی ثبت نشده است</div>';
        return;
    }

    box.innerHTML = "";

    history.forEach(call => {
        const item =
            document.createElement("div");

        item.className = "call-item";

        const icon =
            call.type === "video"
                ? "🎥"
                : "📞";

        let direction = "تماس خروجی";

        if (call.direction === "incoming") {
            direction = "تماس ورودی";
        }

        let status = "برقرار شده";

        if (call.status === "calling") {
            status = "در حال تماس";
        }

        if (call.status === "rejected") {
            status = "رد شده";
        }

        item.innerHTML = `
            <div class="call-item-icon">
                ${icon}
            </div>

            <div class="call-item-info">
                <b>${escapeHtml(call.user_id)}</b>

                <small>
                    ${escapeHtml(direction)}
                    •
                    ${escapeHtml(status)}
                </small>

                <br>

                <small>
                    ${escapeHtml(call.time)}
                </small>
            </div>
        `;

        box.appendChild(item);
    });
}


// ==============================
// CURRENT USER
// ==============================

async function loadCurrentUser() {
    const id = getUserId();

    if (!id) {
        return false;
    }

    try {
        const data =
            await api(
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


// ==============================
// REGISTER
// ==============================

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
        message.textContent =
            "شناسه را وارد کنید";
        return;
    }

    if (!phone) {
        message.textContent =
            "شماره موبایل را وارد کنید";
        return;
    }

    if (!name) {
        message.textContent =
            "نام را وارد کنید";
        return;
    }

    message.textContent = "";

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
            data.user || data;

        localStorage.setItem(
            "videoCallUserId",
            currentUser.user_id
        );

        showApp();
        updateProfile();
        connectWebSocket();

        await loadUsers();

        renderCallHistory();

        toast("ثبت نام موفق بود");

    } catch (error) {
        console.error(
            "Register error:",
            error
        );

        message.textContent =
            error.message;
    }
}


// ==============================
// LOGIN
// ==============================

async function login() {
    const identifier =
        $("loginIdentifier")?.value.trim() || "";

    const message =
        $("loginMessage");

    if (!identifier) {
        message.textContent =
            "شناسه یا شماره موبایل را وارد کنید";
        return;
    }

    message.textContent = "";

    try {
        const data =
            await api(
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

        renderCallHistory();

        toast("ورود موفق بود");

    } catch (error) {
        console.error(
            "Login error:",
            error
        );

        message.textContent =
            error.message;
    }
}


// ==============================
// USERS
// ==============================

async function loadUsers() {
    const box = $("usersList");

    if (!box) {
        return;
    }

    box.innerHTML =
        '<div class="loading">دریافت کاربران...</div>';

    try {
        const data =
            await api("/api/users");

        const users =
            Array.isArray(data.users)
                ? data.users
                : [];

        box.innerHTML = "";

        let count = 0;

        users.forEach(user => {
            if (
                currentUser &&
                user.user_id ===
                currentUser.user_id
            ) {
                return;
            }

            count++;

            const card =
                document.createElement("div");

            card.className = "user-card";

            const avatar =
                user.avatar ||
                makeAvatar(user.display_name);

            card.innerHTML = `
                <img
                    class="avatar"
                    src="${avatar}"
                    alt="avatar"
                >

                <div class="user-info">
                    <b>
                        ${escapeHtml(
                            user.display_name || "کاربر"
                        )}
                    </b>

                    <small>
                        ${escapeHtml(
                            user.user_id || ""
                        )}
                    </small>
                </div>

                <button
                    class="audio-call"
                    type="button"
                >
                    📞
                </button>

                <button
                    class="video-call"
                    type="button"
                >
                    🎥
                </button>
            `;

            card
                .querySelector(".audio-call")
                .addEventListener(
                    "click",
                    () => {
                        startCall(
                            user.user_id,
                            "audio"
                        );
                    }
                );

            card
                .querySelector(".video-call")
                .addEventListener(
                    "click",
                    () => {
                        startCall(
                            user.user_id,
                            "video"
                        );
                    }
                );

            box.appendChild(card);
        });

        if (count === 0) {
            box.innerHTML =
                '<div class="empty">کاربر دیگری ثبت نشده است</div>';
        }

    } catch (error) {
        console.error(
            "Users error:",
            error
        );

        box.innerHTML =
            '<div class="empty">دریافت کاربران ناموفق بود</div>';
    }
}


// ==============================
// SEARCH
// ==============================

async function searchUser() {
    const identifier =
        $("searchInput")?.value.trim() || "";

    const result =
        $("searchResult");

    if (!identifier) {
        result?.classList.add("hidden");
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
            user.user_id ===
            currentUser.user_id
        ) {
            result?.classList.add("hidden");

            toast(
                "این حساب خودتان است"
            );

            return;
        }

        result?.classList.remove("hidden");

        if ($("searchAvatar")) {
            $("searchAvatar").src =
                user.avatar ||
                makeAvatar(user.display_name);
        }

        if ($("searchName")) {
            $("searchName").textContent =
                user.display_name || "کاربر";
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

        if ($("audioCallButton")) {
            $("audioCallButton").onclick =
                () => {
                    startCall(
                        user.user_id,
                        "audio"
                    );
                };
        }

        if ($("videoCallButton")) {
            $("videoCallButton").onclick =
                () => {
                    startCall(
                        user.user_id,
                        "video"
                    );
                };
        }

    } catch (error) {
        result?.classList.add("hidden");

        toast(
            error.message ||
            "کاربر پیدا نشد"
        );
    }
}


// ==============================
// WEBSOCKET
// ==============================

function connectWebSocket() {
    const id = getUserId();

    if (!id) {
        return;
    }

    if (
        socket &&
        (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        )
    ) {
        return;
    }

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    try {
        socket =
            new WebSocket(
                "wss://videocallapp-api.onrender.com/ws/" +
                encodeURIComponent(id)
            );
    } catch (error) {
        console.error(error);
        reconnectWebSocket();
        return;
    }

    socket.onopen = () => {
        if ($("myStatus")) {
            $("myStatus").textContent =
                "🟢 آنلاین";
        }
    };

    socket.onmessage = async event => {
        try {
            const data =
                JSON.parse(event.data);

            await handleSignal(data);

        } catch (error) {
            console.error(
                "Signal error:",
                error
            );
        }
    };

    socket.onerror = error => {
        console.error(
            "WebSocket error:",
            error
        );
    };

    socket.onclose = () => {
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
        setTimeout(() => {
            reconnectTimer = null;
            connectWebSocket();
        }, 3000);
}

function sendSignal(data) {
    if (
        !socket ||
        socket.readyState !== WebSocket.OPEN
    ) {
        toast(
            "اتصال تماس برقرار نیست"
        );

        return false;
    }

    try {
        socket.send(
            JSON.stringify(data)
        );

        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}


// ==============================
// WEBRTC
// ==============================

function createPeerConnection() {
    if (peerConnection) {
        try {
            peerConnection.close();
        } catch {}
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
        event => {
            if (
                event.candidate &&
                currentCallUser
            ) {
                sendSignal({
                    type: "ice-candidate",
                    target_user_id:
                        currentCallUser,
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

            if (
                event.streams &&
                event.streams[0]
            ) {
                event.streams[0]
                    .getTracks()
                    .forEach(track => {
                        const exists =
                            remoteStream
                                .getTracks()
                                .some(
                                    oldTrack =>
                                        oldTrack.id ===
                                        track.id
                                );

                        if (!exists) {
                            remoteStream.addTrack(
                                track
                            );
                        }
                    });
            }

            if ($("remoteVideo")) {
                $("remoteVideo").srcObject =
                    remoteStream;

                $("remoteVideo")
                    .play()
                    .catch(() => {});
            }

            $("remotePlaceholder")
                ?.classList
                .add("hidden");
        };

    peerConnection.onconnectionstatechange =
        () => {
            if (!peerConnection) {
                return;
            }

            const state =
                peerConnection.connectionState;

            if ($("callStatus")) {
                if (state === "connected") {
                    $("callStatus").textContent =
                        "🟢 تماس برقرار است";
                } else if (state === "connecting") {
                    $("callStatus").textContent =
                        "در حال تماس...";
                } else if (state === "failed") {
                    $("callStatus").textContent =
                        "🔴 اتصال ناموفق بود";
                }
            }
        };
}


// ==============================
// START CALL
// ==============================

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
            "در حال تماس...";
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
                        currentCallType === "video"
                });

        if ($("localVideo")) {
            $("localVideo").srcObject =
                localStream;

            $("localVideo")
                .play()
                .catch(() => {});
        }

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
            .setLocalDescription(offer);

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
                "سرور تماس در دسترس نیست"
            );
        }

        addCallHistory(
            userId,
            currentCallType,
            "outgoing",
            "calling"
        );

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


// ==============================
// SIGNAL HANDLER
// ==============================

async function handleSignal(data) {
    if (!data || !data.type) {
        return;
    }

    if (data.type === "offer") {
        incomingOffer = data.offer;

        currentCallUser =
            data.from_user_id;

        currentCallType =
            data.call_type === "audio"
                ? "audio"
                : "video";

        if ($("incomingName")) {
            $("incomingName").textContent =
                currentCallUser || "کاربر";
        }

        if ($("incomingAvatar")) {
            $("incomingAvatar").src =
                makeAvatar(currentCallUser);
        }

        $("incomingCall")
            ?.classList
            .remove("hidden");

        addCallHistory(
            currentCallUser,
            currentCallType,
            "incoming",
            "calling"
        );

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
        cleanupCall();

        toast(
            "تماس پایان یافت"
        );

        return;
    }

    if (data.type === "call-rejected") {
        cleanupCall();

        toast(
            "تماس رد شد"
        );

        return;
    }

    if (data.type === "error") {
        toast(
            data.message ||
            "خطای تماس"
        );
    }
}


// ==============================
// ICE
// ==============================

async function flushIce() {
    if (
        !peerConnection ||
        !peerConnection.remoteDescription
    ) {
        return;
    }

    const candidates =
        pendingIceCandidates;

    pendingIceCandidates = [];

    for (const candidate of candidates) {
        try {
            await peerConnection
                .addIceCandidate(
                    new RTCIceCandidate(
                        candidate
                    )
                );
        } catch (error) {
            console.error(
                "ICE queue error:",
                error
            );
        }
    }
}


// ==============================
// ACCEPT CALL
// ==============================

async function acceptCall() {
    $("incomingCall")
        ?.classList
        .add("hidden");

    $("callPanel")
        ?.classList
        .remove("hidden");

    if ($("callStatus")) {
        $("callStatus").textContent =
            "در حال تماس...";
    }

    try {
        if (!incomingOffer) {
            throw new Error(
                "اطلاعات تماس موجود نیست"
            );
        }

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {
            throw new Error(
                "دسترسی دوربین و میکروفون فعال نیست"
            );
        }

        localStream =
            await navigator.mediaDevices
                .getUserMedia({
                    audio: true,
                    video:
                        currentCallType === "video"
                });

        if ($("localVideo")) {
            $("localVideo").srcObject =
                localStream;

            $("localVideo")
                .play()
                .catch(() => {});
        }

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

        await flushIce();

        const answer =
            await peerConnection
                .createAnswer();

        await peerConnection
            .setLocalDescription(answer);

        sendSignal({
            type: "answer",
            target_user_id:
                currentCallUser,
            answer: answer
        });

        addCallHistory(
            currentCallUser,
            currentCallType,
            "incoming",
            "completed"
        );

        incomingOffer = null;

    } catch (error) {
        console.error(
            "Accept error:",
            error
        );

        toast(
            error.message ||
            "پاسخ به تماس ناموفق بود"
        );

        cleanupCall();
    }
}


// ==============================
// REJECT CALL
// ==============================

function rejectCall() {
    if (currentCallUser) {
        sendSignal({
            type: "call-rejected",
            target_user_id:
                currentCallUser
        });

        addCallHistory(
            currentCallUser,
            currentCallType,
            "incoming",
            "rejected"
        );
    }

    $("incomingCall")
        ?.classList
        .add("hidden");

    incomingOffer = null;
    currentCallUser = null;
}


// ==============================
// MICROPHONE
// ==============================

function toggleMicrophone() {
    if (!localStream) {
        return;
    }

    const tracks =
        localStream.getAudioTracks();

    if (!tracks.length) {
        return;
    }

    tracks.forEach(track => {
        track.enabled =
            !track.enabled;
    });

    const enabled =
        tracks.some(
            track => track.enabled
        );

    if ($("microphoneButton")) {
        $("microphoneButton").textContent =
            enabled ? "🎙️" : "🔇";
    }
}


// ==============================
// CAMERA
// ==============================

function toggleCamera() {
    if (!localStream) {
        return;
    }

    const tracks =
        localStream.getVideoTracks();

    if (!tracks.length) {
        toast(
            "این تماس صوتی است"
        );

        return;
    }

    tracks.forEach(track => {
        track.enabled =
            !track.enabled;
    });

    const enabled =
        tracks.some(
            track => track.enabled
        );

    if ($("cameraButton")) {
        $("cameraButton").textContent =
            enabled ? "📹" : "🚫";
    }
}


// ==============================
// HANGUP
// ==============================

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
        } catch {}

        peerConnection = null;
    }

    if (localStream) {
        localStream
            .getTracks()
            .forEach(track => {
                try {
                    track.stop();
                } catch {}
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

    if ($("microphoneButton")) {
        $("microphoneButton").textContent =
            "🎙️";
    }

    if ($("cameraButton")) {
        $("cameraButton").textContent =
            "📹";
    }

    currentCallUser = null;
    currentCallType = "video";
    incomingOffer = null;
    remoteStream = null;
    pendingIceCandidates = [];
}


// ==============================
// EVENTS
// ==============================

function setupEvents() {

    $("loginButton")
        ?.addEventListener(
            "click",
            login
        );

    $("registerButton")
        ?.addEventListener(
            "click",
            register
        );

    $("showRegisterButton")
        ?.addEventListener(
            "click",
            showRegister
        );

    $("showLoginButton")
        ?.addEventListener(
            "click",
            showLogin
        );

    $("refreshButton")
        ?.addEventListener(
            "click",
            loadUsers
        );

    $("searchButton")
        ?.addEventListener(
            "click",
            searchUser
        );

    $("searchInput")
        ?.addEventListener(
            "keydown",
            event => {
                if (event.key === "Enter") {
                    searchUser();
                }
            }
        );

    $("acceptButton")
        ?.addEventListener(
            "click",
            acceptCall
        );

    $("rejectButton")
        ?.addEventListener(
            "click",
            rejectCall
        );

    $("hangupButton")
        ?.addEventListener(
            "click",
            hangup
        );

    $("closeCallButton")
        ?.addEventListener(
            "click",
            hangup
        );

    $("microphoneButton")
        ?.addEventListener(
            "click",
            toggleMicrophone
        );

    $("cameraButton")
        ?.addEventListener(
            "click",
            toggleCamera
        );

    $("logoutButton")
        ?.addEventListener(
            "click",
            () => {
                try {
                    socket?.close();
                } catch {}

                cleanupCall();

                localStorage.removeItem(
                    "videoCallUserId"
                );

                currentUser = null;

                location.reload();
            }
        );

    $("homeButton")
        ?.addEventListener(
            "click",
            () => {
                $("onlineBox")
                    ?.scrollIntoView({
                        behavior: "smooth"
                    });
            }
        );

    $("contactsButton")
        ?.addEventListener(
            "click",
            () => {
                location.href =
                    "contacts.html";
            }
        );

    $("profileButton")
        ?.addEventListener(
            "click",
            () => {
                location.href =
                    "profile.html";
            }
        );

    $("settingsButton")
        ?.addEventListener(
            "click",
            () => {
                location.href =
                    "settings.html";
            }
        );
}


// ==============================
// START
// ==============================

async function start() {
    setupEvents();

    renderCallHistory();

    const id = getUserId();

    if (!id) {
        showLogin();
        return;
    }

    showApp();

    const loaded =
        await loadCurrentUser();

    if (!loaded) {
        showLogin();
        return;
    }

    updateProfile();

    connectWebSocket();

    await loadUsers();

    renderCallHistory();
}


// ==============================
// DOM READY
// ==============================

document.addEventListener(
    "DOMContentLoaded",
    start
);