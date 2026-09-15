const API_URL = "http://127.0.0.1:8000";


const usersList =
document.getElementById("usersList");



const myUser =
localStorage.getItem("user_id");





async function loadUsers(){


try{


const response =
await fetch(
`${API_URL}/api/users`
);



const data =
await response.json();



usersList.innerHTML = "";





data.users.forEach(user=>{



if(user.user_id === myUser){

return;

}





const item =
document.createElement("div");



item.className =
"user-card";





item.innerHTML = `


<img

class="avatar"

src="${

user.avatar ||

'https://via.placeholder.com/55'

}"

>



<div class="user-info">


<b>

${user.display_name}

</b>


<small>

@${user.user_id}

</small>


</div>





<button

class="call-button"

onclick="callUser('${user.user_id}')"

>

📞

</button>


`;




usersList.appendChild(item);



});



}
catch(error){


console.log(
"Users Error:",
error
);


}



}







// =========================
// CALL USER
// =========================


function callUser(id){



localStorage.setItem(

"call_target",

id

);


location.href="call.html";

location.href =
"index.html";


}






// =========================
// AUTO REFRESH
// =========================


loadUsers();



setInterval(

loadUsers,

5000

);