# 正式版開通手冊

程式全部寫好了。你要做的只有**開兩個帳號、貼三個值、上傳一支程式**。
全部免費方案就夠用（50 個人的班級遠低於任何額度）。

照順序做，大約 30–40 分鐘。**每一步結尾都有「怎麼確認做對了」**。

---

## 為什麼要做這一步

現在線上那版：登入是假的、同學改的資料只留在自己手機、公司職稱其實全世界可讀。

做完這一份之後：

| | 現在 | 做完之後 |
|---|---|---|
| 登入 | 假的，誰都能選任何身分 | LINE 登入，綁定名冊身分 |
| 同學改資料 | 只存在自己那台手機 | 存進資料庫，大家都看得到 |
| 「登入後可見」 | 前端遮蔽，開發者工具可繞過 | **資料庫根本不吐**，繞不過 |
| 報名 | 假的 | 真的，含名額與候補，不會超賣 |

---

## 第 1 步　開 Supabase 專案

1. 到 <https://supabase.com> → **Start your project** → 用 Google 登入
   （建議用 `mac2good909777@gmail.com`，跟其他服務同一個帳號）
2. **New project**
   - Name：`fcu-mcd10`
   - Database Password：**按產生鈕，然後存進你的密碼管理員**
     （這組密碼日常用不到，但忘了就救不回資料庫）
   - Region：**Northeast Asia (Tokyo)** ← 選這個，台灣連過去最快
3. 按 Create，等 2–3 分鐘跑完

✅ **確認**：左上角出現專案名稱，左側選單有 Table Editor / SQL Editor。

---

## 第 2 步　建表

1. 左側 **SQL Editor** → **New query**
2. 把 `supabase/schema.sql` **整份**貼進去 → **Run**
3. 再開一個 New query，把 `supabase/seed.sql` **整份**貼進去 → **Run**

✅ **確認**：左側 **Table Editor** → `members` 應該有 **50 列**，
`profiles` 也有 50 列，`cohorts` 有 1 列。

> 這兩份都可以重複執行。之後名冊有異動，改完 `data.js` 我重新產一份
> `seed.sql` 再跑一次就好 —— **同學自己改過的欄位不會被蓋掉**
> （seed 的最後一段用 `coalesce` 只補空欄位）。

---

## 第 3 步　開 LINE Login Channel

1. 到 <https://developers.line.biz/console/> → 用你的 LINE 登入
2. 沒有 Provider 就先 **Create a new provider**，名稱填 `逢甲建碩十屆`
3. 進去後 **Create a new channel** → 選 **LINE Login**
   - Channel name：`逢甲建碩十屆同學看板`
   - Channel description：隨便寫
   - App types：**勾 Web app**
   - 類別：教育／其他
4. 建好後進 **LINE Login** 分頁 → **Callback URL** 填這一行（**一字不差**）：

   ```
   https://mac2good909777-commits.github.io/fcu-mcd10-1f22af/
   ```

   > ⚠️ **結尾的斜線不能少**。少一個字元 LINE 就會拒絕登入，
   > 而且錯誤訊息不會告訴你是這個原因。
   >
   > 本機測試也要用的話，再加一行 `http://localhost:8811/`。

5. 回 **Basic settings** 分頁，記下兩個值：
   - **Channel ID**（一串數字）→ 等一下填進 `config.js`
   - **Channel secret**（按 Show）→ ⛔ **只放進 Supabase，不要進 config.js**

✅ **確認**：Basic settings 看得到 Channel ID；LINE Login 分頁的
Callback URL 已存檔。

---

## 第 4 步　部署 auth 這支 Edge Function

這是整套唯一的後端程式，負責「LINE 登入 → 換發通行證」。

### 先設 4 個密鑰

Supabase → 左側 **Edge Functions** → **Secrets** → 逐一新增：

| Name | Value 從哪來 |
|---|---|
| `LINE_CHANNEL_ID` | 第 3 步的 Channel ID |
| `LINE_CHANNEL_SECRET` | 第 3 步的 Channel secret |
| `JWT_SECRET` | Supabase → Settings → **API** → **JWT Settings** → JWT Secret |

> `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` **不用自己填**，
> Supabase 會自動注入。

### 再部署程式

**做法 A：網頁介面（不用裝東西，推薦）**

Edge Functions → **Create a new function** → 名稱填 `auth` →
把 `supabase/functions/auth/index.ts` 整份貼進編輯器 → **Deploy**

**做法 B：指令列**

```bash
npm i -g supabase
supabase login
cd "C:/Users/dell/Documents/Claude-DT/projects/20260829-逢甲建碩第10屆介紹頁"
supabase functions deploy auth --project-ref <你的專案ref>
```

（專案 ref 是網址 `https://xxxx.supabase.co` 中間那串 `xxxx`）

✅ **確認**：Edge Functions 清單裡 `auth` 顯示 **Active**。

---

## 第 5 步　填 config.js

打開專案根目錄的 `config.js`，把三個值填進去：

```js
const CONFIG = {
  SUPABASE_URL:      "https://xxxxxxxx.supabase.co",   // Settings → Data API → Project URL
  SUPABASE_ANON_KEY: "eyJhbGci....",                   // Settings → API Keys → anon / publishable
  LINE_CHANNEL_ID:   "2011xxxxxx"                      // 第 3 步的 Channel ID
};
```

⛔ **只能放這三個**。`service_role` key 與 LINE Channel secret **絕對不能**
放進來 —— 這支檔案是公開的，放進去等於把整個資料庫和登入權交出去。
那兩個只存在第 4 步的 Secrets 裡。

填完存檔，跟我說一聲，我推上 GitHub Pages。

✅ **確認**：網頁最下面的版本號後面的「版型模式」三個字**消失**了，
就代表已經接上資料庫。

---

## 第 6 步　你自己先登入一次

1. 開網站 → 右上角「登入」→ 跳到 LINE → 同意
2. 第一次會出現 **「你是哪一位？」**，找到「張現傑」點下去
3. 綁定完成，右上角變成你的名字

✅ **確認**：Supabase → Table Editor → `members` → 第 23 列的
`line_user_id` 有值了。

4. 進「我的 → 編輯我的資料」隨便改一個字 → 儲存 →
   到 `profiles` 表看第 23 列，改的東西真的進去了。

---

## 第 7 步　驗證權限真的有效

**這一步不要跳過。** 這是整套系統的重點，要親眼確認一次。

1. 開一個**無痕視窗**（不會帶登入狀態）
2. 打開網站 → 同學名冊 → 應該**只看得到姓名**
3. 網址列直接輸入：

   ```
   https://<你的專案>.supabase.co/rest/v1/members?select=*&apikey=<anon key>
   ```

   ✅ **應該回一個權限錯誤**，不是 50 筆資料。
   （如果回了資料，代表 RLS 沒生效 —— 立刻告訴我，先不要發給同學。）

4. 再試：

   ```
   https://<你的專案>.supabase.co/rest/v1/rpc/visible_profiles?apikey=<anon key>
   ```

   ✅ 會回 50 筆，但每一筆的 `data` **只有那位同學設成公開的欄位**，
   沒設公開的（預設全部）應該是空的 `{}`。

---

## 第 8 步　收尾

三件事，做完才算真的上線：

1. **刪掉 `private.js`**
   資料已經在資料庫了，這支檔案留著就是一個公開的個資副本。
   說一聲我從 repo 移除並改掉 `index.html` 的引用。

2. **把 `資料/` 那份 xlsx 收好**
   已經在 `.gitignore` 裡，不會上傳。原始名冊有學號，不要外流。

3. **通知同學**
   建議的說法：
   > 班級看板上線了：<網址>
   > 用 LINE 登入 → 第一次要點自己的名字認領身分 →
   > 進「我的 → 編輯我的資料」補上介紹。
   > **每一欄都可以自己選給誰看**，預設只有本班同學看得到。

---

## 出事的時候

| 症狀 | 原因與處理 |
|---|---|
| 按登入跳到 LINE 說「400 Bad Request」 | Callback URL 沒對上。回第 3 步核對，**注意結尾斜線** |
| 登入回來一片空白 | Edge Function 沒部署或 Secrets 沒設。看 Supabase → Edge Functions → Logs |
| 名冊空的、頁尾顯示紅字「讀取失敗」 | `config.js` 的 URL 或 anon key 打錯 |
| 存資料說「讀取失敗 401」 | token 過期（30 天）。登出再登入一次 |
| 有人認領錯身分 | 幹部用 `auth` 的 `unbind` 解除綁定，那個名字就會回到可認領清單 |
| 改了東西同學說沒看到 | 先看頁尾版本時間對不對得上；對得上就是他要重新整理 |

## 費用

Supabase 免費方案：500MB 資料庫、1GB 儲存、每月 50,000 個登入使用者。
50 個人的班級用不到 1%。**七天沒有任何連線會自動休眠**，
下一次有人開網站會自己醒來（第一次載入慢幾秒）。

LINE Login 免費。
