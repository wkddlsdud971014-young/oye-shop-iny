/* 관리 화면 — 매출 탭.
   보여 줄지 말지는 admin.html 이 커스텀 클레임 role 로 판단하고, 여기서는 dailyStats 를 읽고 그리기만 한다.
   orders 는 읽지 않는다 — 서버 함수 countDailyOrders 가 매일 00:05(서울)에 전날을 세어 dailyStats/YYYYMMDD 에 적는다.
   차트는 admin.html 이 CDN 으로 먼저 불러 둔 Chart.js(window.Chart)를 쓴다. */
// auth.js 가 앱을 먼저 연결해 둔다
import "./auth.js";
import { getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, doc, getDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const db = getFirestore(getApp());

const section = document.querySelector("#sales-admin");
const status = document.querySelector("#sa-status");
const head = document.querySelector("#sa-head");
const counted = document.querySelector("#sa-counted");
const canvas = document.querySelector("#sa-chart");
const sum = document.querySelector("#sa-sum");
const tableHead = document.querySelector("#sa-thead");
const body = document.querySelector("#sa-body");
const reloadBtn = document.querySelector("#sa-reload");

// 어제부터 거꾸로 며칠
const DAYS = 7;
let chart = null;
let loadSeq = 0;

// 오류 글은 줄이지 않고 그대로 보여 준다 — admin.html 과 같은 모양
const errorLine = (headText, err) => `${headText}\n${err && err.code ? err.code : ""}\n${err && err.message ? err.message : String(err)}`;

/* --- 작은 도우미 --- */
function make(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}
const cell = (...kids) => make("td", {}, ...kids);
const when = t => (t instanceof Timestamp ? t.toDate().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "");
const won = n => `${Number(n).toLocaleString("ko-KR")}원`;

// 한국 날짜로 어제부터 거꾸로 7일 — 오래된 날부터 돌려준다. 문서 ID 는 함수와 같은 YYYYMMDD
function lastDays() {
  const seoul = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = seoul.getUTCFullYear(), m = seoul.getUTCMonth(), d = seoul.getUTCDate();
  const list = [];
  for (let back = DAYS; back >= 1; back -= 1) {
    const day = new Date(Date.UTC(y, m, d - back));
    const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(day.getUTCDate()).padStart(2, "0");
    list.push({ id: `${day.getUTCFullYear()}${mm}${dd}`, label: `${day.getUTCFullYear()}-${mm}-${dd}`, short: `${mm}/${dd}` });
  }
  return list;
}

/* --- 차트 --- */
// 문서가 없는 날은 null — 막대를 그리지 않고 아래 이름에 「집계 없음」 을 붙인다 (0원으로 그리지 않는다)
function paintChart(days) {
  if (chart) { chart.destroy(); chart = null; }
  if (typeof window.Chart !== "function") {
    console.error(new Error("Chart.js 를 불러오지 못했습니다 (window.Chart 없음)"));
    canvas.hidden = true;
    return "차트를 그리지 못했습니다. Chart.js 를 불러오지 못했습니다 — 아래 표는 그대로 봅니다.";
  }
  canvas.hidden = false;
  const css = getComputedStyle(document.documentElement);
  const gold = css.getPropertyValue("--gold").trim() || "#f2c76b";
  const sub = css.getPropertyValue("--sub").trim() || "#b9a6e4";
  const line = css.getPropertyValue("--line-soft").trim() || "rgba(169,123,255,.22)";
  chart = new window.Chart(canvas, {
    type: "bar",
    data: {
      labels: days.map(d => (d.stats ? d.short : [d.short, "집계 없음"])),
      datasets: [{
        label: "매출 (totalSales)",
        data: days.map(d => (d.stats ? Number(d.stats.totalSales) || 0 : null)),
        backgroundColor: gold,
        borderRadius: 6,
        maxBarThickness: 48
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => (c.raw === null ? "집계 없음" : won(c.raw)) } }
      },
      scales: {
        x: { ticks: { color: sub }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: sub, callback: v => won(v) }, grid: { color: line } }
      }
    }
  });
  return "";
}

/* --- 7일 합계 한 줄 --- */
// 이미 읽은 7일 문서만 더한다 — Firestore 를 다시 읽지 않는다. 문서가 없는 날은 더하지 않고 날 수만 센다
function sumText(days) {
  const have = days.filter(d => d.stats);
  const sales = have.reduce((n, d) => n + (Number(d.stats.totalSales) || 0), 0);
  const orders = have.reduce((n, d) => n + (Number(d.stats.orderCount) || 0), 0);
  const missing = days.length - have.length;
  const note = missing ? `(집계 없는 날 ${missing}일은 빼고 더함)` : "(집계 없는 날 없음)";
  return `최근 7일 합계 ${sales.toLocaleString("ko-KR")}원 - 주문 ${orders.toLocaleString("ko-KR")}건 ${note}`;
}

/* --- 표 --- */
function paintTable(days) {
  // canceledCount 가 있는 날이 하루라도 있으면 칸을 둔다
  const withCanceled = days.some(d => d.stats && d.stats.canceledCount !== undefined);
  const heads = ["날짜", "주문 수", "매출", ...(withCanceled ? ["취소 수"] : []), "집계 시각"];
  tableHead.replaceChildren(make("tr", {}, ...heads.map(h => make("th", { textContent: h }))));
  body.replaceChildren(...days.map(d => {
    if (!d.stats) {
      return make("tr", {}, cell(d.label), make("td", { colSpan: heads.length - 1, textContent: "집계 없음" }));
    }
    const s = d.stats;
    return make("tr", {},
      cell(d.label),
      cell(s.orderCount !== undefined ? `${s.orderCount}건` : ""),
      cell(s.totalSales !== undefined ? won(s.totalSales) : ""),
      ...(withCanceled ? [cell(s.canceledCount !== undefined ? `${s.canceledCount}건` : "")] : []),
      cell(when(s.countedAt))
    );
  }));
}

/* --- 읽기 --- */
// 날짜마다 문서 한 장씩 7번 읽는다
async function load() {
  const seq = ++loadSeq;
  reloadBtn.disabled = true;
  status.textContent = "매출 집계를 읽고 있습니다…";
  try {
    const days = lastDays();
    const snaps = await Promise.all(days.map(d => getDoc(doc(db, "dailyStats", d.id))));
    if (seq !== loadSeq) return;
    days.forEach((d, i) => { d.stats = snaps[i].exists() ? snaps[i].data() : null; });

    const latest = [...days].reverse().find(d => d.stats);
    head.textContent = latest
      ? `${latest.label}까지의 매출입니다 - 매일 00:05에 전날을 셉니다`
      : `최근 7일(${days[0].label} ~ ${days[DAYS - 1].label}) 집계가 없습니다 - 매일 00:05에 전날을 셉니다`;
    counted.textContent = latest && latest.stats.countedAt instanceof Timestamp
      ? `마지막으로 센 시각 : ${when(latest.stats.countedAt)}`
      : "";
    const chartNote = paintChart(days);
    sum.textContent = sumText(days);
    paintTable(days);
    const have = days.filter(d => d.stats).length;
    status.textContent = `${days[0].label} ~ ${days[DAYS - 1].label} 중 ${have}일 집계를 읽었습니다.` + (chartNote ? `\n${chartNote}` : "");
  } catch (err) {
    if (seq !== loadSeq) return;
    console.error(err);
    status.textContent = errorLine("매출 집계를 읽지 못했습니다.", err);
  } finally {
    if (seq === loadSeq) reloadBtn.disabled = false;
  }
}
reloadBtn.addEventListener("click", load);

/* --- admin.html 이 부른다 --- */
// 매출 탭을 처음 열 때 한 번 읽는다 — 「새로 읽기」 로 다시 읽는다
let loaded = false;
export async function showSalesAdmin() {
  section.hidden = false;
  if (loaded) return;
  loaded = true;
  await load();
}

export function hideSalesAdmin() {
  section.hidden = true;
  loaded = false;
  loadSeq += 1;
  if (chart) { chart.destroy(); chart = null; }
  status.textContent = "";
  head.textContent = "";
  counted.textContent = "";
  sum.textContent = "";
  tableHead.replaceChildren();
  body.replaceChildren();
  reloadBtn.disabled = false;
}
