/* ══════════════════════════════════════════════════════════════════
   forms.js　—　資源交流／活動公告／相簿的「寫入」介面

   在這之前這三塊都只有畫面，按下去只會跳「版型階段」提示。

   一支共用的表單彈窗做完三件事，不各寫一套：
   欄位不同但流程完全一樣（填 → 送 → 重讀 → 回原頁），
   分開寫會變成三份幾乎相同、但錯誤處理各壞各的程式碼。

   ⛔ 權限【不能】只靠這裡的按鈕顯不顯示 ——
      真正的把關在 patch-06 的 SQL 函式裡（幹部才能發布、
      只能改自己提的需求）。前端藏按鈕只是為了畫面乾淨。
   ══════════════════════════════════════════════════════════════════ */

let FORM_SUBMIT = null;

/* fields：[{ k, label, type, hint, value, options, required }]
   type：text／textarea／date／datetime／number／check／select        */
function openForm(title, fields, onSubmit, opts){
  opts = opts || {};
  FORM_SUBMIT = onSubmit;
  el("formtitle").textContent = title;
  el("formbody").innerHTML = fields.map(f => {
    const id = "ff_" + f.k, v = f.value == null ? "" : String(f.value);
    let input;
    if(f.type === "textarea")
      input = `<textarea id="${id}" rows="${f.rows || 5}" placeholder="${escAttr(f.ph || "")}">${esc(v)}</textarea>`;
    else if(f.type === "check")
      input = `<label class="fcheck"><input type="checkbox" id="${id}"${f.value ? " checked" : ""}>
                 <span>${esc(f.checkLabel || "")}</span></label>`;
    else if(f.type === "select")
      input = `<select id="${id}">${f.options.map(([ov, ol]) =>
                 `<option value="${escAttr(ov)}"${ov === v ? " selected" : ""}>${esc(ol)}</option>`).join("")}</select>`;
    else
      input = `<input id="${id}" type="${f.type === "datetime" ? "datetime-local" : (f.type || "text")}"
                 value="${escAttr(v)}" placeholder="${escAttr(f.ph || "")}">`;
    return `<div class="ffield">
      ${f.label ? `<label for="${id}">${esc(f.label)}${f.required ? ` <span class="freq">必填</span>` : ""}</label>` : ""}
      ${input}
      ${f.hint ? `<div class="hint">${f.hint}</div>` : ""}
    </div>`;
  }).join("");
  el("formerr").style.display = "none";
  el("formsave").textContent = opts.submitLabel || "儲存";
  el("formdel").style.display = opts.onDelete ? "" : "none";
  FORM_DELETE = opts.onDelete || null;
  el("formbody").dataset.keys = JSON.stringify(fields.map(f => [f.k, f.type || "text", !!f.required, f.label || f.k]));
  el("formwrap").classList.add("on");
  setTimeout(() => { const first = el("formbody").querySelector("input,textarea,select"); if(first) first.focus(); }, 30);
}
let FORM_DELETE = null;
function closeForm(){ el("formwrap").classList.remove("on"); FORM_SUBMIT = null; FORM_DELETE = null; }

function formValues(){
  const out = {}, missing = [];
  JSON.parse(el("formbody").dataset.keys).forEach(([k, type, req, label]) => {
    const i = el("ff_" + k); if(!i) return;
    let v = type === "check" ? i.checked : (i.value || "").trim();
    if(type === "number") v = v === "" ? null : Number(v);
    if(req && (v === "" || v == null)) missing.push(label);
    out[k] = v;
  });
  return { out, missing };
}

function submitForm(){
  const { out, missing } = formValues();
  if(missing.length) return formError("還有沒填的：" + missing.join("、"));
  const btn = el("formsave");
  btn.disabled = true; btn.textContent = "送出中…";
  Promise.resolve(FORM_SUBMIT(out)).then(async () => {
    closeForm();
    await reload();
  }).catch(e => {
    /* ⛔ 不要吞掉錯誤然後把視窗關掉 —— 之前登入就是這樣壞的，
          使用者以為存好了，其實什麼都沒發生。 */
    formError(e.message || String(e));
  }).finally(() => { btn.disabled = false; btn.textContent = "儲存"; });
}
function formError(msg){
  const b = el("formerr"); b.textContent = "⚠️ " + msg; b.style.display = "";
}
function formDelete(){
  if(!FORM_DELETE) return;
  if(!confirm("刪掉之後救不回來，確定？")) return;
  Promise.resolve(FORM_DELETE()).then(async () => { closeForm(); await reload(); })
    .catch(e => formError(e.message || String(e)));
}

/* ── 資源交流 ────────────────────────────────────────────────── */
function needForm(id){
  const n = id ? NEEDS.find(x => x.id === id) : null;
  openForm(n ? "編輯需求" : "我要提一個需求", [
    { k:"title", label:"需求", required:true, value:n?.title || "",
      ph:"例如：找台中北屯的土地代書、想找人一起跑都更案場" },
    { k:"body", label:"說明", type:"textarea", value:n?.body || "",
      ph:"時間、預算、地點、希望對方具備什麼 —— 寫得越具體越容易被接住。" },
    { k:"visibility", label:"誰看得到", type:"select",
      value: n?.visibility || "class",
      options:[["class","只有登入的同學"],["public","公開，任何人都看得到"]],
      hint:"預設是班內限定。選公開就會出現在沒登入的訪客眼前，也可能被搜尋引擎收走。" },
  ], vals => db.saveNeed({ id: id || null, title: vals.title, body: vals.body,
                           visibility: vals.visibility }),
    { onDelete: id ? () => db.deleteNeed(id).then(() => go("needs")) : null });
}
function toggleNeed(id, done){
  db.closeNeed(id, done, []).then(reload)
    .catch(e => alert("改不了：" + e.message));
}

/* ── 公告 / 問卷 / 活動 ──────────────────────────────────────── */
function postForm(kind, id){
  const p = id ? POSTS.find(x => x.id === id) : null;
  const isEvent = kind === "event";
  const base = [
    { k:"title", label:"標題", required:true, value:p?.title || "" },
    { k:"body", label:"內容", type:"textarea", rows:6, value:p?.body || "" },
  ];
  const eventFields = [
    { k:"event_at", label:"日期時間", type:"datetime", required:true,
      value: p?.event_at ? String(p.event_at).slice(0, 16) : "" },
    { k:"place", label:"地點", value:p?.place || "", ph:"例如：紀念館 301 教室" },
    { k:"speaker", label:"講者／主辦", value:p?.speaker || "" },
    { k:"fee", label:"費用", value:p?.fee || "", ph:"例如：每人 600 元、免費" },
    { k:"capacity", label:"人數上限", type:"number", value:p?.capacity ?? "",
      hint:"留白就是不限人數。填了才會顯示剩餘名額。" },
    { k:"signup_open", label:"", type:"check", value: p ? p.signup_open : true,
      checkLabel:"開放線上報名" },
    { k:"deadline", label:"報名截止", type:"date", value:p?.deadline || "" },
  ];
  const tail = [
    { k:"link", label:"相關連結", value:p?.link || "",
      ph:"https://…", hint:"報名表單、地圖、活動頁都可以。" },
    { k:"important", label:"", type:"check", value:!!p?.important, checkLabel:"標為重要（首頁置頂）" },
    { k:"visibility", label:"誰看得到", type:"select",
      value: p?.visibility || "class",
      options:[["class","只有登入的同學"],["public","公開，任何人都看得到"]],
      hint:"預設是班內限定。選公開就會出現在沒登入的訪客眼前，也可能被搜尋引擎收走。" },
  ];
  openForm(p ? "編輯" : (isEvent ? "發布活動" : "發布公告"),
    isEvent ? [...base, ...eventFields, ...tail] : [...base, ...tail],
    vals => db.savePost(Object.assign({ id: id || null, kind }, vals)),
    { onDelete: id ? () => db.deletePost(id).then(() => go(isEvent ? "events" : "board")) : null });
}

/* ── 相簿：掛 Google 相簿連結，不自己存照片 ──────────────────── */
function albumForm(id){
  const a = id ? ALBUMS.find(x => x.id === id) : null;
  openForm(a ? "編輯相簿" : "新增相簿", [
    { k:"title", label:"名稱", required:true, value:a?.title || "",
      ph:"例如：115-1 開學聚餐" },
    { k:"taken_on", label:"日期", type:"date", value:a?.date || "" },
    { k:"link", label:"Google 相簿連結", required:true, value:a?.link || "",
      ph:"https://photos.app.goo.gl/…",
      hint:`在 Google 相簿開好共享相簿 → 分享 → <b>建立連結</b>，把網址貼進來。<br>
            ⚠️ 記得把「<b>允許共同編輯者新增相片</b>」打開，同學才能自己丟照片上來。` },
    { k:"cover", label:"封面圖網址", value:a?.cover || "",
      hint:"可以留白，留白就顯示一個色塊。" },
    { k:"note", label:"備註", value:a?.note || "" },
    { k:"visibility", label:"誰看得到", type:"select",
      value: a?.visibility || "class",
      options:[["class","只有登入的同學"],["public","公開，任何人都看得到"]],
      hint:"預設是班內限定。選公開就會出現在沒登入的訪客眼前，也可能被搜尋引擎收走。" },
  ], vals => db.saveAlbum(Object.assign({ id: id || null }, vals)),
    { onDelete: id ? () => db.deleteAlbum(id) : null });
}
