/* 주문 완료 화면 — 포트원 결제 결과를 이 한 곳에서 처리한다.
   PC 는 결제 화면이, 휴대폰은 포트원이 주소 뒤에 paymentId·code·message 를 붙여 보낸다. */
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
// auth.js 가 앱을 먼저 연결해 두고, 로그인 상태도 알려 준다
import { auth } from "./auth.js";
import { showNotifyCard } from "./notify-card.js";

const db = getFirestore(getApp());

const title = document.querySelector("#done-title");
const msg = document.querySelector("#done-msg");
const prose = document.querySelector("#done-prose");
// 줄마다 글자를 그대로 넣는다 - 받은 글자를 꾸미지 않는다
const say = (head, ...lines) => {
  title.textContent = head;
  msg.replaceChildren(...lines.map(t => Object.assign(document.createElement("p"), { textContent: t })));
};

const paymentId = qs("paymentId");
const code = qs("code");

if (code) {
  // 실패 또는 결제창 닫기 - 주문을 만들지 않고 장바구니도 그대로 둔다
  say("결제가 완료되지 않았습니다", qs("message") ?? "", "장바구니는 그대로입니다");
} else if (!paymentId) {
  // paymentId 도 code 도 없으면 결제 결과가 아니다
  say("결제 결과가 없습니다", "주문을 만들지 않았습니다. 장바구니는 그대로입니다");
} else {
  await saveOrder(paymentId);
}

async function saveOrder(paymentId) {
  // 로그인 상태 확인이 끝날 때까지 기다린 뒤 본다
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    say("로그인이 필요합니다", "로그인하지 않아 주문을 만들지 않았습니다. 장바구니는 그대로입니다", "결제 ID: " + paymentId);
    return;
  }

  // 산 상품 목록을 장바구니에서 읽어 온다 - 상품 목록에 없는 상품은 뺀다
  const bought = Cart.read().filter(i => findProduct(i.id));
  if (!bought.length) {
    // 이미 주문을 저장해 장바구니를 비운 뒤 화면을 다시 연 경우 등
    say("장바구니가 비어 있습니다", "주문을 만들지 않았습니다", "결제 ID: " + paymentId);
    return;
  }
  // 「바로 주문」과 같은 모양 - 상품마다 { productId, name, price, quantity }
  const items = bought.map(i => {
    const p = findProduct(i.id);
    return { productId: p.id, name: p.name, price: p.price, quantity: i.qty };
  });
  // 산 상품 합계 - 상품 가격 × 수량의 합이고 배송비는 넣지 않는다
  const totalPrice = Cart.total();

  try {
    // 결제 ID 를 주문 문서 ID 로 쓴다
    await setDoc(doc(db, "orders", paymentId), {
      userId: user.uid,
      items,
      totalPrice,
      status: "paid",
      createdAt: serverTimestamp(),
      paymentId
    });
  } catch (err) {
    // 오류 글은 줄이지 않고 그대로 보여 준다
    say("주문을 저장하지 못했습니다", `${err.code || ""} ${err.message}`, "장바구니는 그대로입니다", "결제 ID: " + paymentId);
    console.error(err);
    return;
  }

  Cart.clear();
  const badge = document.querySelector(".cart-count");
  if (badge) badge.textContent = Cart.count();
  say("주문이 접수되었습니다", "결제 ID: " + paymentId);
  prose.hidden = false;
  // 주문이 저장된 뒤에만 배송 알림을 묻는다
  showNotifyCard(prose, paymentId);

  // 통로가 이미 있으면 그대로 쓰고, 없을 때만 새로 만든다
  window.dataLayer = window.dataLayer || [];
  // 앞에서 넣은 상품 값이 섞이지 않게 먼저 비운다
  dataLayer.push({ ecommerce: null });
  // 통로 끝에 한 덩어리를 넣는다 - 넣는 순간이 태그 관리자가 듣는 순간
  dataLayer.push({
    // 무슨 일이 일어났나 - 계획서 이름 글자 그대로
    event: "purchase",
    // 같이 보내는 상품 값 묶음
    ecommerce: {
      // 이 주문을 가려내는 번호 - 포트원 결제 ID
      transaction_id: paymentId,
      // 어느 나라 돈인가
      currency: "KRW",
      // 금액 - 산 상품 합계
      value: totalPrice,
      // 산 상품마다 상자 하나씩 목록에 넣는다
      items: items.map(i => ({ item_id: i.productId, item_name: i.name, price: i.price, quantity: i.quantity }))
    }
  });
}
