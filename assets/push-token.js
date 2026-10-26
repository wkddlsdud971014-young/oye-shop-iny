/* 푸시 토큰 — 알림을 허락한 로그인 손님의 FCM 토큰을 pushTokens/{uid} 에 둔다.
   부르는 곳은 두 군데: auth.js(화면을 열 때)와 notify-card.js(「알림 받기」로 granted 가 된 직후).
   토큰 원문은 화면에도 Console 에도 남기지 않는다. */
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getMessaging, getToken, isSupported } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, swReady } from "./auth.js";

// 웹 푸시 인증서의 공개 키 — 비공개 키는 여기 두지 않는다
const VAPID_KEY = "BOuV3LTTfYmtwqqtXglwWvkiwMosbC4ZteDNs7fTNCLWPUFRqf6-aBLcs-1gJCxGHaM3g8748M7WsfqOQ_-mC3o";
// 같은 토큰이라도 이만큼 지나면 다시 쓴다
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

// 한 화면에서 두 곳이 동시에 불러도 한 번만 돈다
let running = null;
export function syncPushToken() {
  running ??= run().finally(() => { running = null; });
  return running;
}

async function run() {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!(await isSupported())) return;

    // 로그인 상태 확인이 끝날 때까지 기다린 뒤 본다
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) return;

    // 서비스 워커 등록이 끝난 뒤에 토큰을 받는다
    const registration = await swReady;
    if (!registration) return;

    const token = await getToken(getMessaging(getApp()), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token) return;

    const ref = doc(getFirestore(getApp()), "pushTokens", user.uid);
    const snap = await getDoc(ref);
    const saved = snap.exists() ? snap.data() : null;
    const savedAt = saved?.updatedAt?.toMillis?.();
    // 같은 토큰이고 30일 안에 쓴 적이 있으면 쓰지 않는다
    if (saved?.token === token && savedAt && Date.now() - savedAt < REFRESH_MS) return;

    // 없으면 만들고, 있으면 token·updatedAt 만 바꾼다 — 다른 필드는 그대로 둔다
    await setDoc(ref, { token, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    // 오류 이름만 남긴다 — 메시지에 토큰이 섞일 수 있다
    console.warn("[푸시 토큰] 확인하지 못했습니다:", err?.name);
  }
}
