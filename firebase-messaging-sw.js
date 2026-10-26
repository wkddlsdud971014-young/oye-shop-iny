/* 웹 푸시 서비스 워커 — 알림을 받을 준비만 합니다.
   SDK 버전은 화면들이 쓰는 12.19.0 과 맞춥니다. */
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

// assets/auth.js 에 넣어 둔 설정과 같은 값
firebase.initializeApp({
  apiKey: "AIzaSyDw8aUqNNNgHVkvRYGWJ75zydKqD_Rxjcc",
  authDomain: "oye-shop-77cd6.firebaseapp.com",
  projectId: "oye-shop-77cd6",
  storageBucket: "oye-shop-77cd6.firebasestorage.app",
  messagingSenderId: "218986352461",
  appId: "1:218986352461:web:aa71965c31a8094a97b104"
});

const messaging = firebase.messaging();
