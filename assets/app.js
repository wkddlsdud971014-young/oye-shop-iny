/* ===========================================================
   오예상점 — 화면을 그리고 장바구니를 다루는 코드
   이 파일은 고치지 않아도 됩니다. (상품은 shop.js 에 있습니다)
   =========================================================== */

const won = n => n.toLocaleString("ko-KR") + "원";
const findProduct = id => PRODUCTS.find(p => p.id === id);
const qs = key => new URLSearchParams(location.search).get(key);

/* --- 장바구니는 브라우저에 저장합니다 --- */
const Cart = {
  read() {
    try { return JSON.parse(localStorage.getItem("haru_cart") || "[]"); }
    catch (e) { return []; }
  },
  write(items) {
    localStorage.setItem("haru_cart", JSON.stringify(items));
  },
  add(id) {
    const items = Cart.read();
    const hit = items.find(i => i.id === id);
    if (hit) hit.qty += 1;
    else items.push({ id, qty: 1 });
    Cart.write(items);

// 담은 상품의 이름과 가격을 상품 목록에서 찾아 온다
const p = findProduct(id);
// 통로가 이미 있으면 그대로 쓰고, 없을 때만 새로 만든다
window.dataLayer = window.dataLayer || [];
// 앞에서 넣은 상품 값이 섞이지 않게 먼저 비운다
dataLayer.push({ ecommerce: null });
// 통로 끝에 한 덩어리를 넣는다 - 넣는 순간이 태그 관리자가 듣는 순간
dataLayer.push({
  // 무슨 일이 일어났나 - 계획서 이름 글자 그대로
  event: "add_to_cart",
  // 같이 보내는 상품 값 묶음
  ecommerce: {
    // 어느 나라 돈인가
    currency: "KRW",
    // 금액 - 한 번 누르면 한 개라 그 상품 가격 하나
    value: p.price,
    // 담은 상품 상자 하나를 목록에 넣는다
    items: [{ item_id: p.id, item_name: p.name, price: p.price, quantity: 1 }]
  }
});
     
  },
  remove(id) {
    Cart.write(Cart.read().filter(i => i.id !== id));
  },
  clear() {
    localStorage.removeItem("haru_cart");
  },
  count() {
    return Cart.read().reduce((sum, i) => sum + i.qty, 0);
  },
  total() {
    return Cart.read().reduce((sum, i) => {
      const p = findProduct(i.id);
      return sum + (p ? p.price * i.qty : 0);
    }, 0);
  }
};

/* --- 머리글과 꼬리글 --- */
function paintChrome() {
  // 화면마다 제목이 달라야 검색에서 구분됩니다.
  // 그래서 제목을 통째로 바꾸지 않고 가게 이름만 갈아 끼웁니다.
  document.title = document.title.replaceAll("오예상점", SHOP.name);

  const brand = document.querySelector(".brand");
  if (brand) brand.textContent = SHOP.name;

  const badge = document.querySelector(".cart-count");
  if (badge) badge.textContent = Cart.count();

  const foot = document.querySelector("footer.site .wrap");
  if (foot) foot.textContent = SHOP.name + " · " + SHOP.tagline;
}

/* --- 상품 목록 --- */
function paintList() {
  const box = document.querySelector("#product-list");
  if (!box) return;

  document.querySelector("#hero-title").textContent = SHOP.name;
  document.querySelector("#hero-tagline").textContent = SHOP.tagline;

  // 카드는 products.js 가 Firestore 에서 읽어 와서 그린다
  box.innerHTML = '<p class="lead">상품을 불러오는 중입니다.</p>';
}

/* --- 상품 상세 --- */
function paintDetail() {
  const box = document.querySelector("#product-detail");
  if (!box) return;

  const p = findProduct(qs("id"));
  if (!p) { box.innerHTML = '<p class="empty">그런 상품이 없습니다.</p>'; return; }

  document.title = p.name + " — " + SHOP.name;
  box.innerHTML = `
    <div class="thumb">${p.emoji}</div>
    <div>
      <h1>${p.name}</h1>
      <div class="price">${won(p.price)}</div>
      <div class="body prose">${p.detail.map(t => `<p>${t}</p>`).join("")}</div>
      <button class="btn" id="add-to-cart">장바구니에 담기</button>
    </div>`;

  // 통로가 이미 있으면 그대로 쓰고, 없을 때만 새로 만든다
  window.dataLayer = window.dataLayer || [];
  // 앞에서 넣은 상품 값이 섞이지 않게 먼저 비운다
  dataLayer.push({ ecommerce: null });
  // 상품 상세 화면이 열린 순간 - 보고 있는 상품 하나를 넣는다
  dataLayer.push({
    // 무슨 일이 일어났나 - 계획서 이름 글자 그대로
    event: "view_item",
    // 같이 보내는 상품 값 묶음
    ecommerce: {
      // 어느 나라 돈인가
      currency: "KRW",
      // 금액 - 보고 있는 상품 가격 하나
      value: p.price,
      // 보고 있는 상품 상자 하나를 목록에 넣는다
      items: [{ item_id: p.id, item_name: p.name, price: p.price, quantity: 1 }]
    }
  });

  document.querySelector("#add-to-cart").addEventListener("click", () => {
    Cart.add(p.id);
    location.href = "cart.html";
  });
}

/* --- 장바구니 --- */
function paintCart() {
  const box = document.querySelector("#cart-box");
  if (!box) return;

  const items = Cart.read();
  if (items.length === 0) {
    box.innerHTML = '<p class="empty">장바구니가 비어 있습니다.</p>';
    return;
  }

  box.innerHTML = `
    <table class="cart">
      <tr><th>상품</th><th>수량</th><th>금액</th><th></th></tr>
      ${items.map(i => {
        const p = findProduct(i.id);
        if (!p) return "";
        return `<tr>
          <td>${p.emoji} ${p.name}</td>
          <td>${i.qty}</td>
          <td>${won(p.price * i.qty)}</td>
          <td><button class="btn ghost drop" data-id="${p.id}">빼기</button></td>
        </tr>`;
      }).join("")}
    </table>
    <div class="total">합계 ${won(Cart.total())}</div>
    <a class="btn" href="checkout.html">결제하기</a>`;

  box.querySelectorAll(".drop").forEach(b => {
    b.addEventListener("click", () => { Cart.remove(b.dataset.id); location.reload(); });
  });
}

/* --- 결제 --- */
function paintCheckout() {
  const form = document.querySelector("#pay-form");
  if (!form) return;

  // ▼ 여기에 「결제를 시작했다」(begin_checkout)를 알리는 코드가 들어갑니다 (뒤 수업에서)
  //   결제 화면(checkout.html)이 열린 직후입니다. 「결제하기」 단추를 누른 순간이 아닙니다.
  // 결제할 상품 목록을 장바구니에서 읽어 온다 - 상품 목록에 없는 상품은 뺀다
  const cartItems = Cart.read().filter(i => findProduct(i.id));
  // 장바구니 합계 - 상품 가격 × 수량의 합이고 배송비는 넣지 않는다
  const cartTotal = Cart.total();
  // 통로가 이미 있으면 그대로 쓰고, 없을 때만 새로 만든다
  window.dataLayer = window.dataLayer || [];
  // 앞에서 넣은 상품 값이 섞이지 않게 먼저 비운다
  dataLayer.push({ ecommerce: null });
  // 통로 끝에 한 덩어리를 넣는다 - 넣는 순간이 태그 관리자가 듣는 순간
  dataLayer.push({
    // 무슨 일이 일어났나 - 계획서 이름 글자 그대로
    event: "begin_checkout",
    // 배송비가 없는 주문인가 - 합계 50000 이상이면 yes, 아니면 no (ecommerce 밖에 둔다)
    free_shipping: cartTotal >= 50000 ? "yes" : "no",
    // 같이 보내는 상품 값 묶음
    ecommerce: {
      // 어느 나라 돈인가
      currency: "KRW",
      // 금액 - 장바구니 상품 합계
      value: cartTotal,
      // 장바구니 상품마다 상자 하나씩 목록에 넣는다
      items: cartItems.map(i => {
        const p = findProduct(i.id);
        return { item_id: p.id, item_name: p.name, price: p.price, quantity: i.qty };
      })
    }
  });

  const sum = document.querySelector("#pay-total");
  if (sum) sum.textContent = won(Cart.total());

  form.addEventListener("submit", e => {
    e.preventDefault();

    // 「결제를 마쳤다」(purchase)는 주문 완료 화면(done.js)에서 주문을 저장한 뒤 보낸다
    // 결제할 상품 목록을 장바구니에서 읽어 온다 - 상품 목록에 없는 상품은 뺀다
    const bought = Cart.read().filter(i => findProduct(i.id));
    // 결제할 상품 합계 - 상품 가격 × 수량의 합이고 배송비는 넣지 않는다
    const boughtTotal = Cart.total();

    // 포트원 결제 번호 - OYE- 뒤에 시각과 임의의 글자를 이어 붙여 결제마다 다르게 만든다
    const paymentId = "OYE-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    // 주문 이름 - 첫 상품 이름, 종류가 더 있으면 뒤에 「외 N건」
    const first = bought.length ? findProduct(bought[0].id).name : "";
    const orderName = bought.length > 1 ? `${first} 외 ${bought.length - 1}건` : first;
    // 결제창이 결과를 못 돌려주고 오류를 던졌을 때 그 글자를 그대로 보여 주는 칸
    const result = document.querySelector("#pay-result");
    const show = text => {
      result.textContent = "paymentId: " + paymentId + "\n" + text;
      result.hidden = false;
    };

    // 포트원 결제창(테스트)을 연다 - 결과는 주문 완료 화면 한 곳에서 처리한다
    PortOne.requestPayment({
      storeId: "store-cdba0757-de00-419f-a55e-6ade92d38944",
      channelKey: "channel-key-c913af88-4b2e-4349-b1c9-a5a47a56dba4",
      paymentId,
      orderName,
      totalAmount: boughtTotal,
      currency: "CURRENCY_KRW",
      payMethod: "CARD",
      // 장바구니의 상품 ID와 수량만 싣는다 - 금액은 싣지 않는다
      customData: { items: bought.map(i => ({ id: i.id, qty: i.qty })) },
      // 휴대폰은 결제를 마치면 이 주소로 넘어온다 - 포트원이 paymentId·code·message 를 붙여 준다
      redirectUrl: "https://oye-iny-shop.vercel.app/done.html"
    })
      .then(response => {
        // 휴대폰처럼 다른 주소로 넘어가는 경우에는 돌려받는 값이 없다
        if (!response) return;
        // PC 는 돌려받은 값을 휴대폰과 같은 모양으로 주문 완료 화면 주소 뒤에 붙인다
        const params = new URLSearchParams();
        ["paymentId", "code", "message"].forEach(key => {
          if (response[key] != null) params.set(key, response[key]);
        });
        location.href = "done.html?" + params.toString();
      })
      .catch(error => show(String(error)));
  });
}

/* --- 가게 소개·배송 안내 글 --- */
function paintProse() {
  const about = document.querySelector("#about-body");
  if (about) about.innerHTML = SHOP.about.map(t => `<p>${t}</p>`).join("");

  const ship = document.querySelector("#shipping-body");
  if (ship) ship.innerHTML = SHOP.shipping.map(t => `<p>${t}</p>`).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  paintChrome();
  paintList();
  paintDetail();
  paintCart();
  paintCheckout();
  paintProse();
});
