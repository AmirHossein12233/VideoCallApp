const NotificationManager = {
    enabled: true,

    init() {
        const saved =
            localStorage.getItem(
                "videoCallNotifications"
            );

        this.enabled =
            saved !== "false";
    },

    async requestPermission() {
        if (!("Notification" in window)) {
            return false;
        }

        if (
            Notification.permission ===
            "granted"
        ) {
            return true;
        }

        if (
            Notification.permission ===
            "denied"
        ) {
            return false;
        }

        const permission =
            await Notification.requestPermission();

        return permission === "granted";
    },

    async show(
        title,
        body,
        options = {}
    ) {
        if (!this.enabled) {
            return;
        }

        this.showInApp(
            title,
            body,
            options
        );

        if (
            !("Notification" in window)
        ) {
            return;
        }

        if (
            document.visibilityState ===
            "visible"
        ) {
            return;
        }

        if (
            Notification.permission !==
            "granted"
        ) {
            return;
        }

        try {
            const notification =
                new Notification(
                    title,
                    {
                        body,
                        icon:
                            options.icon ||
                            "icon.png",
                        tag:
                            options.tag ||
                            "videocallapp",
                        requireInteraction:
                            Boolean(
                                options.requireInteraction
                            )
                    }
                );

            notification.onclick = () => {
                window.focus();

                if (
                    typeof options.onclick ===
                    "function"
                ) {
                    options.onclick();
                }

                notification.close();
            };

        } catch (error) {
            console.error(
                "Notification error:",
                error
            );
        }
    },

    showInApp(
        title,
        body,
        options = {}
    ) {
        let container =
            document.getElementById(
                "notificationContainer"
            );

        if (!container) {
            container =
                document.createElement(
                    "div"
                );

            container.id =
                "notificationContainer";

            document.body.appendChild(
                container
            );
        }

        const item =
            document.createElement(
                "div"
            );

        item.className =
            "app-notification";

        item.innerHTML = `
            <div class="notification-icon">
                ${options.iconEmoji || "🔔"}
            </div>

            <div class="notification-content">
                <div class="notification-title">
                    ${this.escape(title)}
                </div>

                <div class="notification-body">
                    ${this.escape(body)}
                </div>
            </div>

            <button
                class="notification-close"
                type="button"
            >
                ×
            </button>
        `;

        const closeButton =
            item.querySelector(
                ".notification-close"
            );

        closeButton?.addEventListener(
            "click",
            () => {
                this.remove(item);
            }
        );

        container.appendChild(
            item
        );

        requestAnimationFrame(() => {
            item.classList.add(
                "show"
            );
        });

        const timeout =
            options.duration || 5000;

        setTimeout(() => {
            this.remove(item);
        }, timeout);
    },

    remove(element) {
        if (!element) {
            return;
        }

        element.classList.remove(
            "show"
        );

        setTimeout(() => {
            element.remove();
        }, 250);
    },

    escape(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll(
                "<",
                "&lt;"
            )
            .replaceAll(
                ">",
                "&gt;"
            )
            .replaceAll(
                '"',
                "&quot;"
            )
            .replaceAll(
                "'",
                "&#039;"
            );
    },

    enable() {
        this.enabled = true;

        localStorage.setItem(
            "videoCallNotifications",
            "true"
        );
    },

    disable() {
        this.enabled = false;

        localStorage.setItem(
            "videoCallNotifications",
            "false"
        );
    }
};


NotificationManager.init();

window.NotificationManager =
    NotificationManager;