const API_URL = "https://videocallapp-api.onrender.com";

let currentUserId = null;
let currentUser = null;
let socket = null;

let usersCache = new Map();

let localStream = null;
let peerConnection = null;

let currentCallTarget = null;
let currentCallType = "video";

let pendingOffer = null;
let pendingCallerId = null;
let pendingCallerType = "video";

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


// =========================================================
// Helpers
// =========================================================

function $(id) {
    return document.getElementById(id);
}


function show(element) {
    if (!element) return;

    element.classList.remove("hidden");
}


function hide(element) {
    if (!element) return;

    element.classList.add("hidden");
}


function showToast(message) {
    const toast = $("toast");

    if (!toast) {
        alert(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}


function getStoredUserId() {
    const value = localStorage.getItem(
        "videoCallUserId"
    );

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
    if (!user || !user.user_id) {
        return;
    }

    currentUser = user;
    currentUserId = user.user_id;

    localStorage.setItem(
        "videoCallUserId",
        user.user_id
    );

    localStorage.setItem(
        "videoCallUser",
        JSON.stringify(user)
    );
}


function getSavedUser() {
    try {
        const value =
            localStorage.getItem(
                "videoCallUser"
            );

        if (!value) {
            return null;
        }

        return JSON.parse(value);

    } catch {
        return null;
    }
}


function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function getAvatar(user) {
    if (
        user &&
        user.avatar &&
        String(user.avatar).trim()
    ) {
        return user.avatar;
    }

    return "icon.svg";
}


// =========================================================
// Auth UI
// =========================================================

function showLoginPanel() {
    show($("loginPanel"));
    hide($("registerPanel"));
}


function showRegisterPanel() {
    hide($("loginPanel"));
    show($("registerPanel"));
}


function showAuthScreen() {
    show($("authContainer"));
    hide($("appContainer"));

    showLoginPanel();
}


function showMainScreen() {
    hide($("authContainer"));
    show($("appContainer"));
}


// =========================================================
// Login
// =========================================================

async function login() {
    const identifierInput =
        $("loginIdentifier");

    const errorElement =
        $("loginError");

    if (!identifierInput) {
        return;
    }

    const identifier =
        identifierInput.value.trim();

    if (!identifier) {
        if (errorElement) {
            errorElement.textContent =
                "شناسه یا شماره موبایل را وارد کنید";
        }

        return;
    }

    if (errorElement) {
        errorElement.textContent =
            "در حال ورود...";
    }

    try {
        const response = await fetch(
            `${API_URL}/api/users/${encodeURIComponent(identifier)}`
        );

        const data =
            await response.json().catch(
                () => ({})
            );

        if (!response.ok) {
            throw new Error(
                data.detail ||
                "کاربر پیدا نشد"
            );
        }

        const user =
            data.user || data;

        if (
            !user ||
            !user.user_id
        ) {
            throw new Error(
                "اطلاعات کاربر نامعتبر است"
            );
        }

        saveUser(user);

        if (errorElement) {
            errorElement.textContent = "";
        }

        showMainScreen();

        await loadCurrentUser();
        await loadUsers();
        connectWebSocket();

        showToast(
            "ورود موفق بود"
        );

    } catch (error) {

        console.error(
            "Login error:",
            error
        );

        if (errorElement) {
            errorElement.textContent =
                error.message ||
                "خطا در ورود";
        }
    }
}


// =========================================================
// Register
// =========================================================

async function register() {
    const userIdInput =
        $("registerUserId");

    const phoneInput =
        $("registerPhone");

    const nameInput =
        $("registerName");

    const errorElement =
        $("registerError");

    if (
        !userIdInput ||
        !phoneInput ||
        !nameInput
    ) {
        return;
    }

    const userId =
        userIdInput.value.trim();

    const phone =
        phoneInput.value.trim();

    const displayName =
        nameInput.value.trim();

    if (!userId) {
        if (errorElement) {
            errorElement.textContent =
                "شناسه را وارد کنید";
        }

        return;
    }

    if (!phone) {
        if (errorElement) {
            errorElement.textContent =
                "شماره موبایل را وارد کنید";
        }

        return;
    }

    if (!displayName) {
        if (errorElement) {
            errorElement.textContent =
                "نام را وارد کنید";
        }

        return;
    }

    if (errorElement) {
        errorElement.textContent =
            "در حال ثبت‌نام...";
    }

    try {
        const response = await fetch(
            `${API_URL}/api/register`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    user_id: userId,
                    phone: phone,
                    display_name:
                        displayName
                })
            }
        );

        const data =
            await response.json().catch(
                () => ({})
            );

        if (!response.ok) {
            throw new Error(
                data.detail ||
                "ثبت‌نام ناموفق بود"
            );
        }

        const user =
            data.user || data;

        if (
            !user ||
            !user.user_id
        ) {
            throw new Error(
                "اطلاعات ثبت‌نام نامعتبر است"
            );
        }

        saveUser(user);

        if (errorElement) {
            errorElement.textContent = "";
        }

        showMainScreen();

        await loadCurrentUser();
        await loadUsers();
        connectWebSocket();

        showToast(
            "ثبت‌نام و ورود موفق بود"
        );

    } catch (error) {

        console.error(
            "Register error:",
            error
        );

        if (errorElement) {
            errorElement.textContent =
                error.message ||
                "خطا در ثبت‌نام";
        }
    }
}


// =========================================================
// Current User
// =========================================================

async function loadCurrentUser() {
    if (!currentUserId) {
        return;
    }

    try {
        const response = await fetch(
            `${API_URL}/api/profile/${encodeURIComponent(currentUserId)}`
        );

        const data =
            await response.json().catch(
                () => ({})
            );

        if (!response.ok) {
            throw new Error(
                data.detail ||
                "خطا در دریافت پروفایل"
            );
        }

        const user =
            data.user || data;

        if (
            user &&
            user.user_id
        ) {
            saveUser(user);
            updateMyProfileUI(user);
        }

    } catch (error) {

        console.error(
            "Profile error:",
            error
        );

        const savedUser =
            getSavedUser();

        if (savedUser) {
            currentUser =
                savedUser;

            updateMyProfileUI(
                savedUser
            );
        }
    }
}


function updateMyProfileUI(user) {
    if (!user) {
        return;
    }

    const nameElement =
        $("myDisplayName");

    const idElement =
        $("myUserId");

    const avatarElement =
        $("myAvatar");

    const statusElement =
        $("onlineStatus");

    if (nameElement) {
        nameElement.textContent =
            user.display_name ||
            user.user_id;
    }

    if (idElement) {
        idElement.textContent =
            user.user_id || "";
    }

    if (avatarElement) {
        avatarElement.src =
            getAvatar(user);
    }

    if (statusElement) {
        statusElement.textContent =
            "آنلاین";
    }
}


// =========================================================
// Users
// =========================================================

async function loadUsers() {
    try {
        const response = await fetch(
            `${API_URL}/api/users`
        );

        const data =
            await response.json().catch(
                () => ({})
            );

        if (!response.ok) {
            throw new Error(
                data.detail ||
                "خطا در دریافت کاربران"
            );
        }

        const users =
            Array.isArray(data.users)
                ? data.users
                : [];

        usersCache.clear();

        users.forEach(user => {
            if (
                user &&
                user.user_id
            ) {
                usersCache.set(
                    user.user_id,
                    user
                );
            }
        });

        renderUsers(users);

    } catch (error) {

        console.error(
            "Users error:",
            error
        );

        showToast(
            "دریافت کاربران ناموفق بود"
        );
    }
}


function renderUsers(users) {
    const container =
        $("usersList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const filteredUsers =
        users.filter(user =>
            user.user_id !==
            currentUserId
        );

    if (
        filteredUsers.length === 0
    ) {
        container.innerHTML = `
            <div class="empty-state">
                کاربر دیگری وجود ندارد
            </div>
        `;

        return;
    }

    filteredUsers.forEach(user => {

        const card =
            document.createElement(
                "div"
            );

        card.className =
            "user-card";

        const onlineClass =
            user.online
                ? "online"
                : "offline";

        const onlineText =
            user.online
                ? "آنلاین"
                : "آفلاین";

        card.innerHTML = `
            <img
                class="user-avatar"
                src="${escapeHtml(
                    getAvatar(user)
                )}"
                alt=""
            >

            <div class="user-info">
                <div class="user-name">
                    ${escapeHtml(
                        user.display_name ||
                        user.user_id
                    )}
                </div>

                <div class="user-id">
                    @${escapeHtml(
                        user.user_id
                    )}
                </div>

                <div class="user-status ${onlineClass}">
                    ${onlineText}
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
                    🎥
                </button>
            </div>
        `;

        const audioButton =
            card.querySelector(
                ".audio-call-user"
            );

        const videoButton =
            card.querySelector(
                ".video-call-user"
            );

        audioButton?.addEventListener(
            "click",
            () => {
                startCall(
                    user.user_id,
                    "audio"
                );
            }
        );

        videoButton?.addEventListener(
            "click",
            () => {
                startCall(
                    user.user_id,
                    "video"
                );
            }
        );

        container.appendChild(
            card
        );
    });
}


// =========================================================
// Search User
// =========================================================

async function searchUser() {
    const input =
        $("targetUserId");

    const result =
        $("searchResult");

    if (!input || !result) {
        return;
    }

    const identifier =
        input.value.trim();

    if (!identifier) {
        showToast(
            "شناسه یا شماره موبایل را وارد کنید"
        );

        return;
    }

    try {
        const response = await fetch(
            `${API_URL}/api/users/${encodeURIComponent(identifier)}`
        );

        const data =
            await response.json().catch(
                () => ({})
            );

        if (!response.ok) {
            throw new Error(
                data.detail ||
                "کاربر پیدا نشد"
            );
        }

        const user =
            data.user || data;

        if (
            !user ||
            !user.user_id
        ) {
            throw new Error(
                "کاربر پیدا نشد"
            );
        }

        usersCache.set(
            user.user_id,
            user
        );

        show(result);

        const avatar =
            $("searchUserAvatar");

        const name =
            $("searchUserName");

        const id =
            $("searchUserIdentifier");

        const phone =
            $("searchUserPhone");

        if (avatar) {
            avatar.src =
                getAvatar(user);
        }

        if (name) {
            name.textContent =
                user.display_name ||
                user.user_id;
        }

        if (id) {
            id.textContent =
                `@${user.user_id}`;
        }

        if (phone) {
            phone.textContent =
                user.phone || "";
        }

        const audioButton =
            $("searchAudioCallButton");

        const videoButton =
            $("searchVideoCallButton");

        if (audioButton) {
            audioButton.onclick =
                () => {
                    startCall(
                        user.user_id,
                        "audio"
                    );
                };
        }

        if (videoButton) {
            videoButton.onclick =
                () => {
                    startCall(
                        user.user_id,
                        "video"
                    );
                };
        }

    } catch (error) {

        console.error(
            "Search error:",
            error
        );

        hide(result);

        showToast(
            error.message ||
            "کاربر پیدا نشد"
        );
    }
}


// =========================================================
// WebSocket
// =========================================================

function connectWebSocket() {
    if (!currentUserId) {
        return;
    }

    if (
        socket &&
        socket.readyState ===
            WebSocket.OPEN
    ) {
        return;
    }

    if (
        socket &&
        socket.readyState ===
            WebSocket.CONNECTING
    ) {
        return;
    }

    const protocol =
        API_URL.startsWith(
            "https://"
        )
            ? "wss:"
            : "ws:";

    const host =
        API_URL
            .replace(
                /^https?:\/\//,
                ""
            )
            .replace(
                /\/$/,
                ""
            );

    const wsUrl =
        `${protocol}//${host}/ws/${encodeURIComponent(currentUserId)}`;

    try {
        socket =
            new WebSocket(wsUrl);

        socket.onopen = () => {

            updateConnectionStatus(
                true
            );

            if (
                $("onlineStatus")
            ) {
                $("onlineStatus").textContent =
                    "آنلاین";
            }
        };

        socket.onmessage =
            async event => {

                try {
                    const data =
                        JSON.parse(
                            event.data
                        );

                    await handleSocketMessage(
                        data
                    );

                } catch (error) {

                    console.error(
                        "WebSocket message error:",
                        error
                    );
                }
            };

        socket.onclose = () => {

            updateConnectionStatus(
                false
            );

            if (
                $("onlineStatus")
            ) {
                $("onlineStatus").textContent =
                    "آفلاین";
            }

            setTimeout(() => {

                if (
                    currentUserId
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

    } catch (error) {

        console.error(
            "WebSocket connection error:",
            error
        );
    }
}


function updateConnectionStatus(
    connected
) {
    const element =
        $("connectionStatus");

    if (!element) {
        return;
    }

    element.textContent =
        connected
            ? "متصل"
            : "در حال اتصال...";

    element.classList.toggle(
        "connected",
        connected
    );
}


// =========================================================
// WebSocket Messages
// =========================================================

async function handleSocketMessage(
    data
) {
    switch (data.type) {

        case "pong":
            return;

        case "online_status":
            handleOnlineStatus(
                data
            );
            return;

        case "profile_updated":
            handleProfileUpdated(
                data
            );
            return;

        case "offer":
            await receiveOffer(
                data
            );
            return;

        case "answer":
            await receiveAnswer(
                data
            );
            return;

        case "ice-candidate":
            await receiveIceCandidate(
                data
            );
            return;

        case "call-rejected":
            handleCallRejected(
                data
            );
            return;

        case "hangup":
            handleRemoteHangup(
                data
            );
            return;
    }
}


function sendSocketMessage(
    message
) {
    if (
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ) {
        showToast(
            "اتصال برقرار نیست"
        );

        return false;
    }

    socket.send(
        JSON.stringify(message)
    );

    return true;
}


// =========================================================
// Online Status
// =========================================================

function handleOnlineStatus(data) {
    if (
        !data.user_id
    ) {
        return;
    }

    const user =
        usersCache.get(
            data.user_id
        );

    if (user) {
        user.online =
            Boolean(
                data.online
            );
    }

    const users =
        Array.from(
            usersCache.values()
        );

    renderUsers(users);
}


function handleProfileUpdated(data) {
    const user =
        data.user;

    if (
        !user ||
        !user.user_id
    ) {
        return;
    }

    usersCache.set(
        user.user_id,
        user
    );

    if (
        user.user_id ===
        currentUserId
    ) {
        saveUser(user);
        updateMyProfileUI(
            user
        );
    }

    renderUsers(
        Array.from(
            usersCache.values()
        )
    );
}


// =========================================================
// Start Call
// =========================================================

async function startCall(
    targetUserId,
    type = "video"
) {
    if (!targetUserId) {
        return;
    }

    if (
        targetUserId ===
        currentUserId
    ) {
        showToast(
            "نمی‌توانید با خودتان تماس بگیرید"
        );

        return;
    }

    currentCallTarget =
        targetUserId;

    currentCallType =
        type;

    try {

        prepareCallInterface(
            targetUserId,
            type
        );

        await prepareLocalMedia(
            type
        );

        await createPeerConnection(
            targetUserId
        );

        const offer =
            await peerConnection.createOffer();

        await peerConnection.setLocalDescription(
            offer
        );

        const sent =
            sendSocketMessage({
                type: "offer",
                target_user_id:
                    targetUserId,
                offer: offer,
                call_type: type
            });

        if (!sent) {
            cleanupCall();
            return;
        }

        updateCallStatus(
            "در حال برقراری تماس..."
        );

    } catch (error) {

        console.error(
            "Start call error:",
            error
        );

        showToast(
            "شروع تماس ناموفق بود"
        );

        cleanupCall();
    }
}


// =========================================================
// Prepare Media
// =========================================================

async function prepareLocalMedia(
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
        await navigator.mediaDevices.getUserMedia(
            constraints
        );

    const localVideo =
        $("localVideo");

    if (localVideo) {
        localVideo.srcObject =
            localStream;
    }

    return localStream;
}


// =========================================================
// Peer Connection
// =========================================================

async function createPeerConnection(
    targetUserId
) {
    if (peerConnection) {
        try {
            peerConnection.close();
        } catch {
        }
    }

    peerConnection =
        new RTCPeerConnection(
            ICE_SERVERS
        );

    currentCallTarget =
        targetUserId;

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
                !event.candidate
            ) {
                return;
            }

            sendSocketMessage({
                type: "ice-candidate",
                target_user_id:
                    currentCallTarget,
                candidate:
                    event.candidate
            });
        };

    peerConnection.ontrack =
        event => {

            const remoteVideo =
                $("remoteVideo");

            if (
                remoteVideo &&
                event.streams &&
                event.streams[0]
            ) {
                remoteVideo.srcObject =
                    event.streams[0];

                show(
                    remoteVideo
                );

                hide(
                    $("remotePlaceholder")
                );
            }
        };

    peerConnection.onconnectionstatechange =
        () => {

            const state =
                peerConnection
                    ?.connectionState;

            if (
                state ===
                "connected"
            ) {
                updateCallStatus(
                    "تماس برقرار است"
                );
            }

            if (
                state ===
                "failed"
            ) {
                updateCallStatus(
                    "اتصال تماس ناموفق بود"
                );
            }

            if (
                state ===
                "disconnected"
            ) {
                updateCallStatus(
                    "اتصال قطع شد"
                );
            }
        };

    return peerConnection;
}


// =========================================================
// Receive Offer
// =========================================================

async function receiveOffer(
    data
) {
    pendingOffer =
        data.offer;

    pendingCallerId =
        data.from_user_id;

    pendingCallerType =
        data.call_type ||
        "video";

    const caller =
        usersCache.get(
            pendingCallerId
        );

    const callerName =
        caller?.display_name ||
        pendingCallerId;

    const callerAvatar =
        caller?.avatar ||
        "icon.svg";

    const modal =
        $("incomingCallModal");

    const callerElement =
        $("incomingCaller");

    const avatarElement =
        $("incomingCallerAvatar");

    if (callerElement) {
        callerElement.textContent =
            callerName;
    }

    if (avatarElement) {
        avatarElement.src =
            callerAvatar;
    }

    show(modal);

    try {

        if (
            window.NotificationManager
        ) {
            await NotificationManager.show(
                "تماس ورودی",
                `${callerName} با شما تماس می‌گیرد`,
                {
                    iconEmoji:
                        pendingCallerType ===
                        "video"
                            ? "📹"
                            : "📞",
                    requireInteraction:
                        true,
                    duration:
                        10000,
                    onclick:
                        () => {
                            show(
                                $("incomingCallModal")
                            );
                        }
                }
            );
        }

    } catch (error) {
        console.error(
            "Notification error:",
            error
        );
    }

    playRingtone();
}


// =========================================================
// Accept Incoming Call
// =========================================================

async function acceptIncomingCall() {
    if (
        !pendingOffer ||
        !pendingCallerId
    ) {
        return;
    }

    stopRingtone();

    hide(
        $("incomingCallModal")
    );

    currentCallTarget =
        pendingCallerId;

    currentCallType =
        pendingCallerType;

    try {

        prepareCallInterface(
            pendingCallerId,
            pendingCallerType
        );

        await prepareLocalMedia(
            pendingCallerType
        );

        await createPeerConnection(
            pendingCallerId
        );

        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
                pendingOffer
            )
        );

        const answer =
            await peerConnection.createAnswer();

        await peerConnection.setLocalDescription(
            answer
        );

        sendSocketMessage({
            type: "answer",
            target_user_id:
                pendingCallerId,
            answer: answer
        });

        updateCallStatus(
            "تماس برقرار شد"
        );

        pendingOffer = null;
        pendingCallerId = null;

    } catch (error) {

        console.error(
            "Accept call error:",
            error
        );

        showToast(
            "پاسخ به تماس ناموفق بود"
        );

        cleanupCall();
    }
}


// =========================================================
// Reject Incoming Call
// =========================================================

function rejectIncomingCall() {
    stopRingtone();

    if (
        pendingCallerId
    ) {
        sendSocketMessage({
            type: "call-rejected",
            target_user_id:
                pendingCallerId
        });
    }

    pendingOffer = null;
    pendingCallerId = null;

    hide(
        $("incomingCallModal")
    );
}


// =========================================================
// Receive Answer
// =========================================================

async function receiveAnswer(
    data
) {
    if (
        !peerConnection ||
        !data.answer
    ) {
        return;
    }

    try {

        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
                data.answer
            )
        );

        updateCallStatus(
            "در حال اتصال..."
        );

    } catch (error) {

        console.error(
            "Answer error:",
            error
        );
    }
}


// =========================================================
// ICE Candidate
// =========================================================

async function receiveIceCandidate(
    data
) {
    if (
        !peerConnection ||
        !data.candidate
    ) {
        return;
    }

    try {

        await peerConnection.addIceCandidate(
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
}


// =========================================================
// Call Rejected
// =========================================================

function handleCallRejected() {
    stopRingtone();

    showToast(
        "تماس رد شد"
    );

    cleanupCall();
}


// =========================================================
// Remote Hangup
// =========================================================

function handleRemoteHangup() {
    stopRingtone();

    showToast(
        "تماس توسط طرف مقابل پایان یافت"
    );

    cleanupCall();
}


// =========================================================
// Call Interface
// =========================================================

function prepareCallInterface(
    targetUserId,
    type
) {
    show(
        $("callArea")
    );

    const user =
        usersCache.get(
            targetUserId
        );

    const name =
        user?.display_name ||
        targetUserId;

    updateCallStatus(
        `تماس با ${name}...`
    );

    const remoteVideo =
        $("remoteVideo");

    const localVideo =
        $("localVideo");

    if (type === "audio") {

        if (remoteVideo) {
            hide(
                remoteVideo
            );
        }

        if (localVideo) {
            hide(
                localVideo
            );
        }

    } else {

        if (remoteVideo) {
            show(
                remoteVideo
            );
        }

        if (localVideo) {
            show(
                localVideo
            );
        }
    }
}


function updateCallStatus(
    message
) {
    const element =
        $("connectionStatus");

    if (element) {
        element.textContent =
            message;
    }
}


// =========================================================
// Microphone
// =========================================================

function toggleMicrophone() {
    if (!localStream) {
        return;
    }

    const tracks =
        localStream.getAudioTracks();

    if (
        tracks.length === 0
    ) {
        return;
    }

    const enabled =
        !tracks[0].enabled;

    tracks.forEach(
        track => {
            track.enabled =
                enabled;
        }
    );

    const button =
        $("muteButton");

    if (button) {
        button.textContent =
            enabled
                ? "🎤"
                : "🔇";
    }
}


// =========================================================
// Camera
// =========================================================

function toggleCamera() {
    if (!localStream) {
        return;
    }

    const tracks =
        localStream.getVideoTracks();

    if (
        tracks.length === 0
    ) {
        return;
    }

    const enabled =
        !tracks[0].enabled;

    tracks.forEach(
        track => {
            track.enabled =
                enabled;
        }
    );

    const button =
        $("cameraButton");

    if (button) {
        button.textContent =
            enabled
                ? "📹"
                : "🚫";
    }
}


// =========================================================
// Hangup
// =========================================================

function hangupCall() {
    if (
        currentCallTarget
    ) {
        sendSocketMessage({
            type: "hangup",
            target_user_id:
                currentCallTarget
        });
    }

    cleanupCall();
}


function cleanupCall() {
    stopRingtone();

    if (localStream) {

        localStream
            .getTracks()
            .forEach(
                track => {
                    track.stop();
                }
            );

        localStream = null;
    }

    if (peerConnection) {

        try {
            peerConnection.close();
        } catch {
        }

        peerConnection = null;
    }

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
    }

    currentCallTarget =
        null;

    pendingOffer =
        null;

    pendingCallerId =
        null;

    hide(
        $("callArea")
    );

    show(
        $("remotePlaceholder")
    );

    updateCallStatus(
        "آماده تماس"
    );
}


// =========================================================
// Ringtone
// =========================================================

let ringtoneAudio = null;

function playRingtone() {
    try {

        stopRingtone();

        ringtoneAudio =
            new Audio(
                "https://actions.google.com/sounds/v1/alarms/phone_alerts_and_rings.ogg"
            );

        ringtoneAudio.loop =
            true;

        ringtoneAudio.play().catch(
            () => {}
        );

    } catch {
    }
}


function stopRingtone() {
    if (!ringtoneAudio) {
        return;
    }

    try {
        ringtoneAudio.pause();
        ringtoneAudio.currentTime =
            0;
    } catch {
    }

    ringtoneAudio = null;
}


// =========================================================
// Logout
// =========================================================

function logout() {
    try {

        if (socket) {
            socket.close();
        }

    } catch {
    }

    cleanupCall();

    currentUserId = null;
    currentUser = null;

    usersCache.clear();

    localStorage.removeItem(
        "videoCallUserId"
    );

    localStorage.removeItem(
        "videoCallUser"
    );

    showAuthScreen();

    showToast(
        "از حساب خارج شدید"
    );
}


// =========================================================
// Navigation
// =========================================================

function openProfile() {
    if (!currentUserId) {
        return;
    }

    localStorage.setItem(
        "videoCallUserId",
        currentUserId
    );

    window.location.href =
        "profile.html";
}


function openSettings() {
    if (!currentUserId) {
        return;
    }

    localStorage.setItem(
        "videoCallUserId",
        currentUserId
    );

    window.location.href =
        "settings.html";
}


function openContacts() {
    if (!currentUserId) {
        return;
    }

    localStorage.setItem(
        "videoCallUserId",
        currentUserId
    );

    window.location.href =
        "contacts.html";
}


// =========================================================
// Auto Login
// =========================================================

async function autoLogin() {
    const savedId =
        getStoredUserId();

    if (!savedId) {
        showAuthScreen();
        return;
    }

    currentUserId =
        savedId;

    currentUser =
        getSavedUser();

    // مهم:
    // صفحه اصلی را بلافاصله نمایش می‌دهیم
    // تا بعد از ورود سفید/خالی نماند.
    showMainScreen();

    try {

        await loadCurrentUser();
        await loadUsers();

        connectWebSocket();

    } catch (error) {

        console.error(
            "Auto login error:",
            error
        );

        // اگر کاربر دیگر وجود نداشت
        // دوباره صفحه ورود نمایش داده شود.
        if (
            !currentUser
        ) {
            localStorage.removeItem(
                "videoCallUserId"
            );

            localStorage.removeItem(
                "videoCallUser"
            );

            currentUserId =
                null;

            showAuthScreen();
        }
    }
}


// =========================================================
// Events
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        // Login
        $("loginButton")?.addEventListener(
            "click",
            login
        );

        $("loginIdentifier")?.addEventListener(
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


        // Register
        $("registerButton")?.addEventListener(
            "click",
            register
        );

        $("registerUserId")?.addEventListener(
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

        $("registerPhone")?.addEventListener(
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

        $("registerName")?.addEventListener(
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


        // Auth navigation
        $("showRegisterButton")?.addEventListener(
            "click",
            showRegisterPanel
        );

        $("showLoginButton")?.addEventListener(
            "click",
            showLoginPanel
        );


        // Search
        $("searchUserButton")?.addEventListener(
            "click",
            searchUser
        );

        $("targetUserId")?.addEventListener(
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


        // Refresh
        $("refreshUsersButton")?.addEventListener(
            "click",
            loadUsers
        );


        // Navigation
        $("profileButton")?.addEventListener(
            "click",
            openProfile
        );

        $("settingsButton")?.addEventListener(
            "click",
            openSettings
        );

        $("contactsButton")?.addEventListener(
            "click",
            openContacts
        );

        $("logoutButton")?.addEventListener(
            "click",
            logout
        );


        // Call controls
        $("muteButton")?.addEventListener(
            "click",
            toggleMicrophone
        );

        $("cameraButton")?.addEventListener(
            "click",
            toggleCamera
        );

        $("hangupButton")?.addEventListener(
            "click",
            hangupCall
        );


        // Incoming call
        $("acceptCallButton")?.addEventListener(
            "click",
            acceptIncomingCall
        );

        $("rejectCallButton")?.addEventListener(
            "click",
            rejectIncomingCall
        );


        // Notification permission
        document.addEventListener(
            "click",
            async () => {

                if (
                    window.NotificationManager
                ) {
                    try {
                        await NotificationManager.requestPermission();
                    } catch {
                    }
                }

            },
            {
                once: true
            }
        );


        // Start
        autoLogin();
    }
);