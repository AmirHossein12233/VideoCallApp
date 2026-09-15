const API_URL = "https://videocallapp-api.onrender.com";

let currentUser = null;
let socket = null;

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let currentCallUser = null;
let currentCallType = "video";
let incomingOffer = null;


// =========================
// HELPERS
// =========================

function $(id){
    return document.getElementById(id);
}


function getUserId(){
    return localStorage.getItem("videoCallUserId");
}


function toast(message){

    const box = $("toast");

    if(!box)
        return;

    box.textContent = message;

    box.classList.add("show");

    setTimeout(()=>{
        box.classList.remove("show");
    },3000);
}



function avatar(name){

    const letter =
        String(name || "U")
        .trim()
        .charAt(0)
        .toUpperCase();


    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
    width="100"
    height="100">

    <circle cx="50"
    cy="50"
    r="50"
    fill="#111827"/>

    <text x="50"
    y="60"
    text-anchor="middle"
    font-size="45"
    font-family="Arial"
    fill="white">
    ${letter}
    </text>

    </svg>`;


    return "data:image/svg+xml;charset=UTF-8,"
    + encodeURIComponent(svg);

}



function escapeHtml(value){

    return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}



// =========================
// API
// =========================


async function api(path, options={}){

    const response =
    await fetch(
        API_URL + path,
        {
            ...options,

            headers:{
                "Content-Type":
                "application/json",

                ...(options.headers || {})
            }
        }
    );


    let data={};


    try{
        data =
        await response.json();
    }
    catch{
        data={};
    }


    if(!response.ok){

        throw new Error(
            data.detail ||
            "خطای سرور"
        );
    }


    return data;

}



// =========================
// PROFILE
// =========================


function updateProfile(){

    if(!currentUser)
        return;


    if($("myName")){

        $("myName").textContent =
        currentUser.display_name ||
        currentUser.user_id;

    }


    if($("myId")){

        $("myId").textContent =
        "شناسه: " +
        currentUser.user_id;

    }


    if($("myAvatar")){

        $("myAvatar").src =
        currentUser.avatar ||
        avatar(
            currentUser.display_name
        );

    }

}



// =========================
// LOGIN
// =========================


async function login(){

    const id =
    $("loginIdentifier")
    .value
    .trim();


    try{

        const data =
        await api(
            "/api/users/" +
            encodeURIComponent(id)
        );


        currentUser =
        data.user;


        localStorage.setItem(
            "videoCallUserId",
            currentUser.user_id
        );


        showApp();

        updateProfile();

        connectWebSocket();

        loadUsers();


        toast(
            "ورود موفق"
        );


    }
    catch(error){

        if($("loginMessage"))

            $("loginMessage")
            .textContent =
            error.message;

    }

}



// =========================
// REGISTER
// =========================


async function register(){

    const user_id =
    $("registerUserId")
    .value
    .trim();


    const phone =
    $("registerPhone")
    .value
    .trim();


    const display_name =
    $("registerName")
    .value
    .trim();


    try{

        const data =
        await api(
            "/api/register",
            {
                method:"POST",

                body:JSON.stringify({

                    user_id,

                    phone,

                    display_name

                })
            }
        );


        currentUser =
        data.user;


        localStorage.setItem(
            "videoCallUserId",
            currentUser.user_id
        );


        showApp();

        updateProfile();

        connectWebSocket();

        loadUsers();


        toast(
            "ثبت نام موفق"
        );


    }
    catch(error){

        $("registerMessage")
        .textContent =
        error.message;

    }

}



// =========================
// PAGE
// =========================


function showApp(){

    if($("loginPage"))

        $("loginPage")
        .classList.add("hidden");


    if($("registerPage"))

        $("registerPage")
        .classList.add("hidden");


    if($("appPage"))

        $("appPage")
        .classList.remove("hidden");

}
// =========================
// USERS
// =========================

async function loadUsers(){

    const box = $("usersList");

    if(!box)
        return;


    try{

        const data =
        await api("/api/users");


        box.innerHTML = "";


        const users =
        data.users || [];


        let count = 0;


        users.forEach(user=>{


            if(
                user.user_id === getUserId()
            )
            return;


            count++;


            const item =
            document.createElement("div");


            item.className =
            "user-card";


            item.innerHTML = `

            <img class="avatar"
            src="${user.avatar || avatar(user.display_name)}">


            <div class="user-info">

                <b>
                ${escapeHtml(user.display_name)}
                </b>

                <small>
                ${escapeHtml(user.user_id)}
                </small>

            </div>


            <button class="call-button"
            data-type="audio">
            📞
            </button>


            <button class="call-button"
            data-type="video">
            🎥
            </button>

            `;


            item.querySelector(
                '[data-type="audio"]'
            )
            .onclick = ()=>{

                startCall(
                    user.user_id,
                    "audio"
                );

            };


            item.querySelector(
                '[data-type="video"]'
            )
            .onclick = ()=>{

                startCall(
                    user.user_id,
                    "video"
                );

            };


            box.appendChild(item);


        });



        if(count === 0){

            box.innerHTML =
            "<p>کاربر دیگری ثبت نشده است</p>";

        }



    }
    catch(error){

        console.log(error);

    }

}



// =========================
// WEBSOCKET
// =========================

function connectWebSocket(){

    const id =
    getUserId();


    if(!id)
        return;



    socket =
    new WebSocket(
        "wss://videocallapp-api.onrender.com/ws/"
        +
        encodeURIComponent(id)
    );



    socket.onopen = ()=>{


        if($("myStatus"))

            $("myStatus")
            .textContent =
            "🟢 آنلاین";

    };



    socket.onmessage =
    async(event)=>{

        const data =
        JSON.parse(event.data);


        await handleSignal(data);

    };



    socket.onclose = ()=>{


        setTimeout(()=>{

            if(getUserId())
                connectWebSocket();


        },3000);


    };


}



function sendSignal(data){

    if(
        socket &&
        socket.readyState === WebSocket.OPEN
    ){

        socket.send(
            JSON.stringify(data)
        );

        return true;
    }


    toast(
        "اتصال تماس آماده نیست"
    );

    return false;

}



// =========================
// WEBRTC
// =========================


function createPeerConnection(){


    peerConnection =
    new RTCPeerConnection({

        iceServers:[

            {
                urls:
                "stun:stun.l.google.com:19302"
            }

        ]

    });



    peerConnection.onicecandidate =
    event=>{

        if(
            event.candidate &&
            currentCallUser
        ){

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
    event=>{

        if(!remoteStream)

            remoteStream =
            new MediaStream();



        event.streams[0]
        .getTracks()
        .forEach(track=>{

            remoteStream.addTrack(track);

        });



        if($("remoteVideo"))

            $("remoteVideo")
            .srcObject =
            remoteStream;

    };

}




async function startCall(
    userId,
    type
){

    currentCallUser =
    userId;


    currentCallType =
    type;



    try{


        localStream =
        await navigator.mediaDevices
        .getUserMedia({

            audio:true,

            video:
            type === "video"

        });



        if($("localVideo"))

            $("localVideo")
            .srcObject =
            localStream;



        createPeerConnection();



        localStream
        .getTracks()
        .forEach(track=>{

            peerConnection
            .addTrack(
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

            type:"offer",

            target_user_id:
            userId,

            call_type:
            type,

            offer

        });



        if($("callStatus"))

            $("callStatus")
            .textContent =
            "در حال تماس...";


    }
    catch(error){

        toast(
            "دسترسی دوربین یا میکروفون رد شد"
        );

        cleanupCall();

    }

}



// =========================
// SIGNAL HANDLER
// =========================


async function handleSignal(data){


    if(data.type === "offer"){


        incomingOffer =
        data.offer;


        currentCallUser =
        data.from_user_id;


        currentCallType =
        data.call_type ||
        "video";


        if($("incomingCall"))

            $("incomingCall")
            .classList
            .remove("hidden");


        return;

    }



    if(data.type === "answer"){


        await peerConnection
        .setRemoteDescription(
            new RTCSessionDescription(
                data.answer
            )
        );


        return;

    }



    if(data.type === "ice-candidate"){


        if(peerConnection){

            await peerConnection
            .addIceCandidate(
                new RTCIceCandidate(
                    data.candidate
                )
            );

        }


        return;

    }



    if(data.type === "hangup"){

        cleanupCall();

    }


}



// =========================
// ACCEPT / REJECT
// =========================


async function acceptCall(){


    $("incomingCall")
    .classList
    .add("hidden");



    localStream =
    await navigator.mediaDevices
    .getUserMedia({

        audio:true,

        video:
        currentCallType === "video"

    });



    if($("localVideo"))

        $("localVideo")
        .srcObject =
        localStream;



    createPeerConnection();



    localStream
    .getTracks()
    .forEach(track=>{

        peerConnection
        .addTrack(
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
    .setLocalDescription(answer);



    sendSignal({

        type:"answer",

        target_user_id:
        currentCallUser,

        answer

    });


}



function rejectCall(){

    sendSignal({

        type:"hangup",

        target_user_id:
        currentCallUser

    });


    if($("incomingCall"))

        $("incomingCall")
        .classList
        .add("hidden");

}



// =========================
// END CALL
// =========================


function hangup(){


    sendSignal({

        type:"hangup",

        target_user_id:
        currentCallUser

    });


    cleanupCall();

}



function cleanupCall(){


    if(peerConnection){

        peerConnection.close();

        peerConnection = null;

    }



    if(localStream){

        localStream
        .getTracks()
        .forEach(t=>t.stop());

        localStream=null;

    }



    if($("localVideo"))

        $("localVideo")
        .srcObject=null;


    if($("remoteVideo"))

        $("remoteVideo")
        .srcObject=null;



}



// =========================
// START
// =========================


document.addEventListener(
"DOMContentLoaded",
()=>{


    if($("loginButton"))
        $("loginButton").onclick = login;


    if($("registerButton"))
        $("registerButton").onclick = register;


    if($("refreshButton"))
        $("refreshButton").onclick = loadUsers;


    if($("acceptButton"))
        $("acceptButton").onclick = acceptCall;


    if($("rejectButton"))
        $("rejectButton").onclick = rejectCall;


    if($("hangupButton"))
        $("hangupButton").onclick = hangup;



    const id =
    getUserId();



    if(id){

        showApp();

        connectWebSocket();

        loadUsers();

    }

});