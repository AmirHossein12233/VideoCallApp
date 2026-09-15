const API_URL = "https://videocallapp-api.onrender.com";

let currentUserId =
    localStorage.getItem("videoCallUserId") || "";

let currentUser = null;
let socket = null;

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let currentCallTarget = null;
let currentCallType = null;
let incomingOffer = null;

let isMicrophoneEnabled = true;
let isCameraEnabled = true;

const usersCache = new Map();

const iceServers = [
    {
        urls: "stun:stun.l.google.com:19302"
    },
    {
        urls: "stun:stun1.l.google.com:19302"
    }
];

const $ = (id) =>
    document.getElementById(id);

function showElement(element) {
    if (element) {
        element.classList.remove("hidden");
    }
}

function hideElement(element) {
    if (element) {
        element.classList.add("hidden");
    }
}

function showToast(message, type = "info") {
    const toast = $("toast");

    if (!toast) {
        return;
    }

    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove("hidden");

    setTimeout(() => {
        toast.classList.add("hidden");
    }, 3000);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function normalizeUser(data) {
    if (!data) {
        return null;
    }

    return data.user || data;
}

function getStoredUserId() {
    const value =
        localStorage.getItem(
            "videoCallUserId"
        );

    if (
        !value ||
        value === "undefined" ||
        value === "null"
    ) {
        return "";
    }

    return value;
}

async function apiRequest(
    path,
    options = {}
) {
    const response = await fetch(
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

    let data = null;

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

/* =========================
   AUTH
========================= */

async function registerUser() {
    const userIdInput =
        $("registerUserId");

    const phoneInput =
        $("registerPhone");

    const nameInput =
        $("registerName");

    const errorBox =
        $("registerError");

    const user_id =
        userIdInput?.value.trim() || "";

    const phone =
        phoneInput?.value.trim() || "";

    const display_name =
        nameInput?.value.trim() || "";

    if (!user_id) {
        if (errorBox) {
            errorBox.textContent =
                "شناسه را وارد کنید";
        }

        return;
    }

    if (!phone) {
        if (errorBox) {
            errorBox.textContent =
                "شماره موبایل را وارد کنید";
        }

        return;
    }

    if (!display_name) {
        if (errorBox) {
            errorBox.textContent =
                "نام نمایشی را وارد کنید";
        }

        return;
    }

    try {
        if (errorBox) {
            errorBox.textContent = "";
        }

        const data =
            await apiRequest(
                "/api/register",
                {
                    method: "POST",
                    body: JSON.stringify({
                        user_id,
                        phone,
                        display_name
                    })
                }
            );

        const user =
            normalizeUser(data);

        if (!user || !user.user_id) {
            throw new Error(
                "اطلاعات کاربر از سرور دریافت نشد"
            );
        }

        currentUserId =
            user.user_id;

        currentUser =
            user;

        localStorage.setItem(
            "videoCallUserId",
            currentUserId
        );

        localStorage.setItem(
            "videoCallUser",
            JSON.stringify(user)
        );

        showApp();

        showToast(
            "ثبت‌نام با موفقیت انجام شد",
            "success"
        );

    } catch (error) {
        console.error(error);

        if (errorBox) {
            errorBox.textContent =
                error.message;
        }
    }
}

async function loginUser() {
    const input =
        $("loginIdentifier");

    const errorBox =
        $("loginError");

    const identifier =
        input?.value.trim() || "";

    if (!identifier) {
        if (errorBox) {
            errorBox.textContent =
                "شناسه یا شماره موبایل را وارد کنید";
        }

        return;
    }

    try {
        if (errorBox) {
            errorBox.textContent = "";
        }

        const data =
            await apiRequest(
                `/api/users/${encodeURIComponent(
                    identifier
                )}`
            );

        const user =
            normalizeUser(data);

        if (!user || !user.user_id) {
            throw new Error(
                "کاربر پیدا نشد"
            );
        }

        currentUserId =
            user.user_id;

        currentUser =
            user;

        localStorage.setItem(
            "videoCallUserId",
            currentUserId
        );

        localStorage.setItem(
            "videoCallUser",
            JSON.stringify(user)
        );

        showApp();

        showToast(
            "ورود موفق بود",
            "success"
        );

    } catch (error) {
        console.error(error);

        if (errorBox) {
            errorBox.textContent =
                error.message ||
                "کاربر پیدا نشد";
        }
    }
}

async function autoLogin() {
    currentUserId =
        getStoredUserId();

    if (!currentUserId) {
        showAuth();
        return;
    }

    try {
        const data =
            await apiRequest(
                `/api/profile/${encodeURIComponent(
                    currentUserId
                )}`
            );

        const user =
            normalizeUser(data);

        if (
            !user ||
            !user.user_id
        ) {
            throw new Error(
                "کاربر نامعتبر است"
            );
        }

        currentUser =
            user;

        localStorage.setItem(
            "videoCallUser",
            JSON.stringify(user)
        );

        showApp();

    } catch (error) {
        console.error(
            "Auto login error:",
            error
        );

        localStorage.removeItem(
            "videoCallUserId"
        );

        localStorage.removeItem(
            "videoCallUser"
        );

        currentUserId = "";
        currentUser = null;

        showAuth();
    }
}

function showAuth() {
    const auth =
        $("authContainer");

    const app =
        $("appContainer");

    showElement(auth);
    hideElement(app);

    const loginPanel =
        $("loginPanel");

    const registerPanel =
        $("registerPanel");

    showElement(loginPanel);
    hideElement(registerPanel);
}

function showRegister() {
    const loginPanel =
        $("loginPanel");

    const registerPanel =
        $("registerPanel");

    hideElement(loginPanel);
    showElement(registerPanel);
}

function showLogin() {
    const loginPanel =
        $("loginPanel");

    const registerPanel =
        $("registerPanel");

    showElement(loginPanel);
    hideElement(registerPanel);
}

async function showApp() {
    const auth =
        $("authContainer");

    const app =
        $("appContainer");

    hideElement(auth);
    showElement(app);

    updateMyProfileUI();

    connectWebSocket();

    await loadUsers();
}

/* =========================
   PROFILE UI
========================= */

function updateMyProfileUI() {
    if (!currentUser) {
        return;
    }

    const name =
        currentUser.display_name ||
        currentUser.user_id;

    const avatar =
        currentUser.avatar || "";

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
            name;
    }

    if (idElement) {
        idElement.textContent =
            currentUser.user_id;
    }

    if (avatarElement) {
        if (avatar) {
            avatarElement.src =
                avatar;
        } else {
            avatarElement.src =
                "data:image/svg+xml;charset=UTF-8," +
                encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg"
                         width="100"
                         height="100"
                         viewBox="0 0 100 100">
                        <rect width="100"
                              height="100"
                              rx="50"
                              fill="#334155"/>
                        <text x="50"
                              y="58"
                              text-anchor="middle"
                              font-size="40"
                              fill="white">
                            ${escapeHtml(
                                name
                                    .charAt(0)
                                    .toUpperCase()
                            )}
                        </text>
                    </svg>
                `);
        }
    }

    if (statusElement) {
        statusElement.textContent =
            "آنلاین";
    }
}

/* =========================
   USERS
========================= */

async function loadUsers() {
    try {
        const data =
            await apiRequest(
                "/api/users"
            );

        const users =
            Array.isArray(data)
                ? data
                : data.users || [];

        usersCache.clear();

        users.forEach((user) => {
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
        console.error(error);

        showToast(
            "دریافت کاربران ناموفق بود",
            "error"
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

    const filtered =
        users.filter(
            (user) =>
                user.user_id !==
                currentUserId
        );

    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state">
                کاربر دیگری پیدا نشد
            </div>
        `;

        return;
    }

    filtered.forEach((user) => {
        container.appendChild(
            createUserCard(user)
        );
    });
}

function createUserCard(user) {
    const card =
        document.createElement(
            "div"
        );

    card.className =
        "user-card";

    const online =
        Boolean(user.online);

    const avatar =
        user.avatar || "";

    const name =
        user.display_name ||
        user.user_id;

    card.innerHTML = `
        <div class="user-avatar">
            ${
                avatar
                    ? `<img src="${escapeHtml(
                          avatar
                      )}" alt="">`
                    : `<span>${escapeHtml(
                          name
                              .charAt(0)
                              .toUpperCase()
                      )}</span>`
            }
        </div>

        <div class="user-info">
            <div class="user-name">
                ${escapeHtml(name)}
            </div>

            <div class="user-id">
                @${escapeHtml(
                    user.user_id
                )}
            </div>

            <div class="user-status ${
                online
                    ? "online"
                    : "offline"
            }">
                <span></span>
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
                class="audio-call-card-button"
            >
                📞
            </button>

            <button
                type="button"
                class="video-call-card-button"
            >
                🎥
            </button>
        </div>
    `;

    card
        .querySelector(
            ".audio-call-card-button"
        )
        ?.addEventListener(
            "click",
            () => {
                startCall(
                    user.user_id,
                    "audio"
                );
            }
        );

    card
        .querySelector(
            ".video-call-card-button"
        )
        ?.addEventListener(
            "click",
            () => {
                startCall(
                    user.user_id,
                    "video"
                );
            }
        );

    return card;
}

async function searchUser() {
    const input =
        $("targetUserId");

    const result =
        $("searchResult");

    const identifier =
        input?.value.trim() || "";

    if (!identifier) {
        showToast(
            "شناسه یا شماره موبایل را وارد کنید",
            "error"
        );

        return;
    }

    try {
        const data =
            await apiRequest(
                `/api/users/${encodeURIComponent(
                    identifier
                )}`
            );

        const user =
            normalizeUser(data);

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

        renderSearchResult(user);

        showElement(result);

    } catch (error) {
        console.error(error);

        if (result) {
            result.innerHTML = `
                <div class="error-message">
                    ${escapeHtml(
                        error.message ||
                            "کاربر پیدا نشد"
                    )}
                </div>
            `;

            showElement(result);
        }
    }
}

function renderSearchResult(user) {
    const avatar =
        $("searchUserAvatar");

    const name =
        $("searchUserName");

    const id =
        $("searchUserIdentifier");

    const phone =
        $("searchUserPhone");

    if (avatar) {
        if (user.avatar) {
            avatar.src =
                user.avatar;
        } else {
            avatar.src =
                "data:image/svg+xml;charset=UTF-8," +
                encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg"
                         width="100"
                         height="100">
                        <rect width="100"
                              height="100"
                              rx="50"
                              fill="#334155"/>
                        <text x="50"
                              y="58"
                              text-anchor="middle"
                              font-size="40"
                              fill="white">
                            ${escapeHtml(
                                (
                                    user.display_name ||
                                    user.user_id
                                )
                                    .charAt(0)
                                    .toUpperCase()
                            )}
                        </text>
                    </svg>
                `);
        }
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
}

/* =========================
   WEBSOCKET
========================= */

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
        API_URL.startsWith("https://")
            ? "wss:"
            : "ws:";

    const host =
        API_URL.replace(
            /^https?:\/\//,
            ""
        ).replace(/\/$/, "");

    const wsUrl =
        `${protocol}//${host}/ws/${encodeURIComponent(
            currentUserId
        )}`;

    console.log(
        "Connecting WebSocket:",
        wsUrl
    );

    socket =
        new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log(
            "WebSocket connected"
        );

        updateOnlineStatus(
            true
        );

        showToast(
            "اتصال آنلاین برقرار شد",
            "success"
        );
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

    socket.onclose = () => {
        console.log(
            "WebSocket disconnected"
        );

        updateOnlineStatus(
            false
        );

        setTimeout(() => {
            if (
                currentUserId &&
                !socket
            ) {
                connectWebSocket();
            }
        }, 3000);
    };

    socket.onerror = (error) => {
        console.error(
            "WebSocket error:",
            error
        );
    };
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
            "اتصال سرور برقرار نیست",
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
    const type =
        message.type;

    switch (type) {
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
            handleRemoteHangup();
            break;

        case "online_status":
            handleOnlineStatus(
                message
            );
            break;

        case "profile_updated":
            handleProfileUpdated(
                message
            );
            break;

        case "pong":
            break;

        default:
            console.log(
                "Unknown WebSocket message:",
                message
            );
    }
}

/* =========================
   ONLINE STATUS
========================= */

function updateOnlineStatus(
    online
) {
    const element =
        $("onlineStatus");

    if (!element) {
        return;
    }

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

function handleOnlineStatus(
    message
) {
    const userId =
        message.user_id;

    if (!userId) {
        return;
    }

    const user =
        usersCache.get(
            userId
        );

    if (user) {
        user.online =
            Boolean(
                message.online
            );

        usersCache.set(
            userId,
            user
        );
    }

    const users =
        Array.from(
            usersCache.values()
        );

    renderUsers(users);
}

function handleProfileUpdated(
    message
) {
    const user =
        message.user;

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
        currentUser =
            user;

        localStorage.setItem(
            "videoCallUser",
            JSON.stringify(user)
        );

        updateMyProfileUI();
    }

    renderUsers(
        Array.from(
            usersCache.values()
        )
    );
}

/* =========================
   WEBRTC
========================= */

async function createPeerConnection(
    targetUserId
) {
    peerConnection =
        new RTCPeerConnection({
            iceServers
        });

    remoteStream =
        new MediaStream();

    const remoteVideo =
        $("remoteVideo");

    if (remoteVideo) {
        remoteVideo.srcObject =
            remoteStream;
    }

    peerConnection.onicecandidate =
        (event) => {
            if (
                event.candidate
            ) {
                sendSocketMessage({
                    type:
                        "ice-candidate",
                    target_user_id:
                        targetUserId,
                    candidate:
                        event.candidate
                });
            }
        };

    peerConnection.ontrack =
        (event) => {
            event.streams[0]
                ?.getTracks()
                .forEach(
                    (track) => {
                        remoteStream.addTrack(
                            track
                        );
                    }
                );

            if (remoteVideo) {
                remoteVideo.srcObject =
                    remoteStream;

                remoteVideo
                    .play()
                    .catch(
                        () => {}
                    );
            }

            hideElement(
                $("remotePlaceholder")
            );
        };

    peerConnection.onconnectionstatechange =
        () => {
            console.log(
                "Peer connection state:",
                peerConnection
                    .connectionState
            );

            if (
                peerConnection
                    .connectionState ===
                    "connected"
            ) {
                updateConnectionStatus(
                    "متصل"
                );
            }

            if (
                [
                    "failed",
                    "disconnected",
                    "closed"
                ].includes(
                    peerConnection
                        .connectionState
                )
            ) {
                updateConnectionStatus(
                    "اتصال قطع شد"
                );
            }
        };

    if (localStream) {
        localStream
            .getTracks()
            .forEach(
                (track) => {
                    peerConnection.addTrack(
                        track,
                        localStream
                    );
                }
            );
    }

    return peerConnection;
}

async function getLocalMedia(
    type
) {
    if (localStream) {
        return localStream;
    }

    const constraints =
        type === "video"
            ? {
                  audio: true,
                  video: {
                      width: {
                          ideal: 1280
                      },
                      height: {
                          ideal: 720
                      },
                      facingMode:
                          "user"
                  }
              }
            : {
                  audio: true,
                  video: false
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

        localVideo.muted = true;

        localVideo
            .play()
            .catch(() => {});
    }

    isMicrophoneEnabled =
        true;

    isCameraEnabled =
        type === "video";

    updateMediaButtons();

    return localStream;
}

async function startCall(
    targetUserId,
    type = "audio"
) {
    if (!targetUserId) {
        return;
    }

    if (
        targetUserId ===
        currentUserId
    ) {
        showToast(
            "نمی‌توانید با خودتان تماس بگیرید",
            "error"
        );

        return;
    }

    if (
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ) {
        connectWebSocket();

        showToast(
            "در حال اتصال به سرور...",
            "info"
        );

        setTimeout(() => {
            startCall(
                targetUserId,
                type
            );
        }, 1200);

        return;
    }

    try {
        currentCallTarget =
            targetUserId;

        currentCallType =
            type;

        await prepareCallInterface(
            type
        );

        await getLocalMedia(
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

        sendSocketMessage({
            type: "offer",
            target_user_id:
                targetUserId,
            offer,
            call_type: type,
            caller_user_id:
                currentUserId
        });

        updateConnectionStatus(
            "در حال تماس..."
        );

    } catch (error) {
        console.error(
            "Start call error:",
            error
        );

        cleanupCall();

        showToast(
            "شروع تماس ناموفق بود: " +
                error.message,
            "error"
        );
    }
}

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

    incomingOffer =
        message.offer;

    currentCallTarget =
        callerId;

    currentCallType =
        message.call_type ||
        "audio";

    const caller =
        usersCache.get(
            callerId
        );

    const callerName =
        caller?.display_name ||
        callerId;

    const callerAvatar =
        caller?.avatar || "";

    const callerElement =
        $("incomingCaller");

    const avatarElement =
        $("incomingCallerAvatar");

    if (callerElement) {
        callerElement.textContent =
            callerName;
    }

    if (
        avatarElement &&
        callerAvatar
    ) {
        avatarElement.src =
            callerAvatar;
    }

    showElement(
        $("incomingCallModal")
    );

    if (
        window.NotificationManager
    ) {
        await NotificationManager.show(
            "تماس ورودی",
            `${callerName} با شما تماس می‌گیرد`,
            {
                iconEmoji:
                    currentCallType ===
                    "video"
                        ? "🎥"
                        : "📞",
                requireInteraction:
                    true,
                duration: 7000,
                onclick: () => {
                    showElement(
                        $("incomingCallModal")
                    );
                }
            }
        );
    }

    updateConnectionStatus(
        "تماس ورودی..."
    );
}

async function acceptIncomingCall() {
    if (
        !incomingOffer ||
        !currentCallTarget
    ) {
        return;
    }

    try {
        hideElement(
            $("incomingCallModal")
        );

        await prepareCallInterface(
            currentCallType
        );

        await getLocalMedia(
            currentCallType
        );

        await createPeerConnection(
            currentCallTarget
        );

        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
                incomingOffer
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
                currentCallTarget,
            answer
        });

        incomingOffer =
            null;

        updateConnectionStatus(
            "در حال اتصال..."
        );

    } catch (error) {
        console.error(
            "Accept call error:",
            error
        );

        cleanupCall();

        showToast(
            "پذیرش تماس ناموفق بود",
            "error"
        );
    }
}

function rejectIncomingCall() {
    if (currentCallTarget) {
        sendSocketMessage({
            type: "call-rejected",
            target_user_id:
                currentCallTarget
        });
    }

    hideElement(
        $("incomingCallModal")
    );

    incomingOffer = null;
    currentCallTarget = null;
    currentCallType = null;

    updateConnectionStatus(
        "آماده تماس"
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
        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
                message.answer
            )
        );

        updateConnectionStatus(
            "متصل"
        );

    } catch (error) {
        console.error(
            "Answer error:",
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
        await peerConnection.addIceCandidate(
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

function handleCallRejected() {
    showToast(
        "تماس رد شد",
        "error"
    );

    cleanupCall();
}

function handleRemoteHangup() {
    showToast(
        "تماس پایان یافت",
        "info"
    );

    cleanupCall();
}

async function prepareCallInterface(
    type
) {
    showElement(
        $("callArea")
    );

    const remoteVideo =
        $("remoteVideo");

    const localVideo =
        $("localVideo");

    if (type === "video") {
        if (remoteVideo) {
            remoteVideo.style.display =
                "block";
        }

        if (localVideo) {
            localVideo.style.display =
                "block";
        }

        showElement(
            $("cameraButton")
        );

    } else {
        if (remoteVideo) {
            remoteVideo.style.display =
                "none";
        }

        if (localVideo) {
            localVideo.style.display =
                "none";
        }

        hideElement(
            $("cameraButton")
        );
    }

    updateConnectionStatus(
        "آماده اتصال..."
    );
}

function updateConnectionStatus(
    text
) {
    const element =
        $("connectionStatus");

    if (element) {
        element.textContent =
            text;
    }
}

function toggleMicrophone() {
    if (!localStream) {
        return;
    }

    const tracks =
        localStream.getAudioTracks();

    if (!tracks.length) {
        return;
    }

    isMicrophoneEnabled =
        !isMicrophoneEnabled;

    tracks.forEach(
        (track) => {
            track.enabled =
                isMicrophoneEnabled;
        }
    );

    updateMediaButtons();
}

function toggleCamera() {
    if (!localStream) {
        return;
    }

    const tracks =
        localStream.getVideoTracks();

    if (!tracks.length) {
        return;
    }

    isCameraEnabled =
        !isCameraEnabled;

    tracks.forEach(
        (track) => {
            track.enabled =
                isCameraEnabled;
        }
    );

    updateMediaButtons();
}

function updateMediaButtons() {
    const muteButton =
        $("muteButton");

    const cameraButton =
        $("cameraButton");

    if (muteButton) {
        muteButton.textContent =
            isMicrophoneEnabled
                ? "🎤 میکروفون"
                : "🔇 میکروفون خاموش";
    }

    if (cameraButton) {
        cameraButton.textContent =
            isCameraEnabled
                ? "📷 دوربین"
                : "🚫 دوربین خاموش";
    }
}

function hangupCall() {
    if (
        currentCallTarget &&
        socket &&
        socket.readyState ===
            WebSocket.OPEN
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
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (localStream) {
        localStream
            .getTracks()
            .forEach(
                (track) => {
                    track.stop();
                }
            );

        localStream = null;
    }

    if (remoteStream) {
        remoteStream
            .getTracks()
            .forEach(
                (track) => {
                    track.stop();
                }
            );

        remoteStream = null;
    }

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

    currentCallTarget = null;
    currentCallType = null;
    incomingOffer = null;

    hideElement(
        $("incomingCallModal")
    );

    hideElement(
        $("callArea")
    );

    showElement(
        $("remotePlaceholder")
    );

    updateConnectionStatus(
        "آماده تماس"
    );
}

/* =========================
   NAVIGATION
========================= */

function openProfile() {
    localStorage.setItem(
        "videoCallUserId",
        currentUserId
    );

    window.location.href =
        "profile.html";
}

function openSettings() {
    localStorage.setItem(
        "videoCallUserId",
        currentUserId
    );

    window.location.href =
        "settings.html";
}

function openContacts() {
    localStorage.setItem(
        "videoCallUserId",
        currentUserId
    );

    window.location.href =
        "contacts.html";
}

function logout() {
    cleanupCall();

    if (socket) {
        socket.close();
        socket = null;
    }

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

    currentUserId = "";
    currentUser = null;

    showAuth();

    showToast(
        "از حساب خارج شدید",
        "success"
    );
}

/* =========================
   EVENTS
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
            showRegister
        );

    $("showLoginButton")
        ?.addEventListener(
            "click",
            showLogin
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

    $("profileButton")
        ?.addEventListener(
            "click",
            openProfile
        );

    $("settingsButton")
        ?.addEventListener(
            "click",
            openSettings
        );

    $("contactsButton")
        ?.addEventListener(
            "click",
            openContacts
        );

    $("logoutButton")
        ?.addEventListener(
            "click",
            logout
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

    $("loginIdentifier")
        ?.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key ===
                    "Enter"
                ) {
                    loginUser();
                }
            }
        );

    $("targetUserId")
        ?.addEventListener(
            "keydown",
            (event) => {
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
            (event) => {
                if (
                    event.key ===
                    "Enter"
                ) {
                    registerUser();
                }
            }
        );

    $("registerPhone")
        ?.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key ===
                    "Enter"
                ) {
                    registerUser();
                }
            }
        );

    $("registerName")
        ?.addEventListener(
            "keydown",
            (event) => {
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
   PENDING CALL FROM CONTACTS
========================= */

function handlePendingCall() {
    const target =
        localStorage.getItem(
            "videoCallTargetUser"
        );

    const type =
        localStorage.getItem(
            "videoCallTargetType"
        );

    if (!target) {
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
            target,
            type || "audio"
        );
    }, 1000);
}

/* =========================
   START APP
========================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {
        setupEvents();
        autoLogin();
    }
);

window.startCall =
    startCall;

window.hangupCall =
    hangupCall;

window.toggleMicrophone =
    toggleMicrophone;

window.toggleCamera =
    toggleCamera;

window.acceptIncomingCall =
    acceptIncomingCall;

window.rejectIncomingCall =
    rejectIncomingCall;

window.searchUser =
    searchUser;

window.registerUser =
    registerUser;

window.loginUser =
    loginUser;

window.openProfile =
    openProfile;

window.openSettings =
    openSettings;

window.openContacts =
    openContacts;

window.logout =
    logout;

window.handlePendingCall =
    handlePendingCall;