// 1. 쓰는 묶음 불러오기
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

// 2. 서버용 라이브러리 준비 - 이미 준비돼 있으면 건너뛴다
if (getApps().length === 0) {
  initializeApp();
}

// 3. 주인 이메일 - 이 한 줄만 내 구글 계정 주소로 바꾼다
const OWNER_EMAIL = "iny101400@gmail.com";

// 4. 관리 화면이 부르면, 주인 계정에만 커스텀 클레임 role: "admin" 을 다는 함수
exports.grantOwnerRole = onCall({ region: "us-central1" }, async (request) => {
  // 4-1. 누가 불렀나 - 로그인 토큰의 이메일과 확인 여부를 본다
  const token = request.auth ? request.auth.token : null;
  const email = token && token.email ? token.email.toLowerCase() : "";
  if (email !== OWNER_EMAIL.toLowerCase() || token.email_verified !== true) {
    throw new HttpsError("permission-denied", "주인 계정만 명찰을 달 수 있습니다");
  }

  // 4-2. 그 계정에 커스텀 클레임을 단다 - 있던 클레임은 덮어쓴다
  await getAuth().setCustomUserClaims(request.auth.uid, { role: "admin" });
  return { role: "admin" };
});

// 5. 상품 활동 로그 - products 문서가 생기거나 바뀌거나 지워지면 adminLogs 에 한 줄을 남긴다
const { onDocumentWrittenWithAuthContext } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// 5-1. 두 값이 같은가 - 시각(Timestamp) 같은 값은 isEqual 로, 목록과 묶음은 안쪽까지 비교한다
function sameValue(a, b) {
  if (a === b) return true;
  if (a && typeof a.isEqual === "function") return a.isEqual(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => sameValue(a[k], b[k]));
  }
  return false;
}

// 5-2. 바뀐 필드 이름 목록 - 생길 때는 생긴 필드 전부, 지울 때는 있던 필드 전부
function changedKeysOf(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => !sameValue(before[k], after[k])).sort();
}

exports.onProductWritten = onDocumentWrittenWithAuthContext(
  { document: "products/{productId}", region: "us-central1" },
  async (event) => {
    const beforeSnap = event.data && event.data.before;
    const afterSnap = event.data && event.data.after;
    const existedBefore = !!(beforeSnap && beforeSnap.exists);
    const existsAfter = !!(afterSnap && afterSnap.exists);
    const action = !existedBefore ? "create" : !existsAfter ? "delete" : "update";

    const before = existedBefore ? beforeSnap.data() : {};
    const after = existsAfter ? afterSnap.data() : {};
    const changedKeys = changedKeysOf(before, after);

    // 5-3. 바뀐 것이 없거나 재고(stock)만 바뀌었으면 남기지 않는다 - 손님 주문으로 재고가 줄 때
    if (changedKeys.length === 0) return;
    if (changedKeys.length === 1 && changedKeys[0] === "stock") return;

    // 5-4. 서버 권한으로 adminLogs 에만 쓴다 - products 문서는 다시 고치지 않는다
    await getFirestore().collection("adminLogs").add({
      productId: event.params.productId,
      action,
      changedKeys,
      actorId: event.authId ?? null,
      authType: event.authType ?? null,
      at: FieldValue.serverTimestamp(),
    });
  }
);
