/* ===========================================================
   오예상점 — 동의 배너
   -----------------------------------------------------------
   네 신호(ad_storage, analytics_storage, ad_user_data,
   ad_personalization)의 기본값 denied 는 화면마다 머리글에
   태그 관리자보다 먼저 들어 있습니다.
   이 파일은 손님이 고른 값만 다룹니다.
   =========================================================== */

(function () {
  // 고른 값을 적어 두는 자리 — 장바구니와 같은 브라우저 저장소를 씁니다
  const KEY = "oye_consent";

  // 이 가게가 다루는 네 신호
  const SIGNALS = ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"];

  // 통로가 이미 있으면 그대로 쓰고, 없을 때만 새로 만든다
  window.dataLayer = window.dataLayer || [];
  // 머리글에서 만든 창구가 있으면 그대로 쓰고, 없을 때만 새로 만든다
  const gtag = window.gtag || function () { dataLayer.push(arguments); };

  /* --- 브라우저에 적어 둔 값 --- */

  // 아직 고르지 않았거나 읽지 못하면 null 이 나온다
  function readChoice() {
    try { return localStorage.getItem(KEY); }
    catch (e) { return null; }
  }

  function writeChoice(value) {
    try { localStorage.setItem(KEY, value); }
    catch (e) {}
  }

  /* --- 네 신호를 한꺼번에 같은 값으로 바꾼다 --- */
  function update(value) {
    const signals = {};
    SIGNALS.forEach(function (name) { signals[name] = value; });
    // 통로 끝에 동의 값을 넣는다 — 넣는 순간이 태그 관리자가 듣는 순간
    gtag("consent", "update", signals);
  }

  /* --- 배너 겉모습 --- */
  const CSS = `
#consent-banner{
  position:fixed;left:0;right:0;bottom:0;z-index:50;
  display:flex;align-items:center;gap:20px;flex-wrap:wrap;
  max-width:1040px;margin:0 auto 18px;padding:18px 22px;
  background:linear-gradient(165deg,#2c2059,#241a4d);
  border:1px solid rgba(242,199,107,.22);
  border-radius:18px;
  box-shadow:0 18px 42px rgba(0,0,0,.55);
  color:#f4eeff;
  font-family:inherit;font-size:13.5px;line-height:1.7;
}
#consent-banner p{margin:0;flex:1 1 280px;color:#ded4f5}
#consent-buttons{display:flex;gap:10px;margin-left:auto}
#consent-banner button{
  border-radius:999px;padding:9px 22px;
  font-size:13px;font-weight:700;font-family:inherit;
  cursor:pointer;transition:transform .18s ease,box-shadow .18s ease;
}
#consent-accept{
  background:linear-gradient(160deg,#ffe6ac,#f2c76b);
  color:#2a1b05;border:0;
  box-shadow:0 8px 22px rgba(242,199,107,.28);
}
#consent-accept:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(242,199,107,.45)}
#consent-deny{
  background:transparent;color:#b9a6e4;
  border:1px solid rgba(169,123,255,.22);
}
#consent-deny:hover{color:#ffe6ac;border-color:#f2c76b}
#consent-relink{
  display:block;margin-top:10px;
  color:#b9a6e4;font-size:12.5px;text-decoration:underline;
  cursor:pointer;
}
#consent-relink:hover{color:#ffe6ac}
@media (max-width:640px){
  #consent-banner{margin:0 12px 12px;padding:16px 18px}
  #consent-buttons{margin-left:0;width:100%}
  #consent-banner button{flex:1}
}
@media (prefers-reduced-motion:reduce){
  #consent-banner button{transition:none}
}`;

  function paintStyle() {
    if (document.querySelector("#consent-style")) return;
    const tag = document.createElement("style");
    tag.id = "consent-style";
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }

  /* --- 배너를 띄우고 내린다 --- */

  function closeBanner() {
    const box = document.querySelector("#consent-banner");
    if (box) box.remove();
  }

  function openBanner() {
    // 이미 떠 있으면 두 개를 만들지 않는다
    if (document.querySelector("#consent-banner")) return;

    const box = document.createElement("div");
    box.id = "consent-banner";
    box.innerHTML =
      '<p>이 가게는 방문 기록과 광고에 쓰는 값을 모읍니다. ' +
      '수락하시면 모으고, 거부하시면 모으지 않습니다.</p>' +
      '<div id="consent-buttons">' +
      '<button type="button" id="consent-deny">거부</button>' +
      '<button type="button" id="consent-accept">수락</button>' +
      '</div>';
    document.body.appendChild(box);

    document.querySelector("#consent-accept").addEventListener("click", function () {
      // 네 신호를 granted 로 바꾼다
      update("granted");
      writeChoice("granted");
      closeBanner();
    });

    document.querySelector("#consent-deny").addEventListener("click", function () {
      // 앞서 수락을 골랐던 손님이면 여기서 되돌린다.
      // 처음 고르는 손님은 머리글의 기본값이 이미 denied 라 그대로 둔다.
      if (readChoice() === "granted") update("denied");
      writeChoice("denied");
      closeBanner();
    });
  }

  /* --- 화면 맨 아래 「동의 다시 고르기」 --- */
  function paintRelink() {
    const foot = document.querySelector("footer.site .wrap");
    if (!foot) return;
    if (document.querySelector("#consent-relink")) return;

    const link = document.createElement("a");
    link.id = "consent-relink";
    link.href = "#";
    link.textContent = "동의 다시 고르기";
    link.addEventListener("click", function (e) {
      e.preventDefault();
      openBanner();
    });
    foot.appendChild(link);
  }

  document.addEventListener("DOMContentLoaded", function () {
    paintStyle();
    // app.js 가 꼬리글 글자를 갈아 끼운 다음에 링크를 붙입니다
    paintRelink();
    // 아직 아무것도 고르지 않은 손님에게만 배너를 띄운다
    if (!readChoice()) openBanner();
  });
})();
