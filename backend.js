/* ────────────────────────────────────────────────────────────────
   正式模式：Supabase 讀寫 + LINE 登入

   ⛔ 這一層【只負責搬資料】。權限判斷全部在資料庫（RLS 與 SECURITY
      DEFINER 函式）—— 前端看不到的東西是後端沒吐出來，
      不是前端自己決定不顯示。這跟版型階段的遮蔽是兩回事。

   CONFIG 沒填完時整支不會被用到，app.js 會退回 data.js 的版型資料。
   ──────────────────────────────────────────────────────────────── */

const TOKEN_KEY = "fcu10_token";
const tokenOf = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch(e){ return ""; } };
const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }catch(e){} };

/* PostgREST 的標頭。
   ⛔ 【不要】把我們自己簽的 token 送給 PostgREST。
      這個專案的 JWT 簽章金鑰是 ECC(P-256)，而我們手上只有
      legacy 的 HS256 共用密鑰 —— PostgREST 解不開，會回：
        PGRST301 "None of the keys was able to decode the JWT"
      而且是【每一個查詢都 401】，連本來公開的名冊都讀不到。
      症狀就是「登入之後整個網站變空白」。

      所以 PostgREST 一律只用 publishable key、只讀公開資料；
      需要身分的操作全部走 auth 這支 Edge Function（見 backend 的 fn()）。 */
function sbHeaders(extra){
  return Object.assign({
    apikey: CONFIG.SUPABASE_ANON_KEY,
    Authorization: "Bearer " + CONFIG.SUPABASE_ANON_KEY
  }, extra || {});
}

/* 失敗的請求留一份紀錄，診斷面板會顯示。
   ⛔ 不要靜靜地失敗 —— 這整輪除錯之所以拖這麼久，
      就是因為錯誤被吞掉、被覆蓋、被自動「處理」掉。 */
const REQ_LOG = [];
function logFail(path, status, body){
  REQ_LOG.unshift({ path: path.slice(0, 80), status, body: (body || "").slice(0, 200) });
  REQ_LOG.length = Math.min(REQ_LOG.length, 8);
}

async function rest(path, init){
  const r = await fetch(CONFIG.SUPABASE_URL + "/rest/v1/" + path,
    Object.assign({ headers: sbHeaders(init && init.body ? {"Content-Type":"application/json"} : null) }, init));
  if(!r.ok){
    const msg = await r.text();
    logFail(path, r.status, msg);
    /* ⛔ 【不要】在這裡自動清掉 token。
       原本 401 就把 token 刪掉，想法是「壞掉的 token 不如重登」，
       但實際後果是：登入成功 → 某個查詢 401 → token 被刪 →
       畫面還顯示已登入（ME 還在記憶體）→ 重新整理就變登出，
       而且真正的錯誤證據被一起銷毀，完全查不出原因。
       token 該不該作廢由 whoami 決定，不是由任何一個查詢的失敗決定。 */
    throw new Error("讀取失敗 " + r.status + "：" + msg.slice(0, 200));
  }
  return r.status === 204 ? null : r.json();
}
// 呼叫資料庫函式（報名、報到那些有邏輯的動作）
async function rpc(fn, args){
  return rest("rpc/" + fn, { method:"POST", body: JSON.stringify(args || {}) });
}
/* 呼叫 auth 那支 Edge Function。
   ⛔ 這裡【不能】用 sbHeaders() —— 它會多送一個 apikey 標頭，
      而 apikey 不在 function 的 Access-Control-Allow-Headers 裡，
      瀏覽器的預檢就會失敗，整個請求連送都送不出去（Failed to fetch）。
      Edge Function 本身不需要 apikey（Verify JWT 已關），送了只是害死自己。
   ⚠️ 這個 bug 用 curl 測不出來：curl 不做 CORS 預檢。 */
async function authApi(action, body){
  const t = tokenOf();
  const h = { "Content-Type": "application/json" };
  if(t) h.Authorization = "Bearer " + t;
  const r = await fetch(CONFIG.SUPABASE_URL + "/functions/v1/auth", {
    method: "POST", headers: h,
    body: JSON.stringify(Object.assign({ action }, body || {}))
  });
  // ⚠️ 500 也要把 body 讀出來 —— 伺服器有回原因，
  //    只丟一句「伺服器錯誤 500」等於把線索丟掉。
  const text = await r.text();
  let data = null;
  try{ data = text ? JSON.parse(text) : null; }catch(e){}
  if(!r.ok && !data) throw new Error("伺服器錯誤 " + r.status + "：" + text.slice(0, 200));
  return data;
}

/* ── LINE 登入 ───────────────────────────────────────────────────
   標準 OAuth：導去 LINE → 使用者同意 → 帶 code 回來 → 後端換身分。

   ⚠️ state 一定要驗，不驗的話別人可以用一段偽造的網址讓你登入他的帳號（CSRF）。

   ⛔ 但【不能存 sessionStorage】——
      手機 Chrome 按登入會跳去 LINE App 授權，回來時 Chrome 開的常常是
      【新的分頁】。sessionStorage 每個分頁各自獨立，新分頁裡是空的，
      state 就永遠對不上，登入被自己擋掉。
      （LINE 內建瀏覽器全程同一個分頁，所以測不出這個問題。）
      改用 localStorage：跨分頁共用，仍然只有同一個網域讀得到，
      CSRF 防護沒有變弱。加時效，用完就刪。 */
const STATE_KEY = "fcu10_state", STATE_TTL = 15 * 60 * 1000;   // 15 分鐘
function saveState(v){
  try{ localStorage.setItem(STATE_KEY, JSON.stringify({ v, t: Date.now() })); }catch(e){}
}
function takeState(){
  try{
    const raw = localStorage.getItem(STATE_KEY);
    localStorage.removeItem(STATE_KEY);          // 用完就丟，不能重放
    if(!raw) return "";
    const o = JSON.parse(raw);
    return (Date.now() - o.t < STATE_TTL) ? o.v : "";
  }catch(e){ return ""; }
}

function lineLogin(){
  const state = crypto.randomUUID();
  saveState(state);
  const q = new URLSearchParams({
    response_type: "code",
    client_id: CONFIG.LINE_CHANNEL_ID,
    redirect_uri: CONFIG.REDIRECT,
    state,
    scope: "profile openid"
  });
  location.href = "https://access.line.me/oauth2/v2.1/authorize?" + q;
}

// 從 LINE 導回來時處理。回傳 true 代表這一次載入是在處理登入。
async function handleLineCallback(){
  const u = new URLSearchParams(location.search);
  const code = u.get("code"), state = u.get("state");
  if(!code) return false;

  const saved = takeState();
  // 網址清乾淨：不然使用者重新整理會拿一個已經用掉的 code 再打一次
  history.replaceState({}, "", CONFIG.REDIRECT);

  if(!state || state !== saved){
    // ⚠️ 錯誤訊息要說得出「怎麼辦」。使用者不知道什麼是驗證字串，
    //    但看得懂「在同一個瀏覽器重新按一次登入」。
    loginFailed("登入的驗證字串對不上（多半是中途換了瀏覽器或分頁）。" +
                "請在同一個瀏覽器裡重新按一次登入。");
    return true;
  }

  let r;
  try{
    r = await authApi("login", { code, redirect_uri: CONFIG.REDIRECT });
  }catch(e){
    // ⛔ 這裡一定要講出來。之前是把錯誤吞掉，結果症狀變成
    //    「按了登入、LINE 也過了、回來卻等於沒登入，而且沒有任何訊息」——
    //    那是最難查的一種壞法。
    loginFailed("連不上登入伺服器（" + e.message + "）");
    return true;
  }
  if(r.error){ loginFailed(r.error, r.detail); return true; }

  if(r.need_claim){
    CLAIM = { ticket: r.claim_ticket, line_name: r.line_name, list: r.candidates || [] };
    go("claim");
    return true;
  }
  setToken(r.token);
  ME = r.me;
  return true;
}

/* 登入失敗要顯示在畫面上，而且要留得住。
   ⛔ 不能跟「資料讀取失敗」共用同一個元素 ——
      之前就是共用，reload() 成功後 showLoadError() 把它設成隱藏，
      錯誤訊息只閃一下就被擦掉，使用者只看到「紅色秒閃過」。
   ⚠️ 順手存進 localStorage：訊息閃掉了還查得到，
      不然除錯只能靠使用者的眼睛快不快。 */
function loginFailed(msg, detail){
  console.error("登入失敗", msg, detail);
  try{
    localStorage.setItem("fcu10_last_login_error",
      JSON.stringify({ at: new Date().toISOString(), msg, detail }));
  }catch(e){}
  const bar = el("loginerr");
  if(!bar) return;
  bar.style.display = "block";
  bar.innerHTML = `<b>登入沒有成功</b><br>${esc(msg)}` +
    (detail ? `<br><span style="opacity:.85;font-size:.8rem">${esc(JSON.stringify(detail))}</span>` : "") +
    `<div style="display:flex;gap:8px;margin-top:10px">
       <button class="btn btn-sm" style="background:#fff;color:var(--p-700)"
         onclick="lineLogin()">再試一次</button>
       <button class="btn btn-sm" style="background:transparent;color:#fff;border:1px solid #fff9"
         onclick="this.closest('#loginerr').style.display='none'">關閉</button>
     </div>`;
}

// 重新整理後恢復登入狀態
async function restoreLogin(){
  if(!tokenOf()) return null;
  const r = await authApi("whoami");
  if(!r || !r.ok){ setToken(""); return null; }
  setToken(r.token);          // 幹部換人時 token 裡的職務會更新
  return r.me;
}

function logoutReal(){
  setToken("");
  ME = null;
  paintMe();
  go("home");
}

/* ── 身分認領 ────────────────────────────────────────────────────
   第一次用 LINE 登入的人，要從名冊挑自己是誰。
   ⛔ 只列「還沒被認領」的人。已經被綁走的不顯示 ——
      不然兩個人搶同一個名字，第二個會白按一次才被拒絕。          */
let CLAIM = null, CLAIM_Q = "";
function render_claim(){
  if(!CLAIM){ go("home"); return; }
  const q = CLAIM_Q.trim();
  const list = CLAIM.list.filter(m => !q || m.name.includes(q));
  el("v-claim").innerHTML = `
    <div class="sec"><h2>你是哪一位？</h2></div>
    <div class="notice-lock">
      LINE 認出你是 <b>${esc(CLAIM.line_name || "")}</b>，
      但還不知道你是名冊上的誰。<br>
      找到自己的名字點下去，之後每次用同一個 LINE 登入就會直接進來。
    </div>
    <div class="hint" style="margin-bottom:10px">
      ⚠️ 選錯了自己改不回來，要找幹部解除綁定。慢慢找沒關係。
    </div>
    <div class="tools"><div class="search">
      <svg width="18" height="18" fill="none" stroke="var(--muted)"><use href="#i-search"/></svg>
      <input id="cq" placeholder="輸入自己的名字…" value="${esc(CLAIM_Q)}"
        oninput="CLAIM_Q=this.value;render_claim();el('cq').focus()">
    </div></div>
    ${list.length ? `<div class="mgrid">${list.map(m => `
      <div class="mcard" onclick="doClaim(${m.id}, '${escAttr(m.name)}')">
        <div class="ava" style="background:${groupColor(m.grp)}">${esc(initials(m.name))}</div>
        <div class="n">${esc(m.name)}</div>
        <div class="c">${esc((GROUPS[m.grp]||{}).short || "")}</div>
      </div>`).join("")}</div>`
      : emptyBox("找不到你的名字",
          "可能已經被人認領走了（也許你之前用另一個 LINE 帳號登入過），或名冊上就沒有你。找班代或幹部處理。")}`;
}
async function doClaim(id, name){
  if(!confirm(`確定你是「${name}」嗎？\n\n選錯了自己改不回來，要找幹部解除綁定。`)) return;
  const r = await authApi("claim", { claim_ticket: CLAIM.ticket, member_id: id });
  if(r.error){ alert(r.error); return; }
  setToken(r.token);
  ME = r.me;
  CLAIM = null;
  await reload();
  paintMe();
  alert("綁定完成。接下來可以到「我的 → 編輯我的資料」補上你的介紹。");
  go("me");
}

/* ── 資料讀寫 ────────────────────────────────────────────────────
   ⚠️ 欄位清單要跟 schema.sql 對得起來。PostgREST 是逐欄授權，
      select 裡有一欄沒授權，回的是 400，【整個查詢】掛掉，
      不是那一欄變空 —— 所以加欄位時前後端要一起改。            */
const SB = {
  async members(){
    // ⚠️ confirmed = 本人確認過資料才會是 true。名冊靠它顯示「尚未填寫」。
    const rows = await rest("v_members?select=id,cohort,sort,name,grp,officer,status,claimed,confirmed&order=sort.asc");
    // grp → group：前端一路都叫 group，這裡轉一次就好，
    // 不要讓 render 那邊到處判斷兩種名字。
    return rows.map(r => ({ ...r, group: r.grp }));
  },
  async posts(){
    return rest("posts?select=id,kind,title,body,important,published,event_at,time_text,place," +
      "speaker,speaker_title,org,fee,capacity,reserved_seats,signup_open,waitlist_open," +
      "deadline,link,required,done_count,author_id,created_at&order=created_at.desc");
  },
  async needs(){
    return rest("needs?select=id,author_id,title,body,done,helpers,created_at&order=created_at.desc");
  },
  async albums(){
    const rows = await rest("albums?select=id,title,taken_on,cover&order=taken_on.desc");
    return rows.map(a => ({ ...a, date: a.taken_on || "", count: 0 }));
  },
  async seats(){
    const rows = await rest("v_post_seats?select=post_id,capacity,reserved_seats,taken,waiting");
    return Object.fromEntries(rows.map(r => [r.post_id, r]));
  },
  /* ⚠️ 以下三項都需要「你是誰」，一律走 auth 這支 Edge Function。
        不能打 PostgREST —— 它解不開我們發的 token（見 sbHeaders 的說明）。 */
  async mySignups(){
    if(!tokenOf()) return new Map();
    const r = await authApi("my_signups");
    return new Map((r.signups || []).map(x => [x.post_id, x]));
  },
  async signup(postId, on){
    const r = await authApi(on ? "signup" : "unsignup", { post_id: postId });
    if(r.error) throw new Error(r.error);
    return { ok: true };
  },
  // 所有人的個人資料，已經由資料庫按可見範圍遮好才吐出來
  async profiles(){
    const r = await authApi("profiles");
    if(r.error) throw new Error(r.error);
    return Object.fromEntries((r.profiles || []).map(x => [x.member_id, x.data || {}]));
  },
  /* 存自己的資料。
     ⛔ 只送欄位內容，【不送 member_id】—— 身分由 Edge Function
        從 token 取，前端說了不算。這樣就算有人改前端也改不到別人。 */
  async saveProfile(fields, vis){
    if(!ME) throw new Error("請先登入");
    const r = await authApi("save_profile",
      { fields: Object.assign({}, fields, { vis }) });
    if(r.error) throw new Error(r.error);
    return r;
  }
};
