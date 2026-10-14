/* 상품 이름·가격·요약·재고를 Firestore products 컬렉션에서 읽어 온다.
   그림(emoji)과 자세한 설명(detail)은 그대로 shop.js 의 것을 쓴다. */
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, getDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
// auth.js 가 앱을 먼저 연결해 두고, 로그인 상태도 알려 준다
import { onUser } from "./auth.js";

const db = getFirestore(getApp());

// 상품 올리기로 등록할 다섯 장 — p1 은 넣지 않는다
const SEED = {
  p2: { stock: 30, isVisible: true },
  p3: { stock: 8, isVisible: true },
  p4: { stock: 0, isVisible: true },
  p5: { stock: 5, isVisible: false },
  p6: { stock: 40, isVisible: true }
};

/* --- 이번 화면에서 읽은 문서 수 --- */
let readCount = 0;
function countRead(n) {
  readCount += n;
  const el = document.querySelector("#read-count");
  if (el) el.textContent = `이번 화면에서 읽은 문서 ${readCount}장`;
}

const domReady = new Promise(r => {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", r);
  else r();
});

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stockText = n => (Number(n) > 0 ? `재고 ${Number(n)}개` : "품절");

/* --- 상품 목록 --- */
async function loadList() {
  const box = document.querySelector("#product-list");
  if (!box) return;
  try {
    const snap = await getDocs(collection(db, "products"));
    countRead(snap.size);
    if (snap.empty) {
      box.innerHTML = '<p class="empty">등록된 상품이 없습니다.</p>';
      return;
    }
    box.innerHTML = snap.docs.map(d => {
      const p = d.data();
      const local = findProduct(d.id);
      return `
    <a class="card" href="product.html?id=${encodeURIComponent(d.id)}">
      <div class="thumb">${local ? local.emoji : ""}</div>
      <h3>${esc(p.name)}</h3>
      <p class="sum">${esc(p.summary)}</p>
      <div class="price">${won(Number(p.price))}</div>
      <div class="stock${Number(p.stock) > 0 ? "" : " soldout"}">${stockText(p.stock)}</div>
    </a>`;
    }).join("");
  } catch (err) {
    countRead(0);
    box.innerHTML = `<p class="empty">상품을 불러오지 못했습니다.<br>${esc(err.code || "")} ${esc(err.message)}</p>`;
    console.error(err);
  }
}

/* --- 상품 상세 --- */
async function loadDetail() {
  const box = document.querySelector("#product-detail");
  if (!box) return;
  const id = qs("id");
  if (!id) { countRead(0); return; }
  try {
    const snap = await getDoc(doc(db, "products", id));
    countRead(snap.exists() ? 1 : 0);
    // app.js 가 그린 상세(그림·설명·담기 단추)는 그대로 두고 글자만 바꾼다
    const h1 = box.querySelector("h1");
    if (!h1) return;
    const price = box.querySelector(".price");
    if (!snap.exists()) {
      price.insertAdjacentHTML("afterend", '<p class="sum">Firestore 에 이 상품 문서가 없습니다.</p>');
      return;
    }
    const p = snap.data();
    h1.textContent = p.name;
    document.title = p.name + " — " + SHOP.name;
    price.textContent = won(Number(p.price));
    price.insertAdjacentHTML("afterend", `
      <p class="sum">${esc(p.summary)}</p>
      <div class="stock${Number(p.stock) > 0 ? "" : " soldout"}">${stockText(p.stock)}</div>`);
  } catch (err) {
    countRead(0);
    box.insertAdjacentHTML("afterbegin", `<p class="empty">상품 정보를 불러오지 못했습니다.<br>${esc(err.code || "")} ${esc(err.message)}</p>`);
    console.error(err);
  }
}

/* --- 상품 올리기 (로그인한 사람에게만 보인다) --- */
async function seedProducts(btn, msg) {
  btn.disabled = true;
  msg.textContent = "올리는 중…";
  try {
    const batch = writeBatch(db);
    Object.entries(SEED).forEach(([id, extra]) => {
      const p = findProduct(id);
      batch.set(doc(db, "products", id), {
        name: p.name,
        price: p.price,
        summary: p.summary,
        stock: extra.stock,
        isVisible: extra.isVisible,
        createdAt: serverTimestamp()
      });
    });
    await batch.commit();
    msg.textContent = `상품 ${Object.keys(SEED).length}개(${Object.keys(SEED).join(", ")})를 올렸습니다.`;
    await loadList();
  } catch (err) {
    msg.textContent = `상품을 올리지 못했습니다. 아무 문서도 바뀌지 않았습니다. 오류: ${err.code || ""} ${err.message}`;
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

function paintSeedButton(user) {
  const slot = document.querySelector("#seed-slot");
  if (!slot) return;
  slot.replaceChildren();
  if (!user) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn";
  btn.textContent = "상품 올리기";
  const msg = document.createElement("p");
  msg.className = "lead";
  msg.setAttribute("role", "status");
  btn.addEventListener("click", () => seedProducts(btn, msg));
  slot.append(btn, msg);
}

await domReady;
loadList();
loadDetail();
onUser(paintSeedButton);
