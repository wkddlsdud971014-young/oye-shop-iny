/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest, onCall, HttpsError} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const {defineSecret} = require("firebase-functions/params");

// Secret Manager 에 등록한 포트원 API 시크릿 - 에뮬레이터에서는 .secret.local 의 값을 쓴다
const portoneSecret = defineSecret("PORTONE_API_SECRET");
// Secret Manager 에 등록한 Gemini API 키 - 브라우저에는 넣지 않는다
const geminiKey = defineSecret("GEMINI_API_KEY");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

initializeApp();

// 포트원 결제를 다시 조회해 결제 금액과 상품 가격으로 계산한 금액을 비교한다
async function verifyPayment(paymentId) {
  // 시크릿은 portoneSecret.value() 로 읽는다 - 값은 어디에도 찍지 않는다
  const secret = portoneSecret.value();
  if (!secret) {
    logger.error("PORTONE_API_SECRET 이 없습니다");
    return;
  }

  const res = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
    headers: {Authorization: `PortOne ${secret}`},
  });
  if (!res.ok) {
    // 상태 코드와 포트원이 돌려준 오류 글만 찍는다 - 요청 헤더는 찍지 않는다
    logger.error(`결제 조회 실패: ${paymentId} HTTP ${res.status} ${await res.text()}`);
    return;
  }
  const payment = await res.json();

  // customData 가 JSON 글자면 풀어서 items 를 꺼낸다
  let custom = payment.customData;
  if (typeof custom === "string") {
    try {
      custom = JSON.parse(custom);
    } catch (err) {
      custom = null;
    }
  }
  const items = Array.isArray(custom?.items) ? custom.items : [];

  // 터미널에서 읽기 좋게 한 줄씩 찍는다 - 풀린 customData 는 역슬래시 없이 다시 글자로 바꾼다
  console.log(`결제 상태: ${payment.status}`);
  console.log(`결제 금액: ${payment.amount?.total}`);
  console.log(`customData: ${custom ? JSON.stringify(custom) : payment.customData}`);

  // 실제 Firestore 를 읽지 않게, Firestore 에뮬레이터가 연결됐을 때만 읽는다
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    logger.error("Firestore 에뮬레이터가 연결되지 않아 상품 가격을 읽지 않았습니다");
    return;
  }

  // 기준 금액 - products/{상품ID} 의 price × 수량을 모두 더한다
  const db = getFirestore();
  let expected = 0;
  let found = items.length > 0;
  for (const item of items) {
    const snap = await db.doc(`products/${item.id}`).get();
    const price = snap.exists ? snap.get("price") : undefined;
    if (typeof price !== "number") {
      logger.warn(`상품 가격 없음: products/${item.id}`);
      found = false;
      continue;
    }
    expected += price * Number(item.qty);
  }

  const paid = payment.amount?.total;
  if (found && payment.status === "PAID" && paid === expected) {
    console.log(`검증 통과: ${paymentId} 기준 금액 ${expected} 결제 금액 ${paid}`);
  } else {
    console.warn(`금액 불일치: ${paymentId} 기준 금액 ${expected} 결제 금액 ${paid}`);
    // 금액이 다르거나 PAID 가 아니면 주문을 만들지 않는다
    return;
  }

  // 검증을 통과한 결제만 주문으로 만든다 - 문서 ID 는 결제 ID
  try {
    await db.collection("orders").doc(paymentId).create({
      paymentId,
      // 손님 UID - customData 에 userId 가 없으면 빈 글자
      userId: typeof custom?.userId === "string" ? custom.userId : "",
      items: items.map((item) => ({id: item.id, qty: Number(item.qty)})),
      // 서버가 상품 가격으로 계산한 금액
      totalPrice: expected,
      // 포트원이 알려 준 실제 결제 금액
      paidAmount: paid,
      status: "paid",
      // 주문 문서를 만든 시각
      createdAt: FieldValue.serverTimestamp(),
      // 포트원이 알려 준 결제 완료 시각 - 없으면 빈 글자
      paidAt: typeof payment.paidAt === "string" ? payment.paidAt : "",
    });
    console.log(`주문 생성: ${paymentId}`);
  } catch (err) {
    // 같은 결제 ID 의 주문이 이미 있을 때(ALREADY_EXISTS, 코드 6)만 건너뛴다
    if (err.code === 6) {
      console.log(`이미 있는 주문 - 건너뜀: ${paymentId}`);
      return;
    }
    logger.error(`주문 생성 실패: ${paymentId} ${err.code} ${err.message}`);
  }
}

// 포트원 웹훅을 받는다 - 에뮬레이터에서만 실행한다 (지역은 기본값)
// secrets 에 연결해야 이 함수 안에서 portoneSecret.value() 로 값을 읽을 수 있다
exports.portoneWebhook = onRequest({secrets: [portoneSecret]}, async (request, response) => {
  const body = request.body || {};
  // 받은 type 과 data.paymentId 를 터미널에 한 줄로 찍는다
  console.log(`포트원 웹훅: type=${body.type} paymentId=${body.data?.paymentId}`);
  try {
    if (body.data?.paymentId) await verifyPayment(body.data.paymentId);
  } catch (err) {
    logger.error(`결제 검증 중 오류: ${err.message}`);
  }
  response.status(200).send("OK");
});

// 실습 188 도전 - shopPing : 깨어 있는지 + 상품 개수
exports.shopPing = onRequest({ region: "us-central1" }, async (req, res) => {
  const now = new Date().toISOString();
  const snap = await require("firebase-admin").firestore().collection("products").get();
  res.send("오예상점 함수가 깨어 있습니다 · " + now + " · 상품 " + snap.size + "개");
});

// 주문 금액을 서버가 계산한다 - 화면이 보낸 price 는 쓰지 않고 Firestore 의 price 만 쓴다
exports.calcOrderTotal = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인한 뒤에 쓸 수 있습니다.");
  }
  const {productId, quantity} = request.data || {};
  if (typeof productId !== "string" || !productId) {
    throw new HttpsError("invalid-argument", "productId 는 글자여야 합니다.");
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new HttpsError("invalid-argument", "quantity 는 1 이상의 정수여야 합니다.");
  }

  const snap = await getFirestore().doc(`products/${productId}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `products/${productId} 상품이 없습니다.`);
  }
  const price = snap.get("price");
  return {totalPrice: price * quantity};
});

// 상점 도우미 - 질문 하나를 받아 Firestore 상품의 이름과 가격만 보고 답 하나를 돌려준다
const UNKNOWN = "그건 제가 아직 모르는 내용이에요";
exports.askShopBot = onCall({region: "us-central1", secrets: [geminiKey]}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인한 뒤에 물어볼 수 있습니다.");
  }
  const question = typeof request.data?.question === "string" ? request.data.question.trim() : "";
  if (!question || question.length > 300) {
    throw new HttpsError("invalid-argument", "질문은 1자 이상 300자 이하로 적어 주세요.");
  }

  // 근거 - 손님에게 보이는 상품의 이름과 가격만 읽는다 (숨긴 상품은 넣지 않는다)
  const snap = await getFirestore().collection("products").get();
  const facts = snap.docs
      .filter((d) => d.get("isVisible") !== false)
      .map((d) => `- ${d.get("name")}: ${d.get("price")}원`)
      .join("\n");

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent", {
    method: "POST",
    // 키는 주소가 아니라 헤더로 보낸다 - 값은 어디에도 찍지 않는다
    headers: {"Content-Type": "application/json", "x-goog-api-key": geminiKey.value()},
    body: JSON.stringify({
      systemInstruction: {parts: [{text: [
        "너는 오예상점의 상담 도우미다. 한국어 존댓말로 짧게 답한다.",
        "아래 상품 목록(상품 이름과 가격)만 근거로 답한다.",
        "재고, 배송, 할인, 사용법, 소재처럼 목록에 없는 내용은 추측하지 말고",
        `정확히 "${UNKNOWN}" 라고만 답한다.`,
        "",
        "상품 목록:",
        facts || "(상품 없음)",
      ].join("\n")}]},
      contents: [{role: "user", parts: [{text: question}]}],
      generationConfig: {temperature: 0, maxOutputTokens: 300},
    }),
  });
  if (!res.ok) {
    // 상태 코드와 Gemini 가 돌려준 오류 글만 찍는다 - 요청 헤더는 찍지 않는다
    logger.error(`Gemini 호출 실패: HTTP ${res.status} ${await res.text()}`);
    throw new HttpsError("internal", "답변을 받지 못했습니다. 잠시 뒤에 다시 물어봐 주세요.");
  }
  const result = await res.json();
  const answer = (result.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  return {answer: answer || UNKNOWN};
});

Object.assign(exports, require("./automation"));
Object.assign(exports, require("./admin"));