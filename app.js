import { db } from "./firebase.js";
import { ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";
import { settle } from "./engine.js";

let room = new URLSearchParams(location.search).get("room") || "demo";

onValue(ref(db, `rooms/${room}`), (snap)=>{
  let data = snap.val() || {};
  render(data);
});

function render(data){
  let s = data.players || {};
  let html = "";
  for(let k of ["A","B","C","D"]){
    html += `<div>${k}:${s[k]?.score||0}</div>`;
  }
  document.getElementById("scoreBoard").innerHTML = html;
}

window.submitRound = async function(){
  let round = {
    type: document.getElementById("type").value,
    winner: document.getElementById("winner").value,
    loser: document.getElementById("loser").value,
    base: Number(document.getElementById("base").value),
    birds:[{
      A:document.getElementById("E_A").value,
      B:document.getElementById("E_B").value,
      C:document.getElementById("E_C").value,
      D:document.getElementById("E_D").value
    }]
  };

  let result = settle(round);

  let id = Date.now();

  await set(ref(db, `rooms/${room}/rounds/${id}`), {
    round,
    result
  });

  alert("已提交");
}
