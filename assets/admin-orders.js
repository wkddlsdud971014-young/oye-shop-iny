/* 관리 화면 — 주문 탭.
   보여 줄지 말지는 admin.html 이 커스텀 클레임 role 로 판단하고, 여기서는 읽기·그리기·상태 바꾸기만 한다.
   주문을 취소하는 단추는 두지 않는다. adminLogs 에는 쓰지 않는다. */
// auth.js 가 앱을 먼저 연결해 둔다
import "./auth.js";
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, updateDoc, serverTimestamp, Timestamp,
  query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const db = getFirestore(getApp());

const section = document.querySelector("#order-admin");
const body = document.querySelector("#od-body");
const status = document.querySelector("#od-status");
const filterBox = document.querySelector("#od-filter");
const moreBtn = document.querySelector("#od-more");
const detail = document.querySelector("#od-detail");

// 한 번에 읽는 주문 수
const PAGE = 20;
// 지금 고른 필터 — "all" 이면 status 로 거르지 않는다
let filter = "all";
// 마지막으로 읽은 문서 — 「더 보기」 는 이 문서 다음부터 읽는다
let lastDoc = null;
// 필터를 바꾸는 사이 늦게 온 결과를 버리기 위한 번호
let loadSeq = 0;
// 문서 ID → 목록의 행. 상태를 바꾸면 그 행의 status 칸도 고친다
const rows = new Map();

// 상태마다 다음 상태와 단추 글. delivered · canceled 는 다음이 없다 — 단추를 두지 않는다
const NEXT = {
  paid: { to: "preparing", label: "포장 시작" },
  preparing: { to: "shipped", label: "배송 시작" },
  shipped: { to: "delivered", label: "배송 완료" }
};

// 오류 글은 줄이지 않고 그대로 보여 준다 — admin.html 과 같은 모양
const errorLine = (head, err) => `${head}\n${err && err.code ? err.code : ""}\n${err && err.message ? err.message : String(err)}`;

/* --- 작은 도우미 --- */
function make(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}
const cell = (...kids) => make("td", {}, ...kids);
const button = (text, className = "btn ghost") => make("button", { type: "button", className, textContent: text });
// Timestamp 면 한국 시간으로, 아니면 빈 글자
const when = t => (t instanceof Timestamp ? t.toDate().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "");

/* --- 상태 바꾸기 확인 창 --- */
// 브라우저 기본 confirm 대신 admin.html 의 <dialog> 를 쓴다. 「바꾸기」 를 고르면 true
const confirmBox = document.querySelector("#od-confirm");
function confirmMove(id, from, to) {
  document.querySelector("#od-confirm-text").textContent = `주문 ${id} 의 status 를 ${from} → ${to} 로 바꿉니다`;
  confirmBox.returnValue = "";
  confirmBox.showModal();
  return new Promise(resolve => {
    confirmBox.addEventListener("close", () => resolve(confirmBox.returnValue === "move"), { once: true });
  });
}

/* --- 목록 --- */
// createdAt 이 늦은 것부터 20건. 필터는 where 로 Firestore 에서 거른다
function pageQuery() {
  const parts = [collection(db, "orders")];
  if (filter !== "all") parts.push(where("status", "==", filter));
  parts.push(orderBy("createdAt", "desc"));
  if (lastDoc) parts.push(startAfter(lastDoc));
  parts.push(limit(PAGE));
  return query(...parts);
}

function paintRow(d) {
  const o = d.data();
  const statusCell = cell(String(o.status ?? ""));
  const openBtn = button("상세");
  openBtn.addEventListener("click", () => openDetail(d.id));
  const tr = make("tr", {},
    cell(make("code", { textContent: d.id })),
    cell(String(o.totalPrice ?? "")),
    statusCell,
    cell(when(o.createdAt)),
    cell(openBtn)
  );
  rows.set(d.id, { statusCell });
  body.append(tr);
}

// more 가 false 면 처음부터 다시 읽는다
async function loadPage(more) {
  const seq = ++loadSeq;
  if (!more) {
    lastDoc = null;
    rows.clear();
    body.replaceChildren();
  }
  moreBtn.hidden = true;
  status.textContent = "주문을 읽고 있습니다…";
  try {
    const snap = await getDocs(pageQuery());
    if (seq !== loadSeq) return;
    snap.docs.forEach(paintRow);
    if (snap.docs.length) lastDoc = snap.docs[snap.docs.length - 1];
    // 꽉 차게 왔으면 뒤에 더 있을 수 있다
    moreBtn.hidden = snap.size < PAGE;
    const label = filter === "all" ? "전체" : filter;
    status.textContent = rows.size
      ? `${label} 주문 ${rows.size}건을 읽었습니다.` + (moreBtn.hidden ? " 더 읽을 주문이 없습니다." : "")
      : `${label} 주문이 없습니다.`;
  } catch (err) {
    if (seq !== loadSeq) return;
    console.error(err);
    status.textContent = errorLine("주문을 읽지 못했습니다.", err);
    // 「더 보기」 에서 실패했으면 다시 누를 수 있게 둔다
    moreBtn.hidden = !more;
  }
}

filterBox.addEventListener("click", e => {
  const b = e.target.closest("button[data-status]");
  if (!b) return;
  filterBox.querySelectorAll("button[data-status]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  filter = b.dataset.status;
  loadPage(false);
});
moreBtn.addEventListener("click", () => loadPage(true));

/* --- 상세 --- */
// 있을 때만 보여 주는 필드는 값이 없으면 줄을 만들지 않는다
function line(label, value) {
  return make("tr", {}, make("th", { textContent: label, scope: "row" }), cell(value));
}

// 브라우저 주문(products.js · done.js)은 { productId, name, price, quantity },
// 결제 웹훅 주문(functions/index.js)은 { id, qty } 로 적힌다 — 이름이 없으면 상품 ID 를 보여 준다
const firstOf = (...vals) => vals.find(v => v !== undefined && v !== null && v !== "");
function itemsText(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return items.map(it => {
    const name = firstOf(it?.name, it?.productId, it?.id) ?? "?";
    const qty = firstOf(it?.quantity, it?.qty) ?? "?";
    return `${name} × ${qty}`;
  }).join("\n");
}

// note 가 있으면 상세 아래에 남겨 둔다 (바꿨다는 알림 같은 것)
async function openDetail(id, note = "") {
  detail.hidden = false;
  detail.replaceChildren(make("p", { className: "pa-msg", textContent: `주문 ${id} 를 읽고 있습니다…` }));
  let snap;
  try {
    snap = await getDoc(doc(db, "orders", id));
  } catch (err) {
    console.error(err);
    detail.replaceChildren(make("p", { className: "pa-msg", textContent: errorLine(`주문 ${id} 를 읽지 못했습니다.`, err) }));
    return;
  }
  if (!snap.exists()) {
    detail.replaceChildren(make("p", { className: "pa-msg", textContent: `주문 ${id} 가 없습니다.` }));
    return;
  }
  const o = snap.data();
  const now = String(o.status ?? "");
  // 목록의 status 칸도 방금 읽은 값으로 맞춘다
  const r = rows.get(id);
  if (r) r.statusCell.textContent = now;

  const table = make("table", { className: "cart pa-table od-detail" },
    make("tbody", {},
      line("주문 ID", make("code", { textContent: id })),
      line("items", make("span", { className: "od-items", textContent: itemsText(o.items) })),
      line("totalPrice", String(o.totalPrice ?? "")),
      line("status", now),
      line("receivedAt", when(o.receivedAt)),
      line("processStatus", String(o.processStatus ?? "")),
      ...(o.processError !== undefined ? [line("processError", String(o.processError))] : []),
      ...(o.mailStatus !== undefined ? [line("mailStatus", String(o.mailStatus))] : []),
      ...(o.statusUpdatedAt !== undefined ? [line("statusUpdatedAt", when(o.statusUpdatedAt))] : [])
    )
  );
  const msg = make("p", { className: "pa-msg", textContent: note });
  msg.setAttribute("role", "status");
  const kids = [make("h3", { textContent: "주문 상세" }), table];

  const next = NEXT[now];
  if (next) {
    const moveBtn = button(next.label, "btn");
    moveBtn.addEventListener("click", async () => {
      if (!(await confirmMove(id, now, next.to))) return;
      moveBtn.disabled = true;
      msg.textContent = "바꾸는 중…";
      try {
        // status 와 statusUpdatedAt 두 필드만 고친다
        await updateDoc(doc(db, "orders", id), { status: next.to, statusUpdatedAt: serverTimestamp() });
      } catch (err) {
        console.error(err);
        msg.textContent = errorLine(`status 를 바꾸지 못했습니다. (${id})`, err);
        moveBtn.disabled = false;
        return;
      }
      // 바꾼 뒤에는 상세를 다시 읽는다
      await openDetail(id, `status 를 ${now} → ${next.to} 로 바꿨습니다.`);
    });
    kids.push(make("div", { className: "pa-actions" }, moveBtn));
  }
  kids.push(msg);
  detail.replaceChildren(...kids);
}

/* --- admin.html 이 부른다 --- */
// 주문 탭을 처음 열 때 한 번 읽는다. 다시 열어도 다시 읽지 않는다 — 필터 단추를 누르면 새로 읽는다
let loaded = false;
export async function showOrderAdmin() {
  section.hidden = false;
  if (loaded) return;
  loaded = true;
  await loadPage(false);
}

export function hideOrderAdmin() {
  section.hidden = true;
  loaded = false;
  loadSeq += 1;
  lastDoc = null;
  rows.clear();
  body.replaceChildren();
  status.textContent = "";
  moreBtn.hidden = true;
  detail.hidden = true;
  detail.replaceChildren();
  filter = "all";
  filterBox.querySelectorAll("button[data-status]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.status === "all")));
}
