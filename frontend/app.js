const API_URL = "http://127.0.0.1:8000";

let currentUser = null;
let socket = null;

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let currentCall = null;
let incomingCall = null;

let microphoneEnabled = true;
let cameraEnabled = true;

const usersCache = new Map();

const RTC_CONFIG = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun1.l.google.com:19302"
        }
    ]
};

const $ = (id) => document.getElementById(id);

function showToast(message, type = "info") {
    const toast = $("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove("hidden");

    setTimeout(() => {
        toast.classList.add("hidden");
    }, 3000);
}

function getSavedUserId() {
    const value =
        localStorage.getItem("videoCallUserId");

    if (
        !value ||
        value === "undefined" ||
        value === "null"
    ) {
        return null;
    }

    return value;
}

function saveUser(user) {
    if (!user) {
        return;
    }

    currentUser = user;

    const userId =
        user.user_id ||
        user.id;

    if (userId) {
        localStorage.setItem(
            "videoCallUserId",
            userId
        );
    }

    localStorage.setItem(
        "videoCallUser",
        JSON.stringify(user)
    );
}

function getSavedUser() {
    try {
        const data =
            localStorage.getItem(
                "videoCallUser"
            );

        if (!data) {
            return null;
        }

        return JSON.parse(data);
    } catch {
        return null;
    }
}

function getUserId(user = currentUser) {
    if (!user) {
        return null;
    }

    return (
        user.user_id ||
        user.id ||
        null
    );
}

function getUserName(user) {
    if (!user) {
        return "کاربر";
    }

    return (
        user.display_name ||
        user.user_id ||
        user.phone ||
        "کاربر"
    );
}

function getUserAvatar(user) {
    if (
        user &&
        user.avatar
    ) {
        return user.avatar;
    }

    return "";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function apiFetch(
    path,
    options = {}
) {
    const response =
        await fetch(
            `${API_URL}${path}`,
            {
                ...options,
                headers: {
                    "Content-Type":
                        "application/json",
                    ...(options.headers || {})
                }
            }
        );

    let data = {};

    try {
        data =
            await response.json();
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


/* =========================
   AUTH
========================= */

async function registerUser() {
    const userId =
        $("registerUserId")?.value
            .trim();

    const phone =
        $("registerPhone")?.value
            .trim();

    const displayName =
        $("registerName")?.value
            .trim();

    const errorBox =
        $("registerError");

    if (!userId) {
        if (errorBox) {
            errorBox.textContent =
                "شناسه را وارد کنید.";
        }

        return;
    }

    if (!phone) {
        if (errorBox) {
            errorBox.textContent =
                "شماره موبایل را وارد کنید.";
        }

        return;
    }

    if (!displayName) {
        if (errorBox) {
            errorBox.textContent =
                "نام نمایشی را وارد کنید.";
        }

        return;
    }

    try {
        if (errorBox) {
            errorBox.textContent =
                "در حال ثبت‌نام...";
        }

        const data =
            await apiFetch(
                "/api/register",
                {
                    method: "POST",
                    body: JSON.stringify({
                        user_id: userId,
                        phone,
                        display_name:
                            displayName
                    })
                }
            );

        const user =
            data.user || data;

        saveUser(user);

        if (errorBox) {
            errorBox.textContent = "";
        }

        showToast(
            "ثبت‌نام با موفقیت انجام شد.",
            "success"
        );

        showMainApp();

    } catch (error) {
        if (errorBox) {
            errorBox.textContent =
                error.message;
        }
    }
}

async function loginUser() {
    const identifier =
        $("loginIdentifier")?.value
            .trim();

    const errorBox =
        $("loginError");

    if (!identifier) {
        if (errorBox) {
            errorBox.textContent =
                "شناسه یا شماره موبایل را وارد کنید.";
        }

        return;
    }

    try {
        if (errorBox) {
            errorBox.textContent =
                "در حال ورود...";
        }

        const data =
            await apiFetch(
                `/api/users/${encodeURIComponent(
                    identifier
                )}`
            );

        const user =
            data.user || data;

        if (!user) {
            throw new Error(
                "کاربر پیدا نشد."
            );
        }

        saveUser(user);

        if (errorBox) {
            errorBox.textContent = "";
        }

        showToast(
            "با موفقیت وارد شدید.",
            "success"
        );

        showMainApp();

    } catch (error) {
        if (errorBox) {
            errorBox.textContent =
                error.message ||
                "ورود ناموفق بود.";
        }
    }
}

function logoutUser() {
    closeSocket();

    cleanupCall();

    localStorage.removeItem(
        "videoCallUserId"
    );

    localStorage.removeItem(
        "videoCallUser"
    );

    localStorage.removeItem(
        "videoCallTargetUser"
    );

    localStorage.removeItem(
        "videoCallTargetType"
    );

    currentUser = null;

    showAuth();
}

function showAuth() {
    const auth =
        $("authContainer");

    const main =
        $("mainApp");

    if (auth) {
        auth.classList.remove(
            "hidden"
        );
    }

    if (main) {
        main.classList.add(
            "hidden"
        );
    }
}

function showMainApp() {
    const auth =
        $("authContainer");

    const main =
        $("mainApp");

    if (auth) {
        auth.classList.add(
            "hidden"
        );
    }

    if (main) {
        main.classList.remove(
            "hidden"
        );
    }

    renderCurrentUser();

    connectSocket();

    loadUsers();

    checkPendingCall();
}


/* =========================
   CURRENT USER
========================= */

function renderCurrentUser() {
    if (!currentUser) {
        return;
    }

    const name =
        getUserName(currentUser);

    const userId =
        getUserId(currentUser);

    const avatar =
        getUserAvatar(currentUser);

    if ($("myDisplayName")) {
        $("myDisplayName").textContent =
            name;
    }

    if ($("myUserId")) {
        $("myUserId").textContent =
            userId || "";
    }

    if ($("myAvatar")) {
        if (avatar) {
            $("myAvatar").src =
                avatar;
        } else {
            $("myAvatar").removeAttribute(
                "src"
            );
        }
    }

    if ($("onlineStatus")) {
        $("onlineStatus").textContent =
            "آنلاین";
    }
}


/* =========================
   USERS
========================= */

async function loadUsers() {
    try {
        const data =
            await apiFetch(
                "/api/users"
            );

        const users =
            Array.isArray(data)
                ? data
                : data.users || [];

        usersCache.clear();

        for (const user of users) {
            const id =
                getUserId(user);

            if (
                id &&
                id !== getUserId()
            ) {
                usersCache.set(
                    id,
                    user
                );
            }
        }

        renderUsers(users);

    } catch (error) {
        console.error(
            "loadUsers:",
            error
        );
    }
}

function updateCachedUser(user) {
    if (!user) {
        return;
    }

    const id =
        getUserId(user);

    if (!id) {
        return;
    }

    usersCache.set(
        id,
        {
            ...(usersCache.get(id) || {}),
            ...user
        }
    );
}

function renderUsers(users) {
    const container =
        $("usersList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const filtered =
        users.filter(
            user =>
                getUserId(user) !==
                getUserId()
        );

    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state">
                کاربر دیگری پیدا نشد.
            </div>
        `;

        return;
    }

    for (const user of filtered) {
        updateCachedUser(user);

        const id =
            getUserId(user);

        const name =
            getUserName(user);

        const avatar =
            getUserAvatar(user);

        const online =
            Boolean(user.online);

        const item =
            document.createElement(
                "div"
            );

        item.className =
            "user-item";

        item.innerHTML = `
            <div class="user-avatar">
                ${
                    avatar
                        ? `<img src="${escapeHtml(
                              avatar
                          )}" alt="">`
                        : "👤"
                }
            </div>

            <div class="user-info">
                <div class="user-name">
                    ${escapeHtml(name)}
                </div>

                <div class="user-id">
                    ${escapeHtml(id)}
                </div>

                <div class="user-status ${
                    online
                        ? "online"
                        : "offline"
                }">
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
                    class="audio-call-user"
                >
                    📞
                </button>

                <button
                    type="button"
                    class="video-call-user"
                >
                    📹
                </button>
            </div>
        `;

        item
            .querySelector(
                ".audio-call-user"
            )
            ?.addEventListener(
                "click",
                () => {
                    startCall(
                        id,
                        "audio"
                    );
                }
            );

        item
            .querySelector(
                ".video-call-user"
            )
            ?.addEventListener(
                "click",
                () => {
                    startCall(
                        id,
                        "video"
                    );
                }
            );

        container.appendChild(
            item
        );
    }
}


/* =========================
   SEARCH
========================= */

async function searchUser() {
    const identifier =
        $("targetUserId")?.value
            .trim();

    if (!identifier) {
        showToast(
            "شناسه یا شماره موبایل را وارد کنید."
        );

        return;
    }

    try {
        const data =
            await apiFetch(
                `/api/users/${encodeURIComponent(
                    identifier
                )}`
            );

        const user =
            data.user || data;

        if (!user) {
            throw new Error(
                "کاربر پیدا نشد."
            );
        }

        renderSearchResult(user);

    } catch (error) {
        const result =
            $("searchResult");

        if (result) {
            result.classList.remove(
                "hidden"
            );

            result.innerHTML = `
                <div class="search-error">
                    ${escapeHtml(
                        error.message ||
                            "کاربر پیدا نشد."
                    )}
                </div>
            `;
        }
    }
}

function renderSearchResult(user) {
    const result =
        $("searchResult");

    if (!result) {
        return;
    }

    result.classList.remove(
        "hidden"
    );

    updateCachedUser(user);

    if ($("searchUserAvatar")) {
        const avatar =
            getUserAvatar(user);

        if (avatar) {
            $("searchUserAvatar").src =
                avatar;
        } else {
            $("searchUserAvatar")
                .removeAttribute(
                    "src"
                );
        }
    }

    if ($("searchUserName")) {
        $("searchUserName").textContent =
            getUserName(user);
    }

    if ($("searchUserIdentifier")) {
        $("searchUserIdentifier").textContent =
            getUserId(user) || "";
    }

    if ($("searchUserPhone")) {
        $("searchUserPhone").textContent =
            user.phone || "";
    }

    const targetId =
        getUserId(user);

    $("searchAudioCallButton")
        ?.replaceWith(
            $("searchAudioCallButton")
                .cloneNode(true)
        );

    $("searchVideoCallButton")
        ?.replaceWith(
            $("searchVideoCallButton")
                .cloneNode(true)
        );

    $("searchAudioCallButton")
        ?.addEventListener(
            "click",
            () => {
                startCall(
                    targetId,
                    "audio"
                );
            }
        );

    $("searchVideoCallButton")
        ?.addEventListener(
            "click",
            () => {
                startCall(
                    targetId,
                    "video"
                );
            }
        );
}


/* =========================
   WEBSOCKET
========================= */

function connectSocket() {
    const userId =
        getUserId();

    if (!userId) {
        return;
    }

    closeSocket();

    const protocol =
        API_URL.startsWith(
            "https"
        )
            ? "wss"
            : "ws";

    const host =
        API_URL.replace(
            /^https?:\/\//,
            ""
        );

    socket =
        new WebSocket(
            `${protocol}://${host}/ws/${encodeURIComponent(
                userId
            )}`
        );

    socket.onopen = () => {
        console.log(
            "WebSocket connected"
        );

        if ($("onlineStatus")) {
            $("onlineStatus").textContent =
                "آنلاین";
        }
    };

    socket.onmessage = async (
        event
    ) => {
        try {
            const message =
                JSON.parse(
                    event.data
                );

            await handleSocketMessage(
                message
            );

        } catch (error) {
            console.error(
                "WebSocket message error:",
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
        console.log(
            "WebSocket disconnected"
        );

        if ($("onlineStatus")) {
            $("onlineStatus").textContent =
                "آفلاین";
        }
    };
}

function closeSocket() {
    if (socket) {
        try {
            socket.close();
        } catch {}

        socket = null;
    }
}

function sendSocket(message) {
    if (
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ) {
        showToast(
            "اتصال به سرور برقرار نیست.",
            "error"
        );

        return false;
    }

    socket.send(
        JSON.stringify(message)
    );

    return true;
}

async function handleSocketMessage(
    message
) {
    switch (message.type) {
        case "offer":
            await receiveOffer(
                message
            );
            break;

        case "answer":
            await receiveAnswer(
                message
            );
            break;

        case "ice-candidate":
            await receiveIceCandidate(
                message
            );
            break;

        case "call-rejected":
            handleCallRejected(
                message
            );
            break;

        case "hangup":
            handleRemoteHangup(
                message
            );
            break;

        case "profile_updated":
            handleProfileUpdated(
                message
            );
            break;

        case "online_status":
            handleOnlineStatus(
                message
            );
            break;

        case "ping":
            sendSocket({
                type: "pong"
            });
            break;

        default:
            console.log(
                "Unknown socket message:",
                message
            );
    }
}


/* =========================
   ONLINE STATUS
========================= */

function handleOnlineStatus(
    message
) {
    const userId =
        message.user_id ||
        message.target_user_id;

    if (!userId) {
        return;
    }

    const cached =
        usersCache.get(
            userId
        );

    if (cached) {
        cached.online =
            Boolean(
                message.online
            );

        updateCachedUser(
            cached
        );
    }

    const item =
        document.querySelector(
            `[data-user-id="${CSS.escape(
                userId
            )}"]`
        );

    if (item) {
        const status =
            item.querySelector(
                ".user-status"
            );

        if (status) {
            status.textContent =
                message.online
                    ? "آنلاین"
                    : "آفلاین";

            status.className =
                `user-status ${
                    message.online
                        ? "online"
                        : "offline"
                }`;
        }
    }
}

function handleProfileUpdated(
    message
) {
    const user =
        message.user;

    if (!user) {
        return;
    }

    updateCachedUser(user);

    if (
        getUserId(user) ===
        getUserId()
    ) {
        currentUser = {
            ...currentUser,
            ...user
        };

        saveUser(
            currentUser
        );

        renderCurrentUser();
    }

    loadUsers();
}


/* =========================
   WEBRTC
========================= */

async function createPeerConnection(
    targetUserId
) {
    if (peerConnection) {
        try {
            peerConnection.close();
        } catch {}
    }

    peerConnection =
        new RTCPeerConnection(
            RTC_CONFIG
        );

    remoteStream =
        new MediaStream();

    const remoteVideo =
        $("remoteVideo");

    if (remoteVideo) {
        remoteVideo.srcObject =
            remoteStream;
    }

    peerConnection.ontrack =
        event => {
            for (
                const track of event.streams[0]
                    ?.getTracks?.() || []
            ) {
                remoteStream.addTrack(
                    track
                );
            }

            if (remoteVideo) {
                remoteVideo.srcObject =
                    remoteStream;

                remoteVideo
                    .play()
                    .catch(() => {});
            }

            if ($("remotePlaceholder")) {
                $("remotePlaceholder")
                    .classList.add(
                        "hidden"
                    );
            }
        };

    peerConnection.onicecandidate =
        event => {
            if (
                event.candidate
            ) {
                sendSocket({
                    type:
                        "ice-candidate",
                    target_user_id:
                        targetUserId,
                    candidate:
                        event.candidate
                });
            }
        };

    peerConnection.onconnectionstatechange =
        () => {
            const state =
                peerConnection
                    ?.connectionState;

            updateConnectionStatus(
                state
            );

            if (
                state ===
                    "failed" ||
                state ===
                    "closed" ||
                state ===
                    "disconnected"
            ) {
                if (
                    currentCall
                ) {
                    setTimeout(
                        () => {
                            if (
                                currentCall &&
                                (
                                    peerConnection
                                        ?.connectionState ===
                                    "failed" ||
                                    peerConnection
                                        ?.connectionState ===
                                    "closed"
                                )
                            ) {
                                cleanupCall();
                            }
                        },
                        1500
                    );
                }
            }
        };

    if (localStream) {
        for (
            const track of localStream.getTracks()
        ) {
            peerConnection.addTrack(
                track,
                localStream
            );
        }
    }

    return peerConnection;
}

async function prepareCallInterface(
    type
) {
    const callArea =
        $("callArea");

    if (callArea) {
        callArea.classList.remove(
            "hidden"
        );
    }

    const video =
        $("localVideo");

    if (type === "video") {
        if (video) {
            video.classList.remove(
                "hidden"
            );
        }
    } else {
        if (video) {
            video.classList.add(
                "hidden"
            );
        }
    }

    if ($("connectionStatus")) {
        $("connectionStatus").textContent =
            "در حال اتصال...";
    }
}

async function getLocalMedia(
    type
) {
    if (localStream) {
        return localStream;
    }

    const constraints = {
        audio: true,
        video:
            type === "video"
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

        localVideo
            .play()
            .catch(() => {});
    }

    microphoneEnabled = true;
    cameraEnabled =
        type === "video";

    return localStream;
}

async function startCall(
    targetUserId,
    type = "video"
) {
    if (!targetUserId) {
        showToast(
            "کاربر مقصد مشخص نیست.",
            "error"
        );

        return;
    }

    if (
        targetUserId ===
        getUserId()
    ) {
        showToast(
            "نمی‌توانید با خودتان تماس بگیرید.",
            "error"
        );

        return;
    }

    if (
        currentCall
    ) {
        showToast(
            "در حال حاضر یک تماس فعال دارید.",
            "error"
        );

        return;
    }

    if (
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ) {
        connectSocket();

        showToast(
            "در حال اتصال به سرور..."
        );

        return;
    }

    try {
        await prepareCallInterface(
            type
        );

        await getLocalMedia(
            type
        );

        currentCall = {
            targetUserId,
            type,
            outgoing: true
        };

        await createPeerConnection(
            targetUserId
        );

        const offer =
            await peerConnection
                .createOffer();

        await peerConnection
            .setLocalDescription(
                offer
            );

        sendSocket({
            type: "offer",
            target_user_id:
                targetUserId,
            offer,
            call_type: type,
            caller_user_id:
                getUserId(),
            caller_name:
                getUserName(
                    currentUser
                ),
            caller_avatar:
                getUserAvatar(
                    currentUser
                )
        });

        updateConnectionStatus(
            "calling"
        );

        showToast(
            type === "video"
                ? "تماس تصویری در حال برقراری است..."
                : "تماس صوتی در حال برقراری است..."
        );

    } catch (error) {
        console.error(
            "startCall:",
            error
        );

        showToast(
            "امکان شروع تماس وجود ندارد.",
            "error"
        );

        cleanupCall();
    }
}


/* =========================
   INCOMING CALL
========================= */

async function receiveOffer(
    message
) {
    const callerId =
        message.caller_user_id ||
        message.from_user_id ||
        message.user_id;

    if (!callerId) {
        return;
    }

    if (
        currentCall
    ) {
        sendSocket({
            type:
                "call-rejected",
            target_user_id:
                callerId,
            reason:
                "busy"
        });

        return;
    }

    incomingCall = {
        callerUserId:
            callerId,
        callerName:
            message.caller_name ||
            callerId,
        callerAvatar:
            message.caller_avatar ||
            "",
        offer:
            message.offer,
        type:
            message.call_type ||
            "video"
    };

    showIncomingCall(
        incomingCall
    );

    if (
        window.NotificationManager
    ) {
        NotificationManager.show(
            "تماس ورودی",
            `${
                incomingCall.callerName
            } با شما تماس ${
                incomingCall.type ===
                "video"
                    ? "تصویری"
                    : "صوتی"
            } گرفته است.`,
            {
                iconEmoji:
                    incomingCall.type ===
                    "video"
                        ? "📹"
                        : "📞",
                requireInteraction:
                    true,
                duration:
                    10000,
                onclick:
                    () => {
                        focusIncomingCall();
                    }
            }
        );
    }

    playRingtone();
}

function showIncomingCall(
    call
) {
    const modal =
        $("incomingCallModal");

    if (!modal) {
        return;
    }

    if ($("incomingCaller")) {
        $("incomingCaller").textContent =
            call.callerName;
    }

    if ($("incomingCallerAvatar")) {
        if (call.callerAvatar) {
            $("incomingCallerAvatar")
                .src =
                call.callerAvatar;
        } else {
            $("incomingCallerAvatar")
                .removeAttribute(
                    "src"
                );
        }
    }

    modal.classList.remove(
        "hidden"
    );
}

function hideIncomingCall() {
    const modal =
        $("incomingCallModal");

    if (modal) {
        modal.classList.add(
            "hidden"
        );
    }

    stopRingtone();
}

function focusIncomingCall() {
    window.focus();

    const modal =
        $("incomingCallModal");

    if (
        modal &&
        !modal.classList.contains(
            "hidden"
        )
    ) {
        modal.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }
}

async function acceptIncomingCall() {
    if (!incomingCall) {
        return;
    }

    const call =
        incomingCall;

    incomingCall = null;

    hideIncomingCall();

    try {
        currentCall = {
            targetUserId:
                call.callerUserId,
            type:
                call.type,
            outgoing: false
        };

        await prepareCallInterface(
            call.type
        );

        await getLocalMedia(
            call.type
        );

        await createPeerConnection(
            call.callerUserId
        );

        await peerConnection
            .setRemoteDescription(
                new RTCSessionDescription(
                    call.offer
                )
            );

        const answer =
            await peerConnection
                .createAnswer();

        await peerConnection
            .setLocalDescription(
                answer
            );

        sendSocket({
            type: "answer",
            target_user_id:
                call.callerUserId,
            answer,
            receiver_user_id:
                getUserId()
        });

        updateConnectionStatus(
            "connected"
        );

        showToast(
            "تماس پاسخ داده شد.",
            "success"
        );

    } catch (error) {
        console.error(
            "acceptIncomingCall:",
            error
        );

        showToast(
            "پاسخ دادن به تماس ناموفق بود.",
            "error"
        );

        cleanupCall();
    }
}

function rejectIncomingCall() {
    if (!incomingCall) {
        return;
    }

    sendSocket({
        type:
            "call-rejected",
        target_user_id:
            incomingCall.callerUserId,
        reason:
            "rejected"
    });

    incomingCall = null;

    hideIncomingCall();

    showToast(
        "تماس رد شد."
    );
}

async function receiveAnswer(
    message
) {
    if (
        !peerConnection ||
        !message.answer
    ) {
        return;
    }

    try {
        await peerConnection
            .setRemoteDescription(
                new RTCSessionDescription(
                    message.answer
                )
            );

        updateConnectionStatus(
            "connected"
        );

        showToast(
            "تماس برقرار شد.",
            "success"
        );

    } catch (error) {
        console.error(
            "receiveAnswer:",
            error
        );
    }
}

async function receiveIceCandidate(
    message
) {
    if (
        !peerConnection ||
        !message.candidate
    ) {
        return;
    }

    try {
        await peerConnection
            .addIceCandidate(
                new RTCIceCandidate(
                    message.candidate
                )
            );
    } catch (error) {
        console.error(
            "ICE candidate error:",
            error
        );
    }
}

function handleCallRejected(
    message
) {
    stopRingtone();

    const reason =
        message.reason;

    if (reason === "busy") {
        showToast(
            "کاربر در حال مکالمه است.",
            "error"
        );
    } else {
        showToast(
            "تماس رد شد."
        );
    }

    cleanupCall();
}

function handleRemoteHangup() {
    stopRingtone();

    showToast(
        "تماس توسط طرف مقابل پایان یافت."
    );

    cleanupCall();
}

function hangupCall() {
    if (
        currentCall &&
        currentCall.targetUserId
    ) {
        sendSocket({
            type: "hangup",
            target_user_id:
                currentCall.targetUserId
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
        try {
            peerConnection.ontrack =
                null;

            peerConnection.onicecandidate =
                null;

            peerConnection.close();
        } catch {}
    }

    peerConnection = null;

    if (localStream) {
        for (
            const track of
            localStream.getTracks()
        ) {
            track.stop();
        }
    }

    localStream = null;
    remoteStream = null;
    currentCall = null;

    const localVideo =
        $("localVideo");

    const remoteVideo =
        $("remoteVideo");

    if (localVideo) {
        localVideo.srcObject =
            null;
    }

    if (remoteVideo) {
        remoteVideo.srcObject =
            null;
    }

    if ($("callArea")) {
        $("callArea").classList.add(
            "hidden"
        );
    }

    if ($("remotePlaceholder")) {
        $("remotePlaceholder")
            .classList.remove(
                "hidden"
            );
    }

    if ($("connectionStatus")) {
        $("connectionStatus")
            .textContent =
            "آماده تماس";
    }

    microphoneEnabled = true;
    cameraEnabled = true;
}


/* =========================
   CALL CONTROLS
========================= */

function toggleMicrophone() {
    if (!localStream) {
        return;
    }

    microphoneEnabled =
        !microphoneEnabled;

    for (
        const track of
        localStream.getAudioTracks()
    ) {
        track.enabled =
            microphoneEnabled;
    }

    const button =
        $("muteButton");

    if (button) {
        button.textContent =
            microphoneEnabled
                ? "🎙️"
                : "🔇";
    }
}

function toggleCamera() {
    if (!localStream) {
        return;
    }

    cameraEnabled =
        !cameraEnabled;

    for (
        const track of
        localStream.getVideoTracks()
    ) {
        track.enabled =
            cameraEnabled;
    }

    const button =
        $("cameraButton");

    if (button) {
        button.textContent =
            cameraEnabled
                ? "📹"
                : "🚫";
    }
}

function updateConnectionStatus(
    state
) {
    const element =
        $("connectionStatus");

    if (!element) {
        return;
    }

    const texts = {
        new:
            "در حال آماده‌سازی...",
        checking:
            "در حال اتصال...",
        connecting:
            "در حال اتصال...",
        connected:
            "متصل شد",
        completed:
            "متصل شد",
        disconnected:
            "اتصال ناپایدار است",
        failed:
            "اتصال ناموفق بود",
        closed:
            "تماس پایان یافت",
        calling:
            "در حال تماس..."
    };

    element.textContent =
        texts[state] ||
        state;
}


/* =========================
   RINGTONE
========================= */

let ringtoneAudio = null;

function playRingtone() {
    stopRingtone();

    ringtoneAudio =
        new Audio(
            "https://actions.google.com/sounds/v1/alarms/phone_alerts_and_rings.ogg"
        );

    ringtoneAudio.loop =
        true;

    ringtoneAudio.volume =
        0.7;

    ringtoneAudio
        .play()
        .catch(() => {
            console.log(
                "Browser blocked ringtone autoplay."
            );
        });
}

function stopRingtone() {
    if (ringtoneAudio) {
        try {
            ringtoneAudio.pause();

            ringtoneAudio.currentTime =
                0;
        } catch {}

        ringtoneAudio = null;
    }
}


/* =========================
   PENDING CALL
========================= */

function checkPendingCall() {
    const targetUser =
        localStorage.getItem(
            "videoCallTargetUser"
        );

    const targetType =
        localStorage.getItem(
            "videoCallTargetType"
        );

    if (
        !targetUser
    ) {
        return;
    }

    localStorage.removeItem(
        "videoCallTargetUser"
    );

    localStorage.removeItem(
        "videoCallTargetType"
    );

    setTimeout(() => {
        startCall(
            targetUser,
            targetType ||
                "video"
        );
    }, 500);
}


/* =========================
   NAVIGATION
========================= */

function goTo(path) {
    window.location.href =
        path;
}


/* =========================
   DOM EVENTS
========================= */

function setupEvents() {
    $("registerButton")
        ?.addEventListener(
            "click",
            registerUser
        );

    $("loginButton")
        ?.addEventListener(
            "click",
            loginUser
        );

    $("showRegisterButton")
        ?.addEventListener(
            "click",
            () => {
                $("loginPanel")
                    ?.classList.add(
                        "hidden"
                    );

                $("registerPanel")
                    ?.classList.remove(
                        "hidden"
                    );
            }
        );

    $("showLoginButton")
        ?.addEventListener(
            "click",
            () => {
                $("registerPanel")
                    ?.classList.add(
                        "hidden"
                    );

                $("loginPanel")
                    ?.classList.remove(
                        "hidden"
                    );
            }
        );

    $("logoutButton")
        ?.addEventListener(
            "click",
            logoutUser
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

    $("contactsButton")
        ?.addEventListener(
            "click",
            () => {
                goTo(
                    "contacts.html"
                );
            }
        );

    $("profileButton")
        ?.addEventListener(
            "click",
            () => {
                goTo(
                    "profile.html"
                );
            }
        );

    $("settingsButton")
        ?.addEventListener(
            "click",
            () => {
                goTo(
                    "settings.html"
                );
            }
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

    $("loginIdentifier")
        ?.addEventListener(
            "keydown",
            event => {
                if (
                    event.key ===
                    "Enter"
                ) {
                    loginUser();
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
                    registerUser();
                }
            }
        );
}


/* =========================
   INITIALIZE
========================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {
        setupEvents();

        const savedUser =
            getSavedUser();

        const savedUserId =
            getSavedUserId();

        if (
            savedUser &&
            savedUserId
        ) {
            currentUser =
                savedUser;

            showMainApp();
        } else {
            showAuth();
        }
    }
);