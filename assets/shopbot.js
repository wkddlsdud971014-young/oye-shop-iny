/* 상점 도우미 — 첫 화면 오른쪽 아래 동그란 단추와 작은 대화창.
   질문은 서버 함수 askShopBot 에 보낸다. Gemini 키는 서버에만 있다. */
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js";
// auth.js 가 앱을 먼저 연결해 두고, 로그인 상태도 알려 준다
import { auth } from "./auth.js";

const askShopBot = httpsCallable(getFunctions(getApp(), "us-central1"), "askShopBot");

/* --- 단추와 대화창 --- */
const toggle = document.createElement("button");
toggle.type = "button";
toggle.className = "bot-toggle";
toggle.setAttribute("aria-label", "상점 도우미에게 묻기");
toggle.setAttribute("aria-expanded", "false");
toggle.textContent = "✦";

const panel = document.createElement("section");
panel.className = "bot-panel";
panel.hidden = true;
panel.setAttribute("aria-label", "상점 도우미");
panel.innerHTML = `
  <div class="bot-head">
    <strong>오예상점 도우미</strong>
    <button type="button" class="bot-close" aria-label="닫기">×</button>
  </div>
  <div class="bot-log" role="log" aria-live="polite"></div>
  <form class="bot-form">
    <input name="q" maxlength="300" autocomplete="off" placeholder="상품 이름이나 가격을 물어보세요" aria-label="질문">
    <button type="submit" class="btn">묻기</button>
  </form>`;

document.body.append(toggle, panel);

const log = panel.querySelector(".bot-log");
const form = panel.querySelector(".bot-form");
const input = form.querySelector("input");
const send = form.querySelector("button");

// 말풍선 하나를 붙인다 - 글자는 그대로 넣는다
function bubble(who, text) {
  const p = document.createElement("p");
  p.className = "bot-msg " + who;
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
  return p;
}

// 로그인하지 않았으면 로그인 안내를 보여 준다
function loginNote() {
  const p = bubble("bot", "로그인한 뒤에 물어볼 수 있습니다. ");
  const a = document.createElement("a");
  a.href = "login.html";
  a.textContent = "로그인하러 가기";
  p.appendChild(a);
}

function open(show) {
  panel.hidden = !show;
  toggle.setAttribute("aria-expanded", String(show));
  if (show && !log.children.length) bubble("bot", "안녕하세요. 오예상점 상품의 이름과 가격을 물어보시면 답해 드려요.");
  if (show) input.focus();
}

toggle.addEventListener("click", () => open(panel.hidden));
panel.querySelector(".bot-close").addEventListener("click", () => open(false));

/* --- 질문 하나에 답 하나 --- */
form.addEventListener("submit", async e => {
  e.preventDefault();
  const question = input.value.trim();
  if (!question) return;

  // 로그인 상태 확인이 끝날 때까지 기다린 뒤 본다
  await auth.authStateReady();
  if (!auth.currentUser) { loginNote(); return; }

  bubble("me", question);
  input.value = "";
  send.disabled = true;
  const wait = bubble("bot", "생각하는 중…");
  try {
    const result = await askShopBot({ question });
    wait.textContent = result.data.answer;
  } catch (err) {
    // 오류 글은 줄이지 않고 그대로 보여 준다
    wait.textContent = `답을 받지 못했습니다. ${err.code || ""} ${err.message}`;
    console.error(err);
  } finally {
    send.disabled = false;
    input.focus();
  }
});
