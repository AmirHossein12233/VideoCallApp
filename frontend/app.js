const API_URL = "http://127.0.0.1:8000";

let userId = "";
let roomId = "";

let ws = null;

let localStream = null;
let peer = null;

let isCaller = false;



const userInput = document.getElementById("userId");
const roomInput = document.getElementById("roomId");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const statusText = document.getElementById("status");



// =========================
// CREATE ROOM
// =========================

document
.getElementById("createRoom")
.onclick = async ()=>{


    const res = await fetch(
        `${API_URL}/api/create-room`,
        {
            method:"POST"
        }
    );


    const data = await res.json();


    roomInput.value = data.room_id;

    statusText.innerText =
        "اتاق ساخته شد: " + data.room_id;


};




// =========================
// START CAMERA
// =========================

async function startCamera(){


    localStream =
        await navigator.mediaDevices.getUserMedia(
            {
                video:true,
                audio:true
            }
        );


    localVideo.srcObject =
        localStream;

}




// =========================
// JOIN ROOM
// =========================

document
.getElementById("joinRoom")
.onclick = async ()=>{


    userId =
        userInput.value.trim();


    roomId =
        roomInput.value.trim();



    if(!userId || !roomId){

        alert("شناسه و اتاق را وارد کنید");
        return;

    }



    await startCamera();


    connectSocket();


    statusText.innerText =
        "وصل شدی به اتاق";

};





// =========================
// WEBSOCKET
// =========================

function connectSocket(){


    ws =
    new WebSocket(
        `ws://127.0.0.1:8000/ws/call/${roomId}/${userId}`
    );



    ws.onopen = ()=>{

        console.log("socket connected");

    };



    ws.onmessage = async(event)=>{


        const data =
        JSON.parse(event.data);



        if(data.type==="offer"){


            await createPeer();


            await peer.setRemoteDescription(
                data.offer
            );


            const answer =
            await peer.createAnswer();


            await peer.setLocalDescription(
                answer
            );



            sendSignal({

                type:"answer",

                target:data.from,

                answer:answer

            });


        }




        if(data.type==="answer"){


            await peer.setRemoteDescription(
                data.answer
            );


        }




        if(data.type==="ice"){


            if(peer){

                await peer.addIceCandidate(
                    data.candidate
                );

            }

        }


    };

}



// =========================
// CREATE PEER
// =========================

async function createPeer(){


    peer =
    new RTCPeerConnection(
        {

            iceServers:[

                {
                    urls:
                    "stun:stun.l.google.com:19302"
                }

            ]

        }
    );




    localStream
    .getTracks()
    .forEach(
        track=>{

            peer.addTrack(
                track,
                localStream
            );

        }
    );




    peer.ontrack =
    event=>{


        remoteVideo.srcObject =
        event.streams[0];


    };





    peer.onicecandidate =
    event=>{


        if(event.candidate){


            sendSignal({

                type:"ice",

                target:getOtherUser(),

                candidate:event.candidate

            });


        }


    };


}




// =========================
// START CALL
// =========================

document
.getElementById("startCall")
.onclick = async ()=>{


    isCaller=true;


    await createPeer();



    const offer =
    await peer.createOffer();



    await peer.setLocalDescription(
        offer
    );



    sendSignal({

        type:"offer",

        target:getOtherUser(),

        offer:offer

    });


};




// =========================
// SEND MESSAGE
// =========================

function sendSignal(data){


    if(ws && ws.readyState===WebSocket.OPEN){

        ws.send(
            JSON.stringify(data)
        );

    }


}



// =========================
// FIND OTHER USER
// =========================

function getOtherUser(){

    return isCaller
    ? "guest"
    : "host";

}




// =========================
// END CALL
// =========================

document
.getElementById("endCall")
.onclick = ()=>{


    if(peer){

        peer.close();
        peer=null;

    }


    if(localStream){

        localStream
        .getTracks()
        .forEach(
            t=>t.stop()
        );

    }


    if(ws){

        ws.close();

    }


    localVideo.srcObject=null;
    remoteVideo.srcObject=null;


    statusText.innerText =
    "تماس پایان یافت";


};
