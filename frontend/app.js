const API_URL = "http://127.0.0.1:8000";

let userId = "";
let roomId = "";

let ws = null;

let peer = null;

let localStream = null;

let otherUser = null;



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
.onclick = async()=>{


    const response =
    await fetch(
        `${API_URL}/api/create-room`,
        {
            method:"POST"
        }
    );


    const data =
    await response.json();



    roomInput.value =
    data.room_id;


    statusText.innerText =
    "اتاق ساخته شد: " + data.room_id;


};




// =========================
// JOIN ROOM
// =========================

document
.getElementById("joinRoom")
.onclick = async()=>{


    userId =
    userInput.value.trim();


    roomId =
    roomInput.value.trim();



    if(!userId || !roomId){

        alert(
            "شناسه و کد اتاق را وارد کنید"
        );

        return;

    }



    await startCamera();


    connectSocket();


};




// =========================
// CAMERA
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
// SOCKET
// =========================

function connectSocket(){


    ws =
    new WebSocket(

        `ws://127.0.0.1:8000/ws/call/${roomId}/${userId}`

    );



    ws.onopen = ()=>{


        statusText.innerText =
        "به اتاق وصل شدی";


    };





    ws.onmessage = async(event)=>{


        const data =
        JSON.parse(event.data);



        // نفر جدید وارد شد

        if(data.type==="user_joined"){


            otherUser =
            data.user;



            statusText.innerText =
            "کاربر وصل شد";


        }





        // دریافت Offer

        if(data.type==="offer"){


            otherUser =
            data.from;



            await createPeer();



            await peer.setRemoteDescription(
                data.offer
            );



            const answer =
            await peer.createAnswer();



            await peer.setLocalDescription(
                answer
            );



            send({

                type:"answer",

                target:data.from,

                answer:answer

            });



        }





        // دریافت Answer

        if(data.type==="answer"){


            await peer.setRemoteDescription(
                data.answer
            );


        }






        // دریافت ICE

        if(data.type==="ice"){


            if(peer){


                await peer.addIceCandidate(
                    data.candidate
                );


            }


        }





        if(data.type==="user_left"){


            statusText.innerText =
            "کاربر خارج شد";


            remoteVideo.srcObject=null;


        }



    };



}




// =========================
// PEER CONNECTION
// =========================

async function createPeer(){


    if(peer)
        return;



    peer =
    new RTCPeerConnection({

        iceServers:[

            {
                urls:
                "stun:stun.l.google.com:19302"
            }

        ]

    });





    localStream
    .getTracks()
    .forEach(track=>{


        peer.addTrack(
            track,
            localStream
        );


    });





    peer.ontrack =
    event=>{


        remoteVideo.srcObject =
        event.streams[0];


    };





    peer.onicecandidate =
    event=>{


        if(
            event.candidate &&
            otherUser
        ){


            send({

                type:"ice",

                target:otherUser,

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
.onclick = async()=>{


    if(!otherUser){

        alert(
            "هنوز کاربر دیگری وارد نشده"
        );

        return;

    }



    await createPeer();



    const offer =
    await peer.createOffer();



    await peer.setLocalDescription(
        offer
    );



    send({

        type:"offer",

        target:otherUser,

        offer:offer

    });



};





// =========================
// SEND SIGNAL
// =========================

function send(data){


    if(
        ws &&
        ws.readyState === WebSocket.OPEN
    ){


        ws.send(
            JSON.stringify(data)
        );


    }


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
            track=>track.stop()
        );

    }



    if(ws){

        ws.close();

    }



    localVideo.srcObject=null;

    remoteVideo.srcObject=null;


    statusText.innerText =
    "تماس بسته شد";


};
