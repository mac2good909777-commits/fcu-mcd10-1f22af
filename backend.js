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
   ⚠️ apikey 永遠是 anon key；Authorization 有登入才換成自己的 token。
      兩個都要給 —— 只給 Authorization 會被當成沒帶 apikey 而擋掉。 */
function sbHeaders(extra){
  const t = tokenOf();
  return Object.assign({
    apikey: CONFIG.SUPABASE_ANON_KEY,
    Authorization: "Bearer " + (t || CONFIG.SUPABASE_ANON_KEY)
  }, extra || {});
}

async function rest(path, init){
  const r = await fetch(CONFIG.SUPABASE_URL + "/rest/v1/" + path,
    Object.assign({ headers: sbHeaders(init && init.body ? {"Content-Type":"application/json"} : null) }, init));
  if(!r.ok){
    const msg = await r.text();
    // 401 幾乎都是 token 過期。清掉重登比留著一個壞 token 讓每個動作都失敗好。
    if(r.status === 401 && tokenOf()){ setToken(""); }
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
   ⚠️ state 一定要驗：不驗的話別人可以用一段偽造的網址讓你登入他的帳號
      （CSRF）。存 sessionStorage，用完就丟。                        */
function lineLogin(){
  const state = crypto.randomUUID();
  try{ sessionStorage.setItem("fcu10_state", state); }catch(e){}
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

  let saved = "";
  try{ saved = sessionStorage.getItem("fcu10_state") || ""; }catch(e){}
  try{ sessionStorage.removeItem("fcu10_state"); }catch(e){}
  // 網址清乾淨：不然使用者重新整理會拿一個已經用掉的 code 再打一次
  history.replaceState({}, "", CONFIG.REDIRECT);

  if(!state || state !== saved){
    alert("登入驗證失敗，請重新登入一次。");
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
    const rows = await rest("v_members?select=id,cohort,sort,name,grp,officer,status,claimed&order=sort.asc");
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
  async mySignups(){
    if(!tokenOf()) return new Map();
    const rows = await rest("signups?select=post_id,status,note");
    return new Map(rows.map(r => [r.post_id, r]));
  },
  async signup(postId, on){
    if(on) await rpc("join_event", { p_post_id: postId });
    else   await rpc("leave_event", { p_post_id: postId });
    return { ok: true };
  },
  // 所有人的個人資料，已經由資料庫按可見範圍遮好
  async profiles(){
    const rows = await rpc("visible_profiles");
    return Object.fromEntries(rows.map(r => [r.member_id, r.data || {}]));
  },
  /* 存自己的資料。RLS 保證只能改自己那一列。
     ⛔ 一定要 return=representation 並檢查回傳筆數。
        RLS 擋下來時 PATCH 是「成功但影響 0 列」——
        不檢查的話畫面會顯示「已儲存」，其實什麼都沒寫進去。
        這種沉默失敗最難查。 */
  async saveProfile(fields, vis){
    if(!ME) throw new Error("請先登入");
    const body = Object.assign({}, fields, { vis, updated_at: new Date().toISOString() });
    const rows = await rest("profiles?member_id=eq." + ME.id, {
      method: "PATCH",
      headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify(body)
    });
    if(!Array.isArray(rows) || rows.length === 0){
      throw new Error("資料庫沒有寫進任何一列 —— 通常是登入身分沒被資料庫認可。" +
                      "請登出再登入一次；若還是這樣，把這句話告訴我。");
    }
    return rows[0];
  },
  /* 診斷：資料庫「認為」我是誰。
     前端說已登入、資料庫卻認不出來 —— 這是最容易卡住的一種狀況，
     所以要有辦法直接問。 */
  async dbWhoAmI(){
    const rows = await rest("profiles?select=member_id&limit=1");
    return { canReadOwnProfile: Array.isArray(rows) ? rows.length : "?" };
  }
};
