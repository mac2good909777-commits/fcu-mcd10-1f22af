/* ────────────────────────────────────────────────────────────────
   連線設定 —— 這是唯一要你手動填的檔案

   三個值都填好之後，網站會自動從「版型模式」切成「正式模式」：
   名冊改讀資料庫、LINE 登入會動、同學改的資料真的存得起來。
   沒填完就維持版型模式（讀 data.js / private.js），畫面照常。

   怎麼拿這三個值，看 supabase/SETUP.md。

   ⛔ 這支檔案會被公開讀取，所以【只能放公開金鑰】：
        · SUPABASE_ANON_KEY（publishable / anon）—— 設計上就是要放前端的，
          它能做什麼完全由資料庫的 RLS 決定，不是靠藏起來
        · LINE Channel ID —— 公開資訊
      ⛔ 絕對不要放進來的：
        · service_role key      → 繞過所有 RLS，等於把整個資料庫交出去
        · LINE Channel Secret   → 別人可以冒用你的登入
      那兩個只放在 Supabase 的 Edge Function Secrets 裡。
   ──────────────────────────────────────────────────────────────── */

const CONFIG = {
  // Supabase → Settings → Data API → Project URL
  SUPABASE_URL: "https://tjmfhypsigobhgjpkxpp.supabase.co",   // ← 已填（專案 fcu-mcd10，東京節點）

  // Supabase → Settings → API Keys →「Publishable key」那一列的複製鈕
  // 長得像 sb_publishable_xxxxxxxxxxxx
  SUPABASE_ANON_KEY: "sb_publishable_oS5qe_Nie6Ry7QAyqB7jhQ_I4hiMRtN",

  // LINE Developers → 你的 Login channel → Basic settings → Channel ID
  LINE_CHANNEL_ID: "2011322765"
};

// 三個都填了才算接上；少一個就退回版型模式，不會半死不活。
CONFIG.ready = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && CONFIG.LINE_CHANNEL_ID);

// LINE 登入完成後要導回哪裡。
// ⚠️ 這一串必須跟 LINE Developers 後台的 Callback URL【一字不差】，
//    差一個斜線就會被 LINE 拒絕。所以用程式算，不要手打。
CONFIG.REDIRECT = location.origin + location.pathname;
