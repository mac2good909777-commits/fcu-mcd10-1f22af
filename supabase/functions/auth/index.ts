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
//
// 需要的環境變數（Supabase → Edge Functions → Secrets）：
//   LINE_CHANNEL_ID       LINE Login channel 的 Channel ID
//   LINE_CHANNEL_SECRET   同一個 channel 的 Channel secret
//   SUPABASE_URL          （Supabase 會自動注入）
//   SUPABASE_SERVICE_ROLE_KEY（Supabase 會自動注入）
//   JWT_SECRET            Supabase → Settings → API → JWT Secret
//
// ⛔ CHANNEL_SECRET 與 SERVICE_ROLE_KEY 只能放在這裡（伺服器端）。
//    這兩個放進前端等於把整個資料庫交出去。
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const LINE_ID     = Deno.env.get("LINE_CHANNEL_ID")!;
const LINE_SECRET = Deno.env.get("LINE_CHANNEL_SECRET")!;
const JWT_SECRET  = Deno.env.get("JWT_SECRET")!;

// service_role 會繞過 RLS —— 這支 function 需要它才能寫 line_user_id。
// ⛔ 用它做的每一次查詢都要自己檢查身分，RLS 幫不了你。
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  // ⚠️ 前端如果多送了任何標頭，這裡沒列出來，瀏覽器的預檢就會失敗，
  //    症狀是「Failed to fetch」而且 curl 測不出來（curl 不做預檢）。
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// JWT 簽章金鑰。PostgREST 用同一把驗，所以 claims 才會進 request.jwt.claims。
async function key() {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// ⚠️ role 一定要是 "authenticated"：PostgREST 是看這個決定用哪組權限的。
//    漏掉的話所有查詢都會以 anon 身分執行，登入等於沒登入。
async function mintToken(m: { id: number; cohort: number; officer: string }) {
  return await create(
    { alg: "HS256", typ: "JWT" },
    {
      role: "authenticated",
      sub: String(m.id),
      member_id: String(m.id),      // ⚠️ 存成字串：JSON 的數字經過 jsonb 轉型會出事
      cohort: String(m.cohort),
      officer: m.officer ?? "",
      exp: getNumericDate(60 * 60 * 24 * 30),   // 30 天，在職專班不會天天登入
    },
    await key(),
  );
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
      if (!prof.userId) return json({ error: "拿不到 LINE 身分" }, 400);

      // 3. 這個 LINE 帳號綁過名冊上的誰嗎
      const { data: bound } = await admin
        .from("members")
        .select("id, cohort, name, officer, grp")
        .eq("line_user_id", prof.userId)
        .maybeSingle();

      if (bound) {
        return json({
          ok: true,
          token: await mintToken(bound),
          me: bound,
          line_name: prof.displayName,
        });
      }

      // 4. 還沒綁定 → 回一張「還沒被認領」的名單讓他挑自己是誰。
      //    ⛔ 只回姓名與組別，不回公司職稱 —— 這時候他還沒通過任何驗證。
      const { data: open } = await admin
        .from("members")
        .select("id, name, grp, sort")
        .is("line_user_id", null)
        .order("sort");

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

      // ⚠️ 這裡的 is null 是關鍵：兩個人同時認領同一個名字，
      //    第二個人會因為條件不成立而拿到 0 筆，不會蓋掉第一個人。
      const { data: taken, error } = await admin
        .from("members")
        .update({ line_user_id: t.line_user_id, claimed_at: new Date().toISOString() })
        .eq("id", member_id)
        .is("line_user_id", null)
        .select("id, cohort, name, officer, grp")
        .maybeSingle();

      if (error) return json({ error: error.message }, 400);
      if (!taken) return json({ error: "這個名字已經被別人認領了，請找幹部處理" }, 409);

      // 認領完順手建一列空的個人資料，之後直接 update 就好
      await admin.from("profiles").upsert({ member_id: taken.id }, { onConflict: "member_id" });

      return json({ ok: true, token: await mintToken(taken), me: taken });
    }

    // ── 重新整理後恢復登入 ────────────────────────────────────────
    if (action === "whoami") {
      const c = await readToken(req);
      if (!c) return json({ ok: false });
      const { data: m } = await admin
        .from("members")
        .select("id, cohort, name, officer, grp")
        .eq("id", Number(c.member_id))
        .maybeSingle();
      if (!m) return json({ ok: false });
      // ⚠️ 重新簽一次：幹部換人時，舊 token 裡的 officer 還是舊的。
      return json({ ok: true, token: await mintToken(m), me: m });
    }

    // ── 幹部：解除某人的綁定（綁錯人時用）────────────────────────
    if (action === "unbind") {
      const c = await readToken(req);
      if (!c || !c.officer) return json({ error: "只有幹部可以做這件事" }, 403);
      const { error } = await admin
        .from("members")
        .update({ line_user_id: null, claimed_at: null })
        .eq("id", Number(body.member_id));
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "不認得的動作" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
