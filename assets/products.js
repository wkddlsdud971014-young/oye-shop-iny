/* 상품 이름·가격·요약·재고를 Firestore products 컬렉션에서 읽어 온다.
   그림(emoji)과 자세한 설명(detail)은 그대로 shop.js 의 것을 쓴다. */
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, getDoc, serverTimestamp,
  query, where, orderBy, limit, startAfter, runTransaction
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
// auth.js 가 앱을 먼저 연결해 두고, 로그인 상태도 알려 준다
import { auth } from "./auth.js";
import { showNotifyCard } from "./notify-card.js";

const db = getFirestore(getApp());
const storage = getStorage(getApp());

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
// 상세 설명(description) — 빈 줄로 문단을 나누고, 문단 안의 줄바꿈은 <br> 로 남긴다. 글자는 esc 로 막아 HTML 로 실행되지 않는다
const descriptionHtml = text => String(text).replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/)
  .map(t => `<p>${esc(t.trim()).replace(/\n/g, "<br>")}</p>`).join("");

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
async function putPhoto(thumb, path, alt = "") {
  try {
    const url = await getDownloadURL(ref(storage, path));
    const img = document.createElement("img");
    img.alt = alt;
    // 사진 파일을 받지 못하면 그림 글자를 그대로 둔다
    await new Promise((ok, fail) => {
      img.onload = ok;
      img.onerror = () => fail(new Error("사진을 불러오지 못했습니다: " + path));
      img.src = url;
    });
    thumb.replaceChildren(img);
    thumb.classList.add("has-photo");
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function paintPhotos(box) {
  box.querySelectorAll(".thumb[data-image-path]").forEach(thumb => {
    const path = thumb.dataset.imagePath;
    thumb.removeAttribute("data-image-path");
    putPhoto(thumb, path);
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
    // shop.js 목록에 없는 상품(관리 화면에서 만든 자동 ID 상품)은 app.js 가 상세를 못 그리고 「그런 상품이 없습니다」만 남긴다
    // 그때는 Firestore 문서로 같은 모양의 틀을 여기서 그린다. 장바구니는 shop.js 목록으로만 움직이므로 담기 단추는 두지 않는다
    if (!box.querySelector("h1")) {
      if (!snap.exists()) {
        box.innerHTML = `<p class="empty">그런 상품이 없습니다.<br>products/${esc(id)} 문서가 없습니다.</p>`;
        return;
      }
      box.innerHTML = '<div class="thumb"></div><div><h1></h1><div class="price"></div></div>';
    }
    // app.js 가 그린 상세(그림·설명·담기 단추)는 그대로 두고 글자만 바꾼다
    const h1 = box.querySelector("h1");
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
    // description 이 있으면 상세 설명으로 쓴다. 없으면 app.js 가 shop.js 의 detail 로 그린 설명을 그대로 둔다
    if (typeof p.description === "string" && p.description.trim()) {
      let prose = box.querySelector(".body.prose");
      if (!prose) {
        prose = document.createElement("div");
        prose.className = "body prose";
        h1.parentElement.append(prose);
      }
      prose.innerHTML = descriptionHtml(p.description);
    }
    paintOrderButton(box, id);
    // imagePath 가 있으면 그림 글자 자리를 사진으로 바꾼다 — 목록과 같은 방식
    const thumb = box.querySelector(".thumb");
    if (thumb && typeof p.imagePath === "string" && p.imagePath) {
      if (await putPhoto(thumb, p.imagePath, p.name)) box.classList.add("has-photo");
    }
  } catch (err) {
    countRead(0);
    const failed = `<p class="empty">상품 정보를 불러오지 못했습니다.<br>${esc(err.code || "")} ${esc(err.message)}</p>`;
    // app.js 가 그린 상세가 없으면 「그런 상품이 없습니다」 대신 읽기 실패만 보여 준다
    if (box.querySelector("h1")) box.insertAdjacentHTML("afterbegin", failed);
    else box.innerHTML = failed;
    console.error(err);
  }
}

/* --- 바로 주문 (상품 상세) --- */
// 장바구니 담기 단추 옆에 붙인다. 장바구니·결제 화면과는 따로 움직인다
function paintOrderButton(box, id) {
  const cartBtn = box.querySelector("#add-to-cart");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn";
  btn.id = "order-now";
  btn.textContent = "바로 주문";
  const msg = document.createElement("p");
  msg.className = "lead";
  msg.setAttribute("role", "status");
  btn.addEventListener("click", () => orderNow(id, btn, msg, box));
  // 담기 단추가 있으면 그 옆에, 없으면(자동 ID 상품) 재고 아래에 붙인다
  if (cartBtn) cartBtn.after(" ", btn, msg);
  else box.querySelector("h1").parentElement.append(btn, msg);
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
    // 주문이 저장된 뒤에만 배송 알림을 묻는다
    showNotifyCard(msg, orderRef.id);
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

await domReady;
const moreBtn = document.querySelector("#more-btn");
if (moreBtn) moreBtn.addEventListener("click", () => loadMore(moreBtn));
loadList();
loadDetail();
