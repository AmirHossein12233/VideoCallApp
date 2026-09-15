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
        .toUpperCase();


    const svg = `

    <svg xmlns="http://www.w3.org/2000/svg"
    width="100"
    height="100">

    <rect width="100"
    height="100"
    rx="50"
    fill="black"/>

    <text x="50"
    y="60"
    text-anchor="middle"
    font-size="45"
    font-family="Arial"
    fill="white">

    ${letter}

    </text>

    </svg>

    `;


    return (
        "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(svg)
    );

}



function escapeHtml(value){

    return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

}



function toast(message){

    const box =
        $("toast");

    if(!box)
        return;


    box.textContent =
        message;


    box.classList.add(
        "show"
    );


    setTimeout(()=>{

        box.classList.remove(
            "show"
        );

    },3000);

}





/* =========================
 PAGE
========================= */


function showLogin(){

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



function showRegister(){

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



function showApp(){

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
    options={}
){

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
            "خطا در سرور"
        );

    }


    return data;

}





/* =========================
 PROFILE
========================= */


function updateProfile(){

    if(!currentUser)
        return;


    const name =
        currentUser.display_name ||
        currentUser.user_id;


    $("myName").textContent =
        name;


    $("myId").textContent =
        "شناسه: " +
        currentUser.user_id;


    $("myAvatar").src =
        currentUser.avatar ||
        avatar(name);

}





/* =========================
 REGISTER
========================= */


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
    catch(e){

        $("registerMessage")
        .textContent =
        e.message;

    }

}






/* =========================
 LOGIN
========================= */


async function login(){


    const identifier =
        $("loginIdentifier")
        .value
        .trim();



    try{


        const data =
        await api(
            "/api/users/" +
            encodeURIComponent(
                identifier
            )
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
    catch(e){

        $("loginMessage")
        .textContent =
        e.message;

    }

}





/* =========================
 USERS
========================= */


async function loadUsers(){


    const box =
        $("usersList");


    if(!box)
        return;



    try{


        const data =
        await api(
            "/api/users"
        );



        box.innerHTML="";



        data.users.forEach(user=>{


            if(
                user.user_id ===
                getUserId()
            )
            return;



            const div =
            document.createElement(
                "div"
            );


            div.className =
            "user-card";



            div.innerHTML=`

            <img class="avatar"
            src="${user.avatar || avatar(user.display_name)}">


            <div>

            <b>${escapeHtml(user.display_name)}</b>

            <p>
            ${escapeHtml(user.user_id)}
            </p>

            </div>


            <button class="call-button">
            📞
            </button>

            <button class="call-button">
            🎥
            </button>

            `;



            div.children[2].onclick =
            ()=>startCall(
                user.user_id,
                "audio"
            );



            div.children[3].onclick =
            ()=>startCall(
                user.user_id,
                "video"
            );



            box.appendChild(
                div
            );


        });



    }
    catch(e){

        console.log(e);

    }


}
 
/* =========================
   WEBSOCKET
========================= */


function connectWebSocket(){

    const userId =
        getUserId();


    if(!userId)
        return;


    const url =
        "wss://videocallapp-api.onrender.com/ws/" +
        encodeURIComponent(
            userId
        );


    socket =
        new WebSocket(url);



    socket.onopen = ()=>{

        console.log(
            "WebSocket connected"
        );


        if($("myStatus"))
            $("myStatus")
            .textContent =
            "🟢 آنلاین";

    };



    socket.onmessage =
    async(event)=>{

        const data =
            JSON.parse(
                event.data
            );


        await handleSignal(
            data
        );

    };



    socket.onclose = ()=>{

        setTimeout(()=>{

            if(
                getUserId()
            )
                connectWebSocket();


        },3000);

    };

}





function sendSignal(data){

    if(
        !socket ||
        socket.readyState !==
        WebSocket.OPEN
    ){

        toast(
            "اتصال تماس آماده نیست"
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


        if(!remoteStream){

            remoteStream =
            new MediaStream();

        }


        event.streams[0]
        .getTracks()
        .forEach(track=>{


            remoteStream.addTrack(
                track
            );


        });



        $("remoteVideo")
        .srcObject =
        remoteStream;


    };

}







/* =========================
 START CALL
========================= */


async function startCall(
    userId,
    type
){


    currentCallUser =
        userId;


    currentCallType =
        type;



    $("callPanel")
    .classList
    .remove("hidden");



    try{


        localStream =
        await navigator.mediaDevices
        .getUserMedia({

            audio:true,

            video:
            type === "video"

        });



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

            type:
            "offer",


            target_user_id:
            userId,


            call_type:
            type,


            offer:
            offer

        });



        $("callStatus")
        .textContent =
        "در حال تماس...";



    }
    catch(e){

        console.log(e);


        toast(
            "دوربین یا میکروفون اجازه داده نشد"
        );


        cleanupCall();

    }


}







/* =========================
 HANDLE SIGNAL
========================= */


async function handleSignal(data){



    if(
        data.type ===
        "offer"
    ){


        incomingOffer =
        data.offer;


        currentCallUser =
        data.from_user_id;



        currentCallType =
        data.call_type ||
        "video";



        $("incomingCall")
        .classList
        .remove("hidden");


        return;

    }





    if(
        data.type ===
        "answer"
    ){


        await peerConnection
        .setRemoteDescription(

            new RTCSessionDescription(
                data.answer
            )

        );


        return;

    }





    if(
        data.type ===
        "ice-candidate"
    ){


        if(
            data.candidate &&
            peerConnection
        ){

            await peerConnection
            .addIceCandidate(

                new RTCIceCandidate(
                    data.candidate
                )

            );

        }


        return;

    }





    if(
        data.type ===
        "hangup"
    ){

        cleanupCall();

    }


}







/* =========================
 ACCEPT CALL
========================= */


async function acceptCall(){


    $("incomingCall")
    .classList
    .add("hidden");



    $("callPanel")
    .classList
    .remove("hidden");



    localStream =
    await navigator.mediaDevices
    .getUserMedia({

        audio:true,

        video:
        currentCallType === "video"

    });



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
    .setLocalDescription(
        answer
    );



    sendSignal({

        type:
        "answer",


        target_user_id:
        currentCallUser,


        answer:
        answer

    });


}







function rejectCall(){


    sendSignal({

        type:
        "call-rejected",


        target_user_id:
        currentCallUser

    });



    $("incomingCall")
    .classList
    .add("hidden");

}







/* =========================
 CONTROLS
========================= */


function toggleMicrophone(){


    if(!localStream)
        return;



    localStream
    .getAudioTracks()
    .forEach(track=>{

        track.enabled =
        !track.enabled;

    });


}





function toggleCamera(){


    if(!localStream)
        return;



    localStream
    .getVideoTracks()
    .forEach(track=>{

        track.enabled =
        !track.enabled;

    });


}






function hangup(){


    if(currentCallUser){


        sendSignal({

            type:
            "hangup",


            target_user_id:
            currentCallUser

        });


    }



    cleanupCall();


}






function cleanupCall(){


    if(peerConnection){

        peerConnection.close();

        peerConnection =
        null;

    }



    if(localStream){

        localStream
        .getTracks()
        .forEach(
            t=>t.stop()
        );


        localStream =
        null;

    }



    $("localVideo")
    .srcObject =
    null;


    $("remoteVideo")
    .srcObject =
    null;



    $("callPanel")
    .classList
    .add("hidden");


}







/* =========================
 EVENTS
========================= */


function setupEvents(){


    $("loginButton")
    .onclick =
    login;


    $("registerButton")
    .onclick =
    register;


    $("showRegisterButton")
    .onclick =
    showRegister;


    $("showLoginButton")
    .onclick =
    showLogin;


    $("refreshButton")
    .onclick =
    loadUsers;


    $("acceptButton")
    .onclick =
    acceptCall;


    $("rejectButton")
    .onclick =
    rejectCall;


    $("hangupButton")
    .onclick =
    hangup;


    $("closeCallButton")
    .onclick =
    hangup;


    $("microphoneButton")
    .onclick =
    toggleMicrophone;


    $("cameraButton")
    .onclick =
    toggleCamera;


    $("logoutButton")
    .onclick =
    ()=>{

        localStorage.clear();

        location.reload();

    };


}






/* =========================
 START
========================= */


function start(){


    setupEvents();


    const id =
    getUserId();



    if(id){

        showApp();

        connectWebSocket();

        loadUsers();

    }

    else{

        showLogin();

    }


}



document.addEventListener(
"DOMContentLoaded",
start
);