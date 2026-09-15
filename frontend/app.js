const API_URL = "https://videocallapp-api.onrender.com";

let currentUser = null;
let socket = null;

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let currentCallUserId = null;
let currentCallType = null;
let incomingOffer = null;

const ICE_SERVERS = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun1.l.google.com:19302"
        }
    ]
};


// =========================
// Helpers
// =========================

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function showToast(message) {
    const toast = $("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(window.toastTimer);

    window.toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function getSavedUserId() {
    return localStorage.getItem("videoCallUserId");
}

function saveUser(user) {
    if (!user) return;

    currentUser = user;

    const userId =
        user.user_id ||
        user.id ||
        user.identifier;

    if (userId) {
        localStorage.setItem(
            "videoCallUserId",
            userId
        );
    }
}

function clearUser() {
    currentUser = null;

    localStorage.removeItem(
        "videoCallUserId"
    );

    localStorage.removeItem(
        "videoCallTargetUser"
    );

    localStorage.removeItem(
        "videoCallTargetType"
    );
}


// =========================
// Screen
// =========================

function showMainScreen() {
    const authContainer =
        $("authContainer");

    const appContainer =
        $("appContainer");

    if (authContainer) {
        authContainer.classList.add("hidden");
    }

    if (appContainer) {
        appContainer.classList.remove("hidden");
        appContainer.style.display = "";
    }
}

function showAuthScreen() {
    const authContainer =
        $("authContainer");

    const appContainer =
        $("appContainer");

    if (authContainer) {
        authContainer.classList.remove("hidden");
        authContainer.style.display = "";
    }

    if (appContainer) {
        appContainer.classList.add("hidden");
    }
}


// =========================
// API
// =========================

async function apiFetch(
    path,
    options = {}
) {
    const response = await fetch(
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
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const message =
            data?.detail ||
            data?.message ||
            "خطا در ارتباط با سرور";

        throw new Error(message);
    }

    return data;
}


// =========================
// Login
// =========================

async function login() {
    const input =
        $("loginIdentifier");

    const error =
        $("loginError");

    const identifier =
        input?.value.trim();

    if (!identifier) {
        if (error) {
            error.textContent =
                "شناسه یا شماره موبایل را وارد کنید.";
        }

        return;
    }

    if (error) {
        error.textContent = "";
    }

    const button =
        $("loginButton");

    if (button) {
        button.disabled = true;
        button.textContent =
            "در حال ورود...";
    }

    try {
        const user =
            await apiFetch(
                "/api/users/" +
                encodeURIComponent(identifier)
            );

        saveUser(user);

        showMainScreen();

        await loadCurrentUser();
        await loadUsers();

        connectWebSocket();

        showToast(
            "ورود موفق بود"
        );

    } catch (err) {
        console.error(
            "Login error:",
            err
        );

        if (error) {
            error.textContent =
                err.message ||
                "ورود انجام نشد.";
        }
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent =
                "ورود";
        }
    }
}


// =========================
// Register
// =========================

async function register() {
    const userId =
        $("registerUserId")
            ?.value.trim();

    const phone =
        $("registerPhone")
            ?.value.trim();

    const name =
        $("registerName")
            ?.value.trim();

    const error =
        $("registerError");

    if (!userId) {
        error.textContent =
            "شناسه را وارد کنید.";
        return;
    }

    if (!phone) {
        error.textContent =
            "شماره موبایل را وارد کنید.";
        return;
    }

    if (!name) {
        error.textContent =
            "نام نمایشی را وارد کنید.";
        return;
    }

    error.textContent = "";

    const button =
        $("registerButton");

    if (button) {
        button.disabled = true;
        button.textContent =
            "در حال ثبت‌نام...";
    }

    try {
        const result =
            await apiFetch(
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

        const user =
            result.user ||
            result;

        saveUser(user);

        showMainScreen();

        await loadCurrentUser();
        await loadUsers();

        connectWebSocket();

        showToast(
            "ثبت‌نام موفق بود"
        );

    } catch (err) {
        console.error(
            "Register error:",
            err
        );

        error.textContent =
            err.message ||
            "ثبت‌نام انجام نشد.";
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent =
                "ثبت‌نام";
        }
    }
}


// =========================
// Current user
// =========================

async function loadCurrentUser() {
    const userId =
        getSavedUserId();

    if (!userId) {
        showAuthScreen();
        return;
    }

    try {
        const data =
            await apiFetch(
                "/api/profile/" +
                encodeURIComponent(userId)
            );

        currentUser =
            data.user ||
            data;

        saveUser(currentUser);

        updateMyProfile();
    } catch (err) {
        console.error(
            "Profile error:",
            err
        );

        const userData =
            await apiFetch(
                "/api/users/" +
                encodeURIComponent(userId)
            );

        currentUser =
            userData.user ||
            userData;

        saveUser(currentUser);

        updateMyProfile();
    }
}

function updateMyProfile() {
    if (!currentUser) return;

    const name =
        currentUser.display_name ||
        currentUser.name ||
        currentUser.user_id ||
        "کاربر";

    const userId =
        currentUser.user_id ||
        currentUser.id ||
        "";

    const avatar =
        currentUser.avatar ||
        "";

    if ($("myDisplayName")) {
        $("myDisplayName").textContent =
            name;
    }

    if ($("myUserId")) {
        $("myUserId").textContent =
            userId;
    }

    if ($("myAvatar")) {
        if (avatar) {
            $("myAvatar").src =
                avatar;
        } else {
            $("myAvatar").src =
                createAvatar(name);
        }
    }

    if ($("onlineStatus")) {
        $("onlineStatus").textContent =
            "آنلاین";
    }
}

function createAvatar(name) {
    const first =
        String(name || "U")
            .trim()
            .charAt(0)
            .toUpperCase();

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg"
             width="100"
             height="100"
             viewBox="0 0 100 100">
            <rect width="100"
                  height="100"
                  rx="50"
                  fill="#7c3aed"/>
            <text x="50"
                  y="58"
                  text-anchor="middle"
                  font-size="42"
                  font-family="Arial"
                  fill="white">${escapeHtml(first)}</text>
        </svg>
    `;

    return (
        "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(svg)
    );
}


// =========================
// Users
// =========================

async function loadUsers() {
    const list =
        $("usersList");

    if (!list) return;

    list.innerHTML = `
        <div class="loading">
            در حال دریافت کاربران...
        </div>
    `;

    try {
        const data =
            await apiFetch("/api/users");

        let users =
            Array.isArray(data)
                ? data
                : (
                    data.users ||
                    data.items ||
                    []
                );

        const myId =
            getSavedUserId();

        users = users.filter(
            user =>
                String(
                    user.user_id ||
                    user.id
                ) !==
                String(myId)
        );

        renderUsers(users);

    } catch (err) {
        console.error(
            "Users error:",
            err
        );

        list.innerHTML = `
            <div class="empty-state">
                دریافت کاربران ناموفق بود.
            </div>
        `;
    }
}

function renderUsers(users) {
    const list =
        $("usersList");

    if (!list) return;

    if (!users.length) {
        list.innerHTML = `
            <div class="empty-state">
                هنوز کاربر دیگری وجود ندارد.
            </div>
        `;
        return;
    }

    list.innerHTML = "";

    users.forEach(user => {
        const userId =
            user.user_id ||
            user.id ||
            "";

        const name =
            user.display_name ||
            user.name ||
            userId;

        const phone =
            user.phone ||
            "";

        const avatar =
            user.avatar ||
            createAvatar(name);

        const online =
            Boolean(
                user.online ||
                user.is_online
            );

        const item =
            document.createElement(
                "div"
            );

        item.className =
            "user-card";

        item.innerHTML = `
            <img
                class="user-avatar"
                src="${avatar}"
                alt=""
            >

            <div class="user-info">
                <div class="user-name">
                    ${escapeHtml(name)}
                </div>

                <div class="user-id">
                    ${escapeHtml(userId)}
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
                    <span class="${
                        online
                            ? "online"
                            : "offline"
                    }"></span>

                    ${
                        online
                            ? "آنلاین"
                            : "آفلاین"
                    }
                </div>
            </div>

            <div class="user-actions">
                <button
                    type="button"
                    class="audio-call-button"
                >
                    📞
                </button>

                <button
                    type="button"
                    class="video-call-button"
                >
                    🎥
                </button>
            </div>
        `;

        item.querySelector(
            ".audio-call-button"
        )?.addEventListener(
            "click",
            () => startCall(
                userId,
                "audio"
            )
        );

        item.querySelector(
            ".video-call-button"
        )?.addEventListener(
            "click",
            () => startCall(
                userId,
                "video"
            )
        );

        list.appendChild(item);
    });
}


// =========================
// Search
// =========================

async function searchUser() {
    const input =
        $("targetUserId");

    const result =
        $("searchResult");

    const identifier =
        input?.value.trim();

    if (!identifier) {
        showToast(
            "شناسه یا شماره موبایل را وارد کنید."
        );
        return;
    }

    if (!result) return;

    result.classList.remove(
        "hidden"
    );

    result.innerHTML = `
        <div class="loading">
            در حال جستجو...
        </div>
    `;

    try {
        const data =
            await apiFetch(
                "/api/users/" +
                encodeURIComponent(identifier)
            );

        const user =
            data.user ||
            data;

        renderSearchResult(user);

    } catch (err) {
        console.error(
            "Search error:",
            err
        );

        result.innerHTML = `
            <div class="empty-state">
                کاربر پیدا نشد.
            </div>
        `;
    }
}

function renderSearchResult(user) {
    const result =
        $("searchResult");

    if (!result) return;

    const userId =
        user.user_id ||
        user.id ||
        "";

    const name =
        user.display_name ||
        user.name ||
        userId;

    const phone =
        user.phone ||
        "";

    const avatar =
        user.avatar ||
        createAvatar(name);

    if ($("searchUserAvatar")) {
        $("searchUserAvatar").src =
            avatar;
    }

    if ($("searchUserName")) {
        $("searchUserName").textContent =
            name;
    }

    if ($("searchUserIdentifier")) {
        $("searchUserIdentifier")
            .textContent =
            userId;
    }

    if ($("searchUserPhone")) {
        $("searchUserPhone")
            .textContent =
            phone;
    }

    result.classList.remove(
        "hidden"
    );

    const audioButton =
        $("searchAudioCallButton");

    const videoButton =
        $("searchVideoCallButton");

    if (audioButton) {
        audioButton.onclick =
            () => startCall(
                userId,
                "audio"
            );
    }

    if (videoButton) {
        videoButton.onclick =
            () => startCall(
                userId,
                "video"
            );
    }
}


// =========================
// WebSocket
// =========================

function connectWebSocket() {
    const userId =
        getSavedUserId();

    if (!userId) return;

    if (
        socket &&
        socket.readyState === WebSocket.OPEN
    ) {
        return;
    }

    const protocol =
        API_URL.startsWith("https")
            ? "wss"
            : "ws";

    const wsUrl =
        protocol +
        "://" +
        API_URL.replace(
            /^https?:\/\//,
            ""
        ) +
        "/ws/" +
        encodeURIComponent(userId);

    console.log(
        "Connecting WebSocket:",
        wsUrl
    );

    try {
        socket =
            new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log(
                "WebSocket connected"
            );

            updateOnlineStatus(
                true
            );
        };

        socket.onmessage = event => {
            try {
                const data =
                    JSON.parse(
                        event.data
                    );

                handleSignal(data);
            } catch (err) {
                console.error(
                    "WebSocket message error:",
                    err
                );
            }
        };

        socket.onclose = () => {
            console.log(
                "WebSocket closed"
            );

            updateOnlineStatus(
                false
            );

            setTimeout(() => {
                if (
                    getSavedUserId()
                ) {
                    connectWebSocket();
                }
            }, 3000);
        };

        socket.onerror = error => {
            console.error(
                "WebSocket error:",
                error
            );
        };

    } catch (err) {
        console.error(
            "WebSocket failed:",
            err
        );
    }
}

function sendSignal(data) {
    if (
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ) {
        showToast(
            "ارتباط با سرور برقرار نیست."
        );

        return false;
    }

    socket.send(
        JSON.stringify(data)
    );

    return true;
}

function updateOnlineStatus(online) {
    const element =
        $("onlineStatus");

    if (!element) return;

    element.textContent =
        online
            ? "آنلاین"
            : "آفلاین";

    element.classList.toggle(
        "online",
        online
    );

    element.classList.toggle(
        "offline",
        !online
    );
}


// =========================
// Signaling
// =========================

async function handleSignal(data) {
    console.log(
        "Signal:",
        data
    );

    const type =
        data.type ||
        data.event;

    if (
        type === "offer"
    ) {
        await receiveOffer(data);
        return;
    }

    if (
        type === "answer"
    ) {
        await receiveAnswer(data);
        return;
    }

    if (
        type === "ice-candidate"
    ) {
        await receiveIceCandidate(
            data
        );
        return;
    }

    if (
        type === "call-rejected"
    ) {
        showToast(
            "تماس رد شد."
        );

        cleanupCall();
        return;
    }

    if (
        type === "hangup"
    ) {
        showToast(
            "تماس پایان یافت."
        );

        cleanupCall();
        return;
    }

    if (
        type === "ping"
    ) {
        sendSignal({
            type: "pong"
        });
    }
}


// =========================
// Start Call
// =========================

async function startCall(
    targetUserId,
    callType = "video"
) {
    if (!targetUserId) {
        showToast(
            "کاربر مقصد مشخص نیست."
        );
        return;
    }

    if (
        targetUserId ===
        getSavedUserId()
    ) {
        showToast(
            "نمی‌توانید با خودتان تماس بگیرید."
        );
        return;
    }

    currentCallUserId =
        targetUserId;

    currentCallType =
        callType;

    try {
        await prepareCallInterface(
            callType
        );

        createPeerConnection();

        const offer =
            await peerConnection
                .createOffer();

        await peerConnection
            .setLocalDescription(
                offer
            );

        sendSignal({
            type: "offer",
            to: targetUserId,
            from: getSavedUserId(),
            call_type: callType,
            offer: offer
        });

        setConnectionStatus(
            "در حال تماس..."
        );

        showToast(
            "در حال برقراری تماس..."
        );

    } catch (err) {
        console.error(
            "Start call error:",
            err
        );

        showToast(
            "شروع تماس ناموفق بود."
        );

        cleanupCall();
    }
}


// =========================
// Receive Offer
// =========================

async function receiveOffer(data) {
    incomingOffer =
        data.offer;

    currentCallUserId =
        data.from ||
        data.user_id ||
        data.sender;

    currentCallType =
        data.call_type ||
        "video";

    const caller =
        data.display_name ||
        data.name ||
        currentCallUserId;

    const modal =
        $("incomingCallModal");

    if ($("incomingCaller")) {
        $("incomingCaller")
            .textContent =
            caller;
    }

    if ($("incomingCallerAvatar")) {
        $("incomingCallerAvatar")
            .src =
            createAvatar(caller);
    }

    if (modal) {
        modal.classList.remove(
            "hidden"
        );
    }

    await NotificationManager?.show(
        "تماس ورودی",
        `از طرف ${caller}`,
        {
            iconEmoji:
                currentCallType ===
                "video"
                    ? "🎥"
                    : "📞",
            requireInteraction: true
        }
    );

    playRingtone();
}


// =========================
// Accept Call
// =========================

async function acceptIncomingCall() {
    stopRingtone();

    const modal =
        $("incomingCallModal");

    if (modal) {
        modal.classList.add(
            "hidden"
        );
    }

    try {
        await prepareCallInterface(
            currentCallType ||
            "video"
        );

        createPeerConnection();

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
            to: currentCallUserId,
            from: getSavedUserId(),
            answer: answer
        });

        setConnectionStatus(
            "در حال اتصال..."
        );

    } catch (err) {
        console.error(
            "Accept call error:",
            err
        );

        showToast(
            "پاسخ به تماس ناموفق بود."
        );

        cleanupCall();
    }
}


// =========================
// Reject Call
// =========================

function rejectIncomingCall() {
    stopRingtone();

    const modal =
        $("incomingCallModal");

    if (modal) {
        modal.classList.add(
            "hidden"
        );
    }

    sendSignal({
        type: "call-rejected",
        to: currentCallUserId,
        from: getSavedUserId()
    });

    incomingOffer = null;
    currentCallUserId = null;
}


// =========================
// Answer
// =========================

async function receiveAnswer(data) {
    try {
        if (!peerConnection) {
            return;
        }

        await peerConnection
            .setRemoteDescription(
                new RTCSessionDescription(
                    data.answer
                )
            );

        setConnectionStatus(
            "متصل"
        );

    } catch (err) {
        console.error(
            "Answer error:",
            err
        );
    }
}


// =========================
// ICE
// =========================

async function receiveIceCandidate(
    data
) {
    try {
        if (
            !peerConnection ||
            !data.candidate
        ) {
            return;
        }

        await peerConnection
            .addIceCandidate(
                new RTCIceCandidate(
                    data.candidate
                )
            );

    } catch (err) {
        console.error(
            "ICE error:",
            err
        );
    }
}


// =========================
// Peer Connection
// =========================

function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
    }

    peerConnection =
        new RTCPeerConnection(
            ICE_SERVERS
        );

    if (localStream) {
        localStream
            .getTracks()
            .forEach(track => {
                peerConnection.addTrack(
                    track,
                    localStream
                );
            });
    }

    peerConnection.onicecandidate =
        event => {
            if (
                event.candidate &&
                currentCallUserId
            ) {
                sendSignal({
                    type:
                        "ice-candidate",
                    to:
                        currentCallUserId,
                    from:
                        getSavedUserId(),
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
                ?.getTracks()
                .forEach(track => {
                    remoteStream.addTrack(
                        track
                    );
                });

            const remoteVideo =
                $("remoteVideo");

            if (remoteVideo) {
                remoteVideo.srcObject =
                    remoteStream;

                remoteVideo
                    .classList
                    .remove("hidden");
            }

            const placeholder =
                $("remotePlaceholder");

            if (placeholder) {
                placeholder.classList.add(
                    "hidden"
                );
            }
        };

    peerConnection.onconnectionstatechange =
        () => {
            const state =
                peerConnection
                    .connectionState;

            console.log(
                "Connection state:",
                state
            );

            if (
                state === "connected"
            ) {
                setConnectionStatus(
                    "متصل"
                );
            }

            if (
                state === "connecting"
            ) {
                setConnectionStatus(
                    "در حال اتصال..."
                );
            }

            if (
                state === "disconnected" ||
                state === "failed"
            ) {
                setConnectionStatus(
                    "اتصال قطع شد"
                );
            }

            if (
                state === "closed"
            ) {
                setConnectionStatus(
                    "تماس پایان یافت"
                );
            }
        };
}


// =========================
// Call Interface
// =========================

async function prepareCallInterface(
    callType
) {
    const area =
        $("callArea");

    if (area) {
        area.classList.remove(
            "hidden"
        );
    }

    const constraints =
        callType === "audio"
            ? {
                audio: true,
                video: false
            }
            : {
                audio: true,
                video: true
            };

    localStream =
        await navigator.mediaDevices
            .getUserMedia(
                constraints
            );

    const localVideo =
        $("localVideo");

    if (localVideo) {
        localVideo.srcObject =
            localStream;

        localVideo.muted = true;

        if (
            callType === "audio"
        ) {
            localVideo.classList.add(
                "hidden"
            );
        } else {
            localVideo.classList.remove(
                "hidden"
            );
        }
    }
}

function setConnectionStatus(
    status
) {
    const element =
        $("connectionStatus");

    if (element) {
        element.textContent =
            status;
    }
}


// =========================
// Microphone
// =========================

function toggleMicrophone() {
    if (!localStream) return;

    const tracks =
        localStream.getAudioTracks();

    if (!tracks.length) return;

    const enabled =
        !tracks[0].enabled;

    tracks.forEach(track => {
        track.enabled =
            enabled;
    });

    const button =
        $("muteButton");

    if (button) {
        button.textContent =
            enabled
                ? "🎙️ میکروفون"
                : "🔇 میکروفون خاموش";
    }
}


// =========================
// Camera
// =========================

function toggleCamera() {
    if (!localStream) return;

    const tracks =
        localStream.getVideoTracks();

    if (!tracks.length) return;

    const enabled =
        !tracks[0].enabled;

    tracks.forEach(track => {
        track.enabled =
            enabled;
    });

    const button =
        $("cameraButton");

    if (button) {
        button.textContent =
            enabled
                ? "📷 دوربین"
                : "🚫 دوربین خاموش";
    }
}


// =========================
// Hangup
// =========================

function hangupCall() {
    if (currentCallUserId) {
        sendSignal({
            type: "hangup",
            to: currentCallUserId,
            from: getSavedUserId()
        });
    }

    cleanupCall();

    showToast(
        "تماس پایان یافت."
    );
}

function cleanupCall() {
    stopRingtone();

    if (peerConnection) {
        peerConnection.ontrack =
            null;

        peerConnection.onicecandidate =
            null;

        peerConnection.close();

        peerConnection = null;
    }

    if (localStream) {
        localStream
            .getTracks()
            .forEach(track => {
                track.stop();
            });

        localStream = null;
    }

    remoteStream = null;
    incomingOffer = null;
    currentCallUserId = null;
    currentCallType = null;

    const localVideo =
        $("localVideo");

    if (localVideo) {
        localVideo.srcObject =
            null;
    }

    const remoteVideo =
        $("remoteVideo");

    if (remoteVideo) {
        remoteVideo.srcObject =
            null;

        remoteVideo.classList.add(
            "hidden"
        );
    }

    const placeholder =
        $("remotePlaceholder");

    if (placeholder) {
        placeholder.classList.remove(
            "hidden"
        );
    }

    const area =
        $("callArea");

    if (area) {
        area.classList.add(
            "hidden"
        );
    }

    setConnectionStatus(
        "آماده تماس"
    );
}


// =========================
// Ringtone
// =========================

let ringtoneAudio = null;

function playRingtone() {
    stopRingtone();

    try {
        ringtoneAudio =
            new Audio(
                "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
            );

        ringtoneAudio.loop = true;

        ringtoneAudio
            .play()
            .catch(() => {});
    } catch {
        // ignore
    }
}

function stopRingtone() {
    if (ringtoneAudio) {
        ringtoneAudio.pause();
        ringtoneAudio.currentTime = 0;
        ringtoneAudio = null;
    }
}


// =========================
// Navigation
// =========================

function openPage(page) {
    window.location.href =
        page;
}

function logout() {
    if (socket) {
        try {
            socket.close();
        } catch {
            // ignore
        }

        socket = null;
    }

    cleanupCall();

    clearUser();

    showAuthScreen();

    const loginInput =
        $("loginIdentifier");

    if (loginInput) {
        loginInput.value = "";
    }

    showToast(
        "از حساب خارج شدید."
    );
}


// =========================
// Events
// =========================

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
            () => {
                $("loginPanel")
                    ?.classList
                    .add("hidden");

                $("registerPanel")
                    ?.classList
                    .remove("hidden");
            }
        );

    $("showLoginButton")
        ?.addEventListener(
            "click",
            () => {
                $("registerPanel")
                    ?.classList
                    .add("hidden");

                $("loginPanel")
                    ?.classList
                    .remove("hidden");
            }
        );

    $("searchUserButton")
        ?.addEventListener(
            "click",
            searchUser
        );

    $("refreshUsersButton")
        ?.addEventListener(
            "click",
            loadUsers
        );

    $("muteButton")
        ?.addEventListener(
            "click",
            toggleMicrophone
        );

    $("cameraButton")
        ?.addEventListener(
            "click",
            toggleCamera
        );

    $("hangupButton")
        ?.addEventListener(
            "click",
            hangupCall
        );

    $("acceptCallButton")
        ?.addEventListener(
            "click",
            acceptIncomingCall
        );

    $("rejectCallButton")
        ?.addEventListener(
            "click",
            rejectIncomingCall
        );

    $("contactsButton")
        ?.addEventListener(
            "click",
            () => openPage(
                "contacts.html"
            )
        );

    $("profileButton")
        ?.addEventListener(
            "click",
            () => openPage(
                "profile.html"
            )
        );

    $("settingsButton")
        ?.addEventListener(
            "click",
            () => openPage(
                "settings.html"
            )
        );

    $("logoutButton")
        ?.addEventListener(
            "click",
            logout
        );

    $("loginIdentifier")
        ?.addEventListener(
            "keydown",
            event => {
                if (
                    event.key ===
                    "Enter"
                ) {
                    login();
                }
            }
        );

    $("targetUserId")
        ?.addEventListener(
            "keydown",
            event => {
                if (
                    event.key ===
                    "Enter"
                ) {
                    searchUser();
                }
            }
        );

    $("registerUserId")
        ?.addEventListener(
            "keydown",
            event => {
                if (
                    event.key ===
                    "Enter"
                ) {
                    register();
                }
            }
        );
}


// =========================
// Initial load
// =========================

async function init() {
    setupEvents();

    if (
        window.NotificationManager
    ) {
        await window.NotificationManager
            .requestPermission()
            .catch(() => {});
    }

    const savedUserId =
        getSavedUserId();

    if (!savedUserId) {
        showAuthScreen();
        return;
    }

    try {
        showMainScreen();

        await loadCurrentUser();

        await loadUsers();

        connectWebSocket();

    } catch (err) {
        console.error(
            "Initial load error:",
            err
        );

        showAuthScreen();
    }
}

document.addEventListener(
    "DOMContentLoaded",
    init
);