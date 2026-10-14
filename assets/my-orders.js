/* 마이페이지 「내 주문」 — 내 UID 의 orders 만 구독해서 보여 준다.
   상태(status)가 바뀌면 onSnapshot 이 다시 불려 새로고침 없이 바뀐다. */
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, collection, query, where, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
// auth.js 가 앱을 먼저 연결해 두고, 로그인 상태도 알려 준다
import { auth, onUser } from "./auth.js";

const db = getFirestore(getApp());
const box = document.querySelector("#my-orders");

/* --- 구독은 UID 하나에 하나만 --- */
// 지금 구독 하나 — { uid, unsubscribe, stopped }. 다 끝나서 멈춘 뒤에도 남겨 두어 같은 사람에게 다시 걸지 않는다
let current = null;

// 구독 하나를 딱 한 번만 끊고, 끊은 순간에만 한 줄 남긴다
function release(sub, reason) {
  if (!sub || sub.stopped) return false;
  sub.stopped = true;
  // 첫 알림이 onSnapshot 이 돌려주기 전에 와서 아직 함수가 없으면, watch 가 받은 뒤 끊는다
  if (sub.unsubscribe) sub.unsubscribe();
  console.log(`[그만 듣기] ${reason}`);
  return true;
}

function stopWatching(reason) {
  release(current, reason);
  current = null;
}

// 이 상태가 되면 더 바뀔 일이 없다
const DONE = new Set(["delivered", "canceled"]);
// 0건은 「다 끝남」이 아니다
const allDone = docs => docs.length > 0 && docs.every(d => DONE.has(d.get("status")));

function watch(uid) {
  // 같은 사람이면 이미 듣고 있는(또는 다 끝나 멈춘) 것을 그대로 둔다
  if (current && current.uid === uid) return;
  stopWatching("계정이 바뀌었습니다");
  const sub = { uid, unsubscribe: null, stopped: false };
  current = sub;
  sub.unsubscribe = onSnapshot(myOrders(uid), snap => {
    if (sub.stopped) return;
    const changes = snap.docChanges().map(c => `${c.type} ${c.doc.id} ${c.doc.get("status")}`);
    console.log(`[주문 알림] 주문 ${snap.size}건 · 바뀐 것 ${changes.length}건${changes.length ? " — " + changes.join(", ") : ""}`);
    paint(snap.docs);
    // 주문이 전부 delivered·canceled 면 더 들을 것이 없다
    if (allDone(snap.docs) && release(sub, `주문 ${snap.size}건이 모두 끝나 실시간 확인을 멈춥니다`)) {
      paintDone(sub, snap.docs);
    }
  }, err => {
    // 오류 글은 줄이지 않고 그대로 보여 준다
    console.error(err);
    box.replaceChildren(note(`주문을 불러오지 못했습니다. ${err.code || ""} ${err.message}`));
  });
  // 첫 알림 안에서 이미 멈췄으면 그때 없던 해제 함수를 지금 부른다 (한 번만)
  if (sub.stopped) sub.unsubscribe();
}

// 거르기는 Firestore 가 한다 — 정렬(orderBy)은 넣지 않고 받은 뒤 화면에서 한다
const myOrders = uid => query(collection(db, "orders"), where("userId", "==", uid));

// 지금 화면이 아직 이 구독의 사람 것인가 — 로그아웃·계정 변경 뒤 늦게 온 결과를 버린다
const stillMine = sub => current === sub && auth.currentUser?.uid === sub.uid;

/* --- 멈춘 뒤: 안내 + 「다시 확인」 --- */
// 안내는 지금 보이는 주문에 맞춘다 — 멈춘 상태는 그대로다
function stoppedNote(docs) {
  if (allDone(docs)) return "모든 주문이 완료되어 실시간 확인을 마쳤어요. 새로고침하면 최신 내역을 볼 수 있어요.";
  if (!docs.length) return "주문이 없어요. 실시간 확인은 중단된 상태예요. 새로고침하면 다시 실시간으로 확인할 수 있어요.";
  return "진행 중인 주문이 있어요. 실시간 확인은 중단된 상태예요. 새로고침하면 다시 실시간으로 확인할 수 있어요.";
}

function paintDone(sub, docs) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn ghost";
  btn.textContent = "다시 확인";
  const msg = document.createElement("p");
  msg.setAttribute("role", "status");
  msg.style.cssText = "margin:12px 0 0;font-size:14px;color:var(--gold-2)";
  btn.addEventListener("click", () => recheck(sub, btn, msg));
  box.append(note(stoppedNote(docs)), btn, msg);
}

// 한 번만 새로 읽는다 — onSnapshot 은 다시 걸지 않는다
async function recheck(sub, btn, msg) {
  if (btn.disabled || !stillMine(sub)) return;
  btn.disabled = true;
  msg.textContent = "확인하는 중…";
  try {
    const snap = await getDocs(myOrders(sub.uid));
    if (!stillMine(sub)) return; // 그사이 로그아웃·계정 변경 — 이전 사람 결과는 그리지 않는다
    paint(snap.docs);
    paintDone(sub, snap.docs);
    console.log(`[다시 확인] 주문 ${snap.size}건을 한 번 새로 읽었습니다`);
  } catch (err) {
    console.error(err);
    if (!stillMine(sub)) return;
    // 목록은 그대로 두고, 오류 글을 줄이지 않고 보여 준다
    msg.textContent = `다시 확인하지 못했습니다. ${err.code || ""} ${err.message}`;
    btn.disabled = false;
  }
}

/* --- 그리기 --- */
const note = text => {
  const p = document.createElement("p");
  p.className = "lead";
  p.textContent = text;
  return p;
};

// 서버 시각이 아직 안 정해졌으면 어림값을 쓴다
const orderedAt = d => d.get("createdAt", { serverTimestamps: "estimate" });

function paint(docs) {
  if (!docs.length) { box.replaceChildren(note("아직 주문이 없습니다.")); return; }

  // 최신순 — 날짜가 없는 문서는 맨 뒤로
  const rows = [...docs].sort((a, b) => {
    const ta = orderedAt(a)?.toMillis?.() ?? -Infinity;
    const tb = orderedAt(b)?.toMillis?.() ?? -Infinity;
    return tb - ta;
  });

  const table = document.createElement("table");
  table.className = "cart";
  table.innerHTML = "<thead><tr><th>주문한 날</th><th>상품</th><th>합계</th><th>상태</th></tr></thead>";
  const body = document.createElement("tbody");
  rows.forEach(d => {
    const o = d.data();
    const at = orderedAt(d);
    const cells = [
      at?.toDate ? at.toDate().toLocaleString("ko-KR") : "",
      (Array.isArray(o.items) ? o.items : []).map(i => i?.name ?? "").join(", "),
      typeof o.totalPrice === "number" ? won(o.totalPrice) : String(o.totalPrice ?? ""),
      String(o.status ?? "") // 원문 그대로
    ];
    const tr = document.createElement("tr");
    cells.forEach(text => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  table.appendChild(body);
  box.replaceChildren(table);
}

/* --- 로그인 상태에 맞춰 켜고 끈다 --- */
if (box) {
  onUser(user => {
    if (!user) { stopWatching("로그아웃했습니다"); box.replaceChildren(); return; }
    watch(user.uid);
  });
  // 페이지를 떠나면 끊는다 — 다 끝나 이미 멈춘 것은 남겨 두어, 뒤로 가기로 돌아와도 다시 걸지 않는다
  addEventListener("pagehide", () => {
    if (current && !current.stopped) stopWatching("페이지를 떠났습니다");
  });
  // 뒤로 가기로 그대로 돌아오면 다시 잇는다
  addEventListener("pageshow", e => {
    if (e.persisted && auth.currentUser) watch(auth.currentUser.uid);
  });
}
