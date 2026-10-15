/* 상품 이름·가격·요약·재고를 Firestore products 컬렉션에서 읽어 온다.
   그림(emoji)과 자세한 설명(detail)은 그대로 shop.js 의 것을 쓴다. */
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, getDoc, writeBatch, serverTimestamp,
  query, where, orderBy, limit, startAfter, runTransaction
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
// auth.js 가 앱을 먼저 연결해 두고, 로그인 상태도 알려 준다
import { auth, onUser } from "./auth.js";

const db = getFirestore(getApp());
const storage = getStorage(getApp());

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
const PAGE = 3;
let lastDoc = null; // 지금 보이는 마지막 상품 문서 — 더 보기는 이 다음부터 읽는다

function listQuery(after) {
  // 보이는 상품만, 싼 것부터, 세 장만 — 거르기와 자르기는 Firestore 가 한다
  const parts = [
    collection(db, "products"),
    where("isVisible", "==", true),
    orderBy("price", "asc")
  ];
  if (after) parts.push(startAfter(after));
  parts.push(limit(PAGE));
  return query(...parts);
}

const cardHtml = d => {
  const p = d.data();
  const local = findProduct(d.id);
  // imagePath 가 있으면 표시만 해 두고, 사진은 그린 뒤에 paintPhotos 가 바꿔 넣는다
  const photo = typeof p.imagePath === "string" && p.imagePath ? ` data-image-path="${esc(p.imagePath)}"` : "";
  return `
    <a class="card" href="product.html?id=${encodeURIComponent(d.id)}">
      <div class="thumb"${photo}>${local ? local.emoji : ""}</div>
      <h3>${esc(p.name)}</h3>
      <p class="sum">${esc(p.summary)}</p>
      <div class="price">${won(Number(p.price))}</div>
      <div class="stock${Number(p.stock) > 0 ? "" : " soldout"}">${stockText(p.stock)}</div>
    </a>`;
};

// imagePath 경로로 다운로드 URL 을 받아 그림 글자 자리에 사진을 넣는다
// 문서를 읽는 것이 아니므로 읽은 문서 수에 더하지 않는다. 못 받으면 그림 글자를 그대로 둔다
function paintPhotos(box) {
  box.querySelectorAll(".thumb[data-image-path]").forEach(async thumb => {
    const path = thumb.dataset.imagePath;
    thumb.removeAttribute("data-image-path");
    try {
      const url = await getDownloadURL(ref(storage, path));
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      thumb.replaceChildren(img);
    } catch (err) {
      console.error(err);
    }
  });
}

// 세 장을 다 채우지 못했으면 더 가져올 것이 없다
function showMore(show) {
  const slot = document.querySelector("#more-slot");
  if (slot) slot.hidden = !show;
}

async function loadList() {
  const box = document.querySelector("#product-list");
  if (!box) return;
  lastDoc = null;
  showMore(false);
  try {
    const snap = await getDocs(listQuery(null));
    countRead(snap.size);
    if (snap.empty) {
      box.innerHTML = '<p class="empty">등록된 상품이 없습니다.</p>';
      return;
    }
    box.innerHTML = snap.docs.map(cardHtml).join("");
    paintPhotos(box);
    lastDoc = snap.docs[snap.docs.length - 1];
    showMore(snap.size === PAGE);
  } catch (err) {
    countRead(0);
    box.innerHTML = '<p class="empty">목록을 불러오지 못했습니다</p>';
    // 오류 원문 전체는 Console 에만 남긴다 (색인이 없으면 만드는 주소도 여기 나온다)
    console.error(err);
  }
}

async function loadMore(btn) {
  const box = document.querySelector("#product-list");
  if (!box || !lastDoc) return;
  btn.disabled = true;
  try {
    const snap = await getDocs(listQuery(lastDoc));
    countRead(snap.size);
    box.insertAdjacentHTML("beforeend", snap.docs.map(cardHtml).join(""));
    paintPhotos(box);
    if (!snap.empty) lastDoc = snap.docs[snap.docs.length - 1];
    showMore(snap.size === PAGE);
  } catch (err) {
    // 버튼은 그대로 두어 다시 누를 수 있게 한다
    console.error(err);
  } finally {
    btn.disabled = false;
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
    paintOrderButton(box, id);
  } catch (err) {
    countRead(0);
    box.insertAdjacentHTML("afterbegin", `<p class="empty">상품 정보를 불러오지 못했습니다.<br>${esc(err.code || "")} ${esc(err.message)}</p>`);
    console.error(err);
  }
}

/* --- 바로 주문 (상품 상세) --- */
// 장바구니 담기 단추 옆에 붙인다. 장바구니·결제 화면과는 따로 움직인다
function paintOrderButton(box, id) {
  const cartBtn = box.querySelector("#add-to-cart");
  if (!cartBtn) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn";
  btn.id = "order-now";
  btn.textContent = "바로 주문";
  const msg = document.createElement("p");
  msg.className = "lead";
  msg.setAttribute("role", "status");
  btn.addEventListener("click", () => orderNow(id, btn, msg, box));
  cartBtn.after(" ", btn, msg);
}

async function orderNow(id, btn, msg, box) {
  btn.disabled = true;
  msg.textContent = "주문하는 중…";
  try {
    // 로그인 상태 확인이 끝날 때까지 기다린 뒤 본다
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) { msg.textContent = "로그인이 필요합니다"; return; }

    const productRef = doc(db, "products", id);
    const orderRef = doc(collection(db, "orders")); // 자동 ID
    // 재고 확인 · 주문 쓰기 · 재고 차감을 한 번에 — 하나라도 실패하면 아무것도 바뀌지 않는다
    const result = await runTransaction(db, async tx => {
      const snap = await tx.get(productRef);
      countRead(1);
      if (!snap.exists()) throw new Error("Firestore 에 이 상품 문서가 없습니다.");
      const p = snap.data();
      if (!(Number(p.stock) >= 1)) return { soldOut: true };
      const quantity = 1;
      tx.set(orderRef, {
        userId: user.uid,
        items: [{ productId: id, name: p.name, price: p.price, quantity }],
        totalPrice: p.price * quantity,
        status: "paid",
        createdAt: serverTimestamp()
      });
      tx.update(productRef, { stock: p.stock - 1 });
      return { soldOut: false, stock: p.stock - 1 };
    });

    if (result.soldOut) { msg.textContent = "재고가 없습니다"; return; }
    msg.textContent = `주문했습니다. 주문 번호 ${orderRef.id}`;
    const stock = box.querySelector(".stock");
    if (stock) {
      stock.textContent = stockText(result.stock);
      stock.classList.toggle("soldout", !(result.stock > 0));
    }
  } catch (err) {
    // 오류 글은 줄이지 않고 그대로 보여 준다
    msg.textContent = `주문하지 못했습니다. ${err.code || ""} ${err.message}`;
    console.error(err);
  } finally {
    btn.disabled = false;
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
const moreBtn = document.querySelector("#more-btn");
if (moreBtn) moreBtn.addEventListener("click", () => loadMore(moreBtn));
loadList();
loadDetail();
onUser(paintSeedButton);
