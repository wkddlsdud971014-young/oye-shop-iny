/* 마이페이지 「내 주문」 — 내 UID 의 orders 만 구독해서 보여 준다.
   상태(status)가 바뀌면 onSnapshot 이 다시 불려 새로고침 없이 바뀐다. */
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, collection, query, where, onSnapshot, getDocs, doc, runTransaction
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
  clearAlerts(); // 이전 계정의 알림을 남기지 않는다
  // statuses — 이 구독이 마지막으로 본 주문별 status. 첫 알림에서 채운다
  const sub = { uid, unsubscribe: null, stopped: false, statuses: null };
  current = sub;
  sub.unsubscribe = onSnapshot(myOrders(uid), snap => {
    if (sub.stopped) return;
    const changes = snap.docChanges().map(c => `${c.type} ${c.doc.id} ${c.doc.get("status")}`);
    console.log(`[주문 알림] 주문 ${snap.size}건 · 바뀐 것 ${changes.length}건${changes.length ? " — " + changes.join(", ") : ""}`);
    const moves = statusMoves(sub, snap);
    paint(snap.docs, true); // 실시간으로 듣는 목록에만 「주문 취소」를 단다
    showAlerts(moves);
    showToast(moves.length);
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

/* --- 상태가 바뀐 주문 찾기 --- */
// 이전 status 와 새 status 를 실제로 견준다. 이럴 때는 알리지 않는다:
// 첫 알림(들어올 때 있던 주문) · 새로 생긴 주문 · 지워진 주문 · status 가 같은 경우(다른 필드만 바뀜, 같은 값 다시 옴)
// · 서버가 아직 확인하지 않은 캐시 알림(fromCache) — 이때는 값만 기억해 둔다
function statusMoves(sub, snap) {
  const first = sub.statuses === null;
  if (first) sub.statuses = new Map();
  const seen = sub.statuses;
  const moves = [];
  snap.docChanges().forEach(c => {
    const id = c.doc.id;
    if (c.type === "removed") { seen.delete(id); return; }
    const next = String(c.doc.get("status") ?? "");
    const had = seen.has(id);
    const prev = seen.get(id);
    seen.set(id, next);
    if (first || snap.metadata.fromCache || c.type !== "modified" || !had || prev === next) return;
    const items = c.doc.get("items");
    moves.push({
      id, prev, next,
      names: (Array.isArray(items) ? items : []).map(i => i?.name ?? "").filter(Boolean).join(", ")
    });
  });
  return moves;
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

/* --- 상태 글자와 진행 단계 --- */
// Firestore 값(영어 소문자)은 그대로 두고 화면 글자만 바꾼다
const STEPS = ["paid", "preparing", "shipped", "delivered"];
const STATUS_TEXT = new Map([
  ["paid", "주문 완료"],
  ["preparing", "상품 준비 중"],
  ["shipped", "배송 중"],
  ["delivered", "배송 완료"],
  ["canceled", "주문 취소"]
]);
// 다섯 가지 밖의 값(오타 포함)은 영어를 보이지 않고 「확인 중」
const statusText = s => STATUS_TEXT.get(s) ?? "확인 중";

function statusCell(s) {
  const td = document.createElement("td");
  const span = document.createElement("span");
  span.className = "order-status" + (s === "canceled" ? " is-canceled" : STATUS_TEXT.has(s) ? "" : " is-unknown");
  span.textContent = statusText(s);
  td.appendChild(span);
  return td;
}

// 네 단계 — 지나온 단계 · 지금 단계 · 아직 안 온 단계. 모르는 값이면 아무 단계도 강조하지 않는다
function stepsRow(s, id, cancellable) {
  const now = STEPS.indexOf(s);
  const ol = document.createElement("ol");
  ol.className = "order-steps";
  ol.setAttribute("aria-label", "주문 진행 단계");
  STEPS.forEach((step, i) => {
    const li = document.createElement("li");
    li.textContent = STATUS_TEXT.get(step);
    if (now >= 0 && i < now) li.className = "is-done";
    else if (i === now) { li.className = "is-current"; li.setAttribute("aria-current", "step"); }
    ol.appendChild(li);
  });
  const td = document.createElement("td");
  td.className = "order-steps-cell";
  td.colSpan = 4;
  td.appendChild(ol);
  // 정확히 paid 인 주문에만 취소 단추 — 좁은 상태 칸 대신 표 너비를 다 쓰는 단계 줄 아래에 둔다
  if (cancellable && s === "paid") {
    const row = document.createElement("div");
    row.className = "order-cancel-row";
    row.appendChild(cancelButton(id));
    td.appendChild(row);
  }
  const tr = document.createElement("tr");
  tr.appendChild(td);
  return tr;
}

// cancellable — 실시간 구독으로 받은 목록일 때만 true. 「다시 확인」(getDocs) 목록은 구독이 멈춰 있어
// 취소 결과를 받아 그릴 길이 없으므로 취소 단추를 달지 않는다
function paint(docs, cancellable = false) {
  cancelButtons.clear();
  // 서버에서 더는 paid 가 아닌 주문은 「처리 중」 표시를 거둔다
  docs.forEach(d => { if (d.get("status") !== "paid") cancelling.delete(d.id); });
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
      typeof o.totalPrice === "number" ? won(o.totalPrice) : String(o.totalPrice ?? "")
    ];
    const status = String(o.status ?? "");
    const tr = document.createElement("tr");
    cells.forEach(text => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });
    tr.appendChild(statusCell(status));
    body.appendChild(tr);
    // 취소된 주문은 단계 없이 「주문 취소」만
    if (status !== "canceled") {
      tr.className = "order-main";
      body.appendChild(stepsRow(status, d.id, cancellable));
    }
  });
  table.appendChild(body);
  box.replaceChildren(table);
}

/* --- 상태 변경 알림 --- */
// 목록 바로 위, 글 흐름 안에 둔다 — 목록을 덮지 않는다. 화면 읽기 프로그램은 새로 붙은 알림만 읽는다
const alerts = box ? document.createElement("div") : null;
if (alerts) {
  alerts.className = "order-alerts";
  alerts.setAttribute("aria-live", "polite");
  alerts.setAttribute("aria-relevant", "additions");
  alerts.setAttribute("aria-label", "주문 상태 알림");
  box.before(alerts);
}

const line = (label, ...parts) => {
  const p = document.createElement("p");
  const b = document.createElement("span");
  b.className = "order-alert-label";
  b.textContent = label + " ";
  p.append(b, ...parts);
  return p;
};

// 주문 하나에 알림 하나 — 여러 주문이 한꺼번에 바뀌어도 섞이지 않는다
function showAlerts(moves) {
  if (!alerts) return;
  moves.forEach(m => {
    const card = document.createElement("div");
    card.className = "order-alert";
    card.dataset.orderId = m.id;

    const title = document.createElement("p");
    title.className = "order-alert-title";
    title.textContent = "주문 상태가 변경됐어요";

    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = " → ";
    const said = document.createElement("span");
    said.className = "sr-only";
    said.textContent = "에서 ";
    const change = line("상태 변경", statusText(m.prev), arrow, said, statusText(m.next));

    const close = document.createElement("button");
    close.type = "button";
    close.className = "order-alert-close";
    close.setAttribute("aria-label", `${m.names || "주문"} 알림 닫기`);
    close.textContent = "×";
    close.addEventListener("click", () => {
      // 닫으면 남은 알림의 닫기 단추로 옮겨 가 키보드로 이어서 닫을 수 있게 한다
      const next = card.nextElementSibling || card.previousElementSibling;
      card.remove();
      next?.querySelector(".order-alert-close")?.focus();
    });

    card.append(title, line("상품명", m.names || "상품 정보 없음"), change, close);
    alerts.appendChild(card);
  });
}

/* --- 화면 위 초록 토스트 --- */
// 자세한 내용은 위 알림 카드가 읽어 주므로, 토스트는 눈으로만 보는 짧은 신호다(화면 읽기 프로그램이 두 번 읽지 않게)
const toasts = box ? document.createElement("div") : null;
if (toasts) {
  toasts.className = "order-toasts";
  toasts.setAttribute("aria-hidden", "true");
  document.body.appendChild(toasts);
}
const toastTimers = new Set();

// 한 번에 온 변경은 토스트 하나로 묶고 몇 건인지 붙인다. 앞 토스트가 떠 있어도 새 토스트를 따로 쌓아 빠뜨리지 않는다
function showToast(count) {
  if (!toasts || !count) return;
  const toast = document.createElement("div");
  toast.className = "order-toast";
  const text = document.createElement("span");
  text.textContent = "주문 상태가 변경되었습니다";
  toast.appendChild(text);
  if (count > 1) {
    const chip = document.createElement("span");
    chip.className = "order-toast-count";
    chip.textContent = `${count}건`;
    toast.appendChild(chip);
  }
  toasts.appendChild(toast);
  // 3초 뒤 저절로 사라진다
  const timer = setTimeout(() => {
    toastTimers.delete(timer);
    toast.remove();
  }, 3000);
  toastTimers.add(timer);
}

/* --- 주문 취소 (서버가 확정한 뒤에만 화면이 바뀐다) --- */
// 서버에서 취소가 끝나기 전에는 canceled 로 그리지 않는다. 바뀐 상태는 기존 onSnapshot 이 받아 다시 그린다
const cancelling = new Set();    // 취소를 보냈고 아직 서버에서 paid 로 보이는 주문 ID
const cancelButtons = new Map(); // 지금 화면에 있는 취소 단추 — 다시 그릴 때마다 새로 채운다

// 결과 한 줄 — 목록을 다시 그려도 지워지지 않게 목록 밖(바로 위)에 둔다
const cancelMsg = box ? document.createElement("p") : null;
if (cancelMsg) {
  cancelMsg.className = "order-cancel-msg";
  cancelMsg.setAttribute("role", "status");
  box.before(cancelMsg);
}

function cancelButton(id) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn ghost order-cancel";
  const busy = cancelling.has(id);
  btn.disabled = busy;
  btn.textContent = busy ? "취소 처리 중..." : "주문 취소";
  btn.addEventListener("click", () => cancelOrder(id));
  cancelButtons.set(id, btn);
  return btn;
}

const CANCEL_FAIL = "주문을 취소하지 못했어요. 현재 주문 상태를 확인한 뒤 다시 시도해 주세요.";

// 트랜잭션 안에서 거절할 때 쓰는 표시 — Firestore 오류와 구분한다
const refuse = reason => Object.assign(new Error(reason), { refused: reason });

async function cancelOrder(id) {
  const sub = current;
  const uid = auth.currentUser?.uid;
  // 처리 중이면 다시 누른 것은 무시한다 · 실시간 구독 중인 본인 목록에서만
  if (cancelling.has(id) || !sub || sub.stopped || !uid || uid !== sub.uid) return;
  cancelling.add(id);
  const btn = cancelButtons.get(id);
  if (btn) { btn.disabled = true; btn.textContent = "취소 처리 중..."; }
  cancelMsg.textContent = "";

  const ref = doc(db, "orders", id);
  try {
    // 읽기 → 확인 → status 한 칸만 바꾸기. 이 함수는 재시도될 수 있으므로 Firestore 읽기·쓰기 말고는 아무것도 하지 않는다
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw refuse("not-found");
      if (snap.get("userId") !== uid) throw refuse("not-owner");
      if (snap.get("status") !== "paid") throw refuse("not-paid");
      // items · totalPrice · createdAt · userId 는 그대로 둔다. 재고는 건드리지 않는다
      tx.update(ref, { status: "canceled" });
    });
    console.log(`[주문 취소] ${id} 서버에서 취소 확정`);
    // 그사이 로그아웃·계정 변경이면 이전 사람 화면에 아무것도 쓰지 않는다
    if (current === sub && auth.currentUser?.uid === uid) cancelMsg.textContent = "주문이 취소됐어요.";
    // 「처리 중」은 onSnapshot 이 canceled 를 가져와 다시 그릴 때 거둔다
  } catch (err) {
    console.log(`[주문 취소] ${id} 실패 — ${err.refused || err.code || err.name}`);
    cancelling.delete(id);
    if (current !== sub || auth.currentUser?.uid !== uid) return;
    // 화면의 상태는 바꾸지 않는다. 결과가 불확실할 때(연결 끊김 등)도 같은 문구로 먼저 상태를 확인하게 한다
    cancelMsg.textContent = CANCEL_FAIL;
    const b = cancelButtons.get(id);
    if (b) { b.disabled = false; b.textContent = "주문 취소"; }
  }
}

function clearAlerts() {
  if (alerts) alerts.replaceChildren();
  // 이전 계정의 취소 결과와 처리 중 표시도 지운다
  cancelling.clear();
  if (cancelMsg) cancelMsg.textContent = "";
  // 이전 계정의 토스트와 남은 타이머도 함께 지운다
  toastTimers.forEach(clearTimeout);
  toastTimers.clear();
  if (toasts) toasts.replaceChildren();
}

/* --- 로그인 상태에 맞춰 켜고 끈다 --- */
if (box) {
  onUser(user => {
    if (!user) { stopWatching("로그아웃했습니다"); clearAlerts(); box.replaceChildren(); return; }
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
