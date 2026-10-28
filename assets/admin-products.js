/* 관리 화면 — 상품 관리 표.
   보여 줄지 말지는 admin.html 이 커스텀 클레임 role 로 판단하고, 여기서는 읽기·그리기·저장만 한다.
   상품을 완전히 지우는 단추는 두지 않는다. */
// auth.js 가 앱을 먼저 연결해 둔다
import "./auth.js";
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, addDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const db = getFirestore(getApp());

const section = document.querySelector("#product-admin");
const body = document.querySelector("#pa-body");
const status = document.querySelector("#pa-status");
const newBtn = document.querySelector("#pa-new-btn");
const newForm = document.querySelector("#pa-new");
const newMsg = document.querySelector("#pa-new-msg");

// 문서 ID → 문서 내용. 저장이 끝나면 여기를 고치고 그 행만 다시 그린다
const products = new Map();
// 문서 ID → 그 상품의 두 행(본 행, 아래 칸)
const rows = new Map();

// 오류 글은 줄이지 않고 그대로 보여 준다 — admin.html 과 같은 모양
const errorLine = (head, err) => `${head}\n${err && err.code ? err.code : ""}\n${err && err.message ? err.message : String(err)}`;

// 숫자만 받는다 — "12" 는 12, "1.5" · "12개" · "" 는 NaN
const toInt = v => {
  const s = String(v ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : NaN;
};

/* --- 작은 도우미 --- */
function make(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}
const cell = (...kids) => make("td", {}, ...kids);
const button = (text, className = "btn ghost") => make("button", { type: "button", className, textContent: text });
function field(labelText, value, attrs = {}) {
  const input = make("input", { value: value ?? "", ...attrs });
  return { input, label: make("label", { className: "pa-field" }, labelText, input) };
}
function toggle(checked, text) {
  const input = make("input", { type: "checkbox", checked });
  return { input, label: make("label", { className: "pa-toggle" }, input, " ", text) };
}

/* --- 한 상품의 두 행 --- */
// note 가 있으면 아래 칸에 남겨 둔다 (저장했다는 알림 같은 것)
function paint(id, note = "") {
  const p = products.get(id);
  const soldOut = !(Number(p.stock) > 0);
  const sold = toggle(soldOut, "품절");
  const shown = toggle(p.isVisible === true, "노출");
  const editBtn = button("고치기");

  const main = make("tr", { className: "pa-main" },
    cell(make("code", { textContent: id })),
    cell(String(p.name ?? "")),
    cell(String(p.price ?? "")),
    cell(String(p.stock ?? "")),
    cell(sold.label),
    cell(shown.label),
    cell(editBtn)
  );
  // 아래 칸 — 재고 입력 · 고치기 칸이 열리고, 저장 결과와 오류가 이 행 바로 아래에 나온다
  const panel = make("div");
  const msg = make("p", { className: "pa-msg", textContent: note });
  msg.setAttribute("role", "status");
  const extra = make("tr", { className: "pa-extra" }, make("td", { colSpan: 7 }, panel, msg));
  const sync = () => { extra.hidden = !panel.childElementCount && !msg.textContent; };
  sync();

  const controls = [sold.input, shown.input, editBtn];
  // 저장하는 동안에는 이 행의 단추를 잠근다. 실패하면 오류를 남기고 false 를 돌려준다
  async function save(patch, okText) {
    controls.forEach(c => { c.disabled = true; });
    msg.textContent = "저장하는 중…";
    sync();
    try {
      await updateDoc(doc(db, "products", id), patch);
      Object.assign(products.get(id), patch);
      paint(id, okText);
      return true;
    } catch (err) {
      console.error(err);
      msg.textContent = errorLine(`저장하지 못했습니다. (${id})`, err);
      controls.forEach(c => { c.disabled = false; });
      sync();
      return false;
    }
  }

  // 품절 켜기 → stock 0 으로 저장. 끄기 → 1 이상 정수 재고를 받아 저장
  sold.input.addEventListener("change", async () => {
    if (sold.input.checked) {
      if (!(await save({ stock: 0 }, "품절로 바꿨습니다. stock 0"))) sold.input.checked = false;
      return;
    }
    // 재고를 넣고 저장하기 전까지는 품절 그대로 둔다
    sold.input.checked = true;
    const qty = field("다시 들어온 재고", "", { inputMode: "numeric", placeholder: "1 이상의 정수" });
    const ok = button("재고 저장", "btn");
    const cancel = button("취소");
    panel.replaceChildren(make("div", { className: "pa-inline" }, qty.label, ok, cancel));
    sync();
    qty.input.focus();
    cancel.addEventListener("click", () => { panel.replaceChildren(); msg.textContent = ""; sync(); });
    ok.addEventListener("click", async () => {
      const n = toInt(qty.input.value);
      if (!(n >= 1)) { msg.textContent = "재고는 1 이상의 정수로 넣어 주세요."; sync(); return; }
      ok.disabled = true;
      if (!(await save({ stock: n }, `품절을 풀었습니다. stock ${n}`))) ok.disabled = false;
    });
  });

  // 노출 → isVisible true / false 로 저장
  shown.input.addEventListener("change", async () => {
    const next = shown.input.checked;
    if (!(await save({ isVisible: next }, next ? "가게에 보이게 했습니다. isVisible true" : "가게에서 숨겼습니다. isVisible false"))) {
      shown.input.checked = !next;
    }
  });

  // 고치기 → price · summary · stock
  editBtn.addEventListener("click", () => {
    const price = field("price", p.price, { inputMode: "numeric" });
    const summary = field("summary", p.summary);
    const stock = field("stock", p.stock, { inputMode: "numeric" });
    const ok = button("고친 내용 저장", "btn");
    const cancel = button("취소");
    panel.replaceChildren(make("div", { className: "pa-inline" }, price.label, summary.label, stock.label, ok, cancel));
    msg.textContent = "";
    sync();
    price.input.focus();
    cancel.addEventListener("click", () => { panel.replaceChildren(); msg.textContent = ""; sync(); });
    ok.addEventListener("click", async () => {
      const nPrice = toInt(price.input.value);
      const nStock = toInt(stock.input.value);
      if (!(nPrice >= 1)) { msg.textContent = "price 는 1 이상의 정수로 넣어 주세요."; sync(); return; }
      if (!(nStock >= 0)) { msg.textContent = "stock 은 0 이상의 정수로 넣어 주세요."; sync(); return; }
      ok.disabled = true;
      const patch = { price: nPrice, summary: summary.input.value.trim(), stock: nStock };
      if (!(await save(patch, `고쳤습니다. price ${nPrice} · stock ${nStock}`))) ok.disabled = false;
    });
  });

  // 이미 그려 둔 행이면 그 자리에서 바꾸고, 처음이면 표 끝에 붙인다
  const old = rows.get(id);
  if (old) {
    old.main.replaceWith(main);
    old.extra.replaceWith(extra);
  } else {
    body.append(main, extra);
  }
  rows.set(id, { main, extra });
}

/* --- 모두 읽기 --- */
// isVisible 로 거르지 않는다 — 숨긴 상품도 관리자에게는 보인다
async function load() {
  body.replaceChildren();
  products.clear();
  rows.clear();
  status.textContent = "상품을 읽고 있습니다…";
  try {
    const snap = await getDocs(collection(db, "products"));
    snap.docs
      .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))
      .forEach(d => { products.set(d.id, d.data()); paint(d.id); });
    const hidden = snap.docs.filter(d => d.data().isVisible !== true).length;
    status.textContent = `상품 ${snap.size}개를 읽었습니다. 그중 가게에 안 보이는 상품 ${hidden}개`;
  } catch (err) {
    console.error(err);
    status.textContent = errorLine("상품을 읽지 못했습니다.", err);
  }
}

/* --- 새 상품 --- */
newBtn.addEventListener("click", () => {
  newForm.hidden = !newForm.hidden;
  newMsg.textContent = "";
  if (!newForm.hidden) newForm.elements.name.focus();
});
newForm.addEventListener("reset", () => { newForm.hidden = true; newMsg.textContent = ""; });

newForm.addEventListener("submit", async e => {
  e.preventDefault();
  const f = newForm.elements;
  const name = f.name.value.trim();
  const price = toInt(f.price.value);
  const stock = toInt(f.stock.value);
  if (!name) { newMsg.textContent = "name 을 넣어 주세요."; return; }
  if (!(price >= 1)) { newMsg.textContent = "price 는 1 이상의 정수로 넣어 주세요."; return; }
  if (!(stock >= 0)) { newMsg.textContent = "stock 은 0 이상의 정수로 넣어 주세요."; return; }

  const data = { name, price, summary: f.summary.value.trim(), stock, isVisible: false };
  f.save.disabled = true;
  newMsg.textContent = "만드는 중…";
  try {
    // 자동 문서 ID · 처음에는 숨김 · 만든 시각은 서버 시각
    const ref = await addDoc(collection(db, "products"), { ...data, createdAt: serverTimestamp() });
    products.set(ref.id, data);
    paint(ref.id, "새로 만들었습니다. 가게에는 아직 안 보입니다. isVisible false");
    newForm.reset();
    status.textContent = `새 상품 ${ref.id} 를 표 맨 아래에 붙였습니다.`;
  } catch (err) {
    console.error(err);
    newMsg.textContent = errorLine("새 상품을 만들지 못했습니다.", err);
  } finally {
    f.save.disabled = false;
  }
});

/* --- admin.html 이 부른다 --- */
export function showProductAdmin() {
  section.hidden = false;
  return load();
}

export function hideProductAdmin() {
  section.hidden = true;
  newForm.reset();
  body.replaceChildren();
  products.clear();
  rows.clear();
  status.textContent = "";
}
