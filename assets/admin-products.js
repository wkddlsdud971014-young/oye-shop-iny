/* 관리 화면 — 상품 관리 표.
   보여 줄지 말지는 admin.html 이 커스텀 클레임 role 로 판단하고, 여기서는 읽기·그리기·저장만 한다.
   상품을 완전히 지우는 단추는 두지 않는다. */
// auth.js 가 앱을 먼저 연결해 둔다
import "./auth.js";
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, addDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

const db = getFirestore(getApp());
// 버킷은 설정의 storageBucket 값을 그대로 쓴다
const storage = getStorage(getApp());

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
// 문서 ID → 이 화면에서 사진을 덮어 올린 시각. 같은 주소의 옛 사진이 브라우저에 남아 있지 않게 한다
const freshPhoto = new Map();

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
function photoField() {
  const input = make("input", { type: "file", accept: "image/*" });
  return { input, label: make("label", { className: "pa-field" }, "사진", input) };
}

/* --- 사진 --- */
// 올리기 전에 거른다 — Storage 규칙과 같은 기준(이미지 · 5MB 미만). 괜찮으면 "" 를 돌려준다
function checkPhoto(file) {
  if (!file.type.startsWith("image/")) return "이미지 파일만 올릴 수 있습니다";
  if (file.size >= 5 * 1024 * 1024) return "5MB 넘는 사진은 올릴 수 없습니다";
  return "";
}

// 고른 파일을 줄이거나 바꾸지 않고 products/문서 ID/main.jpg 에 그대로 올린다 (있으면 덮어쓴다)
// 문서에는 아무것도 쓰지 않는다 — 다 올라간 뒤에 부르는 쪽이 imagePath 를 저장한다
async function uploadPhoto(id, file, show) {
  // 맨 앞에 / 를 붙이지 않는다 — 예: products/p1/main.jpg
  const path = `products/${id}/main.jpg`;
  show("올리는 중 … 0%");
  const task = uploadBytesResumable(ref(storage, path), file);
  task.on("state_changed", s => {
    const pct = s.totalBytes ? Math.floor(s.bytesTransferred / s.totalBytes * 100) : 0;
    show(`올리는 중 … ${pct}%`);
  });
  await task;
  freshPhoto.set(id, Date.now());
  return path;
}

// imagePath 가 있으면 작은 사진을 넣는다. 화면에 보여 줄 때만 주소를 받고, 문서에는 저장하지 않는다
async function paintThumb(box, id, path) {
  try {
    let url = await getDownloadURL(ref(storage, path));
    if (freshPhoto.has(id)) url += `&v=${freshPhoto.get(id)}`;
    box.replaceChildren(make("img", { className: "pa-thumb", src: url, alt: "" }));
  } catch (err) {
    console.error(err);
    box.replaceChildren(make("span", { className: "pa-nophoto", textContent: "사진을 못 불러옴", title: errorLine("", err).trim() }));
  }
}

/* --- 한 상품의 두 행 --- */
// note 가 있으면 아래 칸에 남겨 둔다 (저장했다는 알림 같은 것)
function paint(id, note = "") {
  const p = products.get(id);
  const soldOut = !(Number(p.stock) > 0);
  const sold = toggle(soldOut, "품절");
  const shown = toggle(p.isVisible === true, "노출");
  const editBtn = button("고치기");
  const thumb = cell();
  if (typeof p.imagePath === "string" && p.imagePath) paintThumb(thumb, id, p.imagePath);

  const main = make("tr", { className: "pa-main" },
    thumb,
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
  const extra = make("tr", { className: "pa-extra" }, make("td", { colSpan: 8 }, panel, msg));
  const sync = () => { extra.hidden = !panel.childElementCount && !msg.textContent; };
  sync();

  const controls = [sold.input, shown.input, editBtn];
  // 저장하는 동안에는 이 행의 단추를 잠근다. 실패하면 오류를 남기고 false 를 돌려준다
  // file 이 있으면 사진을 먼저 올리고, 다 올라간 뒤에 imagePath 를 patch 와 함께 저장한다
  async function save(patch, okText, file = null) {
    controls.forEach(c => { c.disabled = true; });
    msg.textContent = "저장하는 중…";
    sync();
    let head = `저장하지 못했습니다. (${id})`;
    try {
      if (file) {
        head = `사진을 올리지 못했습니다. imagePath 는 적지 않았습니다. (${id})`;
        const path = await uploadPhoto(id, file, text => { msg.textContent = text; sync(); });
        head = `사진은 올라갔지만 문서를 저장하지 못했습니다. (${id})`;
        patch = { ...patch, imagePath: path };
      }
      await updateDoc(doc(db, "products", id), patch);
      Object.assign(products.get(id), patch);
      paint(id, okText);
      return true;
    } catch (err) {
      console.error(err);
      msg.textContent = errorLine(head, err);
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

  // 고치기 → price · summary · stock · 사진
  editBtn.addEventListener("click", () => {
    const price = field("price", p.price, { inputMode: "numeric" });
    const summary = field("summary", p.summary);
    const stock = field("stock", p.stock, { inputMode: "numeric" });
    const photo = photoField();
    const ok = button("고친 내용 저장", "btn");
    const cancel = button("취소");
    panel.replaceChildren(make("div", { className: "pa-inline" }, price.label, summary.label, stock.label, photo.label, ok, cancel));
    msg.textContent = "";
    sync();
    price.input.focus();
    cancel.addEventListener("click", () => { panel.replaceChildren(); msg.textContent = ""; sync(); });
    ok.addEventListener("click", async () => {
      const nPrice = toInt(price.input.value);
      const nStock = toInt(stock.input.value);
      if (!(nPrice >= 1)) { msg.textContent = "price 는 1 이상의 정수로 넣어 주세요."; sync(); return; }
      if (!(nStock >= 0)) { msg.textContent = "stock 은 0 이상의 정수로 넣어 주세요."; sync(); return; }
      const file = photo.input.files[0] || null;
      const bad = file ? checkPhoto(file) : "";
      if (bad) { msg.textContent = bad; sync(); return; }
      ok.disabled = true;
      const patch = { price: nPrice, summary: summary.input.value.trim(), stock: nStock };
      const okText = `고쳤습니다. price ${nPrice} · stock ${nStock}` + (file ? ` · imagePath products/${id}/main.jpg` : "");
      if (!(await save(patch, okText, file))) ok.disabled = false;
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
  // 사진은 문서를 만들기 전에 거른다
  const file = f.photo.files[0] || null;
  const bad = file ? checkPhoto(file) : "";
  if (bad) { newMsg.textContent = bad; return; }

  const data = { name, price, summary: f.summary.value.trim(), stock, isVisible: false };
  f.save.disabled = true;
  newMsg.textContent = "만드는 중…";
  let id = null;
  let head = "새 상품을 만들지 못했습니다.";
  try {
    // 1) 자동 문서 ID · 처음에는 숨김 · 만든 시각은 서버 시각
    const created = await addDoc(collection(db, "products"), { ...data, createdAt: serverTimestamp() });
    id = created.id;
    products.set(id, data);
    paint(id, "새로 만들었습니다. 가게에는 아직 안 보입니다. isVisible false");
    if (file) {
      // 2) 그 문서 ID 로 사진을 올린다
      head = `새 상품 ${id} 문서는 만들었지만 사진을 올리지 못했습니다. imagePath 는 적지 않았습니다. 표의 「고치기」 에서 다시 올릴 수 있습니다.`;
      const path = await uploadPhoto(id, file, text => { newMsg.textContent = text; });
      // 3) 다 올라간 뒤에 imagePath 를 저장한다
      head = `새 상품 ${id} 의 사진은 올라갔지만 imagePath 를 저장하지 못했습니다. 표의 「고치기」 에서 다시 올릴 수 있습니다.`;
      await updateDoc(doc(db, "products", id), { imagePath: path });
      products.get(id).imagePath = path;
      paint(id, `새로 만들었습니다. 가게에는 아직 안 보입니다. isVisible false · imagePath ${path}`);
    }
    newForm.reset();
    status.textContent = `새 상품 ${id} 를 표 맨 아래에 붙였습니다.`;
  } catch (err) {
    console.error(err);
    if (id) {
      // 문서는 이미 생겼다 — 같은 상품이 두 번 만들어지지 않게 입력 칸은 닫고, 오류는 그 행과 표 위에 남긴다
      newForm.reset();
      paint(id, errorLine(head, err));
      status.textContent = errorLine(head, err);
    } else {
      newMsg.textContent = errorLine(head, err);
    }
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
