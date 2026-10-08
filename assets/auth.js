/* 로그인 상태 — 모든 화면이 이 파일 하나를 불러 씁니다.
   onAuthStateChanged 는 여기에만 둡니다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

// index.html 에 넣어 둔 설정과 같은 값
const firebaseConfig = {
  apiKey: "AIzaSyDw8aUqNNNgHVkvRYGWJ75zydKqD_Rxjcc",
  authDomain: "oye-shop-77cd6.firebaseapp.com",
  projectId: "oye-shop-77cd6",
  storageBucket: "oye-shop-77cd6.firebasestorage.app",
  messagingSenderId: "218986352461",
  appId: "1:218986352461:web:aa71965c31a8094a97b104"
};

// 화면에서 먼저 연결해 두었으면 그것을 그대로 쓴다
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

/* --- 로그인 상태를 기다리는 화면들 --- */
let known = false;
let current = null;
const waiting = [];

// 상태 확인이 끝나면 cb(user) 를 부른다. 로그인 안 했으면 user 는 null
export function onUser(cb) {
  waiting.push(cb);
  if (known) cb(current);
}

// 로그아웃하면 첫 화면으로 간다
export async function logout() {
  await signOut(auth);
  location.href = "index.html";
}

/* --- 머리글 --- */
// 확인이 끝나기 전에는 비워 두었다가, 끝나면 채운다
const slot = document.createElement("span");
slot.className = "auth-slot";
const nav = document.querySelector("nav.site");
if (nav) nav.appendChild(slot);

function paintHeader(user) {
  slot.replaceChildren();
  if (!user) {
    const login = document.createElement("a");
    login.href = "login.html";
    login.textContent = "로그인";
    slot.appendChild(login);
    return;
  }
  const email = document.createElement("span");
  email.className = "auth-email";
  // 화면 녹화 도구에 이메일이 남지 않게 가린다
  email.setAttribute("data-clarity-mask", "true");
  email.textContent = user.email;

  const my = document.createElement("a");
  my.href = "mypage.html";
  my.textContent = "마이페이지";

  const out = document.createElement("button");
  out.type = "button";
  out.className = "btn ghost";
  out.textContent = "로그아웃";
  out.addEventListener("click", logout);

  // 구글 프로필 사진이 있으면 이메일 앞에 작게 둔다. 없거나 못 불러오면 빼고 이메일만 보인다
  if (user.photoURL) {
    const photo = document.createElement("img");
    photo.className = "auth-photo";
    photo.src = user.photoURL;
    photo.alt = "";
    photo.referrerPolicy = "no-referrer";
    photo.setAttribute("data-clarity-mask", "true");
    photo.addEventListener("error", () => photo.remove());
    slot.append(photo);
  }

  slot.append(email, my, out);
}

onAuthStateChanged(auth, user => {
  known = true;
  current = user;
  paintHeader(user);
  waiting.forEach(cb => cb(user));
});
