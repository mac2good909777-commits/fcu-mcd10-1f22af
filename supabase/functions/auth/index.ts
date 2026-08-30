// ═══════════════════════════════════════════════════════════════════
// LINE 登入 → 換發 Supabase 格式的 JWT
//
// 這是整套系統【唯一】的 Edge Function。之後所有讀寫都直接走 PostgREST，
// 權限由資料庫的 RLS 保證 —— 不需要每個動作再寫一支 function。
//
// 三個動作：
//   login    前端把 LINE 回傳的 code 送來 → 換 LINE 身分 → 發 token
//   claim    第一次登入時，從名冊挑自己是誰 → 綁定
//   whoami   用 token 換回自己的身分（重新整理後恢復登入狀態）
//   ping     診斷用：回報環境變數在不在、資料庫通不通（不吐任何機密）
//   profiles     依「誰在看」吐出遮蔽過的個人資料
//   save_profile 存自己的資料
//   signups      我報名了哪幾場 / 報名 / 取消
//   save_need / close_need / delete_need     資源交流（本人）
//   save_post / delete_post                  公告問卷活動（幹部）
//   save_album / delete_album                相簿（幹部）
//   feed         登入後的完整內容（含班內限定）
//
// ⛔ 為什麼這些也放進來，而不是讓前端直接打 PostgREST：
//    這個專案的 JWT 簽章金鑰是 ECC(P-256)，我們手上只有 legacy 的
//    HS256 共用密鑰 —— PostgREST 解不開我們發的 token，會回
//    PGRST301「None of the keys was able to decode the JWT」。
//    所以前端對 PostgREST 一律只用 publishable key 讀公開資料，
//    凡是需要「你是誰」的操作都繞到這裡，由這支 function 驗身分。
//
// 需要的環境變數（Supabase → Edge Functions → Secrets）：
//   LINE_CHANNEL_ID       LINE Login channel 的 Channel ID
//   LINE_CHANNEL_SECRET   同一個 channel 的 Channel secret
//   JWT_SECRET            Settings → JWT Keys → Legacy JWT Secret
//   SUPABASE_URL          （Supabase 自動注入）
//
// ⛔ CHANNEL_SECRET 與 JWT_SECRET 只能放在這裡（伺服器端）。
//    放進前端等於把整個資料庫與登入權交出去。
//
// ⚠️ 這一版【不用 supabase-js，也不依賴 SUPABASE_SERVICE_ROLE_KEY】。
//    專案遷到新版 API 金鑰（sb_publishable_/sb_secret_）之後，
//    那個舊環境變數不保證還在，缺了會在第一次查資料庫時 500，
//    而且錯誤訊息完全看不出原因。
//    我們手上已經有 JWT_SECRET，直接自己簽一張 role=service_role 的
//    token 打 PostgREST 就好 —— 少一個相依、少一次冷啟動載入。
// ═══════════════════════════════════════════════════════════════════

import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const LINE_ID     = Deno.env.get("LINE_CHANNEL_ID") ?? "";
const LINE_SECRET = Deno.env.get("LINE_CHANNEL_SECRET") ?? "";
const JWT_SECRET  = Deno.env.get("JWT_SECRET") ?? "";
const SB_URL      = Deno.env.get("SUPABASE_URL") ?? "";

/* apikey 標頭要的是【真的 Supabase 金鑰】，不能塞自簽的 JWT。
   舊版 anon/service_role key 本身就是 JWT，所以以前那樣寫剛好會動；
   專案換成新版金鑰（sb_publishable_/sb_secret_）之後，
   閘道會拿 apikey 去比對金鑰清單 → 自簽的一律 Invalid API key。
   ⚠️ 不同世代的專案注入的變數名稱不一樣，所以這裡列一串候選逐一找。 */
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
                 ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const API_KEY = SERVICE_KEY
             || Deno.env.get("SUPABASE_ANON_KEY")
             || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
             || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  // ⚠️ 前端多送任何一個標頭而這裡沒列，瀏覽器預檢就會失敗，
  //    症狀是 Failed to fetch —— 而且 curl 測不出來（curl 不做預檢）。
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// JWT 簽章金鑰。PostgREST 用同一把驗，所以 claims 才進得了 request.jwt.claims。
async function key() {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// ⚠️ role 一定要是 "authenticated"：PostgREST 靠這個決定用哪組權限。
//    漏掉的話所有查詢都以 anon 身分執行，登入等於沒登入。
async function mintToken(m: { id: number; cohort: number; officer: string }) {
  return await create(
    { alg: "HS256", typ: "JWT" },
    {
      role: "authenticated",
      sub: String(m.id),
      member_id: String(m.id),      // ⚠️ 存字串：數字經過 jsonb 轉型會出事
      cohort: String(m.cohort),
      officer: m.officer ?? "",
      exp: getNumericDate(60 * 60 * 24 * 30),   // 30 天，在職專班不會天天登入
    },
    await key(),
  );
}

/* 以 service_role 身分打 PostgREST。
   ⛔ service_role 會【繞過所有 RLS】。用它做的每一次查詢，
      條件都要自己寫對 —— RLS 這時候幫不了你。
   ⚠️ 短效（60 秒）：這張 token 不外流，也沒必要活久。 */
async function svcToken() {
  return await create(
    { alg: "HS256", typ: "JWT" },
    { role: "service_role", exp: getNumericDate(60) },
    await key(),
  );
}
async function db(path: string, init: RequestInit = {}) {
  // apikey 用真的金鑰讓閘道放行；
  // Authorization 決定「用什麼角色執行」——
  // 有 service key 就直接用它，沒有就用自簽的 service_role JWT。
  if (!API_KEY) throw new Error("找不到任何 Supabase API key（見 ping 診斷）");
  const bearer = SERVICE_KEY || await svcToken();
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: API_KEY,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`資料庫 ${r.status}：${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function readToken(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!t) return null;
  try {
    return await verify(t, await key()) as Record<string, string>;
  } catch {
    return null;                     // 過期或被改過，一律當作沒登入
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* 空的就空的 */ }
  const action = body.action ?? "";

  try {
    // ── 診斷 ──────────────────────────────────────────────────────
    // ⛔ 只回「有沒有設」與「通不通」，絕不回金鑰內容。
    if (action === "ping") {
      let dbOK = "";
      try {
        const rows = await db("members?select=id&limit=1");
        dbOK = `ok(${Array.isArray(rows) ? rows.length : "?"})`;
      } catch (e) { dbOK = String(e).slice(0, 200); }
      return json({
        ok: true,
        env: {
          LINE_CHANNEL_ID: LINE_ID ? "set" : "MISSING",
          LINE_CHANNEL_SECRET: LINE_SECRET ? "set" : "MISSING",
          JWT_SECRET: JWT_SECRET ? `set(${JWT_SECRET.length})` : "MISSING",
          SUPABASE_URL: SB_URL ? "set" : "MISSING",
          SERVICE_KEY: SERVICE_KEY ? "set" : "MISSING",
          API_KEY: API_KEY ? "set" : "MISSING",
          mode: SERVICE_KEY ? "service key" : "自簽 service_role JWT",
        },
        db: dbOK,
      });
    }

    // ── 登入 ──────────────────────────────────────────────────────
    if (action === "login") {
      const { code, redirect_uri } = body;
      if (!code || !redirect_uri) return json({ error: "缺少 code" }, 400);

      // 1. 拿 LINE 的 access token
      const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri,
          client_id: LINE_ID,
          client_secret: LINE_SECRET,
        }),
      });
      const tok = await tokenRes.json();
      if (!tok.access_token) return json({ error: "LINE 驗證失敗", detail: tok }, 400);

      // 2. 拿 LINE 的使用者資料
      const profRes = await fetch("https://api.line.me/v2/profile", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      const prof = await profRes.json();
      if (!prof.userId) return json({ error: "拿不到 LINE 身分", detail: prof }, 400);

      // 3. 這個 LINE 帳號綁過名冊上的誰嗎
      const boundRows = await db(
        `members?select=id,cohort,name,officer,grp&line_user_id=eq.${encodeURIComponent(prof.userId)}`,
      );
      const bound = boundRows?.[0];
      if (bound) {
        return json({
          ok: true,
          token: await mintToken(bound),
          me: bound,
          line_name: prof.displayName,
        });
      }

      // 4. 還沒綁定 → 回「還沒被認領」的名單讓他挑自己是誰。
      //    ⛔ 只回姓名與組別，不回公司職稱 —— 這時候他還沒通過任何驗證。
      const open = await db("members?select=id,name,grp,sort&line_user_id=is.null&order=sort.asc");

      // claim_ticket 是短效憑證，證明「這個人剛通過 LINE 驗證」。
      // ⛔ 不能讓前端自己送 line_user_id 來認領 ——
      //    那等於任何人都可以宣稱自己是任何一個 LINE 帳號。
      const ticket = await create(
        { alg: "HS256", typ: "JWT" },
        { purpose: "claim", line_user_id: prof.userId, exp: getNumericDate(600) },
        await key(),
      );
      return json({
        ok: true,
        need_claim: true,
        claim_ticket: ticket,
        line_name: prof.displayName,
        candidates: open ?? [],
      });
    }

    // ── 認領身分 ──────────────────────────────────────────────────
    if (action === "claim") {
      const { claim_ticket, member_id } = body;
      let t: Record<string, string>;
      try {
        t = await verify(claim_ticket, await key()) as Record<string, string>;
      } catch {
        return json({ error: "認領逾時，請重新登入" }, 401);
      }
      if (t.purpose !== "claim") return json({ error: "憑證不對" }, 401);

      // ⚠️ 網址條件裡的 line_user_id=is.null 是關鍵：
      //    兩個人同時認領同一個名字，第二個會因為條件不成立而拿到 0 筆，
      //    不會蓋掉第一個人。
      const taken = await db(
        `members?id=eq.${Number(member_id)}&line_user_id=is.null`,
        {
          method: "PATCH",
          body: JSON.stringify({
            line_user_id: t.line_user_id,
            claimed_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=representation" },
        },
      );
      const me = taken?.[0];
      if (!me) return json({ error: "這個名字已經被別人認領了，請找幹部處理" }, 409);

      // 認領完順手建一列空的個人資料，之後直接 update 就好
      await db("profiles?on_conflict=member_id", {
        method: "POST",
        body: JSON.stringify({ member_id: me.id }),
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      });

      return json({ ok: true, token: await mintToken(me), me });
    }

    // ── 重新整理後恢復登入 ────────────────────────────────────────
    if (action === "whoami") {
      const c = await readToken(req);
      if (!c) return json({ ok: false });
      const rows = await db(
        `members?select=id,cohort,name,officer,grp&id=eq.${Number(c.member_id)}`,
      );
      const m = rows?.[0];
      if (!m) return json({ ok: false });
      // ⚠️ 重新簽一次：幹部換人時，舊 token 裡的 officer 還是舊的。
      return json({ ok: true, token: await mintToken(m), me: m });
    }

    // ── 幹部：解除某人的綁定（綁錯人時用）────────────────────────
    if (action === "unbind") {
      const c = await readToken(req);
      if (!c || !c.officer) return json({ error: "只有幹部可以做這件事" }, 403);
      await db(`members?id=eq.${Number(body.member_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ line_user_id: null, claimed_at: null }),
        headers: { Prefer: "return=minimal" },
      });
      return json({ ok: true });
    }

    // ── 以下都需要身分 ───────────────────────────────────────────
    const c = await readToken(req);
    const meId = c ? Number(c.member_id) : null;
    const meCohort = c ? Number(c.cohort) : null;

    // 個人資料：由資料庫按可見範圍遮好才吐出來
    if (action === "profiles") {
      const rows = await db(
        `rpc/visible_profiles`,
        {
          method: "POST",
          body: JSON.stringify({ p_viewer: meId, p_cohort: meCohort }),
        },
      );
      return json({ ok: true, profiles: rows ?? [] });
    }

    // 存自己的資料。⛔ 只認 token 裡的身分，不接受前端指定 member_id。
    if (action === "save_profile") {
      if (!meId) return json({ error: "請先登入" }, 401);
      const fields = body.fields as unknown as Record<string, unknown> ?? {};
      // ⛔ 白名單：只讓改得動這些欄位。
      //    不擋的話，前端送 member_id 之類的東西就能改到別的地方。
      const ALLOW = ["nickname",
                     "company","title","company2","title2","company3","title3",
                     "industry","tag","headline","intro",
                     "resource","wish","topics","edu_bg","web","line_url",
                     "q_why","q_thesis","q_team",
                     // ⚠️ 這三個資料庫早就有欄位，但一直沒放進白名單，
                     //    所以前端就算送上來也被丟掉。mask_profile 會把它們
                     //    強制限制在 class 以內，不必也不能靠這裡把關。
                     "phone","email","line_id",
                     "vis"];
      // ⚠️ confirmed_at 是「本人確認過」的印記。
      //    沒有它，名冊帶進來的公司職稱不會對其他同學顯示 ——
      //    那些是同學填給學校的，不是同意公開在班級看板上的。
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { updated_at: now, confirmed_at: now };
      for (const k of ALLOW) if (k in fields) patch[k] = fields[k];

      const rows = await db(`profiles?member_id=eq.${meId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
        headers: { Prefer: "return=representation" },
      });
      if (!rows?.length) {
        // 認領時應該已經建過列了，但保險起見補一次
        await db("profiles", {
          method: "POST",
          body: JSON.stringify({ member_id: meId, ...patch }),
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        });
      }
      return json({ ok: true });
    }

    // 我報名了哪幾場
    if (action === "my_signups") {
      if (!meId) return json({ ok: true, signups: [] });
      const rows = await db(`signups?select=post_id,status,note&member_id=eq.${meId}`);
      return json({ ok: true, signups: rows ?? [] });
    }

    // 報名／取消。名額與候補的判斷在資料庫函式裡，避免兩人同時報名超賣。
    if (action === "signup" || action === "unsignup") {
      if (!meId) return json({ error: "請先登入" }, 401);
      const fn = action === "signup" ? "join_event_as" : "leave_event_as";
      await db(`rpc/${fn}`, {
        method: "POST",
        body: JSON.stringify({ p_member: meId, p_post_id: Number(body.post_id) }),
      });
      return json({ ok: true });
    }

    // ── 登入後的完整內容 ────────────────────────────────────────
    // ⚠️ 為什麼讀取也要繞這裡：前端一律用 anon key 打 PostgREST
    //    （本專案 JWT 簽章金鑰是 ECC，PostgREST 解不開我們簽的 token），
    //    所以資料庫看不出誰登入了。RLS 只放行 visibility='public'，
    //    班內限定的內容必須由這支函式驗完身分後用 service key 取。
    if (action === "feed") {
      if (!meId) return json({ error: "請先登入" }, 401);
      const [posts, needs, albums] = await Promise.all([
        db("posts?select=*&published=is.true&order=created_at.desc"),
        db("needs?select=*&order=created_at.desc"),
        db("albums?select=*&order=taken_on.desc"),
      ]);
      return json({ ok: true, posts, needs, albums });
    }

    // ── 資源交流 ─────────────────────────────────────────────────
    if (action === "save_need") {
      if (!meId) return json({ error: "請先登入" }, 401);
      const r = await db("rpc/save_need_as", {
        method: "POST",
        body: JSON.stringify({
          p_member: meId, p_id: body.id ? Number(body.id) : null,
          p_title: String(body.title ?? "").slice(0, 200),
          p_body: String(body.body ?? "").slice(0, 5000),
          p_visibility: body.visibility === "public" ? "public" : "class",
        }),
      });
      return json({ ok: true, id: r });
    }
    if (action === "close_need") {
      if (!meId) return json({ error: "請先登入" }, 401);
      await db("rpc/close_need_as", {
        method: "POST",
        body: JSON.stringify({
          p_member: meId, p_id: Number(body.id),
          p_done: body.done !== false,
          p_helpers: Array.isArray(body.helpers) ? body.helpers.map(Number) : [],
        }),
      });
      return json({ ok: true });
    }
    if (action === "delete_need") {
      if (!meId) return json({ error: "請先登入" }, 401);
      await db("rpc/delete_need_as", {
        method: "POST",
        body: JSON.stringify({ p_member: meId, p_id: Number(body.id) }),
      });
      return json({ ok: true });
    }

    // ── 公告 / 問卷 / 活動（幹部）─────────────────────────────────
    if (action === "save_post") {
      if (!meId) return json({ error: "請先登入" }, 401);
      const r = await db("rpc/save_post_as", {
        method: "POST",
        body: JSON.stringify({ p_member: meId, p_data: body.data ?? {} }),
      });
      return json({ ok: true, id: r });
    }
    if (action === "delete_post") {
      if (!meId) return json({ error: "請先登入" }, 401);
      await db("rpc/delete_post_as", {
        method: "POST",
        body: JSON.stringify({ p_member: meId, p_id: Number(body.id) }),
      });
      return json({ ok: true });
    }

    // ── 相簿（幹部）──────────────────────────────────────────────
    if (action === "save_album") {
      if (!meId) return json({ error: "請先登入" }, 401);
      const r = await db("rpc/save_album_as", {
        method: "POST",
        body: JSON.stringify({ p_member: meId, p_data: body.data ?? {} }),
      });
      return json({ ok: true, id: r });
    }
    if (action === "delete_album") {
      if (!meId) return json({ error: "請先登入" }, 401);
      await db("rpc/delete_album_as", {
        method: "POST",
        body: JSON.stringify({ p_member: meId, p_id: Number(body.id) }),
      });
      return json({ ok: true });
    }

    return json({ error: "不認得的動作" }, 400);
  } catch (e) {
    // ⚠️ 把真正的錯誤講出來。之前只回一句「伺服器錯誤」，
    //    結果查了一輪才知道是哪一段掛掉。
    console.error(e);
    return json({ error: "伺服器出錯", detail: String(e).slice(0, 300) }, 500);
  }
});
