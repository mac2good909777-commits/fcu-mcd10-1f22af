/* ════════════════════════════════════════════════════════════════
   逢甲大學建設碩士在職學位學程　第十屆同學看板
   版型階段：名冊是真的（data.js／private.js），公告活動是示範內容，
   登入是假的（「我的」頁面可切換身分預覽）。

   ⛔ 接 Supabase 時只改 db 這一層（見下方「後端接點」），
      render 那些函式一行都不用動 —— 這是刻意的分層，
      不要為了方便在 render 裡直接打 fetch。
   ════════════════════════════════════════════════════════════════ */

/* ⚠️ GitHub Pages 把 index.html 快取 10 分鐘，但每支 js 後面有 ?v= 會立刻更新 ——
   於是改版後十分鐘內，回訪的人會拿到【新的 js ＋ 舊的 css】，版面看起來像壞掉。
   （2026-08-30 首頁幹部區就這樣整個爛掉過一次。）
   解法：兩邊各記一個版本號，對不上就換一個網址重載 ——
   換網址才會真的重抓 html，直接 reload() 只會再吃到同一份快取。
   ⛔ 改 index.html 的 ?v= 時，這個數字要一起改，不然就白做了。 */
const CSS_V = "70";
(function fixStaleCss(){
  if(document.documentElement.dataset.cssv === CSS_V) return;
  // ⛔ LINE 登入導回時網址帶著 code / state，換網址會把它們丟掉，登入就永遠不會成功
  if(/[?&](code|state|error)=/.test(location.search)) return;
  const k = "fcu10_cssfix";
  try{
    if(sessionStorage.getItem(k) === CSS_V) return;   // 只救一次，避免無限重載
    sessionStorage.setItem(k, CSS_V);
  }catch(e){ return; }
  location.replace(location.pathname + "?r=" + CSS_V);
})();

const VERSION = "v7.0　2026-08-30";

/* 模式由 config.js 決定，不是寫死的：
     三個連線值填齊 → "supabase"（正式，資料進資料庫）
     沒填齊         → "mock"（版型，讀 data.js，改動只留在本機瀏覽器）
   ⛔ 不要手動改成 "supabase" 來測試 —— 沒有連線值它會整頁壞掉，
      而畫面上不會說原因。 */
const BACKEND = (typeof CONFIG !== "undefined" && CONFIG.ready) ? "supabase" : "mock";
const LIVE = BACKEND === "supabase";

/* ── 後端接點 ────────────────────────────────────────────────────
   正式接 Supabase 時，把每個 mock 分支換成 rest()／Edge Function：

     const SB  = "https://<專案>.supabase.co";
     const KEY = "<publishable key>";            // 公開金鑰，本來就放前端
     async function rest(path){
       const r = await fetch(SB+"/rest/v1/"+path,
         {headers:{apikey:KEY, Authorization:"Bearer "+KEY}});
       if(!r.ok) throw new Error("讀取失敗 "+r.status);
       return r.json();
     }

   ⚠️ PostgREST 是「逐欄授權」：select 清單裡只要有一欄沒 grant，
      整個查詢會 400（不是那一欄變空），全站資料一起消失。
      所以新增欄位時要像 TC8 那樣寫「完整清單被拒就退回舊清單」的退路。
   ⚠️ 個資（電話、Email、LINE ID）不要放進公開可讀的 view，
      要走 Edge Function 驗身分後才吐。                              */
const db = {
  async members(){
    if(LIVE) return SB.members();
    // cohort 統一在這裡補上，不寫進名冊那 50 行 —— 現在整批都是第十屆，
    // 之後多一屆時是新增資料列，不是回頭改舊的。
    return structuredClone(MOCK_MEMBERS).map(m => ({ cohort:CURRENT_COHORT, ...m }));
  },
  async posts(){   return LIVE ? SB.posts()  : structuredClone(MOCK_POSTS); },
  async needs(){   return LIVE ? SB.needs()  : structuredClone(MOCK_NEEDS); },
  async albums(){  return LIVE ? SB.albums() : structuredClone(MOCK_ALBUMS); },

  // 席次是公開數字（只吐數量、不吐是誰）；「我報名了哪幾場」要驗身分
  async seats(){
    if(LIVE) return SB.seats();
    const s = {};
    MOCK_POSTS.filter(p => p.capacity).forEach(p => {
      s[p.id] = { capacity:p.capacity, reserved_seats:p.reserved_seats||0,
                  taken: MOCK_SEATS_TAKEN[p.id] || 0, waiting: MOCK_WAITING[p.id] || 0 };
    });
    return s;
  },
  async mySignups(){
    if(LIVE) return SB.mySignups();
    return new Map(MY_MOCK_SIGNUPS.map(x => [x.post_id, x]));
  },
  async signup(postId, on){
    if(LIVE) return SB.signup(postId, on);
    if(on){ MY_MOCK_SIGNUPS.push({post_id:postId, status:"ok"});
            MOCK_SEATS_TAKEN[postId] = (MOCK_SEATS_TAKEN[postId]||0)+1; }
    else  { MY_MOCK_SIGNUPS = MY_MOCK_SIGNUPS.filter(x => x.post_id !== postId);
            MOCK_SEATS_TAKEN[postId] = Math.max(0,(MOCK_SEATS_TAKEN[postId]||0)-1); }
    return {ok:true};
  },

  /* 個人資料。
     正式模式：資料庫已經按可見範圍遮好才吐出來 —— 前端拿到的就是能看的。
     版型模式：private.js 全都在瀏覽器裡，靠 profileOf() 自己遮。
     ⚠️ 這是兩者最大的差別，也是正式版才算真的有隱私的原因。 */
  async profiles(){
    if(LIVE) return SB.profiles();
    return null;                       // 版型模式走舊路徑
  },
  /* 寫入類的動作版型模式一律擋掉並說原因 ——
     假裝成功會讓人以為存進去了，那比不能用更糟。 */
  saveNeed:    n => LIVE ? SB.saveNeed(n)         : Promise.reject(new Error("版型模式不能寫入")),
  closeNeed:   (id, done, helpers) => LIVE ? SB.closeNeed(id, done, helpers) : Promise.reject(new Error("版型模式不能寫入")),
  deleteNeed:  id => LIVE ? SB.deleteNeed(id)     : Promise.reject(new Error("版型模式不能寫入")),
  savePost:    d => LIVE ? SB.savePost(d)         : Promise.reject(new Error("版型模式不能寫入")),
  deletePost:  id => LIVE ? SB.deletePost(id)     : Promise.reject(new Error("版型模式不能寫入")),
  saveAlbum:   d => LIVE ? SB.saveAlbum(d)        : Promise.reject(new Error("版型模式不能寫入")),
  deleteAlbum: id => LIVE ? SB.deleteAlbum(id)    : Promise.reject(new Error("版型模式不能寫入")),

  async saveProfile(fields, vis){
    if(LIVE) return SB.saveProfile(fields, vis);
    const all = loadEdits();
    all[ME.id] = Object.assign({}, all[ME.id], fields, { vis });
    saveEdits(all);
  }
};


// 假的報名狀態（版型用）
const MOCK_SEATS_TAKEN = { 101: 23, 102: 41, 103: 0 };
const MOCK_WAITING     = { 102: 0 };
let   MY_MOCK_SIGNUPS  = [];

/* ── 狀態 ──────────────────────────────────────────────────────── */
let ME = null, MEMBERS = [], POSTS = [], NEEDS = [], ALBUMS = [], SEATS = {}, MY_SIGNUPS = new Map();
// 正式模式下所有人的個人資料（資料庫已按可見範圍遮好）
let PROFILES = {};
let VIEW = "home", DETAIL = null;
let M_FILTER = { q:"", group:"all", ind:"all" };
let ACT_TAB = "all", NEED_TAB = "open";

/* ── 小工具 ────────────────────────────────────────────────────── */
const el   = id => document.getElementById(id);
const esc  = s => (s ?? "").toString().replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
// ⛔ 要塞進 onclick="f('這裡')" 的值一律用 escAttr。
//    esc 沒處理單引號，名字填 X'+alert(1)+'Y 就會逃出字串變成程式碼。
//    ⚠️ 不能改用 HTML 實體 &#39; —— 瀏覽器會先解回單引號才交給 JS，等於沒防。
const escAttr = s => esc(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// ⚠️ 日期一律指定 Asia/Taipei：使用者可能在別的時區，
//    但「今天」對同學永遠是台灣的今天。
const twDate = d => new Date(d).toLocaleDateString("sv-SE", { timeZone:"Asia/Taipei" });
const isToday = iso => iso && twDate(iso) === twDate(new Date());

const WD = ["日","一","二","三","四","五","六"];
function whenLabel(iso){
  if(!iso) return "";
  const d = new Date(iso);
  const s = d.toLocaleString("zh-TW", { timeZone:"Asia/Taipei", month:"numeric", day:"numeric" });
  const w = new Date(d.toLocaleString("en-US", { timeZone:"Asia/Taipei" })).getDay();
  return `${s}（${WD[w]}）`;
}
function timeLabel(iso){
  if(!iso) return "";
  return new Date(iso).toLocaleTimeString("zh-TW",
    { timeZone:"Asia/Taipei", hour:"2-digit", minute:"2-digit", hour12:false });
}
const memberOf = id => MEMBERS.find(m => m.id === id) || null;

/* ── 公司職稱的門檻 ──────────────────────────────────────────────
   名冊對未登入的人只顯示【姓名】—— 目的是讓同學進來認領對照自己。
   公司、職稱、產業別、學歷要登入後才看得到。

   ⚠️ 現階段這是【前端遮蔽】，不是權限。private.js 被瀏覽器載入了，
      翻開發者工具就看得到。真正生效是接上 Supabase、
      由 Edge Function 驗完身分才吐那一天（見 README）。
      在那之前，網址請當作非公開的。                              */

/* ── 可見範圍 ────────────────────────────────────────────────────
   每一個欄位由本人自己決定給誰看。四級，由寬到嚴：

     public   任何人（含未登入）
     class    本屆同學（登入後）← 預設
     private  只有自己
     alumni   全學程校友（跨屆）← 資料庫認得，但介面先不提供，見 VIS 的說明

   ⛔ 預設一律 class，不是 public。
      同學是把資料交給「班上」，不是交給網際網路 ——
      要公開必須是他自己動手打開，不能是我們幫他決定的。          */
const VIS = {
  public:  { label:"公開",     hint:"任何人都看得到，包含沒登入的訪客",  rank:0 },
  /* ⚠️ alumni（跨屆校友）先【不放進選單】。
        校友會會不會做還沒定案，現在讓它出現在每個欄位的下拉裡只是干擾 ——
        四個選項要想，三個選項馬上就選得下去。
        資料庫那邊的判斷邏輯照樣留著（mask_profile 認得這個值），
        將來要開只要把 hidden 拿掉，不用動資料也不用改後端。 */
  alumni:  { label:"全學程校友", hint:"跨屆的學長姊學弟妹（尚未啟用）", rank:1, hidden:true },
  class:   { label:"本屆同學",   hint:"登入的第十屆同學（預設）",          rank:2 },
  private: { label:"只有自己",   hint:"誰都看不到，只有你自己編輯時看得到", rank:3 }
};
/* 下拉要顯示哪些選項。
   ⚠️ 已經存成隱藏值的欄位仍要列出那個選項，
      否則使用者一存檔就會被無聲改成別的範圍。 */
const visOptions = current =>
  Object.entries(VIS).filter(([k, o]) => !o.hidden || k === current);
// 我現在是什麼身分 → 我最多看得到 rank 幾的欄位
function viewerRank(target){
  if(ME && target && ME.id === target.id) return 9;          // 自己看自己：全都看得到
  if(!ME) return 0;                                          // 沒登入
  if(target && ME.cohort !== target.cohort) return 1;         // 別屆的校友
  return 2;                                                  // 同屆同學
}

/* ── 個人資料的欄位定義 ──────────────────────────────────────────
   欄位順序＝編輯表單的順序，也是個人頁的顯示順序。
   seed:true 代表這一欄是從新生名冊帶進來的，本人可以改。          */
const PROFILE_FIELDS = [
  { key:"nickname", label:"小名／稱呼", type:"text",   vis:"class",
    hint:"名冊上是本名，這裡可以填大家平常怎麼叫你" },
  /* 三組「單位／職稱」：班上不少人身兼多家（自己開公司＋事務所＋掛顧問），
     只給一組會逼他們挑一個填，資訊反而失真。
     ⚠️ 職稱的公開範圍跟著同一組的單位走，不另外設 ——
        六個下拉選單只會讓人不想填。 */
  { key:"company",  pair:"title",  label:"單位／職稱",     type:"pair", vis:"class", seed:true },
  { key:"company2", pair:"title2", label:"單位／職稱（二）", type:"pair", vis:"class",
    hint:"身兼多家的話填這裡，沒有就留空" },
  { key:"company3", pair:"title3", label:"單位／職稱（三）", type:"pair", vis:"class" },
  /* ⚠️ 不是下拉，是「可以自己打」的欄位。
        原本 13 選 1，但這班橫跨的行業比我們列得出來的多
        （能源、離岸風電、無人機、窗簾、磁磚建材…），
        選不到自己那一行的人只能勉強挑一個最接近的，篩選反而失真。
        分類是為了找人，不是為了整齊。 */
  { key:"industry", label:"產業分類",   type:"combo", vis:"class", seed:true,
    hint:"點一下會出現建議清單，也可以直接打自己的行業。這欄是名冊的篩選依據" },
  { key:"tag",      label:"產業標籤",   type:"text",   vis:"class",
    hint:"比分類更精確的一句。例：工業地產、危老重建、TOD" },
  { key:"headline", label:"一句話自介", type:"text",   vis:"class",
    hint:"會用引號顯示在名冊卡片上，寫得有記憶點一點" },
  { key:"intro",    label:"簡介",       type:"area",   vis:"class",
    hint:"你在做什麼、幫誰解決什麼問題" },
  { key:"resource", label:"我可以提供", type:"area",   vis:"class", key_field:true,
    hint:"⭐ 這欄和下一欄是媒合的關鍵 —— 同學是靠這些找到你的" },
  { key:"wish",     label:"我想找",     type:"area",   vis:"class", key_field:true,
    hint:"⭐ 你希望在這個班遇到什麼人、什麼機會" },
  { key:"topics",   label:"關注主題",   type:"text",   vis:"class",
    hint:"用頓號分開。例：工業地產、實價登錄、土地開發" },
  { key:"edu_bg",   label:"學歷",       type:"text",   vis:"class", seed:true },
  { key:"web",      label:"網站",       type:"text",   vis:"class",
    hint:"個人網站、公司網站、作品集都可以" },
  { key:"line_url", label:"LINE 加入好友連結", type:"text", vis:"class", line_help:true,
    hint:"貼上你的 LINE 連結，同學就能直接加你，不用先交換手機號碼" },
  { key:"q_why",    label:"為什麼來讀建設碩士？", type:"area", vis:"class", optional:true },
  { key:"q_thesis", label:"論文或專題想做什麼方向？", type:"area", vis:"class", optional:true },
  { key:"q_team",   label:"想找什麼樣的同學一起做報告？", type:"area", vis:"class", optional:true }
];
const FIELD = Object.fromEntries(PROFILE_FIELDS.map(f => [f.key, f]));

/* 本人自己編輯過的內容。
   ⚠️ 版型階段存在這台瀏覽器的 localStorage，換一台電腦就不見了 ——
      這是「先讓你試填看看」，不是正式儲存。
      接上 Supabase 之後改存 members 表，並由 RLS 保證只有本人能改自己那列。 */
const EDIT_KEY = "fcu10_profile_edits";
function loadEdits(){
  try{ return JSON.parse(localStorage.getItem(EDIT_KEY) || "{}"); }catch(e){ return {}; }
}
function saveEdits(o){
  try{ localStorage.setItem(EDIT_KEY, JSON.stringify(o)); }catch(e){}
}
// 完整的個人資料＝名冊帶進來的 ＋ 本人改過的
function fullProfile(id){
  if(LIVE) return PROFILES[id] || { vis:{} };
  const seed = (typeof PRIVATE_PROFILE !== "undefined" && PRIVATE_PROFILE[id]) || {};
  const mine = loadEdits()[id] || {};
  return { ...seed, ...mine, vis:{ ...(seed.vis || {}), ...(mine.vis || {}) } };
}
// 這個欄位設定給誰看
function fieldVis(id, key){
  return fullProfile(id).vis[key] || FIELD[key]?.vis || "class";
}
// 我看不看得到某人的某一欄
function canSee(member, key){
  const p = fullProfile(member.id);
  if(!p[key]) return false;                              // 沒填就沒有
  // 正式模式：資料庫吐得出來就代表我看得到，不必再算一次
  if(LIVE) return true;
  return viewerRank(member) >= VIS[fieldVis(member.id, key)].rank;
}
const seeVal = (member, key) => canSee(member, key) ? fullProfile(member.id)[key] : null;
// 這個人有沒有【任何一欄】是我看得到的（決定卡片要不要顯示鎖頭）
const seesAnything = m => PROFILE_FIELDS.some(f => canSee(m, f.key));

/* 舊呼叫點的相容層：profileOf 回傳「我看得到的那些欄位」。
   ⛔ 不要改回直接讀 PRIVATE_PROFILE —— 那會跳過可見範圍檢查。 */
function profileOf(id){
  const m = memberOf(id);
  if(!m) return null;
  // 正式模式：資料庫已經遮好，直接用。
  // ⛔ 不要在這裡再判斷一次可見範圍 —— 前端沒有「別人設成 private 的內容」，
  //    再判斷一次只會把本來看得到的東西也擋掉。
  if(LIVE){
    const p = PROFILES[id];
    return (p && Object.keys(p).length) ? p : null;
  }
  const out = {};
  PROFILE_FIELDS.forEach(f => { const v = seeVal(m, f.key); if(v) out[f.key] = v; });
  return Object.keys(out).length ? out : null;
}
const LOCKED = "🔒 登入後可見";
// 空狀態要說明「這一區是幹嘛的」。
// 只寫「還沒有公告」，看的人會以為系統壞了或資料沒載進來。
const emptyBox = (title, desc) =>
  `<div class="empty"><b>${esc(title)}</b><div>${esc(desc)}</div></div>`;

/* ⛔ 使用者填的網址不能直接塞進 href。
   填 javascript:alert(1) 就會變成可以點的程式碼 —— 只放行 http/https。
   ⚠️ 這裡回傳 null 代表「有填但不安全」，畫面要當作沒填，不要照原樣印出來。 */
function safeUrl(u){
  const t = (u || "").trim();
  return /^https?:\/\//i.test(t) ? t : null;
}
// LINE 的連結長這兩種：個人 line.me/ti/p/xxx、官方帳號 lin.ee/xxx
const isLineUrl = u => /^https:\/\/(line\.me\/ti\/p\/|lin\.ee\/)/i.test((u || "").trim());
// 首頁「班級幹部」那一區的排序：照職務位階，不是照 id。
// 班代排第一、組代排最後 —— 那是全班的視角。
const officerRank = m => {
  const i = OFFICER_ORDER.indexOf(m.officer);
  return i < 0 ? 99 : i;
};
// 名冊裡的排序：組代表最前面，接著其他幹部，再來才是照學號順序。
// ⚠️ 跟 officerRank 是兩套，不要合併：
//    名冊是【一組一組看】的，找人第一個想找的是自己這組的組代；
//    首頁幹部區是【全班一起看】的，那裡班代才該排第一。
const isGroupRep = m => /組代$/.test(m.officer || "");
const rosterRank = m => isGroupRep(m) ? 0 : (m.officer ? 1 : 2);
// 卡片上的職務標籤：組代只寫「組代」。
// 「智慧防災組代」六個字會撐出卡片右上角，而卡片本來就已經標了組別色。
const officerBadge = m => isGroupRep(m) ? "組代" : m.officer;
function statusPill(m){
  if(m.status === "leave")        return `<span class="pill">休學中</span>`;
  if(m.status === "leave_active") return `<span class="pill">休學（仍參與）</span>`;
  return "";
}
const nameOf   = id => (memberOf(id) || {}).name || "";
const initials = n => (n || "").slice(-2);
const groupColor = g => (GROUPS[g] || {}).color || "var(--p-500)";
const groupName  = g => (GROUPS[g] || {}).name || "";
const isOfficer  = () => !!(ME && ME.officer);

/* 班上有幾個人。
   ⛔ 不要用 MEMBERS.length —— 那會把老師與助教一起算進去（變 52）。
   ⛔ 也不要用 data.js 裡的靜態值 —— 名冊異動後就對不上了。
   ⚠️ 休學的不算在「人數」裡，但名冊上還是列出來（標休學中）——
      問「我們班幾個人」，答案是現在還在的那些。 */
const activeCount = () =>
  MEMBERS.filter(m => (m.kind || "student") === "student" && m.status !== "leave").length;

/* ── 主視覺 ──────────────────────────────────────────────────────
   固定人言大樓 —— 逢甲最具代表性的建築、校內地標。
   ⛔ 原本做成可切換，但那是版型階段用來比較的工具；
      上線之後每個人看到不一樣的封面沒有意義，還多一份要維護的狀態。
   圖片授權 CC BY-SA 3.0（Wikimedia Commons，攝影者 SSR2000），
   出處寫在「使用說明」頁，依授權條款不可刪除。               */
const HERO = "assets/hero-renyan.jpg";

function heroHTML(){
  const blocks = ["--c-sky","--c-green","--c-yellow","--c-orange","--c-purple"]
    .map(c => `<i style="background:var(${c})"></i>`).join("");
  return `<div class="hero">
    <img src="${HERO}" alt="逢甲大學人言大樓">
    <div class="tint"></div>
    <div class="blocks">${blocks}</div>
    <div class="txt">
      <div class="kicker">逢甲大學　FENG CHIA UNIVERSITY</div>
      <h2>建設碩士在職學位學程<br>第十屆同學看板</h2>
      <div class="line">${CLASS_INFO.year}　共 ${activeCount()} 位同學</div>
    </div>
  </div>`;
}

/* ── 席次 ──────────────────────────────────────────────────────── */
function seatsLeft(postId){
  const s = SEATS[postId];
  if(!s || s.capacity == null) return null;      // 沒設上限＝不限名額
  return Math.max(0, s.capacity - (s.reserved_seats || 0) - (s.taken || 0));
}
function signupBlock(p){
  if(!p.signup_open) return `<div class="seatline">尚未開放報名</div>`;
  const left = seatsLeft(p.id), st = SEATS[p.id] || {};
  const wait = st.waiting ? `　候補 <b>${st.waiting}</b> 位` : "";
  if(left === null) return `<div class="seatline">開放報名中${wait}</div>`;
  if(left === 0)    return `<div class="seatline full">名額已滿${p.waitlist_open ? "，可以登記候補" : ""}${wait}</div>`;
  return `<div class="seatline">還剩 <b>${left}</b> 個位子${wait}</div>`;
}
function signupButton(p){
  if(!p.signup_open) return "";
  if(!ME) return `<button class="btn btn-primary" onclick="onMe()">登入後報名</button>`;
  if(MY_SIGNUPS.has(p.id))
    return `<button class="btn btn-done" onclick="doSignup(${p.id}, false)">✓ 已報名（點此取消）</button>`;
  const left = seatsLeft(p.id);
  if(left === 0 && !p.waitlist_open) return `<button class="btn btn-done" disabled>名額已滿</button>`;
  return `<button class="btn btn-primary" onclick="doSignup(${p.id}, true)">${left === 0 ? "登記候補" : "我要報名"}</button>`;
}
// 報到：只在活動當天可按。平常留著但變灰 —— 按鈕消失比按鈕變灰更難懂。
function checkinButton(p){
  if(!p.event_at) return "";
  if(!isToday(p.event_at)) return `<button class="btn btn-done" disabled>📍 報到（當天開放）</button>`;
  if(!ME) return `<button class="btn btn-checkin" onclick="onMe()">登入後報到</button>`;
  return `<button class="btn btn-checkin" onclick="alert('版型階段：正式版會跳出報到碼輸入框')">📍 報到</button>`;
}
async function doSignup(postId, on){
  await db.signup(postId, on);
  await reload();
  render(VIEW);
}

/* ── 首頁 ──────────────────────────────────────────────────────── */
function render_home(){
  const events   = POSTS.filter(p => p.kind === "event" && p.event_at)
                        .sort((a,b) => new Date(a.event_at) - new Date(b.event_at));
  const next     = events[0];
  const notices  = POSTS.filter(p => p.kind === "notice").slice(0, 3);
  const surveys  = POSTS.filter(p => p.kind === "survey");
  /* 師長排在同學前面 —— 名冊那邊也是同一個原則，兩處要一致。
     學程主任與助教不在 OFFICER_ORDER 裡，officerRank 會給 99 而被排到最後，
     所以要先按身分分層，再在同一層裡照職務位階排。 */
  const officers = MEMBERS.filter(m => m.officer)
    .sort((a,b) => (isStudent(a) - isStudent(b)) || (officerRank(a) - officerRank(b)));

  el("v-home").innerHTML = heroHTML() + `
    ${next ? `
    <div class="sec"><h2>下一場</h2><button class="more" onclick="go('acts')">全部活動 ›</button></div>
    <article class="card bigcard">
      <div class="band">
        <div class="kicker">${esc(next.org || "班級")}活動</div>
        <div class="t">${esc(next.title)}</div>
      </div>
      <div class="body">
        <div class="meta">
          <span>🗓 <b>${whenLabel(next.event_at)}</b>　${esc(next.time_text || timeLabel(next.event_at))}</span>
        </div>
        <div class="meta" style="margin-top:5px"><span>📍 ${esc(next.place || "")}</span></div>
        ${next.fee ? `<div class="meta" style="margin-top:5px"><span>💰 ${esc(next.fee)}</span></div>` : ""}
        ${signupBlock(next)}
        <div class="actions">
          ${signupButton(next)}
          <button class="btn btn-ghost" onclick="openPost(${next.id})">看詳情</button>
        </div>
        <div class="actions" style="margin-top:8px">${checkinButton(next)}</div>
      </div>
    </article>` : ""}

    ${surveys.length ? `
    <div class="sec"><h2>待填問卷</h2></div>
    ${surveys.map(s => `
      <article class="card pad" onclick="openPost(${s.id})" style="cursor:pointer">
        <div class="pills" style="margin-bottom:6px">
          ${s.required ? `<span class="pill warn">必填</span>` : `<span class="pill">選填</span>`}
          ${s.deadline ? `<span class="pill">${esc(s.deadline)} 截止</span>` : ""}
        </div>
        <b>${esc(s.title)}</b>
        <div class="hint">已完成 ${s.done_count || 0} / ${activeCount()} 人</div>
      </article>`).join("")}` : ""}

    <div class="sec"><h2>最新公告</h2><button class="more" onclick="go('notices')">更多 ›</button></div>
    ${notices.length ? notices.map(noticeCard).join("") : emptyBox("還沒有公告", "幹部發布的班務公告會出現在這裡。標記「重要」的會置頂並顯示紅字。")}

    <div class="sec"><h2>幹部職務</h2></div>
    <div class="hint" style="margin-bottom:10px">先看事情該找哪個職務，再去找人。</div>
    <div class="joinnote">在職專班來的不只是學位，還有人脈 ——
      <b>做幹部是最快把全班認識一輪的方式</b>，也最容易跟師長與其他屆搭上線。
      下一任改選時，歡迎接手其中一個位子。</div>
    <div class="dutygrid">
      ${OFFICER_ORDER.filter(o => OFFICER_DESC[o]).map(o => `<div class="duty">
        <div class="offbadge">${esc(o)}</div>
        <div class="hint">${esc(OFFICER_DESC[o])}</div>
      </div>`).join("")}
    </div>

    <div class="sec" style="margin-top:20px"><h2>班級幹部</h2><span class="hint">碩一上</span>
      <button class="more" onclick="go('members')">全班名冊 ›</button></div>
    <div class="offgrid">
      ${officers.map(m => `<div class="offcard" onclick="openMember(${m.id})">
        <div class="ava" style="background:${isStudent(m) ? groupColor(m.group) : "var(--p-700)"}">${esc(initials(m.name))}</div>
        <div class="offbody">
          <div class="offname">${esc(m.name)}</div>
          <div class="offrole">${esc(m.officer)}</div>
        </div>
      </div>`).join("")}
    </div>

    <div class="sec"><h2>關於這個班</h2></div>
    <article class="card pad">
      <dl class="kv">
        <dt>學校</dt><dd>${esc(CLASS_INFO.school)}</dd>
        <dt>學程</dt><dd>${esc(CLASS_INFO.program)}<div class="hint">${esc(CLASS_INFO.program_en)}</div></dd>
        <dt>屆別</dt><dd>${esc(CLASS_INFO.cohort)}（${esc(CLASS_INFO.year)}）</dd>
        <dt>人數</dt><dd>${activeCount()} 位</dd>
        <dt>專業組別</dt><dd>${Object.values(GROUPS).map(g =>
          `<span class="pill" style="margin:2px 3px 2px 0"><span class="gdot" style="background:${g.color}"></span>${esc(g.name)}</span>`).join("")}</dd>
        <dt>學程網站</dt><dd><a href="${CLASS_INFO.site}" target="_blank" rel="noopener"
          style="color:var(--p-500);font-weight:700">mcd.fcu.edu.tw ↗</a></dd>
      </dl>
    </article>`;
}

function noticeCard(p){
  return `<article class="card pad" onclick="openPost(${p.id})" style="cursor:pointer">
    ${p.important || visPill(p) || rolePill(p.author_id) ? `<div class="pills" style="margin-bottom:6px">${
      rolePill(p.author_id)}${p.important ? `<span class="pill warn">重要</span>` : ""}${visPill(p)}</div>` : ""}
    <b style="${p.important ? "color:var(--c-red)" : ""}">${esc(p.title)}</b>
    <div class="hint">${byline(p)}</div>
  </article>`;
}

/* ── 公告 ──────────────────────────────────────────────────────── */
function render_notices(){
  const list = POSTS.filter(p => p.kind === "notice" || p.kind === "survey")
                    .sort((a,b) => (b.important?1:0) - (a.important?1:0)
                                || new Date(b.created_at) - new Date(a.created_at));
  el("v-notices").innerHTML = `
    <div class="sec"><h2>公告與問卷</h2>
      ${isOfficer() ? `<button class="more" onclick="postForm('notice')">＋ 發布</button>` : ""}</div>
    ${list.length ? list.map(p => p.kind === "survey" ? surveyCard(p) : noticeCard(p)).join("")
                  : emptyBox("還沒有公告或問卷",
                      "班務公告、班費說明、問卷調查都放這裡。問卷可以標必填與截止日；完成人數由幹部手動更新 —— 系統刻意不記錄誰填了誰沒填。")}`;
}
function surveyCard(p){
  return `<article class="card pad" onclick="openPost(${p.id})" style="cursor:pointer">
    <div class="pills" style="margin-bottom:6px">
      ${rolePill(p.author_id)}
      <span class="pill solid" style="background:var(--c-sky)">問卷</span>
      ${p.required ? `<span class="pill warn">必填</span>` : ""}
      ${p.deadline ? `<span class="pill">${esc(p.deadline)} 截止</span>` : ""}
      ${visPill(p)}
    </div>
    <b>${esc(p.title)}</b>
    <div class="hint">已完成 ${p.done_count || 0} / ${activeCount()} 人
      ・${byline(p)}</div>
  </article>`;
}

/* ── 活動 ──────────────────────────────────────────────────────── */
function render_acts(){
  const all = POSTS.filter(p => p.kind === "event")
                   .sort((a,b) => new Date(a.event_at) - new Date(b.event_at));
  const list = ACT_TAB === "all" ? all : all.filter(p => (p.org || "班級") === ACT_TAB);
  // 照月份分組：在職專班一個月大概就一兩場，平鋪會看不出節奏
  const months = {};
  list.forEach(p => {
    const m = new Date(p.event_at).toLocaleDateString("zh-TW",
      { timeZone:"Asia/Taipei", year:"numeric", month:"long" });
    (months[m] ??= []).push(p);
  });
  el("v-acts").innerHTML = `
    <div class="sec"><h2>活動</h2>
      ${isOfficer() ? `<button class="more" onclick="postForm('event')">＋ 發布</button>` : ""}</div>
    <div class="tools"><div class="chips">
      ${[["all","全部"],["班級","班級活動"],["學程","學程活動"]].map(([k,l]) =>
        `<button class="chip${ACT_TAB===k?" on":""}" onclick="ACT_TAB='${k}';render('acts')">${l}</button>`).join("")}
    </div></div>
    ${Object.keys(months).length ? Object.entries(months).map(([m, ps]) => `
      <div class="sec"><h2 style="font-size:.88rem;color:var(--muted)">${m}</h2></div>
      ${ps.map(eventCard).join("")}`).join("")
      : emptyBox("還沒有活動",
          "聚餐、參訪、專題演講都放這裡，會照月份分組。活動可以開放報名、設名額與候補，當天才會出現報到按鈕。")}`;
}
function eventCard(p){
  const left = seatsLeft(p.id);
  return `<article class="card pad" onclick="openPost(${p.id})" style="cursor:pointer">
    <div class="pills" style="margin-bottom:7px">
      ${rolePill(p.author_id)}
      <span class="pill solid" style="background:var(--p-700)">${esc(p.org || "班級")}</span>
      ${isToday(p.event_at) ? `<span class="pill ok">今天</span>` : ""}
      ${p.signup_open ? (left === 0 ? `<span class="pill warn">已額滿</span>`
        : left !== null ? `<span class="pill">剩 ${left} 位</span>` : `<span class="pill">開放報名</span>`) : ""}
      ${MY_SIGNUPS.has(p.id) ? `<span class="pill ok">已報名</span>` : ""}
      ${visPill(p)}
    </div>
    <b style="font-size:1.02rem">${esc(p.title)}</b>
    <div class="meta" style="margin-top:7px">
      <span>🗓 ${whenLabel(p.event_at)} ${esc(p.time_text || timeLabel(p.event_at))}</span>
    </div>
    <div class="meta" style="margin-top:3px"><span>📍 ${esc(p.place || "")}</span></div>
  </article>`;
}

/* ── 貼文詳情（活動／公告／問卷共用）───────────────────────────── */
function openPost(id){ DETAIL = id; go("pdetail"); }
function render_pdetail(){
  const p = POSTS.find(x => x.id === DETAIL);
  if(!p){ el("v-pdetail").innerHTML = `<div class="empty">找不到這則內容</div>`; return; }
  const back = p.kind === "event" ? "acts" : "notices";
  el("v-pdetail").innerHTML = `
    <div class="backbar"><button onclick="go('${back}')">
      <svg width="18" height="18" fill="none" stroke="currentColor"><use href="#i-back"/></svg>返回</button></div>
    <article class="card pad detail">
      <div class="pills" style="margin-bottom:8px">
        ${p.kind === "event"  ? `<span class="pill solid" style="background:var(--p-700)">${esc(p.org||"班級")}活動</span>` : ""}
        ${p.kind === "notice" ? `<span class="pill">公告</span>` : ""}
        ${p.kind === "survey" ? `<span class="pill solid" style="background:var(--c-sky)">問卷</span>` : ""}
        ${p.important ? `<span class="pill warn">重要</span>` : ""}
        ${p.required ? `<span class="pill warn">必填</span>` : ""}
      </div>
      <h3>${esc(p.title)}</h3>
      <dl class="kv">
        ${p.event_at ? `<dt>時間</dt><dd>${whenLabel(p.event_at)}　${esc(p.time_text || timeLabel(p.event_at))}</dd>` : ""}
        ${p.place    ? `<dt>地點</dt><dd>${esc(p.place)}
          <div><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.place)}"
            target="_blank" rel="noopener" style="color:var(--p-500);font-weight:700;font-size:.85rem">在地圖開啟 ↗</a></div></dd>` : ""}
        ${p.speaker  ? `<dt>${esc(p.speaker_title || "講者")}</dt><dd>${esc(p.speaker)}</dd>` : ""}
        ${p.fee      ? `<dt>費用</dt><dd>${esc(p.fee)}</dd>` : ""}
        ${p.deadline ? `<dt>截止</dt><dd>${esc(p.deadline)}</dd>` : ""}
        <dt>發布</dt><dd>${byline(p)}</dd>
      </dl>
      <div class="bodytext">${esc(p.body || "")}</div>
      ${p.link ? `<div class="actions" style="margin-top:14px">
        <a class="btn btn-primary" href="${esc(p.link)}" target="_blank" rel="noopener">前往填寫 ↗</a></div>` : ""}
      ${p.kind === "event" ? `
        ${signupBlock(p)}
        <div class="actions">${signupButton(p)}</div>
        <div class="actions" style="margin-top:8px">${checkinButton(p)}</div>
        ${MY_SIGNUPS.has(p.id) ? `<div class="myorder">你已報名這場活動。有事無法出席請記得<b>提前取消</b>，
          位子可以讓給候補的同學。</div>` : ""}` : ""}
      ${isOfficer() ? `<div class="block"><h4>幹部工具</h4>
        <div class="actions">
          <button class="btn btn-ghost btn-sm" onclick="postForm('${p.kind}', ${p.id})">編輯這則</button>
        </div></div>` : ""}
    </article>`;
}

/* ── 名冊 ──────────────────────────────────────────────────── */
function render_members(){
  const q = M_FILTER.q.trim().toLowerCase();
  /* ⛔ 名冊只列【同學】。老師與助教也在 members 裡（他們要能登入），
        但混進同學名冊會讓「50 位同學」這個數字失真，組別篩選也會出現
        不屬於任何一組的人。他們獨立一區放在最下面。 */
  const staff = MEMBERS.filter(m => (m.kind || "student") !== "student");
  const list = MEMBERS.filter(m => (m.kind || "student") === "student").filter(m => {
    if(M_FILTER.group !== "all" && m.group !== M_FILTER.group) return false;
    const p = profileOf(m.id);
    if(M_FILTER.ind !== "all" && (!p || p.industry !== M_FILTER.ind)) return false;
    if(!q) return true;
    // 未登入時只能搜姓名 —— 搜得到公司就等於公司是公開的，那遮蔽就白做了
    const hay = p ? [m.name, m.officer, p.company, p.title, p.edu_bg,
                     p.industry, groupName(m.group)]
                  : [m.name, m.officer, groupName(m.group)];
    return hay.join(" ").toLowerCase().includes(q);
  }).sort((a,b) =>
    // 先分組（sort 的百位就是組別），組內才排「組代 → 幹部 → 學號」。
    // ⛔ 不能讓 rosterRank 蓋過組別：那會把三位組代一起拉到最上面，
    //    三個組的分塊就散了，看的人找不到自己那組。
    (Math.floor(a.sort / 100) - Math.floor(b.sort / 100))
    || (rosterRank(a) - rosterRank(b))
    || (officerRank(a) - officerRank(b))
    || (a.sort - b.sort));

  // 產業別篩選只在登入後出現（未登入根本看不到產業別）
  /* ⚠️ 產業篩選用【實際出現過的值】動態產生，不是固定清單 ——
        同學自己打的行業也要能被篩到，否則「可以自己填」等於白填。 */
  const inds = ME ? [...new Set(MEMBERS.map(m => (profileOf(m.id)||{}).industry).filter(Boolean))]
                    .sort((a, b) => a.localeCompare(b, "zh-Hant")) : [];

  el("v-members").innerHTML = `
    <div class="sec"><h2>名冊</h2><span class="hint">${list.length} / ${
      MEMBERS.filter(m => (m.kind || "student") === "student").length} 位</span></div>
    ${!ME ? `<div class="notice-lock">
      名冊先開放<b>姓名</b>，方便同學進來對照認領自己。<br>
      公司與職稱<b>已由新生名冊預設帶入</b>，登入後才看得到，之後也可以自己修改。</div>` : ""}
    <div class="tools">
      <div class="search">
        <svg width="18" height="18" fill="none" stroke="var(--muted)"><use href="#i-search"/></svg>
        <input id="mq" placeholder="${ME ? "搜尋姓名、公司、職稱、學歷…" : "搜尋姓名…"}" value="${esc(M_FILTER.q)}"
          oninput="M_FILTER.q=this.value;render_members();refocus('mq')">
      </div>
      <div class="chips">
        <button class="chip${M_FILTER.group==="all"?" on":""}" onclick="M_FILTER.group='all';render_members()">全部 ${MEMBERS.filter(m => (m.kind||"student") === "student").length}</button>
        ${Object.entries(GROUPS).map(([k,g]) =>
          `<button class="chip${M_FILTER.group===k?" on":""}" onclick="M_FILTER.group='${k}';render_members()">
            <span class="gdot" style="background:${g.color}"></span>${esc(g.short)} ${MEMBERS.filter(m => m.group === k && (m.kind||"student") === "student").length}</button>`).join("")}
      </div>
      ${inds.length ? `<div class="chips" style="margin-top:6px">
        <button class="chip${M_FILTER.ind==="all"?" on":""}" onclick="M_FILTER.ind='all';render_members()">不分產業</button>
        ${inds.map(k => `<button class="chip${M_FILTER.ind===k?" on":""}" onclick="M_FILTER.ind='${escAttr(k)}';render_members()">${esc(k)}</button>`).join("")}
      </div>` : ""}
    </div>
    ${staff.length && M_FILTER.group === "all" && !M_FILTER.q ? `
      <div class="sec" style="margin-top:4px">
        <h2 style="font-size:.9rem"><span class="gdot" style="background:var(--p-700)"></span>學程師長</h2>
        <span class="hint">${staff.length} 位</span></div>
      <div class="mgrid">${staff.map(memberCard).join("")}</div>` : ""}
    ${!list.length ? `<div class="empty">沒有符合的同學</div>`
      : M_FILTER.group !== "all"
        ? `<div class="mgrid">${list.map(memberCard).join("")}</div>`
        // 全部檢視時打上組別分隔 —— 不然「組代排最前面」這件事看起來只是亂排
        : Object.keys(GROUPS).map(g => {
            const ms = list.filter(m => m.group === g);
            if(!ms.length) return "";
            return `<div class="sec" style="margin-top:18px">
                <h2 style="font-size:.9rem"><span class="gdot" style="background:${groupColor(g)}"></span>${esc(groupName(g))}組</h2>
                <span class="hint">${ms.length} 位</span></div>
              <div class="mgrid">${ms.map(memberCard).join("")}</div>`;
          }).join("")}
`;
}
/* 師長不屬於任何一組。members.grp 是 not null 且有 check，
   建資料時只能先填 'land' 佔位（見 patch-05）——
   ⛔ 那是佔位值，不是事實，一律不要拿它來顯示組別或配色。 */
function isStudent(m){ return (m?.kind || "student") === "student"; }

function memberCard(m){
  // 三組單位／職稱都放上去 —— 身兼多家的人，只顯示一個等於漏掉一半資訊
  const orgs = [["company","title"],["company2","title2"],["company3","title3"]]
    .map(([c, t]) => ({ c: seeVal(m, c), t: seeVal(m, t) }))
    .filter(x => x.c || x.t);
  const ind = seeVal(m, "industry"), tag = seeVal(m, "tag"), head = seeVal(m, "headline");
  const nick = seeVal(m, "nickname");
  const anything = seesAnything(m);

  /* 版面：
       第一列  左＝頭像與姓名　右＝單位／職稱（可能多組）
       第二列  一句話自介，整行
       最後    標籤靠底對齊
     ⛔ 頭像不要獨佔一整列 —— 那會讓上方空一大塊，
        資訊全擠在下面的窄柱裡，316px 的欄寬等於白給。 */
  /* 版面：
       第一行  頭像 ＋ 姓名（橫排，右上角留給職務標籤）
       之後    單位／職稱、一句話自介、標籤，全部佔滿整個卡片寬度
     ⛔ 不要把單位擠到右半邊 —— 316px 的卡再切一半，
        「睦聚地產開發有限公司」會斷成三行，比沒有還難看。 */
  return `<div class="mcard${m.status === "leave" ? " dim" : ""}" onclick="openMember(${m.id})">
    ${m.officer ? `<div class="of">${esc(officerBadge(m))}</div>` : ""}
    <div class="mtop">
      <div class="ava" style="background:${isStudent(m) ? groupColor(m.group) : "var(--p-700)"}">${esc(initials(m.name))}</div>
      <div class="mname">
        <div class="n">${esc(m.name)}</div>
        ${nick ? `<div class="nick">${esc(nick)}</div>` : ""}
      </div>
    </div>
    ${orgs.length ? `<div class="c">${orgs.map((o, i) =>
      `<div class="org${i ? " alt" : ""}">${esc(o.c || "")}${
        o.c && o.t ? "　" : ""}<span>${esc(o.t || "")}</span></div>`).join("")}</div>`
      : `<div class="c blank">${m.confirmed === false ? "尚未填寫資料" : LOCKED}</div>`}
    ${head ? `<div class="head">「${esc(head)}」</div>` : ""}
    <div class="pills">
      ${tag ? `<span class="pill solid" style="background:${isStudent(m) ? groupColor(m.group) : "var(--p-700)"}">${esc(tag)}</span>` : ""}
      ${ind ? `<span class="pill">${esc(ind)}</span>` : ""}
      ${!tag && !ind && isStudent(m) ? `<span class="pill"><span class="gdot" style="background:${groupColor(m.group)}"></span>${esc((GROUPS[m.group]||{}).short||"")}</span>` : ""}
      ${statusPill(m)}
    </div>
  </div>`;
}

function openMember(id){ DETAIL = id; go("mdetail"); }
function render_mdetail(){
  const m = memberOf(DETAIL);
  if(!m){ el("v-mdetail").innerHTML = `<div class="empty">找不到這位同學</div>`; return; }
  const isMe = ME && ME.id === m.id;
  const v = k => seeVal(m, k);
  const co = v("company"), ti = v("title"), nick = v("nickname");
  const anything = seesAnything(m);

  // 一段一段長出來：本人沒填、或設定成看不到的，整段不出現。
  // ⛔ 不要留「未填寫」的空殼 —— 50 個人的頁面全是空殼會讓人以為系統壞了。
  const block = (key, title) => {
    const val = v(key); if(!val) return "";
    const f = FIELD[key];
    return `<div class="block">
      <h4>${esc(title || f.label)}${isMe ? visTag(m.id, key) : ""}</h4>
      <div class="bodytext">${esc(val)}</div></div>`;
  };
  const topics = v("topics"), web = v("web");

  el("v-mdetail").innerHTML = `
    <div class="backbar"><button onclick="go('members')">
      <svg width="18" height="18" fill="none" stroke="currentColor"><use href="#i-back"/></svg>返回名冊</button></div>
    <article class="card pad detail">
      <div style="display:flex;gap:14px;align-items:center">
        <div class="ava lg" style="background:${isStudent(m) ? groupColor(m.group) : "var(--p-700)"}">${esc(initials(m.name))}</div>
        <div>
          <h3>${esc(m.name)}${nick ? `<span style="font-size:.82rem;color:var(--muted);font-weight:500">（${esc(nick)}）</span>` : ""}</h3>
          <div class="hint" style="margin-top:2px">${co || ti
            ? `${esc(co || "")}　${esc(ti || "")}`
            : isMe ? `<span class="locked">還沒填公司職稱</span>`
                   : `<span class="locked">${LOCKED}</span>`}</div>
          <div class="pills" style="margin-top:7px">
            ${m.officer ? `<span class="pill solid" style="background:var(--c-orange)">${esc(m.officer)}</span>` : ""}
            ${isStudent(m) ? `<span class="pill"><span class="gdot" style="background:${groupColor(m.group)}"></span>${esc(groupName(m.group))}</span>` : ""}
            ${v("industry") ? `<span class="pill">${esc(v("industry"))}</span>` : ""}
            ${statusPill(m)}
          </div>
        </div>
      </div>

      ${m.officer && OFFICER_DESC[m.officer] ? `<div class="offnote">
        <b>${esc(m.officer)}</b>　${esc(OFFICER_DESC[m.officer])}</div>` : ""}

      ${v("headline") ? `<div class="headline">「${esc(v("headline"))}」</div>` : ""}

      ${[["company","title"],["company2","title2"],["company3","title3"]]
        .map(([c, t]) => ({ c: v(c), t: v(t) }))
        .filter(x => x.c || x.t)
        .map((x, i) => `<div class="block"><h4>${i === 0 ? "服務單位" : "另一個身分"}${
          isMe ? visTag(m.id, i === 0 ? "company" : i === 1 ? "company2" : "company3") : ""}</h4>
          <div class="bodytext">${esc(x.c || "")}${x.c && x.t ? "　" : ""}${esc(x.t || "")}</div></div>`).join("")}

      ${block("intro")}
      ${block("resource")}
      ${block("wish")}
      ${topics ? `<div class="block"><h4>關注主題${isMe ? visTag(m.id,"topics") : ""}</h4>
        <div class="pills">${topics.split(/[、,，]/).filter(Boolean)
          .map(t => `<span class="pill">${esc(t.trim())}</span>`).join("")}</div></div>` : ""}
      ${block("edu_bg")}
      ${safeUrl(web) ? `<div class="block"><h4>網站${isMe ? visTag(m.id,"web") : ""}</h4>
        <a href="${esc(safeUrl(web))}" target="_blank" rel="noopener"
           style="color:var(--p-500);font-weight:700;word-break:break-all">${esc(web)} ↗</a></div>` : ""}

      ${safeUrl(v("line_url")) ? `<div class="block">
        <h4>LINE${isMe ? visTag(m.id,"line_url") : ""}</h4>
        <a class="btn btn-line" href="${esc(safeUrl(v("line_url")))}" target="_blank" rel="noopener">
          加 ${esc(m.name)} 為 LINE 好友</a>
        <div class="hint" style="margin-top:6px">當面加好友的話，用 LINE 自己的行動條碼就好。</div>
        ${isMe && !isLineUrl(v("line_url")) ? `<div class="hint" style="margin-top:6px">
          ⚠️ 這看起來不像 LINE 的連結（正常是 line.me/ti/p/… 或 lin.ee/…），確認一下。</div>` : ""}
      </div>` : ""}

      ${["q_why","q_thesis","q_team"].some(k => v(k)) ? `<div class="qsec">
        ${["q_why","q_thesis","q_team"].map(k => block(k)).join("")}</div>` : ""}

      ${!anything ? (isMe
        // ⛔ 自己的頁面永遠不該出現「登入查看」—— 他已經登入了。
        //    看不到只有一個原因：還沒填。要引導去填，不是叫他再登入一次。
        ? `<div class="block"><h4>你的資料還是空的</h4>
            <div class="notice-lock" style="margin:0">
              公司、職稱、學歷這些<b>本來會從新生名冊帶進來</b>，
              現在是空的，代表存檔沒有成功或還沒填過。<br>
              點下面進去填，每一欄都可以自己選給誰看。
            </div>
            <div class="actions" style="margin-top:12px">
              <button class="btn btn-primary" onclick="go('profile')">去填我的資料</button></div></div>`
        : `<div class="block"><h4>更多資料</h4>
            <div class="notice-lock" style="margin:0">
              這位同學的資料<b>設定成登入後才看得到</b>，或是他還沒填。<br>
              名冊先讓大家對照認領自己，其餘由每個人自己決定給誰看。
            </div>
            ${ME ? "" : `<div class="actions" style="margin-top:12px">
              <button class="btn btn-primary" onclick="onMe()">登入查看</button></div>`}</div>`)
      : ME ? `<div class="block"><h4>聯絡方式</h4>
          <div class="hint">電話與 Email 一律走後端驗身分才吐，不寫進網站檔案裡。</div></div>` : ""}

      ${isMe ? `<div class="actions" style="margin-top:16px">
        <button class="btn btn-primary" onclick="go('profile')">編輯我的資料</button></div>
        <div class="hint" style="margin-top:8px">欄位旁邊出現
          <span class="vistag open">公開</span> 或 <span class="vistag shut">只有自己</span>
          時，代表那一欄跟預設（本屆同學）不一樣。只有你自己看得到這些標籤。</div>` : ""}
    </article>`;
}

/* 欄位旁邊的小標：這一欄現在給誰看。只有本人看得到。
   ⛔ 預設值（本屆同學）不顯示 —— 每一欄都掛同一個標籤等於沒有資訊，
      只是把版面弄花。只有「跟預設不一樣」的才值得標出來，
      那時候它才真的在提醒你：這一欄跟其他欄不同。 */
function visTag(id, key){
  const k = fieldVis(id, key);
  if(k === "class") return "";
  return ` <span class="vistag${k === "public" ? " open" : k === "private" ? " shut" : ""}">${VIS[k].label}</span>`;
}

/* ── 編輯我的資料 ────────────────────────────────────────────────
   每一欄右邊都有「給誰看」的選單 —— 這是這一頁的重點，
   不是附加功能。同學願意寫多少，取決於他能不能控制誰看得到。      */
function render_profile(){
  if(!ME){ el("v-profile").innerHTML = `<div class="empty">請先登入</div>`; return; }
  const p = fullProfile(ME.id);
  el("v-profile").innerHTML = `
    <div class="backbar"><button onclick="go('me')">
      <svg width="18" height="18" fill="none" stroke="currentColor"><use href="#i-back"/></svg>返回我的</button></div>
    <div class="sec"><h2>編輯我的資料</h2></div>
    <div class="notice-lock">
      這些會顯示在<b>同學名冊</b>，是別人認識你的第一印象。<br>
      公司、職稱、學歷<b>已從新生名冊帶入</b>，不對就直接改。
    </div>
    <article class="card pad" style="margin-bottom:12px">
      <h4 style="font-size:.9rem;font-weight:800;margin-bottom:6px">每一欄旁邊的
        <span class="vissel-demo">本屆同學 ⌄</span> 是什麼？</h4>
      <div class="bodytext" style="margin-top:0;font-size:.9rem">
        那是<b>「這一欄給誰看」</b>的設定，每個欄位可以分開設，不想公開的就單獨關掉。三個選擇：
      </div>
      <dl class="kv" style="margin-top:10px">
        <dt>公開</dt><dd>任何人都看得到，包含沒登入的訪客。</dd>
        <dt>本屆同學</dt><dd><b>預設值</b>。只有登入的第十屆同學看得到。</dd>
        <dt>只有自己</dt><dd>誰都看不到，只有你自己編輯時看得到。</dd>
      </dl>
      <div class="hint" style="margin-top:8px">
        不確定就不用動，維持「本屆同學」是最常見的選擇。</div>
    </article>
    ${(fullProfile(ME.id).confirmed === false) ? `<div class="notice-lock"
      style="background:#fff6e5;border-color:#f0d9a8">
      ⚠️ <b>你的資料目前不會顯示給其他同學。</b><br>
      名冊帶進來的公司職稱是你當初填給學校的，不是同意公開在這裡的內容，
      所以<b>要你自己按過一次儲存</b>，才會對同學顯示。<br>
      看過下面的內容、確認沒問題（或改成你想露出的樣子）再按儲存就好。
    </div>` : ""}
    <div class="hint" style="margin:0 0 12px">
      ⚠️ 版型階段：改動只存在這台瀏覽器，換一台電腦就不見了。
      正式版會存進資料庫，並且只有你自己改得動自己那一列。
    </div>
    <article class="card pad">
      <div class="field">
        <label>姓名</label>
        <input value="${esc(ME.name)}" disabled>
        <div class="hint">姓名來自新生名冊，不開放自己改（名冊要對得起來）。
          想讓大家叫你別的稱呼，填下面的「小名」。</div>
      </div>
      ${PROFILE_FIELDS.map(f => profileField(f, p)).join("")}
    </article>
    <div class="actions" style="margin-top:14px">
      <button class="btn btn-primary" onclick="saveProfile()">儲存</button>
      <button class="btn btn-ghost" onclick="go('members')">看名冊效果</button>
    </div>
    <div class="hint" style="margin-top:10px">
      想知道別人看到什麼？儲存後到「我的 → 切換身分」選「未登入」，
      再回名冊看自己的卡片。
    </div>`;
}
function profileField(f, p){
  const val = p[f.key] || "";
  const vis = p.vis?.[f.key] || f.vis;
  if(f.type === "pair"){
    // 一行兩格：左邊單位、右邊職稱，共用一個公開範圍
    return `<div class="field">
      <label>${esc(f.label)}
        <span class="vislabel">給誰看</span>
        <select class="vissel" id="pv_${f.key}">
          ${visOptions(vis).map(([k, o]) =>
            `<option value="${k}"${k === vis ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
        </select>
      </label>
      <div class="pairrow">
        <input id="pf_${f.key}" value="${esc(val)}" placeholder="單位／公司">
        <input id="pf_${f.pair}" value="${esc(p[f.pair] || "")}" placeholder="職稱">
      </div>
      ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}
    </div>`;
  }
  if(f.type === "combo"){
    return `<div class="field">
      <label>${esc(f.label)}
        <span class="vislabel">給誰看</span>
        <select class="vissel" id="pv_${f.key}">
          ${visOptions(vis).map(([k, o]) =>
            `<option value="${k}"${k === vis ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
        </select>
      </label>
      <input id="pf_${f.key}" value="${esc(val)}" list="dl_${f.key}" placeholder="選一個，或直接打你的行業">
      <datalist id="dl_${f.key}">
        ${INDUSTRY_SUGGEST.map(x => `<option value="${esc(x)}"></option>`).join("")}
      </datalist>
      ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}
    </div>`;
  }
  const input = f.type === "area"
    ? `<textarea id="pf_${f.key}" rows="4">${esc(val)}</textarea>`
    : f.type === "select"
      ? `<select id="pf_${f.key}"></select>`   /* 目前沒有純下拉的欄位，保留分支備用 */
      : `<input id="pf_${f.key}" value="${esc(val)}">`;
  return `<div class="field${f.key_field ? " key" : ""}">
    <label>${esc(f.label)}${f.optional ? `<span class="opt">選填</span>` : ""}
      <span class="vislabel">給誰看</span>
      <select class="vissel" id="pv_${f.key}">
        ${visOptions(vis).map(([k, o]) =>
          `<option value="${k}"${k === vis ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
      </select>
    </label>
    ${input}
    ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}
    ${f.line_help ? lineHelpHTML() : ""}
  </div>`;
}
/* LINE 連結怎麼拿 —— 這是最多人會卡住的一步，說明要具體到「點哪裡」。
   收在 <details> 裡，不然表單會被一大段步驟撐開。 */
function lineHelpHTML(){
  return `<details class="howto">
    <summary>怎麼找到我的 LINE 連結？</summary>
    <div class="howtobody">
      <b>一般個人帳號</b>
      <ol>
        <li>打開 LINE，切到左下角<b>「主頁」</b></li>
        <li>點右上角的<b>加入好友圖示</b>（人形加號）</li>
        <li>選<b>「邀請」</b>→<b>「複製連結」</b><br>
          （或選「行動條碼」→ 切到「我的 QR code」→ 點分享 → 複製連結）</li>
        <li>回到這裡貼上，會長得像 <code>https://line.me/ti/p/xxxxxxxx</code></li>
      </ol>
      <b>LINE 官方帳號（有做生意的可以用這個）</b>
      <ol>
        <li>登入 <b>LINE Official Account Manager</b></li>
        <li>左側<b>「增加好友人數」→「建立加入好友網址」</b></li>
        <li>複製那串 <code>https://lin.ee/xxxxx</code></li>
      </ol>
      <div class="notice-lock" style="margin:10px 0 0">
        ⚠️ 這一欄的公開範圍<b>預設是「本屆同學」</b>。<br>
        如果改成「公開」，等於任何在網路上看到這一頁的人都能加你 ——
        除非你用的是官方帳號，否則不建議。
      </div>
    </div>
  </details>`;
}

function saveProfile(){
  const mine = LIVE ? { vis:{} } : (loadEdits()[ME.id] || { vis:{} });
  const all = LIVE ? null : loadEdits();
  mine.vis = mine.vis || {};
  PROFILE_FIELDS.forEach(f => {
    const i = el("pf_" + f.key), s = el("pv_" + f.key);
    if(i) mine[f.key] = (i.value || "").trim();
    if(s) mine.vis[f.key] = s.value;
    // pair 的第二格（職稱）也要收；它沒有自己的公開範圍，跟著單位走
    if(f.pair){ const j = el("pf_" + f.pair); if(j) mine[f.pair] = (j.value || "").trim(); }
  });
  db.saveProfile(mine, mine.vis).then(async () => {
    await reload();
    alert(LIVE ? "已儲存。" : "已儲存。\n（版型模式只存在這台瀏覽器，換一台就不見）");
    openMember(ME.id);   // 直接跳去看效果，比回設定頁有感
  }).catch(e => alert("存不起來：" + e.message));
}

/* ── 資源交流 ──────────────────────────────────────────────────── */
function render_needs(){
  const list = NEEDS.filter(n => NEED_TAB === "all" ? true : NEED_TAB === "open" ? !n.done : n.done);
  el("v-needs").innerHTML = `
    <div class="sec"><h2>資源交流</h2>
      ${ME ? `<button class="more" onclick="needForm()">＋ 我要提</button>` : ""}</div>
    <div class="tools"><div class="chips">
      ${[["open","進行中"],["done","已解決"],["all","全部"]].map(([k,l]) =>
        `<button class="chip${NEED_TAB===k?" on":""}" onclick="NEED_TAB='${k}';render('needs')">${l}</button>`).join("")}
    </div></div>
    <div class="hint" style="margin-bottom:10px">同學之間互相提需求、互相接。
      一個班最值錢的就是這些跨行業的連結。</div>
    ${list.length ? list.map(needRow).join("")
      : emptyBox("還沒有人提需求",
          "這班橫跨開發、營造、建築、估價、地政、公部門、工程顧問、室內裝修、資訊、能源 —— 十幾個行業。有需求就開一則，有人接了就標記解決，看板上會留下誰接住的紀錄。比在 LINE 群裡問有效，因為 LINE 訊息會被洗掉。")}`;
}
/* 公開的東西要看得出來是公開的 ——
   發文的人才會知道自己剛剛把什麼推到了全網際網路上。
   班內限定是預設值，不用特別標，標了到處都是徽章反而看不到重點。 */
/* 公告是誰發的很重要 —— 財務說要收班費，跟一般同學說要收班費是兩回事。
   幹部發的一律把職務標出來，讓人一眼看出這則有沒有分量。
   ⛔ 不要只寫名字：全班五十個人，記不住誰是財務。 */
function roleOf(id){ return (memberOf(id) || {}).officer || ""; }
function rolePill(id){
  const r = roleOf(id);
  return r ? `<span class="pill role">${esc(r)}</span>` : "";
}
function byline(p){
  const r = roleOf(p.author_id);
  return `${r ? `<b style="color:var(--c-orange)">${esc(r)}</b>　` : ""}${
    esc(nameOf(p.author_id))}　${twDate(p.created_at)}`;
}
function visPill(x){
  return x?.visibility === "public"
    ? `<span class="pill open">🌐 公開</span>` : "";
}
function needRow(n){
  return `<article class="card pad" onclick="openNeed(${n.id})" style="cursor:pointer">
    <div class="pills" style="margin-bottom:6px">
      ${n.done ? `<span class="pill ok">已解決</span>` : `<span class="pill solid" style="background:var(--c-green)">徵求中</span>`}
      ${visPill(n)}
    </div>
    <b>${esc(n.title)}</b>
    <div class="hint">${esc(nameOf(n.author_id))}　${twDate(n.created_at)}</div>
  </article>`;
}
function openNeed(id){ DETAIL = id; go("ndetail"); }
function render_ndetail(){
  const n = NEEDS.find(x => x.id === DETAIL);
  if(!n){ el("v-ndetail").innerHTML = `<div class="empty">找不到</div>`; return; }
  const author = memberOf(n.author_id);
  el("v-ndetail").innerHTML = `
    <div class="backbar"><button onclick="go('needs')">
      <svg width="18" height="18" fill="none" stroke="currentColor"><use href="#i-back"/></svg>返回</button></div>
    <article class="card pad detail">
      <div class="pills" style="margin-bottom:8px">
        ${n.done ? `<span class="pill ok">已解決</span>` : `<span class="pill solid" style="background:var(--c-green)">徵求中</span>`}
      </div>
      <h3>${esc(n.title)}</h3>
      <div class="bodytext">${esc(n.body)}</div>
      <div class="block"><h4>提出者</h4>
        <div class="mcard" style="max-width:180px;text-align:left;display:flex;gap:10px;align-items:center"
             onclick="openMember(${n.author_id})">
          <div class="ava" style="width:40px;height:40px;font-size:.9rem;margin:0;background:${groupColor(author?.group)}">
            ${esc(initials(author?.name))}</div>
          <div><div class="n" style="font-size:.9rem">${esc(author?.name)}</div>
            <div class="c">${esc(author?.company || "")}</div></div>
        </div></div>
      ${n.done && n.helpers?.length ? `<div class="block"><h4>誰接住的</h4>
        <div class="pills">${n.helpers.map(h => `<span class="pill">${esc(nameOf(h))}</span>`).join("")}</div></div>` : ""}
      ${ME ? (ME.id === n.author_id ? `<div class="actions" style="margin-top:14px">
        <button class="btn btn-primary" onclick="toggleNeed(${n.id}, ${!n.done})">
          ${n.done ? "改回徵求中" : "標記已解決"}</button>
        <button class="btn btn-ghost" onclick="needForm(${n.id})">編輯</button></div>`
        : !n.done ? `<div class="actions" style="margin-top:14px">
        <a class="btn btn-primary" href="${escAttr(contactOf(n.author_id))}" target="_blank" rel="noopener">
          我可以幫忙</a></div>
        <div class="hint" style="margin-top:8px">直接私訊${esc(author?.name || "提出者")}談，
          談成之後請對方回來把這則標記已解決。</div>` : "") : ""}
    </article>`;
}

/* ── 相簿 ──────────────────────────────────────────────────────── */
function render_album(){
  el("v-album").innerHTML = `
    <div class="sec"><h2>班級相簿</h2>
      ${isOfficer() ? `<button class="more" onclick="albumForm()">＋ 新增</button>` : ""}</div>
    <div class="hint" style="margin-bottom:10px">照片放在 <b>Google 相簿</b>，這裡只放入口。
      不自己做一套上傳：班上本來就在用 Google 相簿，
      而且大家可以直接把自己拍的丟進同一本，不用等誰整理。</div>
    ${!ALBUMS.length ? emptyBox("還沒有相簿",
        isOfficer()
          ? "在 Google 相簿開一本共享相簿，把連結貼進來就好。記得開「允許共同編輯者新增相片」，同學才能自己上傳。"
          : "聚餐、參訪、開學典禮的照片會建成一本一本的相簿，由幹部開好共享相簿後放上來。") : ""}
    <div class="agrid">${ALBUMS.map(albumCard).join("")}</div>`;
}
function albumCard(a){
  const url = safeUrl(a.link);
  return `<div class="acard">
    <a href="${url ? escAttr(url) : "#/album"}" ${url ? `target="_blank" rel="noopener"` : ""}>
      ${a.cover && safeUrl(a.cover) ? `<img src="${escAttr(safeUrl(a.cover))}" alt="">`
                                    : `<div class="acover">📷</div>`}
      ${visPill(a) ? `<div class="acorner">${visPill(a)}</div>` : ""}
      <div class="cap">${esc(a.title)}
        <span>${esc(a.date || "")}${a.note ? "　" + esc(a.note) : ""}</span></div>
    </a>
    ${isOfficer() ? `<button class="aedit" onclick="albumForm(${a.id})">編輯</button>` : ""}
  </div>`;
}

/* ── 我的 ──────────────────────────────────────────────────────── */
function render_me(){
  const mine = ME ? POSTS.filter(p => MY_SIGNUPS.has(p.id)) : [];
  el("v-me").innerHTML = `
    <div class="sec"><h2>我的</h2></div>
    ${ME ? `
      <article class="card pad">
        <div style="display:flex;gap:14px;align-items:center">
          <div class="ava lg" style="background:${groupColor(ME.group)}">${esc(initials(ME.name))}</div>
          <div><h3 style="font-size:1.15rem;font-weight:800">${esc(ME.name)}</h3>
            <div class="hint">${(() => { const p = profileOf(ME.id);
              return p ? `${esc(p.company)}　${esc(p.title)}` : ""; })()}</div>
            <div class="pills" style="margin-top:6px">
              ${ME.officer ? `<span class="pill solid" style="background:var(--c-orange)">${esc(ME.officer)}</span>` : ""}
              <span class="pill">${esc(groupName(ME.group))}</span></div>
          </div>
        </div>
        <div class="actions" style="margin-top:14px">
          <button class="btn btn-primary btn-sm" onclick="go('profile')">編輯我的資料</button>
          <button class="btn btn-ghost btn-sm" onclick="openMember(${ME.id})">看我的頁面</button>
          <button class="btn btn-ghost btn-sm" onclick="logout()">登出</button>
        </div>
      </article>
      <div class="sec"><h2>我報名的活動</h2></div>
      ${mine.length ? mine.map(eventCard).join("") : `<div class="empty">還沒有報名任何活動</div>`}
    ` : `
      <article class="card pad" style="text-align:center">
        <div style="font-size:2rem">🔐</div>
        <b style="display:block;margin-top:8px">登入後才能報名活動、看聯絡方式</b>
        <div class="hint" style="margin-top:6px">用 LINE 登入。第一次登入要從名冊點自己的名字，之後就會直接進來。</div>
        <div class="actions" style="margin-top:14px"><button class="btn btn-primary" onclick="onMe()">登入</button></div>
      </article>`}

    ${LIVE && ME && ME.officer === "班代" ? `
    <div class="sec"><h2>診斷</h2></div>
    <article class="card pad">
      <div class="hint" style="margin-bottom:10px">
        ⛔ 只有班代看得到這一塊，同學不會看到。<br>
        系統怪怪的時候按下去，把結果整段截圖傳出來就能定位問題。</div>
      <div class="actions"><button class="btn btn-ghost btn-sm" onclick="showDbWhoAmI(this)">問資料庫我是誰</button></div>
      <pre id="dbwho" style="display:none;white-space:pre-wrap;word-break:break-all;
        background:var(--line-soft);padding:10px;border-radius:8px;margin-top:10px;
        font-size:.75rem;line-height:1.6"></pre>
    </article>` : ""}

    ${LIVE ? "" : `
    <div class="sec"><h2>版型測試：切換身分</h2></div>
    <article class="card pad">
      <div class="hint" style="margin-bottom:10px">⛔ 只有版型模式才有這一塊。
        接上資料庫之後它會自己消失 —— 正式站上留著等於誰都能假冒任何人。</div>
      <div class="chips" style="flex-wrap:wrap">
        <button class="chip${!ME?" on":""}" onclick="loginAs(null)">未登入</button>
        <button class="chip${ME&&!ME.officer?" on":""}" onclick="loginAs(5)">一般同學</button>
        <button class="chip${ME&&ME.officer?" on":""}" onclick="loginAs(23)">幹部（班代）</button>
      </div>
    </article>`}`;
}

/* 問資料庫「你認為我是誰」。
   前端說已登入、資料庫卻認不出來時，這是唯一能問清楚的方法 ——
   猜是猜不出來的（我已經猜錯三次）。 */
async function showDbWhoAmI(btn){
  const box = el("dbwho");
  box.style.display = "block";
  box.textContent = "查詢中…";
  const out = {};
  try{ const p = await authApi("ping"); out.伺服器診斷 = p; }
  catch(e){ out.ping_error = e.message; }
  try{ const w = await authApi("whoami"); out.後端認得的我 = w.ok ? w.me : "不認得"; }
  catch(e){ out.whoami_error = e.message; }
  try{ const pr = await authApi("profiles");
       out.拿到的個人資料筆數 = (pr.profiles||[]).length;
       const mine = (pr.profiles||[]).find(x => ME && x.member_id === ME.id);
       out.我自己的欄位 = mine ? Object.keys(mine.data||{}) : "沒拿到"; }
  catch(e){ out.profiles_error = e.message; }
  out.前端認為的我 = ME ? { id: ME.id, name: ME.name, officer: ME.officer } : null;
  out.最近失敗的請求 = (typeof REQ_LOG !== "undefined" && REQ_LOG.length) ? REQ_LOG : "（沒有）";
  try{
    const t = localStorage.getItem("fcu10_token") || "";
    const payload = t.split(".")[1];
    // ⚠️ atob 出來是 binary string，中文要再過一次 UTF-8 解碼，
    //    不然「班代」會顯示成亂碼，看起來像資料壞掉其實只是顯示問題。
    out.token內容 = payload
      ? JSON.parse(new TextDecoder().decode(
          Uint8Array.from(atob(payload.replace(/-/g,"+").replace(/_/g,"/")), ch => ch.charCodeAt(0))))
      : "沒有 token";
  }catch(e){ out.token_error = e.message; }
  box.textContent = JSON.stringify(out, null, 2);
}

/* ── 班級管理（幹部）──────────────────────────────────────────── */
function render_admin(){
  const byGroup = {};
  MEMBERS.forEach(m => (byGroup[m.group] ??= []).push(m));
  el("v-admin").innerHTML = `
    <div class="sec"><h2>班級管理</h2></div>
    ${!isOfficer() ? `<div class="empty">這一頁只有幹部看得到。<br>
      到「我的 → 切換身分」選幹部就能預覽。</div>` : `
    <article class="card pad">
      <h4 style="font-size:.86rem;color:var(--muted);letter-spacing:.5px;margin-bottom:8px">班級概況</h4>
      <dl class="kv">
        <dt>同學人數</dt><dd>${activeCount()} 位在學</dd>
        <dt>幹部</dt><dd>${MEMBERS.filter(m=>m.officer).sort((a,b)=>officerRank(a)-officerRank(b))
          .map(m=>`<span class="pill" style="margin:2px 3px 2px 0">${esc(m.officer)}：${esc(m.name)}</span>`).join("")}</dd>
        <dt>組別分布</dt><dd>${Object.entries(byGroup).map(([g,ms]) =>
          `<span class="pill" style="margin:2px 3px 2px 0"><span class="gdot" style="background:${groupColor(g)}"></span>${esc(groupName(g))} ${ms.length}</span>`).join("")}</dd>
      </dl>
    </article>
    <div class="sec"><h2>管理工具</h2></div>
    ${[
      ["👥 同學管理", "審核新申請、解除綁定、標記退出。刪除只給重複的空帳號用。"],
      ["📋 報名名單", "每場活動的報名者、餐點統計、飲食禁忌，可匯出 CSV。"],
      ["📍 現場報到台", "產生報到碼、即時看誰到了、補登、記錄未到原因。"],
      ["💰 班費與收款", "收款登記只有財務長勾得動；流水帳只增不改，對帳吵起來看這裡。"],
      ["📢 發布內容", "公告、問卷、活動。可先存成草稿只給幹部看，定案再公開。"]
    ].map(([t, d]) => `<article class="card pad" onclick="alert('版型階段：這是正式版的功能位置')" style="cursor:pointer">
        <b>${t}</b><div class="hint">${d}</div></article>`).join("")}`}`;
}

/* ── 行事曆 ────────────────────────────────────────────────────
   資料在 school.js（逢甲 115 學年度行事曆）。
   ⚠️ 一定要標出處與「以註冊課務組公告為準」——
      學校會改行事曆，同學若把這裡當唯一依據而錯過退選，那是我們的錯。 */
let CAL_TERM = "115-1";
const rocDate = iso => {                       // 西元 → 民國顯示
  const d = new Date(iso + "T00:00:00+08:00");
  return `${d.getFullYear() - 1911}/${d.getMonth() + 1}/${d.getDate()}`;
};
const calWeekday = iso =>
  WD[new Date(iso + "T00:00:00+08:00").getDay()];

let CAL_TAB = "class";     // class 停課日 / admin 行政日程

/* 建設發展創新論壇：六場都有固定日期，本質上就是行事曆的東西。
   ⛔ 不要留在「本學期」分頁 —— 那頁講的是每週固定的課表，
      六個一次性的日期夾在裡面，兩邊都變難讀。 */
const nextForum = today => FORUM.sessions.find(x => x.date >= today);

/* 「下一場」是即將發生的事，跟「下次沒課」一樣要擺最上面；
   六場的完整清單是查閱用的，放最後。同一頁，但不擠在一起。 */
function forumNextHTML(today){
  const nextF = nextForum(today);
  return `
    ${nextF ? `<article class="card bigcard">
      <div class="band">
        <div class="kicker">下一場　建設發展創新論壇（必修）</div>
        <div class="t">${esc(nextF.title)}${nextF.speaker ? `　講師：${esc(nextF.speaker)}` : ""}</div>
      </div>
      <div class="body">
        <div class="meta"><span>🗓 <b>${nextF.date.slice(5).replace("-", "/")}（${calWeekday(nextF.date)}）</b>
          　${esc(nextF.time)}　第 ${nextF.week} 週</span></div>
        <div class="meta" style="margin-top:5px"><span>📍 ${esc(nextF.place)}</span></div>
        <div class="seatline">還有 <b>${Math.round((new Date(nextF.date) - new Date(today)) / 86400000)}</b> 天</div>
      </div>
    </article>` : ""}`;
}
function forumListHTML(today){
  const nextF = nextForum(today);
  return `
    <div class="sec"><h2>建設發展創新論壇</h2></div>
    <div class="hint" style="margin-bottom:10px">
      碩一必修 1 學分，整學期六堂 —— 五次論壇加一次師生座談會，
      多數排在週六下午在紀 301，但有三場改時間或改地點，出門前先確認一下。</div>
    <article class="card">
      ${FORUM.sessions.map(x => {
        const past = x.date < today;
        return `<div class="calrow${past ? " past" : ""}${x === nextF ? " next" : ""}">
          <div class="caldate wide"><b>${x.date.slice(5).replace("-", "/")}</b>
            <span>第 ${x.week} 週</span></div>
          <div class="calbody">
            <div class="caltext"><b>${esc(x.title)}</b>${x.speaker ? `　講師：${esc(x.speaker)}` : ""}</div>
            <div class="hint">${esc(x.time)}　${esc(x.place)}</div>
          </div>
        </div>`;
      }).join("")}
    </article>
    <article class="card pad" style="margin-top:12px">
      <h4 style="font-size:.86rem;color:var(--muted);letter-spacing:.5px;margin-bottom:6px">怎麼算分</h4>
      <div class="bodytext" style="margin-top:0">${esc(FORUM.grading_text)}</div>
    </article>`;
}

function render_calendar(){
  const today = twDate(new Date());
  const sched = CLASS_SCHEDULE;
  /* 下次沒課是什麼時候 —— 在職專班最常被問的就是這個。
     ⛔ 不要寫成「下一個不上課的日子」：那是把欄位名直接搬到畫面上，
        讀起來像系統訊息。同學實際會問的是「下次沒課是哪天」。 */
  const nextOff = sched.rows.filter(r => !r.teach)
    .map(r => ({ ...r, d: r.dates.find(d => d >= today) || r.dates[r.dates.length - 1] }))
    .filter(r => r.d >= today)[0];
  const nextAdmin = ACADEMIC_CALENDAR.find(e => e.date >= today);
  const days = d => Math.round((new Date(d) - new Date(today)) / 86400000);

  el("v-calendar").innerHTML = `
    <div class="sec"><h2>行事曆</h2></div>

    ${nextOff ? `<article class="card bigcard">
      <div class="band">
        <div class="kicker">下次沒課</div>
        <div class="t">${esc(nextOff.week)}　${nextOff.dates.map(d => d.slice(5).replace("-", "/")).join("、")}</div>
      </div>
      <div class="body">
        <ul class="offlist">${nextOff.items.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
        ${affectedHTML(nextOff.dates)}
        <div class="seatline">還有 <b>${days(nextOff.d)}</b> 天</div>
      </div>
    </article>` : ""}

    ${forumNextHTML(today)}

    <div class="tools" style="margin-top:16px"><div class="chips">
      <button class="chip${CAL_TAB==="class"?" on":""}" onclick="CAL_TAB='class';render('calendar')">上課與放假</button>
      <button class="chip${CAL_TAB==="admin"?" on":""}" onclick="CAL_TAB='admin';render('calendar')">行政日程</button>
    </div></div>

    ${CAL_TAB === "class" ? classScheduleHTML(today) : adminCalendarHTML(today, nextAdmin)}

    ${forumListHTML(today)}`;
}

/* 那天原本有哪幾門課 —— 只講「11/28 沒課」沒有用，
   同學要知道的是「所以我那門不動產稅制少上一次」。
   ⚠️ 建設發展創新論壇不是每個週六都有，只有 FORUM 排定的六場；
      不特別擋掉的話，每一個停課的週六都會誤報一場論壇。 */
const WEEKDAY_CH = ["日","一","二","三","四","五","六"];
const wdOf = d => WEEKDAY_CH[new Date(d + "T00:00:00").getDay()];
function coursesOn(date){
  const d = wdOf(date);
  return THIS_TERM.rows.filter(r => r.day === d)
    .filter(r => r.name !== "建設發展創新論壇"
              || FORUM.sessions.some(f => f.date === date));
}
function affectedHTML(dates){
  const rows = [];
  (dates || []).forEach(dt => coursesOn(dt).forEach(r => rows.push({ dt, r })));
  if(!rows.length) return `<div class="hint" style="margin-top:8px">這幾天本來就沒有排課。</div>`;
  return `<div class="offcls">
    <div class="ochead">這幾天原本的課</div>
    ${rows.map(({ dt, r }) => `<div class="ocrow">
      <span class="ocdate">${dt.slice(5).replace("-", "/")}（${wdOf(dt)}）</span>
      <span class="ocname">${esc(r.name)}${
        r.kind === "必修" ? `<span class="wtag">必修</span>` : ""}</span>
      <span class="octeacher">${esc(r.teacher || "")}</span>
    </div>`).join("")}
  </div>`;
}

/* 學程公告的休假表：一列一個日期區間，右邊直接標「上課／沒課」 */
function classScheduleHTML(today){
  const s = CLASS_SCHEDULE;
  return `
    <div class="hint" style="margin-bottom:10px">
      學程公告　115 學年度第 1 學期休假及重要活動日期</div>
    <article class="card">
      ${s.rows.map(r => {
        const past = r.dates[r.dates.length - 1] < today;
        return `<div class="calrow${past ? " past" : ""}">
          <div class="caldate wide">
            ${r.dates.map(d => `<b>${d.slice(5).replace("-", "/")}</b>`).join("")}
            <span>${esc(r.week)}</span>
          </div>
          <div class="calbody">
            <ul class="offlist">${r.items.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
            ${r.teach ? "" : affectedHTML(r.dates)}
          </div>
          <span class="pill solid" style="align-self:flex-start;background:${
            r.teach ? "var(--ok)" : "var(--c-red)"}">${r.teach ? "上課" : "沒課"}</span>
        </div>`;
      }).join("")}
    </article>

    <article class="card pad" style="margin-top:12px">
      <h4 style="font-size:.86rem;color:var(--muted);letter-spacing:.5px;margin-bottom:6px">開學怎麼上</h4>
      <div class="bodytext" style="margin-top:0">${esc(s.notes_text)}</div>
      <div class="notice-lock" style="margin:12px 0 0">⚠️ ${esc(s.caveat)}</div>
      <div class="hint" style="margin-top:8px">
        第 2 學期（115-2）的休假表學程還沒公告，公告後補上。
      </div>
    </article>`;
}

/* 學校行事曆：選課、繳費、成績、學位這些行政期限 */
function adminCalendarHTML(today, next){
  const list = ACADEMIC_CALENDAR.filter(e => e.term === CAL_TERM);
  return `
    <div class="tools"><div class="chips">
      ${Object.entries(TERMS).map(([k,t]) =>
        `<button class="chip${CAL_TERM===k?" on":""}" onclick="CAL_TERM='${k}';render('calendar')">${esc(t.name)}</button>`).join("")}
    </div></div>
    <div class="hint" style="margin-bottom:10px">${esc(TERMS[CAL_TERM].range)}
      　行事曆原文為民國紀年，這裡一律換算成西元顯示。</div>

    <article class="card">
      ${list.map(e => {
        const k = CAL_KIND[e.kind] || {};
        const past = e.date < today;
        const isNext = next && e.date === next.date && e.text === next.text;
        return `<div class="calrow${past ? " past" : ""}${isNext ? " next" : ""}">
          <div class="caldate"><b>${e.date.slice(5).replace("-", "/")}</b>
            <span>${calWeekday(e.date)}</span></div>
          <div class="calbody">
            <div class="caltext">${e.big ? `<b>${esc(e.text)}</b>` : esc(e.text)}</div>
            ${e.detail ? `<div class="hint">${esc(e.detail)}</div>` : ""}
          </div>
          <span class="pill solid" style="background:${k.color};align-self:flex-start">${esc(k.label || "")}</span>
        </div>`;
      }).join("")}
    </article>

    <article class="card pad" style="margin-top:12px">
      <div class="hint">
        資料來源：<b>${esc(CALENDAR_SOURCE.title)}</b>（${esc(CALENDAR_SOURCE.note)}）<br>
        大學部的統籌科目集中會考、學士畢業班隨堂考不列在這裡 —— 在職專班不適用。
      </div>
      <div class="actions" style="margin-top:10px">
        <a class="btn btn-ghost btn-sm" href="${CALENDAR_SOURCE.url}" target="_blank" rel="noopener">註冊課務組行事曆 ↗</a>
      </div>
    </article>`;
}

/* ── 課程資訊 ────────────────────────────────────────────────
   ⛔ 只放會變動的東西。招生簡章上的畢業學分、課程結構、三組方向、
      教育目標、核心能力都拿掉了 —— 同學考進來時就看過，
      在這裡重印只會把真正要看的東西往下推。要查的人給連結就夠。 */
function render_courses(){
  const c = COURSE_INFO, t = THIS_TERM, today = twDate(new Date());

  /* 排序原則：【會變動的放上面，固定的放下面】。
     每學期都不一樣的（下一場論壇、本學期六堂論壇）擺前面。
     ⛔ 不要照「重要性」排 —— 課程地圖看起來很重要，
        但同學一學期只會看它一次。
     週曆雖然常看，但擺在課程地圖正上方 ——
     三張課表（本學期、碩二上下、課程地圖）連在一起才好對照，
     拆開放反而要上下捲。 */
  el("v-courses").innerHTML = `
    <div class="sec"><h2>本學期課程</h2><span class="hint">${esc(t.term)}</span></div>

    <div class="sec"><h2>本學期週曆</h2><span class="hint">碩一上</span></div>
    ${weekGrid(t.rows)}
    <div class="hint" style="margin-top:8px">
      平日晚間都是 18:10–21:00，週六早上 09:10–11:00、下午 13:10–16:00。
      <b>星期四沒有課</b>；<b>週一晚上兩門課同時開</b>，國土計畫專論與結構物安全鑑定實務只能二擇一。
      資料出自${esc(t.source)}，實際時間與教室仍以學校課表與授課老師公告為準。</div>

    <div class="sec"><h2>課程地圖</h2></div>
    <article class="card pad">
      <div class="creditbar">
        <div class="cseg req" style="flex:${COURSE_MAP.credits.required}">
          <b>${COURSE_MAP.credits.required}</b><span>必修</span></div>
        <div class="cseg ele" style="flex:${COURSE_MAP.credits.total - COURSE_MAP.credits.required}">
          <b>${COURSE_MAP.credits.total - COURSE_MAP.credits.required}</b><span>選修</span></div>
      </div>
      <div class="hint" style="margin-top:8px">
        畢業要 <b>${COURSE_MAP.credits.total}</b> 學分：共同必修 ${COURSE_MAP.credits.required} 學分，
        其餘全部靠選修湊，每門 ${COURSE_MAP.credits.per_elective} 學分 ——
        也就是還要修滿十門。${esc(COURSE_MAP.credits.outside)}</div>
      <details class="howto" style="margin-top:12px">
        <summary>展開四學期完整課程地圖</summary>
        <div class="howtobody">
          <div class="maptable">
            <table>
              <tr><th></th>${COURSE_MAP.terms.map(x => `<th>${esc(x)}</th>`).join("")}</tr>
              ${COURSE_MAP.rows.map(r => `<tr>
                <th class="rowlab"${r.key !== "req" && r.key !== "common"
                  ? ` style="border-left:3px solid ${groupColor(r.key)}"` : ""}>${esc(r.label)}</th>
                ${r.cells.map(cell => `<td>${cell.length
                  ? cell.map(x => `<div>${esc(x)}</div>`).join("") : "—"}</td>`).join("")}
              </tr>`).join("")}
            </table>
          </div>
          <div class="hint" style="margin-top:8px">115 學年度入學新生適用。僅供參考，以當學期公告為主。</div>
        </div>
      </details>
      <details class="howto" style="margin-top:10px">
        <summary>碩二上課表（115-1，第九屆學長姊的課，供規劃參考）</summary>
        <div class="howtobody" style="padding:0">
          ${weekGrid(TERM_Y2.rows)}
          <div class="hint" style="padding:10px 0 0">
            ⚠️ 我們升碩二時是 116-1，開課內容會不一樣。</div>
        </div>
      </details>
    </article>

    <div class="sec"><h2>自己查課</h2></div>
    <article class="card">
      <a class="linkrow" href="${esc(c.search.url)}" target="_blank" rel="noopener">
        <span>課程查詢系統（開課狀況、教學大綱、進度、評量）</span><span class="go">↗</span></a>
      ${c.links.map(l => `<a class="linkrow" href="${esc(l.url)}" target="_blank" rel="noopener">
        <span>${esc(l.label)}</span><span class="go">↗</span></a>`).join("")}
    </article>
    <div class="hint" style="margin-top:10px">
      進去之後分頁選「<b>${esc(c.search.tab)}</b>」，依序選：
      ${c.search.fields.map(f => `${esc(f.label)} <b>${esc(f.value)}</b>`).join("、")}。<br>
      這個系統沒辦法做成直達連結 —— 網址帶一個會過期的憑證，選完條件網址也不會變。
    </div>`;

}

/* 課表用週曆呈現。
   ⚠️ 一個格子可能同時有兩門課（週一晚上、週六早上就是），
      所以每格是陣列不是單一課程 —— 這是課表最容易寫錯的地方。
   ⚠️ 欄位固定用課表原本的星期集合（碩一沒有週四），不要自己補齊
      一到五 —— 補出來的空欄會讓人以為那天有課只是還沒排。 */
/* 搜尋框每打一個字就整塊重畫，input 是新的，游標會回到最前面 ——
   打「gis」會變成「sig」。補回焦點後要把游標壓回字尾。 */
function refocus(id){
  const i = el(id); if(!i) return;
  i.focus(); const n = i.value.length; i.setSelectionRange(n, n);
}
function weekGrid(rows){
  const DAY_ORDER = ["一","二","三","四","五","六","日"];
  const days = DAY_ORDER.filter(d => rows.some(r => r.day === d));
  // 時段排序：節次 0 最前，其餘照開始時間
  const rank = t => t.includes("節次") ? -1 : parseInt(t.replace(/[^0-9]/g, "").slice(0, 4), 10);
  const slots = [...new Set(rows.map(r => r.time))].sort((a, b) => rank(a) - rank(b));

  return `<div class="weekwrap"><table class="week">
    <tr><th class="tcorner"></th>${days.map(d => `<th>週${d}</th>`).join("")}</tr>
    ${slots.map(slot => `<tr>
      <th class="tslot">
        <span class="pnum">${esc(PERIODS[slot] || "")}</span>
        ${slot === "節次 0" ? "" : esc(slot).replace("–", "<br>–")}
      </th>
      ${days.map(d => {
        const cs = rows.filter(r => r.day === d && r.time === slot);
        if(!cs.length) return `<td></td>`;
        return `<td>${cs.map(r => `<div class="wcls${r.kind === "必修" ? " req" : ""}"
          style="${r.group ? `border-left-color:${groupColor(r.group)}` : ""}">
          <b>${esc(r.name)}</b>
          ${r.kind === "必修" ? `<span class="wtag">必修</span>` : ""}
          ${r.teacher ? `<span class="wt">${esc(r.teacher)}</span>` : ""}
        </div>`).join("")}</td>`;
      }).join("")}
    </tr>`).join("")}
  </table></div>`;
}

/* ── 師資 ────────────────────────────────────────────────────────
   ⚠️ 找指導教授時，真正在找的是「專長對不對得上我的題目」，
      所以搜尋框搜的是【專長】，不是只有姓名。
   ⛔ 分機與 Email 登入後才顯示 —— 這是從新生手冊抄來的內部聯絡資訊，
      公開放上網會被爬蟲收走。學程辦公室是對外窗口，例外公開。 */
let F_Q = "";
function render_faculty(){
  const q = F_Q.trim();
  const hit = t => !q || (t.name + t.title + t.edu + t.field).includes(q);
  // 學程主任排最前面，其餘照職稱（教授→副教授→助理教授）
  const full = FACULTY_FULL.filter(hit)
    .sort((a, b) => (b.head ? 1 : 0) - (a.head ? 1 : 0) || a.rank - b.rank);
  const part = FACULTY_PART.filter(hit);

  el("v-faculty").innerHTML = `
    <div class="sec"><h2>學程辦公室</h2></div>
    <article class="card pad">
      <dl class="kv">
        <dt>時間</dt><dd>${esc(OFFICE.when)}</dd>
        <dt>地點</dt><dd>${esc(OFFICE.place)}</dd>
      </dl>
      <div class="block" style="margin-top:12px">
        ${OFFICE.staff.map(x => `<div class="frow">
          <div class="fname"><b>${esc(x.name)}</b><span>${esc(x.title)}</span></div>
          <div class="fcontact">分機 ${esc(x.ext)}　<a href="mailto:${esc(x.email)}">${esc(x.email)}</a></div>
        </div>`).join("")}
      </div>
      <div class="hint" style="margin-top:10px">${esc(OFFICE.saturday)}</div>
    </article>

    <div class="sec"><h2>師資</h2><span class="hint">${full.length + part.length} 位</span></div>
    <div class="tools"><div class="search">
      <svg width="18" height="18" fill="none" stroke="var(--muted)"><use href="#i-search"/></svg>
      <input id="fq" placeholder="搜尋專長、姓名、學歷…例如「不動產估價」" value="${esc(F_Q)}"
        oninput="F_Q=this.value;render_faculty();refocus('fq')">
    </div></div>
    ${!ME ? `<div class="notice-lock">分機與 Email <b>登入後才看得到</b>。
      這是新生手冊上的內部聯絡資訊，公開放在網頁上會被爬蟲收走。</div>` : ""}

    ${full.length ? `<div class="sec"><h2 style="font-size:.9rem;color:var(--muted)">專任教師</h2></div>
      ${full.map(facultyCard).join("")}` : ""}
    ${part.length ? `<div class="sec"><h2 style="font-size:.9rem;color:var(--muted)">兼任教師</h2></div>
      ${part.map(facultyCard).join("")}` : ""}
    ${!full.length && !part.length ? emptyBox("沒有符合的老師",
      "換個關鍵字試試。可以搜專長（例如「不動產估價」「都市防災」「GIS」）、姓名或學歷。") : ""}

    <div class="hint" style="margin-top:12px">
      資料整理自 115 學年度新生手冊。老師的分機與研究室可能異動，
      正式聯絡前建議先向學程辦公室確認。</div>`;
}
/* 老師的逢甲頁面。
   ⛔ 沒有 fcuId 的不要用猜的組連結 —— 點進去是別的老師，比沒有連結更糟。
      改成連到學程網站搜尋，讓使用者自己看有沒有。 */
function facultyLink(f){
  if(!f.fcuId) return { url:`https://mcd.fcu.edu.tw/?s=${encodeURIComponent(f.name)}`,
                        label:"在逢甲網站搜尋" };
  // 老師分散在不同系所網站，host 與 unit 都要對；沒寫就是本學程
  const host = f.fcuHost || "mcd", unit = f.fcuUnit || "CD16";
  return { url:`https://${host}.fcu.edu.tw/teachers-detail/?id=${f.fcuId}&unit_id=${unit}`,
           label:"個人介紹頁" };
}
function facultyCard(f){
  const link = facultyLink(f);
  return `<article class="card pad fcard">
    <div class="frow">
      <div class="fname"><b>${esc(f.name)}</b><span>${esc(f.title)}</span></div>
      ${ME && f.ext ? `<div class="fcontact">分機 ${esc(f.ext)}<br>
        ${f.email ? f.email.split("、").map(e =>
          `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join("<br>") : ""}</div>` : ""}
    </div>
    <div class="ffield">${esc(f.field)}</div>
    <div class="hint">${esc(f.edu)}${f.note ? `　·　${esc(f.note)}` : ""}</div>
    <a class="flink${f.fcuId ? " has" : ""}" href="${esc(link.url)}" target="_blank" rel="noopener"
       onclick="event.stopPropagation()">${esc(link.label)} ↗</a>
  </article>`;
}

/* ── 使用說明 ──────────────────────────────────────────────────── */
function render_help(){
  el("v-help").innerHTML = `
    <div class="sec"><h2>使用說明</h2></div>
    <article class="card pad helpdoc">
      <h3>1　這是什麼</h3>
      <p style="font-size:.93rem">逢甲大學建設碩士在職學位學程第十屆的班級看板。
        公告、活動報名、同學名冊、資源交流都在這裡，不用在 LINE 群裡往上翻。</p>

      <h3>2　要不要登入</h3>
      <table>
        <tr><th>不用登入</th><th>要登入</th></tr>
        <tr>
          <td>同學名冊、公告、活動、相簿的<b>內容</b>；已報名<b>人數</b></td>
          <td>報名活動、現場報到、看聯絡方式、提資源需求</td>
        </tr>
      </table>
      <p style="font-size:.9rem;margin-top:8px">⛔ 不外流：電話、Email、LINE 帳號 ID、報到定位。</p>

      <h3>3　活動報名</h3>
      <ul>
        <li>首頁會固定顯示<b>下一場</b>，直接在那裡報名</li>
        <li>額滿可以登記候補；有人取消會自動遞補</li>
        <li><b>不能去一定要提前取消</b> —— 位子讓給候補的同學，聚餐的桌數也要算</li>
        <li>報到按鈕平常是灰的，<b>活動當天</b>才會亮</li>
      </ul>

      <h3>4　資源交流怎麼用</h3>
      <p style="font-size:.93rem">這一班橫跨開發、營造、建築、公部門、金融、法務、資訊。
        有需求就直接提，比在群組裡問有效。解決了記得標「已解決」，
        看板上會留下誰接住的紀錄。</p>

      <h3>5　圖片出處</h3>
      <p style="font-size:.93rem">校園照片取自 Wikimedia Commons，授權
        <b>CC BY-SA 3.0</b>（人言大樓、丘逢甲紀念館：攝影者 SSR2000；校園空拍：Flickr，CC BY 2.0）。
        依授權條款必須標示作者與授權方式，所以這一段請不要刪掉。</p>

      <h3>6　出事的時候</h3>
      <ul>
        <li><b>有人說「沒改到」</b>：先看頁尾的版本時間，對得上就是他要重新整理</li>
        <li><b>畫面空白</b>：先重新整理一次；持續發生再找管理的同學</li>
      </ul>
    </article>`;
}

/* ── 導覽 ──────────────────────────────────────────────────────── */
const VIEWS = ["home","notices","acts","calendar","courses","members","mdetail","profile","claim","faculty","needs","ndetail","album","pdetail","me","admin","help"];
/* 導覽只有六項。同一件事的頁面收成【分頁】，不要各占一列 ——
   十一項的側欄沒人掃得完，每次都要從頭找一遍。
   ⛔ home／members／needs 不進分頁：最常點的三個藏起來等於廢掉。 */
const NAV_GROUPS = [
  { v:"home",    label:"首頁" },
  /* 第三格＝這一頁自己的大標題文字。分頁列已經寫了頁名，
     底下再一個一模一樣的大標題是廢話 —— 把它吸收進分頁列，
     它右邊的說明字與動作鈕（＋發布）一起搬過來，不會弄丟。 */
  { v:"notices", label:"公告活動",
    tabs:[["notices","公告與問卷","公告與問卷"], ["acts","活動","活動"], ["album","相簿","班級相簿"]] },
  /* 行事曆單獨一項：它回答「這週要不要來」，是每週都會問一次的事。
     論壇六場也在那裡 —— 那是六個固定日期，本質上就是行事曆。 */
  { v:"calendar", label:"行事曆" },
  /* 課表與師資合在一起：查完課想知道是誰教的，是同一個動作。 */
  { v:"courses", label:"課程資訊與師資",
    tabs:[["courses","課程資訊","本學期課程"], ["faculty","師資","師資"]] },
  { v:"members", label:"同學" },
  { v:"needs",   label:"資源交流" },
  { v:"me",      label:"我的",
    tabs:[["me","我的","我的"], ["help","使用說明","使用說明"]] },
  { v:"admin",   label:"班級管理", officerOnly:true },
];
/* 子頁 → 它屬於哪個導覽項（決定哪個按鈕亮著）。
   詳細頁沒有自己的按鈕，也靠這張表回到來源。 */
const NAV_ROOT = (() => {
  const m = {};
  NAV_GROUPS.forEach(g => (g.tabs || [[g.v]]).forEach(([v]) => m[v] = g.v));
  return Object.assign(m, { mdetail:"members", ndetail:"needs", pdetail:"notices", profile:"me", claim:"me" });
})();
const NAV_TITLES = { home:"首頁", notices:"公告", acts:"活動",
  calendar:"行事曆", courses:"課程資訊", faculty:"師資", members:"名冊",
  needs:"資源交流", album:"相簿", me:"我的", admin:"班級管理", help:"使用說明" };

function render(v){
  const fn = window["render_" + v];
  if(fn) fn();
  paintTabs(v);   // ⚠️ 放在 render 裡而不是 go 裡：頁內的篩選鈕也會直接呼叫 render()，
}                 //    只在 go() 插分頁列的話，一按篩選分頁列就不見了。
function paintTabs(v){
  const g = NAV_GROUPS.find(x => x.tabs && x.tabs.some(t => t[0] === v));
  if(!g) return;
  const host = el("v-" + v); if(!host) return;
  const bar = document.createElement("div");
  bar.className = "subtabs";
  bar.innerHTML = g.tabs.map(([tv, tl]) =>
    `<button class="tb${tv === v ? " on" : ""}" onclick="go('${tv}')">${tl}</button>`).join("");

  // 把重複的頁面標題吸收掉，它的說明字與動作鈕搬進分頁列
  const own = g.tabs.find(t => t[0] === v)?.[2];
  if(own){
    const sec = [...host.querySelectorAll(".sec")]
      .find(x => x.querySelector("h2")?.textContent.trim() === own);
    if(sec){
      const hint = sec.querySelector(".hint"), act = sec.querySelector(".more");
      if(hint){ hint.classList.add("tabhint"); bar.appendChild(hint); }
      if(act) bar.appendChild(act);
      sec.remove();
    }
  }
  host.insertBefore(bar, host.firstChild);
}
function go(v){
  if(!VIEWS.includes(v)) v = "home";
  VIEW = v;
  VIEWS.forEach(x => el("v-" + x).classList.toggle("on", x === v));
  const navFor = NAV_ROOT[v] || v;
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("on", b.dataset.v === navFor));
  render(v);
  paintDrawer();
  window.scrollTo(0, 0);
  closeDrawer();
}
document.querySelectorAll(".nav button").forEach(b => b.onclick = () => go(b.dataset.v));

function paintDrawer(){
  el("drawerlist").innerHTML = NAV_GROUPS.map(g => {
    if(g.officerOnly && !isOfficer()) return "";
    const rows = (g.tabs || [[g.v, g.label]]).map(([v, t]) =>
      `<a class="di${VIEW === v ? " on" : ""}" onclick="go('${v}')">${t}</a>`).join("");
    // 只有一頁的群組不用再加一層標題，那只是多一行字
    return g.tabs ? `<div class="dgroup">${g.label}</div>${rows}` : rows;
  }).join("") + `<div class="dgroup">學程</div>
    <a class="di" href="${CLASS_INFO.site}" target="_blank" rel="noopener">學程官網 ↗</a>`;
}
function openDrawer(){ el("drawer").classList.add("on"); el("scrim").classList.add("on"); }
function closeDrawer(){ el("drawer").classList.remove("on"); el("scrim").classList.remove("on"); }
/* 「我可以幫忙」要能真的聯絡到人。
   ⛔ 不要做站內私訊 —— 那需要通知系統，沒人會回來看網站收信。
      班上本來就用 LINE，直接把人帶過去最有效。 */
function contactOf(id){
  const m = memberOf(id);
  return safeUrl(m?.line_url) || (m?.email ? "mailto:" + m.email : "#/member/" + id);
}
function openLightbox(url){ el("lightimg").src = url; el("lightbox").classList.add("on"); }
function closeLightbox(){ el("lightbox").classList.remove("on"); }

/* ── 登入 ────────────────────────────────────────────────────────
   正式模式：LINE Login → auth 換 token → 第一次要認領身分。
   版型模式：沒有真登入，用「我的」頁面的切換身分預覽三種畫面。   */
function onMe(){
  if(ME){ go("me"); return; }
  if(LIVE){ lineLogin(); return; }
  alert("版型模式：填好 config.js 之後，按這裡就會跳 LINE 登入。\n\n" +
        "現在先到「我的」頁面用最下面的「切換身分」預覽。");
  go("me");
}
function loginAs(id){
  ME = id ? memberOf(id) : null;
  MY_MOCK_SIGNUPS = id ? [{ post_id:101, status:"ok" }] : [];
  reload().then(() => { paintMe(); render(VIEW); });
}
function logout(){
  if(LIVE){ logoutReal(); return; }
  loginAs(null);
}
function paintMe(){
  el("meName").textContent = ME ? ME.name : "登入";
  el("meBtn").classList.toggle("in", !!ME);
  el("nav-admin").style.display = isOfficer() ? "" : "none";
  paintDrawer();
}

/* ── 啟動 ──────────────────────────────────────────────────────── */
/* ⚠️ 一個失敗不能拖垮全部。
   原本用 Promise.all：七個查詢只要一個失敗，MEMBERS 就停在空陣列，
   整個網站變空白，錯誤只有頁尾一行小字 —— 同學會直接當成「壞了」。
   改成 allSettled：成功的照用，失敗的保留舊值，並回報哪幾項掛了。 */
async function reload(){
  const jobs = [
    ["members",  db.members()],
    ["posts",    db.posts()],
    ["needs",    db.needs()],
    ["albums",   db.albums()],
    ["seats",    db.seats()],
    ["signups",  db.mySignups()],
    ["profiles", db.profiles()],
  ];
  const res = await Promise.allSettled(jobs.map(j => j[1]));
  const failed = [];
  res.forEach((r, i) => {
    const name = jobs[i][0];
    if(r.status === "rejected"){ failed.push(name); console.error("讀取失敗：" + name, r.reason); return; }
    const v = r.value;
    if(name === "members"  && v) MEMBERS = v;
    if(name === "posts"    && v) POSTS = v;
    if(name === "needs"    && v) NEEDS = v;
    if(name === "albums"   && v) ALBUMS = v;
    if(name === "seats"    && v) SEATS = v;
    if(name === "signups"  && v) MY_SIGNUPS = v;
    if(name === "profiles" && v) PROFILES = v;
  });
  return failed;
}

// 讀不到東西時要講人話，並且給一顆能按的按鈕 —— 不要只留一行紅字在頁尾
function showLoadError(failed){
  const bar = el("loaderr");
  if(!failed.length){ bar.style.display = "none"; return; }
  bar.style.display = "block";
  bar.innerHTML = `<b>有些資料沒讀到</b>（${esc(failed.join("、"))}）。
    通常是網路不穩或伺服器剛睡醒，重試一次多半就好了。
    <button class="btn btn-sm" style="margin-top:8px;background:#fff;color:var(--p-700)"
      onclick="retryLoad(this)">重新載入</button>`;
}
async function retryLoad(btn){
  btn.disabled = true; btn.textContent = "載入中…";
  const failed = await reload();
  showLoadError(failed);
  render(VIEW);
  paintMe();
}

(async function boot(){
  el("verline").textContent = VERSION + (LIVE ? "" : "　版型模式");
  try{
    if(LIVE){
      // 先處理 LINE 導回來的 code，再恢復既有登入 —— 順序反了會白登入一次
      const handled = await handleLineCallback();
      if(!handled) ME = await restoreLogin();
    }
  }catch(e){ console.error("登入狀態還原失敗", e); }

  let failed = await reload();
  // ⚠️ 冷啟動時 Supabase 偶爾會丟一次 Failed to fetch，重試一次就好。
  //    不重試的話，使用者看到的是一個空白的網站。
  if(failed.length){
    await new Promise(r => setTimeout(r, 900));
    failed = await reload();
  }
  showLoadError(failed);

  paintMe();
  // 認領畫面是登入流程的一部分，不要被 go("home") 蓋掉
  if(VIEW !== "claim") go("home");
})();
