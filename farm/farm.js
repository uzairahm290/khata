(() => {
  "use strict";

  const KINDS = { bakri: { one: "بکری", many: "بکریاں" }, bakra: { one: "بکرا", many: "بکرے" }, bheer: { one: "بھیڑ", many: "بھیڑیں" }, bacha: { one: "بچہ", many: "بچے" } };
  const CATS = { chara: "سبز چارہ", bhoosa: "بھوسہ", wanda: "ونڈا / دانہ", dawai: "دوائی", doctor: "ڈاکٹر", mazdoori: "مزدوری", deegar: "دیگر" };
  const STATUS = { active: "موجود", sold: "بیچ دیا", dead: "مر گیا" };
  const MONTHS = ["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون", "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"];

  const cfg = window.KHATA_CONFIG;
  const sb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage },
  });
  const hasSavedLogin = () => { try { return Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")); } catch { return false; } };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const todayStr = () => ymd(new Date());
  const rs = (n) => "Rs " + Math.round(n).toLocaleString("en-PK");
  const money = (n) => `<span class="num">${rs(n)}</span>`;
  const urduDate = (s) => { const [y, m, d] = s.split("-").map(Number); return `<span class="num">${d}</span> ${MONTHS[m - 1]} <span class="num">${y}</span>`; };

  let animals = [], expenses = [], editId = null;
  let view = { y: new Date().getFullYear(), m: new Date().getMonth() };

  let tt;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), 2400); }

  // ---------- theme ----------
  $("#themeBtn").addEventListener("click", () => {
    const root = document.documentElement;
    const cur = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("khata-theme", next); } catch {}
  });

  // ---------- tabs ----------
  $$("nav.tabs button").forEach((b) => b.addEventListener("click", () => {
    $$("nav.tabs button").forEach((x) => x.setAttribute("aria-selected", x === b));
    ["dash", "exp", "ani"].forEach((k) => ($("#p-" + k).hidden = k !== b.dataset.tab));
  }));

  // ---------- static bits ----------
  $("#eCats").innerHTML = Object.entries(CATS).map(([k, v], i) => `<label><input type="radio" name="ecat" id="ecat-${k}" value="${k}" ${i === 0 ? "checked" : ""}><span>${v}</span></label>`).join("");
  $("#aKinds").innerHTML = Object.entries(KINDS).map(([k, v], i) => `<label><input type="radio" name="akind" id="akind-${k}" value="${k}" ${i === 0 ? "checked" : ""}><span>${v.one}</span></label>`).join("");
  function resetDates() { $("#eDate").value = todayStr(); $("#aDate").value = todayStr(); $("#todayLbl").innerHTML = "آج: " + urduDate(todayStr()); }

  // ---------- calculations ----------
  const activeAnimals = () => animals.filter((a) => a.status === "active");
  const monthKey = (y, m) => y + "-" + pad(m + 1);
  const monthExp = (y, m) => { const k = monthKey(y, m); return expenses.filter((e) => e.date.startsWith(k)); };
  const sum = (a) => a.reduce((s, e) => s + e.amount, 0);
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  function perAnimalFor(list) {
    const act = activeAnimals();
    const shared = sum(list.filter((e) => !e.animalId));
    const share = act.length ? shared / act.length : 0;
    const direct = {};
    list.filter((e) => e.animalId).forEach((e) => (direct[e.animalId] = (direct[e.animalId] || 0) + e.amount));
    return animals.filter((a) => a.status === "active" || direct[a.id])
      .map((a) => { const d = direct[a.id] || 0, s = a.status === "active" ? share : 0; return { a, d, s, t: d + s }; })
      .sort((x, y) => y.t - x.t);
  }

  // ---------- render ----------
  function tally(n) { if (!n) return ""; let s = ""; const c = Math.min(n, 30); for (let i = 1; i <= c; i++) s += i % 5 === 0 ? "| " : "|"; return s + (n > 30 ? "…" : ""); }
  function renderHerd() {
    const act = activeAnimals(); const c = { bakri: 0, bakra: 0, bheer: 0, bacha: 0 };
    act.forEach((a) => (c[a.kind] = (c[a.kind] || 0) + 1));
    $("#herd").innerHTML = Object.keys(KINDS).map((k) => `<div><span class="k">${KINDS[k].many}</span><span class="v num">${c[k]}</span><span class="tally">${tally(c[k])}</span></div>`).join("")
      + `<div class="total"><span class="k">کل جانور</span><span class="v num">${act.length}</span><span class="tally"></span></div>`;
  }
  function niceMax(v) { if (v <= 0) return 1000; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function renderDaily(list, y, m) {
    const N = daysIn(y, m); const per = new Array(N).fill(0);
    list.forEach((e) => { const d = Number(e.date.slice(8, 10)); if (d >= 1 && d <= N) per[d - 1] += e.amount; });
    const W = 620, H = 200, L = 14, R = 56, T = 12, B = 28; const max = niceMax(Math.max(...per)); const step = (W - L - R) / N; const bw = Math.max(3, step * 0.62);
    const yv = (v) => T + (H - T - B) * (1 - v / max);
    let g = "";
    [0, 0.5, 1].forEach((f) => { const v = max * f, yy = yv(v); g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1"/><text x="${W - R + 6}" y="${yy + 4}" font-size="11" fill="var(--muted)">${v >= 1000 ? v / 1000 + "k" : v}</text>`; });
    const now = new Date(); const curDay = y === now.getFullYear() && m === now.getMonth() ? now.getDate() : -1;
    let b = "";
    per.forEach((v, i) => {
      const day = i + 1; const cx = W - R - (i + 0.5) * step; // day 1 on the right, like the page reads
      const h = (H - T - B) * (v / max); const col = day === curDay ? "var(--haldi)" : "var(--green)";
      if (v > 0) b += `<rect x="${cx - bw / 2}" y="${H - B - h}" width="${bw}" height="${Math.max(h, 1.5)}" rx="1.5" fill="${col}"><title>${day} ${MONTHS[m]}: ${rs(v)}</title></rect>`;
      if (day === 1 || day % 5 === 0 || day === curDay) b += `<text x="${cx}" y="${H - B + 16}" font-size="11" text-anchor="middle" fill="${day === curDay ? "var(--haldi)" : "var(--muted)"}">${day}</text>`;
    });
    $("#dailyChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:420px;display:block" role="img" aria-label="روزانہ خرچہ">${g}<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--muted)" stroke-width="1"/>${b}</svg>`;
  }
  function renderDash() {
    const { y, m } = view; $("#mTitle").innerHTML = `${MONTHS[m]} <span class="num">${y}</span>`;
    const now = new Date(); const isCur = y === now.getFullYear() && m === now.getMonth();
    $("#mNext").disabled = isCur; $("#mNext").style.opacity = isCur ? 0.35 : 1;
    const list = monthExp(y, m); const total = sum(list);
    const days = isCur ? now.getDate() : daysIn(y, m);
    const today = sum(expenses.filter((e) => e.date === todayStr()));
    const act = activeAnimals().length;
    $("#stats").innerHTML = `
      <div class="stat main"><div class="k">آج کا خرچہ</div><div class="v">${money(today)}</div></div>
      <div class="stat main"><div class="k">اس مہینے کا خرچہ</div><div class="v">${money(total)}</div></div>
      <div class="stat"><div class="k">روزانہ اوسط</div><div class="v">${money(days ? total / days : 0)}</div></div>
      <div class="stat"><div class="k">فی جانور (مہینہ)</div><div class="v">${money(act ? total / act : 0)}</div></div>`;
    renderDaily(list, y, m);

    const bc = {}; list.forEach((e) => (bc[e.cat] = (bc[e.cat] || 0) + e.amount));
    const cats = Object.entries(bc).sort((a, b) => b[1] - a[1]); const cmax = Math.max(1, ...cats.map((c) => c[1]));
    $("#catBars").innerHTML = cats.length
      ? cats.map(([k, v]) => `<div class="barrow"><span class="lbl">${CATS[k] || esc(k)}</span><span class="track"><span class="fill" style="width:${(v / cmax) * 100}%;display:block"></span></span><span class="amt">${money(v)}</span></div>`).join("")
      : `<div class="empty">اس مہینے کوئی خرچہ درج نہیں ہوا۔</div>`;

    const rows = perAnimalFor(list);
    $("#perAnimal").innerHTML = rows.length
      ? `<table class="per"><thead><tr><th>جانور</th><th>اپنا خرچہ</th><th>مشترکہ حصہ</th><th>کل</th></tr></thead><tbody>${rows.map((r) => `<tr><td><span class="pername">${thumb(r.a, "thumb xs")}${esc(r.a.name)}</span><span class="kindchip ${r.a.kind}">${KINDS[r.a.kind]?.one || ""}</span></td><td class="r">${money(r.d)}</td><td class="r">${money(r.s)}</td><td class="r"><b>${money(r.t)}</b></td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">پہلے "جانور" والے حصے میں جانور شامل کریں۔</div>`;

    const ms = []; for (let i = 5; i >= 0; i--) { const d = new Date(y, m - i, 1); ms.push({ y: d.getFullYear(), m: d.getMonth() }); }
    const mv = ms.map((x) => ({ ...x, t: sum(monthExp(x.y, x.m)) })); const mmax = Math.max(1, ...mv.map((x) => x.t));
    $("#monthBars").innerHTML = mv.map((x) => `<div class="barrow"><span class="lbl">${MONTHS[x.m]}</span><span class="track"><span class="fill h" style="width:${(x.t / mmax) * 100}%;display:block"></span></span><span class="amt">${money(x.t)}</span></div>`).join("");
  }
  function renderExpForm() {
    const sel = $("#eAnimal"); const cur = sel.value;
    sel.innerHTML = `<option value="">سب جانور (مشترکہ)</option>` + activeAnimals().map((a) => `<option value="${a.id}">${esc(a.name)} · ${KINDS[a.kind]?.one || ""}</option>`).join("");
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  }
  function renderExpList() {
    const list = expenses.slice(0, 150);
    if (!list.length) { $("#expList").innerHTML = `<div class="empty">ابھی کوئی خرچہ درج نہیں۔ اوپر رقم لکھ کر "محفوظ کریں" دبائیں۔</div>`; return; }
    const groups = {}; list.forEach((e) => (groups[e.date] = groups[e.date] || []).push(e));
    const byId = Object.fromEntries(animals.map((a) => [a.id, a]));
    $("#expList").innerHTML = Object.entries(groups).map(([d, items]) => `<div class="daygroup"><div class="dh"><span>${urduDate(d)}</span><span>${money(sum(items))}</span></div>${items.map((e) => `<div class="item"><div class="what">${CATS[e.cat] || esc(e.cat)}<small>${e.animalId ? esc(byId[e.animalId]?.name || "پرانا جانور") : "سب جانور"}${e.note ? " · " + esc(e.note) : ""}</small></div><div class="amt">${money(e.amount)}</div><button class="ghost danger" type="button" data-del-exp="${e.id}">مٹائیں</button></div>`).join("")}</div>`).join("");
    $$("[data-del-exp]").forEach((b) => armButton(b, () => remove("farm_expense", b.dataset.delExp)));
  }
  function thumb(a, cls = "thumb") {
    const url = a.photoPath && photoUrls[a.photoPath];
    return url
      ? `<button class="${cls}" type="button" data-zoom="${a.id}" aria-label="تصویر بڑی کریں"><img src="${esc(url)}" alt="${esc(a.name)}" loading="lazy"></button>`
      : `<span class="${cls} none ${a.kind}" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M14 22c-4-6-2-12 2-14-1 4 0 7 3 9 3-2 7-3 13-3 7 0 13 2 17 6 4 1 7 4 7 8 0 3-2 5-5 5l-2 13h-5l-1-9c-4 1-9 1-14 0l-1 9h-5l-2-12c-3-1-5-3-6-6-2 0-5-1-6-3 2 0 3-1 5-3Z"/></svg></span>`;
  }
  function renderAniList() {
    if (!animals.length) { $("#aniList").innerHTML = `<div class="empty">کوئی جانور درج نہیں۔ اوپر قسم چن کر نام لکھیں۔</div>`; return; }
    const cost = {}; expenses.filter((e) => e.animalId).forEach((e) => (cost[e.animalId] = (cost[e.animalId] || 0) + e.amount));
    const order = { active: 0, sold: 1, dead: 2 };
    const list = [...animals].sort((a, b) => order[a.status] - order[b.status] || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    $("#aniList").innerHTML = list.map((a) => {
      const price = [
        `خرید: ${a.buyPrice != null ? money(a.buyPrice) : "<em>قیمت نہیں لکھی</em>"}`,
        a.status === "sold" ? `فروخت: ${a.salePrice != null ? money(a.salePrice) : "<em>قیمت نہیں لکھی</em>"}` : "",
        `اپنا خرچہ: ${money(cost[a.id] || 0)}`,
      ].filter(Boolean).join("<i>·</i>");
      const editing = editId === a.id;
      return `<div class="acard ${a.status !== "active" ? "gone" : ""}">
        ${thumb(a)}
        <div class="ainfo">
          <div class="aname">${esc(a.name)}<span class="kindchip ${a.kind}">${KINDS[a.kind]?.one || ""}</span>${a.status !== "active" ? `<span class="statechip">${STATUS[a.status]}</span>` : ""}</div>
          <div class="aprice">${price}</div>
          <small>${a.addedOn ? urduDate(a.addedOn) + " سے" : ""}${a.note ? " · " + esc(a.note) : ""}</small>
        </div>
        <div class="aact">
          <button class="ghost" type="button" data-edit="${a.id}" aria-expanded="${editing}">${editing ? "بند کریں" : "قیمت / تصویر"}</button>
        </div>
        ${editing ? editPanel(a) : ""}
      </div>`;
    }).join("");
    $$("[data-edit]").forEach((b) => b.addEventListener("click", () => { const id = Number(b.dataset.edit); editId = editId === id ? null : id; renderAniList(); }));
    $$("[data-zoom]").forEach((b) => b.addEventListener("click", () => zoom(Number(b.dataset.zoom))));
    if (editId != null) wireEdit();
  }
  function editPanel(a) {
    return `<form class="aedit" id="editForm" autocomplete="off">
      <div class="row">
        <label class="f">خریدنے کی قیمت
          <input class="big" id="edBuy" type="number" inputmode="numeric" min="0" step="1" value="${a.buyPrice ?? ""}" placeholder="0">
        </label>
        <label class="f">حالت
          <select id="edStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${a.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        </label>
      </div>
      <label class="f" id="edSaleWrap" ${a.status === "sold" ? "" : "hidden"}>کتنے کا بیچا
        <input class="big" id="edSale" type="number" inputmode="numeric" min="0" step="1" value="${a.salePrice ?? ""}" placeholder="0">
      </label>
      <div class="f">تصویر
        <div class="edphoto">
          ${thumb(a, "thumb lg")}
          <label class="photo-pick sm" for="edPhoto"><span id="edPhotoTxt">${a.photoPath ? "نئی تصویر لگائیں" : "تصویر لگائیں"}</span></label>
          <input id="edPhoto" class="sr-only" type="file" accept="image/*">
        </div>
      </div>
      <label class="f">نوٹ
        <input id="edNote" type="text" value="${esc(a.note || "")}">
      </label>
      <div class="edbtns">
        <button class="primary" id="edSave" type="submit">محفوظ کریں</button>
        <button class="ghost danger" type="button" id="edDel">جانور مٹائیں</button>
      </div>
    </form>`;
  }
  function wireEdit() {
    const a = animals.find((x) => x.id === editId); if (!a) { editId = null; return; }
    $("#edStatus").addEventListener("change", () => { $("#edSaleWrap").hidden = $("#edStatus").value !== "sold"; if (!$("#edSaleWrap").hidden) $("#edSale").focus(); });
    $("#edPhoto").addEventListener("change", () => { const f = $("#edPhoto").files[0]; $("#edPhotoTxt").textContent = f ? "چنی گئی: محفوظ کریں دبائیں" : "تصویر لگائیں"; });
    armButton($("#edDel"), () => removeAnimal(a));
    $("#editForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = $("#edSave"); btn.disabled = true; btn.textContent = "محفوظ ہو رہا ہے…";
      const status = $("#edStatus").value;
      const patch = {
        buy_price: priceOrNull($("#edBuy").value),
        sale_price: status === "sold" ? priceOrNull($("#edSale").value) : null,
        status, note: $("#edNote").value.trim() || null,
      };
      const file = $("#edPhoto").files[0];
      if (file) {
        const path = await uploadPhoto(a.id, file);
        if (!path) { btn.disabled = false; btn.textContent = "محفوظ کریں"; return; }
        patch.photo_path = path;
      }
      const { error } = await sb.from("farm_animal").update(patch).eq("id", a.id);
      if (error) { toast("محفوظ نہیں ہو سکا"); btn.disabled = false; btn.textContent = "محفوظ کریں"; return; }
      if (file && a.photoPath) sb.storage.from(BUCKET).remove([a.photoPath]);
      editId = null; toast("محفوظ ہو گیا"); await loadAll();
    });
  }
  function renderWorth() {
    const n = (v) => Number(v) || 0;
    const activeBuy = sum(activeAnimals().map((a) => ({ amount: n(a.buyPrice) })));
    const allBuy = sum(animals.map((a) => ({ amount: n(a.buyPrice) })));
    const sold = sum(animals.filter((a) => a.status === "sold").map((a) => ({ amount: n(a.salePrice) })));
    const allExp = sum(expenses);
    const missing = animals.filter((a) => a.buyPrice == null).length;
    $("#worth").innerHTML = `
      <div class="stat"><div class="k">موجود جانوروں کی خرید</div><div class="v">${money(activeBuy)}</div></div>
      <div class="stat"><div class="k">بیچ کر ملا</div><div class="v">${money(sold)}</div></div>
      <div class="stat"><div class="k">شروع سے کل خرچہ</div><div class="v">${money(allExp)}</div></div>
      <div class="stat main"><div class="k">کل لگایا (خرید + خرچہ)</div><div class="v">${money(allBuy + allExp)}</div></div>`
      + (missing ? `<p class="hint" style="grid-column:1/-1">${missing} جانوروں کی قیمت ابھی نہیں لکھی۔ "جانور" والے حصے میں "قیمت / تصویر" دبا کر لکھیں۔</p>` : "");
  }
  function renderAll() { renderHerd(); renderDash(); renderWorth(); renderExpForm(); renderExpList(); renderAniList(); }

  // ---------- photos ----------
  const BUCKET = "farm-photos";
  const photoUrls = {};
  const priceOrNull = (v) => { const x = Number(v); return v === "" || !(x >= 0) ? null : Math.round(x); };
  // shrink phone photos (often 4-8 MB) to ~1200px JPEG before upload
  async function shrink(file) {
    const MAX = 1200;
    let src;
    try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
    const w = src.width, h = src.height, s = Math.min(1, MAX / Math.max(w, h));
    const c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
  }
  async function uploadPhoto(animalId, file) {
    let blob;
    try { blob = await shrink(file); } catch { toast("یہ تصویر کھل نہیں سکی، کوئی اور چنیں"); return null; }
    const path = `${animalId}/${Date.now()}.jpg`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) { toast("تصویر اپ لوڈ نہیں ہو سکی"); return null; }
    return path;
  }
  async function loadPhotoUrls() {
    const need = animals.map((a) => a.photoPath).filter((p) => p && !photoUrls[p]);
    if (!need.length) return;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(need, 60 * 60 * 6);
    if (error || !data) return;
    data.forEach((d) => { if (d.signedUrl) photoUrls[d.path] = d.signedUrl; });
  }
  function zoom(id) {
    const a = animals.find((x) => x.id === id); const url = a && photoUrls[a.photoPath]; if (!url) return;
    $("#lightImg").src = url; $("#lightImg").alt = a.name; $("#lightbox").hidden = false; $("#lightClose").focus();
  }
  const closeZoom = () => { $("#lightbox").hidden = true; $("#lightImg").removeAttribute("src"); };
  $("#lightClose").addEventListener("click", closeZoom);
  $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeZoom(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#lightbox").hidden) closeZoom(); });
  async function removeAnimal(a) {
    const { error } = await sb.from("farm_animal").delete().eq("id", a.id);
    if (error) { toast("مٹایا نہیں جا سکا"); await loadAll(); return; }
    if (a.photoPath) sb.storage.from(BUCKET).remove([a.photoPath]);
    editId = null; toast("مٹا دیا"); await loadAll();
  }
  $("#aPhoto").addEventListener("change", () => {
    const f = $("#aPhoto").files[0], img = $("#aPhotoPrev");
    if (img.src) URL.revokeObjectURL(img.src);
    if (f) { img.src = URL.createObjectURL(f); img.hidden = false; $("#aPhotoTxt").textContent = "تصویر بدلیں"; }
    else { img.hidden = true; img.removeAttribute("src"); $("#aPhotoTxt").textContent = "تصویر لیں یا چنیں"; }
  });

  // two taps to delete, so nothing goes by mistake
  function armButton(btn, action) {
    const orig = btn.textContent; let timer;
    btn.addEventListener("click", () => {
      if (btn.classList.contains("armed")) { clearTimeout(timer); btn.disabled = true; action(); return; }
      btn.classList.add("armed"); btn.textContent = "پکا؟";
      timer = setTimeout(() => { btn.classList.remove("armed"); btn.textContent = orig; }, 3000);
    });
  }

  // ---------- data ----------
  async function loadAll() {
    const [a, e] = await Promise.all([
      sb.from("farm_animal").select("id,name,kind,added_on,status,note,buy_price,sale_price,photo_path").order("id"),
      sb.from("farm_expense").select("id,entry_date,amount,category,animal_id,note,created_at").order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(5000),
    ]);
    if (a.error || e.error) { toast("ڈیٹا نہیں آ سکا، انٹرنیٹ دیکھیں"); return; }
    const numOrNull = (v) => (v == null ? null : Number(v));
    animals = a.data.map((r) => ({ id: r.id, name: r.name, kind: r.kind, addedOn: r.added_on, status: r.status, note: r.note, buyPrice: numOrNull(r.buy_price), salePrice: numOrNull(r.sale_price), photoPath: r.photo_path }));
    expenses = e.data.map((r) => ({ id: r.id, date: r.entry_date, amount: Number(r.amount) || 0, cat: r.category, animalId: r.animal_id, note: r.note }));
    renderAll();
    await loadPhotoUrls();
    renderAniList();
  }
  async function remove(table, id) {
    const { error } = await sb.from(table).delete().eq("id", id);
    if (error) { toast("مٹایا نہیں جا سکا"); await loadAll(); return; }
    toast("مٹا دیا"); await loadAll();
  }

  $("#expForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const amt = Number($("#eAmt").value);
    if (!(amt > 0)) { toast("رقم لکھیں"); $("#eAmt").focus(); return; }
    const btn = $("#eSave"); btn.disabled = true;
    const animalId = $("#eAnimal").value;
    const { error } = await sb.from("farm_expense").insert({
      amount: Math.round(amt), entry_date: $("#eDate").value || todayStr(),
      category: document.querySelector("input[name=ecat]:checked").value,
      animal_id: animalId ? Number(animalId) : null, note: $("#eNote").value.trim() || null,
    });
    btn.disabled = false;
    if (error) { toast("محفوظ نہیں ہو سکا، دوبارہ کوشش کریں"); return; }
    $("#eAmt").value = ""; $("#eNote").value = ""; toast("خرچہ محفوظ ہو گیا"); $("#eAmt").focus();
    await loadAll();
  });
  $("#aniForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const name = $("#aName").value.trim(); if (!name) { $("#aName").focus(); return; }
    const btn = $("#aSave"); btn.disabled = true;
    const { data, error } = await sb.from("farm_animal").insert({
      name, kind: document.querySelector("input[name=akind]:checked").value,
      added_on: $("#aDate").value || todayStr(), note: $("#aNote").value.trim() || null,
      buy_price: priceOrNull($("#aPrice").value),
    }).select("id").single();
    if (error) { btn.disabled = false; toast("محفوظ نہیں ہو سکا"); return; }
    const file = $("#aPhoto").files[0];
    if (file) {
      btn.textContent = "تصویر جا رہی ہے…";
      const path = await uploadPhoto(data.id, file);
      if (path) await sb.from("farm_animal").update({ photo_path: path }).eq("id", data.id);
    }
    btn.disabled = false; btn.textContent = "جانور شامل کریں";
    $("#aName").value = ""; $("#aNote").value = ""; $("#aPrice").value = ""; $("#aPhoto").value = ""; $("#aPhoto").dispatchEvent(new Event("change"));
    toast("جانور شامل ہو گیا");
    await loadAll();
  });
  $("#mPrev").addEventListener("click", () => { const d = new Date(view.y, view.m - 1, 1); view = { y: d.getFullYear(), m: d.getMonth() }; renderDash(); });
  $("#mNext").addEventListener("click", () => { const d = new Date(view.y, view.m + 1, 1); if (d > new Date()) return; view = { y: d.getFullYear(), m: d.getMonth() }; renderDash(); });

  // ---------- auth (same accounts as the madrassa khata) ----------
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#authEmail").value.trim(), password = $("#authPass").value, m = $("#authMsg");
    if (!email || password.length < 6) { m.className = "msg err"; m.textContent = "ای میل لکھیں اور پاس ورڈ کم از کم 6 حروف کا رکھیں۔"; return; }
    $("#authBtn").disabled = true;
    const res = await sb.auth.signInWithPassword({ email, password });
    $("#authBtn").disabled = false;
    if (res.error) { m.className = "msg err"; m.textContent = /invalid login/i.test(res.error.message) ? "ای میل یا پاس ورڈ غلط ہے۔" : res.error.message; return; }
    m.textContent = ""; boot();
  });
  $$("[data-logout]").forEach((b) => b.addEventListener("click", async () => { await sb.auth.signOut({ scope: "local" }); location.reload(); }));

  let booted = false;
  async function boot() {
    let session = null, err = null;
    try { const r = await sb.auth.getSession(); session = r.data.session; err = r.error; } catch (e) { err = e; }
    if (!session && hasSavedLogin() && (err || !navigator.onLine)) { $("#boot").textContent = "انٹرنیٹ سے رابطہ نہیں ہو رہا۔ انٹرنیٹ آتے ہی کھاتہ کھل جائے گا۔"; return; }
    $("#boot").hidden = true;
    if (!session) { $("#auth").hidden = false; $("#app").hidden = true; return; }
    const mem = await sb.from("members").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (mem.error) { $("#boot").hidden = false; $("#boot").textContent = "انٹرنیٹ سے رابطہ نہیں ہو رہا۔"; return; }
    if (!mem.data) { $("#auth").hidden = true; $("#noAccess").hidden = false; return; }
    $("#auth").hidden = true; $("#noAccess").hidden = true; $("#app").hidden = false;
    if (!booted) { resetDates(); booted = true; }
    await loadAll();
  }
  sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") { $("#app").hidden = true; $("#auth").hidden = false; } });
  window.addEventListener("online", () => { if (!booted) boot(); });
  let lastLoad = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && booted && Date.now() - lastLoad > 60000) { lastLoad = Date.now(); resetDates(); loadAll(); }
  });

  boot();
})();
