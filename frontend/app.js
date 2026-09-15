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



// =========================
// HELPERS
// =========================


function $(id){
    return document.getElementById(id);
}



function getUserId(){

    return localStorage.getItem(
        "videoCallUserId"
    );

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

    <circle
    cx="50"
    cy="50"
    r="50"
    fill="black"/>

    <text
    x="50"
    y="62"
    text-anchor="middle"
    font-size="45"
    font-family="Arial"
    fill="white">

    ${letter}

    </text>

    </svg>

    `;


    return

    "data:image/svg+xml;charset=UTF-8,"
    +
    encodeURIComponent(svg);

}



function escapeHtml(value){

    return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

}



function toast(text){

    const box =
        $("toast");

    if(!box)
        return;


    box.textContent =
        text;


    box.classList.add(
        "show"
    );


    setTimeout(()=>{

        box.classList.remove(
            "show"
        );

    },3000);

}



// =========================
// PAGE
// =========================


function showLogin(){

    $("loginPage")
    ?.classList.remove(
        "hidden"
    );


    $("registerPage")
    ?.classList.add(
        "hidden"
    );


    $("appPage")
    ?.classList.add(
        "hidden"
    );

}



function showRegister(){

    $("loginPage")
    ?.classList.add(
        "hidden"
    );


    $("registerPage")
    ?.classList.remove(
        "hidden"
    );


    $("appPage")
    ?.classList.add(
        "hidden"
    );

}



function showApp(){

    $("loginPage")
    ?.classList.add(
        "hidden"
    );


    $("registerPage")
    ?.classList.add(
        "hidden"
    );


    $("appPage")
    ?.classList.remove(
        "hidden"
    );

}




// =========================
// API
// =========================


async function api(
    path,
    options={}
){

    const res =
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
        await res.json();

    }
    catch{

        data={};

    }



    if(!res.ok){

        throw new Error(
            data.detail ||
            "خطا در سرور"
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


    const name =
        currentUser.display_name ||
        currentUser.user_id ||
        "کاربر";


    $("myName")
    &&
    (
        $("myName")
        .textContent =
        name
    );


    $("myId")
    &&
    (
        $("myId")
        .textContent =
        "شناسه: " +
        currentUser.user_id
    );


    if($("myAvatar")){

        $("myAvatar")
        .src =
        currentUser.avatar ||
        avatar(name);

    }

}



// =========================
// REGISTER
// =========================


async function register(){


    try{


        const data =
        await api(
            "/api/register",
            {

                method:"POST",

                body:
                JSON.stringify({

                    user_id:
                    $("registerUserId")
                    .value
                    .trim(),


                    phone:
                    $("registerPhone")
                    .value
                    .trim(),


                    display_name:
                    $("registerName")
                    .value
                    .trim()

                })

            }
        );



        currentUser =
        data.user ||
        data;



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

// =========================
// LOGIN
// =========================


async function login(){

    try{

        const id =
        $("loginIdentifier")
        .value
        .trim();


        const data =
        await api(
            "/api/users/" +
            encodeURIComponent(id)
        );


        currentUser =
        data.user ||
        data;


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




// =========================
// USERS
// =========================


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



        const users =
        data.users || [];



        box.innerHTML="";



        users.forEach(user=>{


            if(
                user.user_id ===
                getUserId()
            )
            return;



            const card =
            document.createElement(
                "div"
            );


            card.className =
            "user-card";



            card.innerHTML = `

            <img class="avatar"
            src="${
            user.avatar ||
            avatar(
                user.display_name
            )
            }">


            <div class="user-info">

            <b>
            ${
            escapeHtml(
                user.display_name
            )
            }
            </b>

            <p>
            ${
            escapeHtml(
                user.user_id
            )
            }
            </p>

            </div>


            <button class="audio">
            📞
            </button>


            <button class="video">
            🎥
            </button>

            `;



            card.querySelector(
                ".audio"
            ).onclick =
            ()=>startCall(
                user.user_id,
                "audio"
            );



            card.querySelector(
                ".video"
            ).onclick =
            ()=>startCall(
                user.user_id,
                "video"
            );



            box.appendChild(
                card
            );

        });


    }
    catch(e){

        console.log(e);

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
    async(e)=>{


        const data =
        JSON.parse(
            e.data
        );


        await handleSignal(
            data
        );


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
        !socket ||
        socket.readyState !==
        WebSocket.OPEN
    ){

        toast(
            "اتصال تماس آماده نیست"
        );

        return;

    }


    socket.send(
        JSON.stringify(data)
    );

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
    e=>{


        if(
            e.candidate &&
            currentCallUser
        ){

            sendSignal({

                type:
                "ice-candidate",


                target_user_id:
                currentCallUser,


                candidate:
                e.candidate

            });

        }

    };




    peerConnection.ontrack =
    e=>{


        if(!remoteStream)

            remoteStream =
            new MediaStream();



        e.streams[0]
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




// =========================
// START CALL
// =========================


async function startCall(
    id,
    type
){


    currentCallUser =
    id;


    currentCallType =
    type;



    $("callPanel")
    ?.classList
    .remove(
        "hidden"
    );



    try{


        localStream =
        await navigator.mediaDevices
        .getUserMedia({

            audio:true,

            video:
            type==="video"

        });



        $("localVideo")
        .srcObject =
        localStream;



        createPeerConnection();



        localStream
        .getTracks()
        .forEach(t=>{

            peerConnection.addTrack(
                t,
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
            id,

            call_type:
            type,

            offer:
            offer

        });


    }
    catch(e){

        toast(
            "دسترسی دوربین یا میکروفون رد شد"
        );

    }

}




// =========================
// SIGNAL
// =========================


async function handleSignal(data){


    if(data.type==="offer"){


        incomingOffer =
        data.offer;


        currentCallUser =
        data.from_user_id;



        currentCallType =
        data.call_type ||
        "video";



        $("incomingCall")
        ?.classList
        .remove(
            "hidden"
        );


        return;

    }




    if(data.type==="answer"){


        await peerConnection
        .setRemoteDescription(

            new RTCSessionDescription(
                data.answer
            )

        );


        return;

    }




    if(data.type==="ice-candidate"){


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




    if(data.type==="hangup"){

        cleanupCall();

    }


}






// =========================
// ACCEPT
// =========================


async function acceptCall(){


    $("incomingCall")
    ?.classList
    .add(
        "hidden"
    );



    localStream =
    await navigator.mediaDevices
    .getUserMedia({

        audio:true,

        video:
        currentCallType==="video"

    });



    $("localVideo")
    .srcObject =
    localStream;



    createPeerConnection();



    localStream
    .getTracks()
    .forEach(t=>{

        peerConnection.addTrack(
            t,
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
        "hangup",

        target_user_id:
        currentCallUser

    });


    $("incomingCall")
    ?.classList
    .add(
        "hidden"
    );

}




// =========================
// CONTROLS
// =========================


function toggleMicrophone(){

    localStream
    ?.getAudioTracks()
    .forEach(t=>{

        t.enabled =
        !t.enabled;

    });

}



function toggleCamera(){

    localStream
    ?.getVideoTracks()
    .forEach(t=>{

        t.enabled =
        !t.enabled;

    });

}



function hangup(){


    sendSignal({

        type:
        "hangup",

        target_user_id:
        currentCallUser

    });


    cleanupCall();

}




function cleanupCall(){


    peerConnection
    ?.close();


    peerConnection =
    null;



    localStream
    ?.getTracks()
    .forEach(t=>t.stop());



    localStream =
    null;



    $("localVideo")
    &&
    (
        $("localVideo")
        .srcObject=null
    );


    $("remoteVideo")
    &&
    (
        $("remoteVideo")
        .srcObject=null
    );


    $("callPanel")
    ?.classList
    .add(
        "hidden"
    );


}




// =========================
// EVENTS
// =========================


function setupEvents(){


    $("loginButton")
    &&(
    $("loginButton").onclick =
    login
    );


    $("registerButton")
    &&(
    $("registerButton").onclick =
    register
    );


    $("showRegisterButton")
    &&(
    $("showRegisterButton").onclick =
    showRegister
    );


    $("showLoginButton")
    &&(
    $("showLoginButton").onclick =
    showLogin
    );


    $("refreshButton")
    &&(
    $("refreshButton").onclick =
    loadUsers
    );


    $("acceptButton")
    &&(
    $("acceptButton").onclick =
    acceptCall
    );


    $("rejectButton")
    &&(
    $("rejectButton").onclick =
    rejectCall
    );


    $("hangupButton")
    &&(
    $("hangupButton").onclick =
    hangup
    );


    $("logoutButton")
    &&(
    $("logoutButton").onclick =
    ()=>{

        localStorage.clear();

        location.reload();

    }
    );

}



// =========================
// START
// =========================


function start(){


    setupEvents();


    if(
        getUserId()
    ){

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