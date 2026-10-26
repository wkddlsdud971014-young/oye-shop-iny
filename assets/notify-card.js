/* 배송 출발 알림 카드 — 주문을 마친 손님에게만 띄운다.
   주문 완료 화면(done.js)과 바로 주문 성공 직후(products.js)에서만 부른다.
   권한 요청은 「알림 받기」를 누를 때만 한다. 토큰 발급·저장은 하지 않는다. */

// 주문 하나에 카드 하나 — 이미 붙어 있으면 다시 만들지 않는다
export function showNotifyCard(where, orderId) {
  // 알림을 못 쓰는 브라우저면 카드를 띄우지 않는다
  if (!("Notification" in window)) {
    console.log("[알림 권한] 이 브라우저는 알림을 지원하지 않습니다");
    return;
  }
  const old = document.querySelector(".notify-card");
  if (old && old.dataset.orderId === orderId) return;
  if (old) old.remove();

  const card = document.createElement("section");
  card.className = "notify-card";
  card.dataset.orderId = orderId;
  card.setAttribute("aria-live", "polite");
  paint(card, Notification.permission);
  where.after(card);
}

function paint(card, permission) {
  const head = document.createElement("h3");
  const text = document.createElement("p");

  if (permission === "granted") {
    head.textContent = "알림을 받고 있어요";
    text.textContent = "배송이 시작되면 알림으로 알려드릴게요.";
    card.replaceChildren(head, text);
    return;
  }

  if (permission === "denied") {
    head.textContent = "알림이 꺼져 있어요";
    text.textContent = "브라우저 설정에서 켤 수 있어요. 주소창 왼쪽 자물쇠(사이트 정보) 아이콘을 누르고 「알림」을 「허용」으로 바꾼 뒤 이 화면을 새로고침해 주세요.";
    card.replaceChildren(head, text);
    return;
  }

  // default — 아직 고르지 않았다
  head.textContent = "배송이 출발하면 알려 드릴까요?";
  text.textContent = "주문하신 오예상점 상품의 배송이 시작되면 알림으로 알려드릴게요.";

  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "btn";
  yes.textContent = "알림 받기";
  yes.addEventListener("click", async () => {
    yes.disabled = true;
    later.disabled = true;
    const result = await Notification.requestPermission();
    console.log("[알림 권한] 요청 결과:", result);
    paint(card, result);
  });

  // 나중에 — 이번 주문에서만 숨긴다. 다음 주문에서는 다시 묻는다
  const later = document.createElement("button");
  later.type = "button";
  later.className = "btn ghost";
  later.textContent = "나중에";
  later.addEventListener("click", () => {
    console.log("[알림 권한] 나중에 — 이번 주문에서 카드를 숨깁니다");
    card.remove();
  });

  const row = document.createElement("div");
  row.className = "notify-actions";
  row.append(yes, later);
  card.replaceChildren(head, text, row);
}
