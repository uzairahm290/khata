(() => {
  "use strict";

  // ---------- lists ----------
  const FUNDS = ["زکوٰۃ", "صدقہ", "فطرانہ", "عام عطیات", "چرم قربانی", "تعمیرات", "طلبہ فیس", "فدیہ / کفارہ", "دیگر"];
  const EXP_CATS = ["اساتذہ کی تنخواہ", "طلبہ کا کھانا / راشن", "بجلی / گیس / پانی", "کتب و تعلیمی سامان", "تعمیر و مرمت", "کرایہ", "علاج / دوائی", "طلبہ کی ضروریات", "سفر / ٹرانسپورٹ", "دیگر"];
  const MODES = ["نقد", "بینک", "ایزی پیسہ", "جاز کیش", "چیک"];

  const cfg = window.KHATA_CONFIG;
  const sb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage },
  });
  // Is there a saved login in this browser? (key written by supabase-js)
  const hasSavedLogin = () => { try { return Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")); } catch { return false; } };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => Math.round(Number(n) || 0).toLocaleString("en-PK");
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const urDate = (iso) => { try { return new Intl.DateTimeFormat("ur-PK", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T00:00:00")); } catch { return iso; } };
  const monthKey = (iso) => iso.slice(0, 7);
  const monthName = (key) => { try { return new Intl.DateTimeFormat("ur-PK", { month: "short" }).format(new Date(key + "-01T00:00:00")); } catch { return key; } };

  const state = { income: [], expense: [], name: "مدرسہ کا حساب", editInc: null, editExp: null };

  // ---------- toast ----------
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

  // ---------- light / dark ----------
  const darkMQ = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : { matches: false, addEventListener() {} };
  const isDark = () => { const t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : darkMQ.matches; };
  function paintThemeBtn() {
    const d = isDark();
    $("#themeBtn").setAttribute("aria-pressed", String(d));
    $("#themeBtn").title = d ? "روشن انداز" : "تاریک انداز";
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = d ? "#183A30" : "#17302A";
  }
  $("#themeBtn").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("khata-theme", next); } catch {}
    paintThemeBtn();
  });
  darkMQ.addEventListener?.("change", paintThemeBtn);
  paintThemeBtn();

  // ---------- dates in header ----------
  function setDates() {
    const now = new Date();
    try { $("#hijri").textContent = new Intl.DateTimeFormat("ur-PK-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).format(now) + " ھ"; } catch { $("#hijri").textContent = ""; }
    try { $("#greg").textContent = new Intl.DateTimeFormat("ur-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now); } catch {}
  }

  // ---------- selects ----------
  function fill(sel, items, def) { sel.innerHTML = items.map((x) => `<option${x === def ? " selected" : ""}>${esc(x)}</option>`).join(""); }
  function resetIncForm() {
    $("#incForm").reset(); fill($("#incFund"), FUNDS, "عام عطیات"); fill($("#incMode"), MODES, "نقد");
    $("#incDate").value = today(); state.editInc = null;
    $("#incFormTitle").textContent = "نئی آمدنی درج کریں"; $("#incSave").textContent = "محفوظ کریں"; $("#incCancel").hidden = true;
  }
  function resetExpForm() {
    $("#expForm").reset(); fill($("#expCat"), EXP_CATS, EXP_CATS[0]); fill($("#expFund"), FUNDS, "عام عطیات"); fill($("#expMode"), MODES, "نقد");
    $("#expDate").value = today(); state.editExp = null;
    $("#expFormTitle").textContent = "نیا خرچ درج کریں"; $("#expSave").textContent = "محفوظ کریں"; $("#expCancel").hidden = true;
  }

  // ---------- tabs ----------
  const TABS = ["dashboard", "income", "expense", "compare"];
  function showTab(name) {
    if (!TABS.includes(name)) name = "dashboard";
    TABS.forEach((t) => ($("#view-" + t).hidden = t !== name));
    $$(".tab[data-tab]").forEach((b) => (b.dataset.tab === name ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    window.scrollTo({ top: 0 });
  }
  $$(".tab[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

  // ---------- data ----------
  async function loadAll() {
    const [inc, exp, set] = await Promise.all([
      sb.from("income").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false }),
      sb.from("expense").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false }),
      sb.from("settings").select("madrassa_name").eq("id", 1).maybeSingle(),
    ]);
    if (inc.error || exp.error) { toast("ریکارڈ لوڈ نہیں ہوا۔ انٹرنیٹ چیک کر کے صفحہ دوبارہ کھولیں۔"); return; }
    state.income = inc.data || []; state.expense = exp.data || [];
    if (set.data) state.name = set.data.madrassa_name;
    $("#madName").textContent = state.name; document.title = state.name + " · کھاتہ";
    renderAll();
  }

  // ---------- render ----------
  function renderAll() { renderDashboard(); renderIncTable(); renderExpTable(); renderCompare(); renderDonors(); if (!$("#donorBox").hidden && donorOpen) openDonor(donorOpen); }

  function sum(arr) { return arr.reduce((a, r) => a + Number(r.amount), 0); }

  function renderDashboard() {
    const tin = sum(state.income), tout = sum(state.expense), bal = tin - tout;
    $("#kIn").textContent = money(tin); $("#kOut").textContent = money(tout); $("#kBal").textContent = money(bal);
    $(".sum-bal").classList.toggle("neg", bal < 0);

    const mk = monthKey(today());
    const mIn = sum(state.income.filter((r) => monthKey(r.entry_date) === mk));
    const mOut = sum(state.expense.filter((r) => monthKey(r.entry_date) === mk));
    $("#monthLine").textContent = `اس مہینے: ${money(mIn)} روپے جمع، ${money(mOut)} روپے خرچ۔ تمام رقمیں روپے میں ہیں۔`;

    // fund table
    const funds = new Map(FUNDS.map((f) => [f, { in: 0, out: 0 }]));
    state.income.forEach((r) => { if (!funds.has(r.fund)) funds.set(r.fund, { in: 0, out: 0 }); funds.get(r.fund).in += Number(r.amount); });
    state.expense.forEach((r) => { if (!funds.has(r.fund)) funds.set(r.fund, { in: 0, out: 0 }); funds.get(r.fund).out += Number(r.amount); });
    const rows = [...funds].filter(([, v]) => v.in || v.out);
    const tb = $("#fundTable tbody");
    if (!rows.length) tb.innerHTML = `<tr><td colspan="4" class="empty">ابھی کوئی اندراج نہیں۔ «آمدنی» میں جا کر پہلی رقم درج کریں۔</td></tr>`;
    else tb.innerHTML = rows.map(([f, v]) => {
      const b = v.in - v.out;
      return `<tr><td>${esc(f)} ${b < 0 ? '<span class="chip chip-warn">جمع سے زیادہ خرچ</span>' : ""}</td><td class="amt pos">${money(v.in)}</td><td class="amt neg">${money(v.out)}</td><td class="amt ${b < 0 ? "neg" : ""}">${money(b)}</td></tr>`;
    }).join("");

    renderChart();

    // category bars
    const cats = new Map();
    state.expense.forEach((r) => cats.set(r.category, (cats.get(r.category) || 0) + Number(r.amount)));
    const catArr = [...cats].sort((a, b) => b[1] - a[1]);
    const max = catArr[0]?.[1] || 1;
    $("#catBars").innerHTML = catArr.length
      ? catArr.map(([c, v]) => `<div class="catbar"><span>${esc(c)}</span><div class="catbar-track"><div class="catbar-fill" style="width:${Math.max(2, (v / max) * 100)}%"></div></div><span class="num">${money(v)}</span></div>`).join("")
      : `<p class="empty">ابھی کوئی خرچ درج نہیں ہوا۔</p>`;

    // recent
    const recent = [
      ...state.income.map((r) => ({ t: "in", d: r.entry_date, c: r.created_at, a: r.amount, title: r.donor_name, sub: r.fund })),
      ...state.expense.map((r) => ({ t: "out", d: r.entry_date, c: r.created_at, a: r.amount, title: r.category, sub: r.detail || r.fund })),
    ].sort((a, b) => (b.c || "").localeCompare(a.c || "")).slice(0, 8);
    $("#recent").innerHTML = recent.length
      ? recent.map((r) => `<li class="${r.t}"><span class="bar"></span><div>${esc(r.title)}<small>${esc(r.sub)} · ${esc(urDate(r.d))}</small></div><span class="num ${r.t === "in" ? "pos" : "neg"}">${r.t === "in" ? "+" : "−"}${money(r.a)}</span></li>`).join("")
      : `<li class="empty" style="display:block">کوئی اندراج نہیں۔</li>`;
  }

  function renderChart() {
    const months = [];
    const d = new Date(); d.setDate(1);
    for (let i = 5; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`); }
    const data = months.map((m) => ({ m, i: sum(state.income.filter((r) => monthKey(r.entry_date) === m)), o: sum(state.expense.filter((r) => monthKey(r.entry_date) === m)) }));
    const max = Math.max(1, ...data.flatMap((x) => [x.i, x.o]));
    const step = niceStep(max / 4); const top = Math.ceil(max / step) * step;
    const W = 520, H = 230, L = 56, R = 10, T = 12, B = 34, ph = H - T - B, pw = W - L - R, gw = pw / 6, bw = Math.min(26, gw * 0.3);
    const y = (v) => T + ph - (v / top) * ph;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="چھ مہینے کی آمدنی اور خرچ">`;
    for (let v = 0; v <= top + 0.001; v += step) {
      s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)" stroke-width="1"/>`;
      s += `<text x="${L - 6}" y="${y(v) + 4}" font-size="11" text-anchor="end" direction="ltr">${shortNum(v)}</text>`;
    }
    // newest month at the left edge reading RTL: oldest on the right
    data.forEach((x, k) => {
      const cx = W - R - gw * (k + 0.5);
      s += `<rect x="${cx + 2}" y="${y(x.i)}" width="${bw}" height="${T + ph - y(x.i)}" fill="var(--lapis)"><title>${money(x.i)}</title></rect>`;
      s += `<rect x="${cx - bw - 2}" y="${y(x.o)}" width="${bw}" height="${T + ph - y(x.o)}" fill="var(--madder)"><title>${money(x.o)}</title></rect>`;
      s += `<text x="${cx}" y="${H - 10}" font-size="13" text-anchor="middle">${esc(monthName(x.m))}</text>`;
    });
    $("#chart").innerHTML = s + "</svg>";
  }
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function shortNum(v) { if (v >= 1e5) return (v / 1e5).toLocaleString("en", { maximumFractionDigits: 1 }) + "L"; if (v >= 1e3) return (v / 1e3).toLocaleString("en", { maximumFractionDigits: 1 }) + "k"; return String(v); }

  function rowActs(kind, id) {
    return `<div class="row-acts">${kind === "inc" ? `<button class="mini" data-print="${id}" type="button">رسید</button>` : ""}<button class="mini" data-edit-${kind}="${id}" type="button">درستی</button><button class="mini danger" data-del-${kind}="${id}" type="button">مٹائیں</button></div>`;
  }

  function renderIncTable() {
    const q = $("#incSearch").value.trim();
    const list = state.income.filter((r) => !q || [r.donor_name, r.fund, r.mode, r.note, r.phone, String(r.receipt_no)].some((x) => (x || "").includes(q)));
    const tb = $("#incTable tbody");
    tb.innerHTML = list.length ? list.map((r) => `<tr class="erow"><td class="no c-no">${r.receipt_no}</td><td class="dt c-dt">${esc(urDate(r.entry_date))}</td><td class="c-name"><button class="link" type="button" data-donor="${esc(donorKey(r.donor_name))}">${esc(r.donor_name)}</button>${r.note ? `<small class="muted c-note">${esc(r.note)}</small>` : ""}</td><td class="c-fund"><span class="chip">${esc(r.fund)}</span></td><td class="c-mode">${esc(r.mode)}</td><td class="amt pos c-amt">${money(r.amount)}</td><td class="c-acts">${rowActs("inc", r.id)}</td></tr>`).join("")
      : `<tr><td colspan="7" class="empty">${q ? "تلاش سے کچھ نہیں ملا۔" : "ابھی کوئی آمدنی درج نہیں۔ اوپر فارم سے پہلی رقم درج کریں۔"}</td></tr>`;
    const tf = $("#incTable tfoot") || $("#incTable").createTFoot();
    tf.innerHTML = list.length ? `<tr><td colspan="5">میزان (${list.length} اندراج)</td><td class="amt pos">${money(sum(list))}</td><td></td></tr>` : "";
  }

  function renderExpTable() {
    const q = $("#expSearch").value.trim();
    const list = state.expense.filter((r) => !q || [r.category, r.detail, r.paid_to, r.fund, r.note, String(r.voucher_no)].some((x) => (x || "").includes(q)));
    const tb = $("#expTable tbody");
    tb.innerHTML = list.length ? list.map((r) => `<tr class="erow"><td class="no c-no">${r.voucher_no}</td><td class="dt c-dt">${esc(urDate(r.entry_date))}</td><td class="c-name">${esc(r.category)}${r.detail ? `<small class="muted c-note">${esc(r.detail)}</small>` : ""}</td><td class="c-mode">${r.paid_to ? esc(r.paid_to) : '<span class="muted">—</span>'}</td><td class="c-fund"><span class="chip">${esc(r.fund)}</span></td><td class="amt neg c-amt">${money(r.amount)}</td><td class="c-acts">${rowActs("exp", r.id)}</td></tr>`).join("")
      : `<tr><td colspan="7" class="empty">${q ? "تلاش سے کچھ نہیں ملا۔" : "ابھی کوئی خرچ درج نہیں۔ اوپر فارم سے پہلا خرچ درج کریں۔"}</td></tr>`;
    const tf = $("#expTable tfoot") || $("#expTable").createTFoot();
    tf.innerHTML = list.length ? `<tr><td colspan="5">میزان (${list.length} اندراج)</td><td class="amt neg">${money(sum(list))}</td><td></td></tr>` : "";
  }
  $("#incSearch").addEventListener("input", renderIncTable);
  $("#expSearch").addEventListener("input", renderExpTable);

  // ---------- donors ----------
  const donorKey = (n) => String(n || "").trim().replace(/\s+/g, " ") || "گمنام";
  const ANON = "گمنام";
  let donorOpen = null;

  function donorGroups() {
    const g = new Map();
    state.income.forEach((r) => {
      const k = donorKey(r.donor_name);
      if (!g.has(k)) g.set(k, { name: k, rows: [], total: 0, last: "", phones: new Set() });
      const d = g.get(k); d.rows.push(r); d.total += Number(r.amount);
      if (r.entry_date > d.last) d.last = r.entry_date;
      if (r.phone) d.phones.add(r.phone);
    });
    return [...g.values()].sort((a, b) => (a.name === ANON) - (b.name === ANON) || b.total - a.total);
  }

  function renderDonors() {
    const q = $("#donorSearch").value.trim();
    const list = donorGroups().filter((d) => !q || d.name.includes(q) || [...d.phones].some((p) => p.includes(q)));
    $("#donorTable tbody").innerHTML = list.length
      ? list.map((d) => `<tr class="erow drow"><td class="c-name"><button class="link" type="button" data-donor="${esc(d.name)}">${esc(d.name)}</button></td><td class="num-c c-count" data-label="عطیات">${d.rows.length}</td><td class="dt c-dt" data-label="آخری بار">${esc(urDate(d.last))}</td><td class="amt pos c-amt">${money(d.total)}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">${q ? "اس نام کا کوئی عطیہ دہندہ نہیں ملا۔" : "ابھی کوئی عطیہ درج نہیں ہوا۔"}</td></tr>`;
  }
  $("#donorSearch").addEventListener("input", renderDonors);

  function openDonor(key) {
    const d = donorGroups().find((x) => x.name === key);
    if (!d) { closeDonor(); return; }
    donorOpen = key;
    $("#donorName").textContent = d.name;
    $("#donorPhone").textContent = d.phones.size ? [...d.phones].join(" · ") : "";
    $("#donorPhone").hidden = !d.phones.size;
    const rows = [...d.rows].sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.id - a.id);
    const first = rows[rows.length - 1].entry_date, yr = today().slice(0, 4);
    const thisYear = sum(rows.filter((r) => r.entry_date.startsWith(yr)));
    $("#donorStats").innerHTML = [
      ["کل عطیات", money(d.total), "pos"], ["اس سال", money(thisYear), ""],
      ["کتنی بار", String(rows.length), ""], ["پہلا عطیہ", urDate(first), "txt"], ["آخری عطیہ", urDate(d.last), "txt"],
    ].map(([l, v, c]) => `<div class="dstat"><span class="sum-label">${l}</span><span class="${c === "txt" ? "dstat-txt" : "sum-val " + c}">${esc(v)}</span></div>`).join("");

    const byFund = new Map(); rows.forEach((r) => byFund.set(r.fund, (byFund.get(r.fund) || 0) + Number(r.amount)));
    const fArr = [...byFund].sort((a, b) => b[1] - a[1]), fMax = fArr[0][1] || 1;
    $("#donorFunds").innerHTML = fArr.map(([f, v]) => `<div class="catbar"><span>${esc(f)}</span><div class="catbar-track"><div class="catbar-fill in" style="width:${Math.max(3, (v / fMax) * 100)}%"></div></div><span class="num">${money(v)}</span></div>`).join("");

    const byYear = new Map(); rows.forEach((r) => { const y = r.entry_date.slice(0, 4); const o = byYear.get(y) || { n: 0, t: 0 }; o.n++; o.t += Number(r.amount); byYear.set(y, o); });
    $("#donorYears tbody").innerHTML = [...byYear].sort((a, b) => b[0].localeCompare(a[0])).map(([y, o]) => `<tr><td class="num-c">${y}</td><td class="num-c">${o.n}</td><td class="amt pos">${money(o.t)}</td></tr>`).join("");

    $("#donorList tbody").innerHTML = rows.map((r) => `<tr class="erow"><td class="no c-no">${r.receipt_no}</td><td class="dt c-dt">${esc(urDate(r.entry_date))}</td><td class="c-fund"><span class="chip">${esc(r.fund)}</span></td><td class="c-mode">${esc(r.mode)}</td><td class="amt pos c-amt">${money(r.amount)}</td><td class="c-acts"><div class="row-acts"><button class="mini" data-print="${r.id}" type="button">رسید</button></div></td></tr>`).join("");
    if ($("#donorBox").hidden) { $("#donorBox").hidden = false; document.body.classList.add("locked"); $("#donorClose").focus(); }
  }
  function closeDonor() { donorOpen = null; $("#donorBox").hidden = true; document.body.classList.remove("locked"); }
  $("#donorClose").addEventListener("click", closeDonor);
  $("#donorBox").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeDonor(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#donorBox").hidden) closeDonor(); });

  // ---------- compare: one month, day by day ----------
  const cmp = { month: monthKey(today()), fund: "", onlyActive: false, open: new Set() };
  const pad = (n) => String(n).padStart(2, "0");
  const shiftMonth = (key, d) => { const [y, m] = key.split("-").map(Number); const x = new Date(y, m - 1 + d, 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; };
  const monthLong = (key) => { try { return new Intl.DateTimeFormat("ur-PK", { month: "long", year: "numeric" }).format(new Date(key + "-01T00:00:00")); } catch { return key; } };
  const dayLabel = (iso) => { try { return new Intl.DateTimeFormat("ur-PK", { day: "numeric", weekday: "short" }).format(new Date(iso + "T00:00:00")); } catch { return iso.slice(8); } };

  function cmpMonths() {
    const all = [...state.income, ...state.expense].map((r) => monthKey(r.entry_date));
    const now = monthKey(today());
    let first = all.length ? all.reduce((a, b) => (a < b ? a : b)) : now;
    let last = all.length ? all.reduce((a, b) => (a > b ? a : b)) : now;
    if (now > last) last = now;
    if (cmp.month < first) first = cmp.month;
    if (cmp.month > last) last = cmp.month;
    const out = []; for (let k = last; k >= first; k = shiftMonth(k, -1)) out.push(k);
    return out;
  }

  function renderCompare() {
    // month + fund selects
    const months = cmpMonths();
    $("#cmpMonth").innerHTML = months.map((k) => `<option value="${k}"${k === cmp.month ? " selected" : ""}>${esc(monthLong(k))}</option>`).join("");
    const funds = [...new Set([...FUNDS, ...state.income.map((r) => r.fund), ...state.expense.map((r) => r.fund)])];
    $("#cmpFund").innerHTML = `<option value="">تمام مدیں</option>` + funds.map((f) => `<option${f === cmp.fund ? " selected" : ""}>${esc(f)}</option>`).join("");
    $("#cmpPrev").disabled = months.indexOf(cmp.month) === months.length - 1;
    $("#cmpNext").disabled = months.indexOf(cmp.month) === 0;

    const byFund = (r) => !cmp.fund || r.fund === cmp.fund;
    const inc = state.income.filter(byFund), exp = state.expense.filter(byFund);
    const start = cmp.month + "-01", [y, m] = cmp.month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const end = `${cmp.month}-${pad(daysInMonth)}`;

    const opening = sum(inc.filter((r) => r.entry_date < start)) - sum(exp.filter((r) => r.entry_date < start));
    const mInc = inc.filter((r) => r.entry_date >= start && r.entry_date <= end);
    const mExp = exp.filter((r) => r.entry_date >= start && r.entry_date <= end);
    const tIn = sum(mInc), tOut = sum(mExp), closing = opening + tIn - tOut;

    $("#cOpen").textContent = money(opening); $("#cIn").textContent = money(tIn); $("#cOut").textContent = money(tOut); $("#cClose").textContent = money(closing);
    $(".cmp-sum .sum-bal").classList.toggle("neg", closing < 0);
    $("#cmpTitle").textContent = `${monthLong(cmp.month)}${cmp.fund ? " · " + cmp.fund : ""}`;

    // show the whole month, but stop at today for the running month
    const t = today(), lastDay = cmp.month === monthKey(t) ? Number(t.slice(8)) : cmp.month > monthKey(t) ? 0 : daysInMonth;
    let runIn = 0, runOut = 0, rows = "";
    for (let d = 1; d <= lastDay; d++) {
      const iso = `${cmp.month}-${pad(d)}`;
      const di = mInc.filter((r) => r.entry_date === iso), de = mExp.filter((r) => r.entry_date === iso);
      const dIn = sum(di), dOut = sum(de);
      runIn += dIn; runOut += dOut;
      const active = di.length || de.length;
      if (cmp.onlyActive && !active) continue;
      const bal = opening + runIn - runOut, isOpen = cmp.open.has(iso);
      rows += `<tr class="cmp-row${active ? " active" : " quiet"}${iso === t ? " today" : ""}"${active ? ` data-day="${iso}" tabindex="0" aria-expanded="${isOpen}"` : ""}>
        <td class="dt">${active ? `<span class="caret">${isOpen ? "▾" : "◂"}</span>` : ""}${esc(dayLabel(iso))}${iso === t ? ' <span class="chip">آج</span>' : ""}</td>
        <td class="amt g-day${dIn ? " pos" : " zero"}" data-label="اس دن آمدنی">${dIn ? money(dIn) : "—"}</td>
        <td class="amt g-day${dOut ? " neg" : " zero"}" data-label="اس دن خرچ">${dOut ? money(dOut) : "—"}</td>
        <td class="amt g-run" data-label="اب تک آمدنی">${money(runIn)}</td>
        <td class="amt g-run" data-label="اب تک خرچ">${money(runOut)}</td>
        <td class="amt g-bal${bal < 0 ? " neg" : ""}" data-label="بقایا">${money(bal)}</td></tr>`;
      if (active && isOpen) {
        const items = [
          ...di.map((r) => `<li class="in"><span><button class="link" type="button" data-donor="${esc(donorKey(r.donor_name))}">${esc(r.donor_name)}</button> <small>${esc(r.fund)} · رسید ${r.receipt_no}</small></span><span class="num pos">+${money(r.amount)}</span></li>`),
          ...de.map((r) => `<li class="out"><span><button class="link" type="button" data-voucher="${r.voucher_no}">${esc(r.category)}</button>${r.detail ? " — " + esc(r.detail) : ""} <small>${esc(r.fund)} · واؤچر ${r.voucher_no}</small></span><span class="num neg">−${money(r.amount)}</span></li>`),
        ].join("");
        rows += `<tr class="cmp-detail"><td colspan="6"><ul>${items}</ul></td></tr>`;
      }
    }
    $("#cmpTable tbody").innerHTML = rows || `<tr><td colspan="6" class="empty">${lastDay === 0 ? "یہ مہینہ ابھی شروع نہیں ہوا۔" : "اس مہینے میں کوئی اندراج نہیں۔"}</td></tr>`;
    $("#cmpTable tfoot").innerHTML = `<tr><td>میزان</td><td class="amt pos" data-label="کل آمدنی">${money(tIn)}</td><td class="amt neg" data-label="کل خرچ">${money(tOut)}</td><td class="amt g-run">${money(tIn)}</td><td class="amt g-run">${money(tOut)}</td><td class="amt${closing < 0 ? " neg" : ""}" data-label="بقایا">${money(closing)}</td></tr>`;
  }

  $("#cmpMonth").addEventListener("change", (e) => { cmp.month = e.target.value; cmp.open.clear(); renderCompare(); });
  $("#cmpFund").addEventListener("change", (e) => { cmp.fund = e.target.value; renderCompare(); });
  $("#cmpOnlyActive").addEventListener("change", (e) => { cmp.onlyActive = e.target.checked; renderCompare(); });
  $("#cmpPrev").addEventListener("click", () => { cmp.month = shiftMonth(cmp.month, -1); cmp.open.clear(); renderCompare(); });
  $("#cmpNext").addEventListener("click", () => { cmp.month = shiftMonth(cmp.month, 1); cmp.open.clear(); renderCompare(); });
  const toggleDay = (tr) => { const d = tr.dataset.day; cmp.open.has(d) ? cmp.open.delete(d) : cmp.open.add(d); renderCompare(); };
  $("#cmpTable").addEventListener("click", (e) => { if (e.target.closest("button")) return; const tr = e.target.closest("tr[data-day]"); if (tr) toggleDay(tr); });
  $("#cmpTable").addEventListener("keydown", (e) => { const tr = e.target.closest("tr[data-day]"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleDay(tr); } });

  // ---------- amounts ----------
  function toLatinDigits(s) { return String(s).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)); }
  function readAmount(v) { const n = Number(toLatinDigits(v).replace(/[,\s،]/g, "")); return Number.isFinite(n) && n > 0 ? n : (parseUrduNumber(v) || 0); }

  function msg(el, text, kind) { el.textContent = text; el.className = "form-msg " + (kind || ""); }

  // ---------- save income ----------
  $("#incForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = $("#incMsg"), amount = readAmount($("#incAmount").value);
    if (!amount) { msg(m, "رقم درج کریں، مثلاً 5000", "err"); $("#incAmount").focus(); return; }
    const row = {
      donor_name: $("#incName").value.trim() || "گمنام", phone: $("#incPhone").value.trim() || null,
      amount, fund: $("#incFund").value, mode: $("#incMode").value, entry_date: $("#incDate").value || today(),
      note: $("#incNote").value.trim() || null,
    };
    $("#incSave").disabled = true;
    const res = state.editInc ? await sb.from("income").update(row).eq("id", state.editInc).select().single() : await sb.from("income").insert(row).select().single();
    $("#incSave").disabled = false;
    if (res.error) { msg(m, "محفوظ نہیں ہوا: " + res.error.message, "err"); return; }
    const was = state.editInc; resetIncForm(); $("#incQuick").value = "";
    msg(m, was ? "تبدیلی محفوظ ہو گئی۔" : `محفوظ ہو گیا۔ رسید نمبر ${res.data.receipt_no}`, "ok");
    await loadAll();
  });
  $("#incCancel").addEventListener("click", () => { resetIncForm(); msg($("#incMsg"), ""); });

  // ---------- save expense ----------
  $("#expForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = $("#expMsg"), amount = readAmount($("#expAmount").value);
    if (!amount) { msg(m, "رقم درج کریں، مثلاً 5000", "err"); $("#expAmount").focus(); return; }
    const row = {
      category: $("#expCat").value, detail: $("#expDetail").value.trim() || null, paid_to: $("#expTo").value.trim() || null,
      amount, fund: $("#expFund").value, mode: $("#expMode").value, entry_date: $("#expDate").value || today(),
      note: $("#expNote").value.trim() || null,
    };
    $("#expSave").disabled = true;
    const res = state.editExp ? await sb.from("expense").update(row).eq("id", state.editExp).select().single() : await sb.from("expense").insert(row).select().single();
    $("#expSave").disabled = false;
    if (res.error) { msg(m, "محفوظ نہیں ہوا: " + res.error.message, "err"); return; }
    const was = state.editExp; resetExpForm(); $("#expQuick").value = "";
    msg(m, was ? "تبدیلی محفوظ ہو گئی۔" : `محفوظ ہو گیا۔ واؤچر نمبر ${res.data.voucher_no}`, "ok");
    await loadAll();
  });
  $("#expCancel").addEventListener("click", () => { resetExpForm(); msg($("#expMsg"), ""); });

  // ---------- row actions (edit / delete / print) ----------
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.editInc) {
      const r = state.income.find((x) => x.id == b.dataset.editInc); if (!r) return;
      resetIncForm(); state.editInc = r.id;
      $("#incName").value = r.donor_name; $("#incPhone").value = r.phone || ""; $("#incAmount").value = Number(r.amount);
      setSel($("#incFund"), r.fund, FUNDS); setSel($("#incMode"), r.mode, MODES); $("#incDate").value = r.entry_date; $("#incNote").value = r.note || "";
      $("#incFormTitle").textContent = `رسید ${r.receipt_no} میں درستی`; $("#incSave").textContent = "تبدیلی محفوظ کریں"; $("#incCancel").hidden = false;
      $("#incForm").scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (b.dataset.editExp) {
      const r = state.expense.find((x) => x.id == b.dataset.editExp); if (!r) return;
      resetExpForm(); state.editExp = r.id;
      setSel($("#expCat"), r.category, EXP_CATS); $("#expDetail").value = r.detail || ""; $("#expTo").value = r.paid_to || ""; $("#expAmount").value = Number(r.amount);
      setSel($("#expFund"), r.fund, FUNDS); setSel($("#expMode"), r.mode, MODES); $("#expDate").value = r.entry_date; $("#expNote").value = r.note || "";
      $("#expFormTitle").textContent = `واؤچر ${r.voucher_no} میں درستی`; $("#expSave").textContent = "تبدیلی محفوظ کریں"; $("#expCancel").hidden = false;
      $("#expForm").scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (b.dataset.delInc || b.dataset.delExp) {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "پکا مٹائیں؟"; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.textContent = "مٹائیں"; } }, 4000); return; }
      const table = b.dataset.delInc ? "income" : "expense", id = b.dataset.delInc || b.dataset.delExp;
      b.disabled = true;
      const { error } = await sb.from(table).delete().eq("id", id);
      if (error) { toast("نہیں مٹا: " + error.message); b.disabled = false; return; }
      toast("اندراج مٹا دیا گیا"); await loadAll();
    } else if (b.dataset.voucher) {
      showTab("expense"); $("#expSearch").value = b.dataset.voucher; renderExpTable();
      setTimeout(() => $("#expTable").scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } else if (b.dataset.donor) {
      openDonor(b.dataset.donor);
    } else if (b.dataset.print) {
      printReceipt(state.income.find((x) => x.id == b.dataset.print));
    } else if (b.hasAttribute("data-logout")) {
      if (!$("#app").hidden && b.dataset.armed !== "1") {
        b.dataset.armed = "1"; b.classList.add("armed"); toast("باہر نکلنے کے لیے دوبارہ دبائیں");
        setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.classList.remove("armed"); } }, 4000); return;
      }
      await sb.auth.signOut({ scope: "local" }); location.reload();
    }
  });
  function setSel(sel, val, list) { if (!list.includes(val)) sel.insertAdjacentHTML("beforeend", `<option>${esc(val)}</option>`); sel.value = val; }

  function printReceipt(r) {
    if (!r) return;
    $("#receipt").innerHTML = `<div class="r-head"><h1>${esc(state.name)}</h1><div>رسید وصولی · نمبر ${r.receipt_no}</div></div>
      <table><tr><td>تاریخ</td><td>${esc(urDate(r.entry_date))}</td></tr><tr><td>نام</td><td>${esc(r.donor_name)}</td></tr>
      <tr><td>مد</td><td>${esc(r.fund)}</td></tr><tr><td>رقم</td><td>${money(r.amount)} روپے</td></tr><tr><td>ذریعہ</td><td>${esc(r.mode)}</td></tr>
      ${r.note ? `<tr><td>نوٹ</td><td>${esc(r.note)}</td></tr>` : ""}</table>
      <p>جزاکم اللہ خیرا۔ اللہ تعالیٰ آپ کے عطیے کو قبول فرمائے۔</p><div class="r-sign"><span>دستخط وصول کنندہ</span><span>مہر مدرسہ</span></div>`;
    window.print();
  }

  // ---------- rename ----------
  $("#renameBtn").addEventListener("click", () => { $("#renameInput").value = state.name; $("#renameBox").hidden = false; $("#renameInput").focus(); });
  $("#renameCancel").addEventListener("click", () => ($("#renameBox").hidden = true));
  $("#renameForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const v = $("#renameInput").value.trim(); if (!v) return;
    const { error } = await sb.from("settings").update({ madrassa_name: v }).eq("id", 1);
    if (error) { toast("نام محفوظ نہیں ہوا"); return; }
    state.name = v; $("#madName").textContent = v; document.title = v + " · کھاتہ"; $("#renameBox").hidden = true; toast("نام محفوظ ہو گیا");
  });

  // ---------- CSV export ----------
  $("#csvBtn").addEventListener("click", () => {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["قسم", "نمبر", "تاریخ", "نام / خرچ", "تفصیل", "مد", "ذریعہ", "رقم", "نوٹ"].map(q).join(",")];
    state.income.forEach((r) => lines.push(["آمدنی", r.receipt_no, r.entry_date, r.donor_name, r.phone, r.fund, r.mode, r.amount, r.note].map(q).join(",")));
    state.expense.forEach((r) => lines.push(["خرچ", r.voucher_no, r.entry_date, r.category, [r.detail, r.paid_to].filter(Boolean).join(" — "), r.fund, r.mode, r.amount, r.note].map(q).join(",")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `madrassa-khata-${today()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  // ================= URDU SPEECH → FIELDS =================
  const NUMW = {
    "ایک": 1, "دو": 2, "تین": 3, "چار": 4, "پانچ": 5, "چھ": 6, "چھے": 6, "سات": 7, "آٹھ": 8, "نو": 9, "دس": 10,
    "گیارہ": 11, "بارہ": 12, "تیرہ": 13, "چودہ": 14, "پندرہ": 15, "سولہ": 16, "سترہ": 17, "اٹھارہ": 18, "انیس": 19, "بیس": 20,
    "اکیس": 21, "بائیس": 22, "تئیس": 23, "چوبیس": 24, "پچیس": 25, "چھبیس": 26, "ستائیس": 27, "اٹھائیس": 28, "انتیس": 29, "تیس": 30,
    "پینتیس": 35, "چالیس": 40, "پینتالیس": 45, "پچاس": 50, "پچپن": 55, "ساٹھ": 60, "پینسٹھ": 65, "ستر": 70, "پچھتر": 75, "اسی": 80, "اسّی": 80, "پچاسی": 85, "نوے": 90, "پچانوے": 95,
    "ڈیڑھ": 1.5, "ڈھائی": 2.5, "آدھا": 0.5, "سوا": 1.25,
  };
  const MULT = { "سو": 100, "ہزار": 1000, "لاکھ": 100000, "کروڑ": 10000000 };

  function parseUrduNumber(text) {
    const toks = toLatinDigits(text).replace(/[،,]/g, "").split(/\s+/).filter(Boolean);
    let best = 0, total = 0, cur = 0, inNum = false;
    const flush = () => { const v = total + cur; if (v > best) best = v; total = 0; cur = 0; inNum = false; };
    for (const raw of toks) {
      const t = raw.replace(/[۔.!?]$/, "");
      if (/^\d+(\.\d+)?$/.test(t)) {
        if (/^03\d{8,9}$/.test(t) || t.length > 9) { flush(); continue; } // phone number, not money
        cur += Number(t); inNum = true;
      } else if (t in NUMW) { cur += NUMW[t]; inNum = true; }
      else if (t in MULT) {
        const m = MULT[t];
        if (m === 100) cur = (cur || 1) * 100;
        else { total += (cur || 1) * m; cur = 0; }
        inNum = true;
      } else if (inNum && /^(اور|روپے|روپیہ|روپئے|rs)$/i.test(t)) { /* keep going */ }
      else if (inNum) flush();
    }
    flush();
    return Math.round(best);
  }

  const FUND_KEYS = [
    [/زکو[ٰۃةت]|زکات/, "زکوٰۃ"], [/فطر/, "فطرانہ"], [/صدق/, "صدقہ"], [/چرم|کھال|قربانی/, "چرم قربانی"],
    [/تعمیر/, "تعمیرات"], [/فیس/, "طلبہ فیس"], [/فدی|کفار/, "فدیہ / کفارہ"], [/عطی|چندہ|ہدیہ/, "عام عطیات"],
  ];
  const CAT_KEYS = [
    [/تنخواہ|مشاہرہ|استاد|اساتذہ|قاری صاحب|مولانا/, "اساتذہ کی تنخواہ"], [/کھانا|راشن|آٹا|سبزی|گوشت|چاول|دال|گھی|دودھ/, "طلبہ کا کھانا / راشن"],
    [/بجلی|گیس|پانی|بل/, "بجلی / گیس / پانی"], [/کتاب|کتب|کاپی|قرآن|قاعدہ|قلم|سٹیشنری/, "کتب و تعلیمی سامان"],
    [/مرمت|تعمیر|سیمنٹ|اینٹ|رنگ|مستری|مزدور/, "تعمیر و مرمت"], [/کرایہ/, "کرایہ"], [/دوا|علاج|ڈاکٹر|ہسپتال/, "علاج / دوائی"],
    [/کپڑ|جوت|بستر|رضائی/, "طلبہ کی ضروریات"], [/سفر|کرایہ گاڑی|پٹرول|ٹرانسپورٹ|رکشہ/, "سفر / ٹرانسپورٹ"],
  ];
  const MODE_KEYS = [[/بینک|بنک|ٹرانسفر|آن لائن/, "بینک"], [/ایزی ?پیسہ|ایزی پیسے/, "ایزی پیسہ"], [/جاز ?کیش/, "جاز کیش"], [/چیک/, "چیک"], [/نقد|کیش/, "نقد"]];

  const pick = (text, keys) => { for (const [re, v] of keys) if (re.test(text)) return v; return null; };
  const phoneIn = (text) => (toLatinDigits(text).replace(/[-\s]/g, "").match(/03\d{9}/) || [null])[0];

  function parseIncome(text) {
    const out = { amount: parseUrduNumber(text), fund: pick(text, FUND_KEYS), mode: pick(text, MODE_KEYS), phone: phoneIn(text) };
    const m = text.match(/^(.+?)\s+(?:نے|کی طرف سے|کی جانب سے)\s/);
    if (m) out.name = m[1].replace(/^(آج|کل)\s+/, "").trim();
    return out;
  }
  function parseExpense(text) {
    const out = { amount: parseUrduNumber(text), category: pick(text, CAT_KEYS), fund: pick(text, FUND_KEYS), mode: pick(text, MODE_KEYS) };
    const m = text.match(/(\S+(?:\s+\S+)?)\s+کو\s/);
    if (m && !/بل|کرایہ/.test(m[1])) out.paidTo = m[1].replace(/^(آج|کل)\s+/, "").trim();
    return out;
  }

  function applyParse(kind) {
    const text = $(`#${kind}Quick`).value.trim(), sm = $(`#${kind}SpeakMsg`);
    if (!text) { sm.textContent = "پہلے کچھ لکھیں یا مائیک دبا کر بولیں۔"; return; }
    const filled = [];
    if (kind === "inc") {
      const p = parseIncome(text);
      if (p.name) { $("#incName").value = p.name; filled.push("نام"); }
      if (p.amount) { $("#incAmount").value = p.amount; filled.push("رقم"); }
      if (p.fund) { $("#incFund").value = p.fund; filled.push("مد"); }
      if (p.mode) { $("#incMode").value = p.mode; filled.push("ذریعہ"); }
      if (p.phone) { $("#incPhone").value = p.phone; filled.push("فون"); }
      if (!$("#incNote").value) $("#incNote").value = text;
    } else {
      const p = parseExpense(text);
      if (p.category) { $("#expCat").value = p.category; filled.push("خرچ کی قسم"); }
      if (p.amount) { $("#expAmount").value = p.amount; filled.push("رقم"); }
      if (p.paidTo) { $("#expTo").value = p.paidTo; filled.push("کس کو"); }
      if (p.fund) { $("#expFund").value = p.fund; filled.push("مد"); }
      if (p.mode) { $("#expMode").value = p.mode; filled.push("ذریعہ"); }
      if (!$("#expDetail").value) $("#expDetail").value = text.slice(0, 120);
    }
    sm.textContent = filled.length ? `بھر دیا: ${filled.join("، ")}۔ ایک نظر دیکھ کر «محفوظ کریں» دبائیں۔` : "رقم سمجھ نہیں آئی، خانے میں خود لکھ دیں۔";
  }
  $$("[data-parse]").forEach((b) => b.addEventListener("click", () => applyParse(b.dataset.parse)));

  // Web Speech API (Chrome on Android / desktop)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, recKind = null;
  $$("[data-mic]").forEach((btn) => btn.addEventListener("click", () => {
    const kind = btn.dataset.mic, sm = $(`#${kind}SpeakMsg`);
    if (!SR) { sm.textContent = "اس براؤزر میں بول کر لکھنا نہیں چلتا۔ Chrome استعمال کریں، یا موبائل کی بورڈ کا مائیک دبا کر خانے میں بولیں۔"; $(`#${kind}Quick`).focus(); return; }
    if (rec) { rec.stop(); return; }
    rec = new SR(); recKind = kind;
    rec.lang = "ur-PK"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    const box = $(`#${kind}Quick`); let finalText = "";
    rec.onstart = () => { btn.classList.add("live"); btn.querySelector("span").textContent = "سن رہا ہے… رکنے کے لیے دبائیں"; sm.textContent = "اب بولیں، مثلاً: «احمد نے دس ہزار زکوٰۃ دی»"; };
    rec.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) { const t = ev.results[i][0].transcript; if (ev.results[i].isFinal) finalText += t + " "; else interim += t; }
      box.value = (finalText + interim).trim();
    };
    rec.onerror = (ev) => { sm.textContent = ev.error === "not-allowed" ? "مائیک کی اجازت نہیں ملی۔ براؤزر کی سیٹنگ میں مائیک کی اجازت دیں۔" : "آواز صاف نہیں آئی، دوبارہ کوشش کریں۔"; };
    rec.onend = () => {
      btn.classList.remove("live"); btn.querySelector("span").textContent = "بول کر لکھوائیں"; rec = null;
      if (box.value.trim()) applyParse(recKind);
    };
    try { rec.start(); } catch { rec = null; }
  }));

  // ================= AUTH =================
  const signUpMode = false; // new accounts are closed in the database; only existing members can log in
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#authEmail").value.trim(), password = $("#authPass").value, m = $("#authMsg");
    if (!email || password.length < 6) { msg(m, "ای میل لکھیں اور پاس ورڈ کم از کم 6 حروف کا رکھیں۔", "err"); return; }
    $("#authBtn").disabled = true;
    const res = signUpMode
      ? await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + "/madrassa/" } })
      : await sb.auth.signInWithPassword({ email, password });
    $("#authBtn").disabled = false;
    if (res.error) {
      const t = /invalid login/i.test(res.error.message) ? "ای میل یا پاس ورڈ غلط ہے۔" : /not confirmed/i.test(res.error.message) ? "پہلے اپنی ای میل میں آیا ہوا تصدیقی لنک کھولیں۔" : res.error.message;
      msg(m, t, "err"); return;
    }
    if (signUpMode && !res.data.session) { msg(m, "اکاؤنٹ بن گیا۔ اپنی ای میل کھول کر تصدیقی لنک دبائیں، پھر یہاں داخل ہوں۔", "ok"); return; }
    boot();
  });

  let booted = false;
  function showOffline() {
    $("#boot").hidden = false;
    $("#boot").innerHTML = `<div class="offline">انٹرنیٹ سے رابطہ نہیں ہو رہا۔<br><small>آپ لاگ اِن ہیں، انٹرنیٹ آتے ہی کھاتہ خود کھل جائے گا۔</small><br><button class="btn btn-line" type="button" id="retryBoot">دوبارہ کوشش کریں</button></div>`;
    $("#retryBoot").onclick = () => boot();
  }

  async function boot() {
    let session = null, err = null;
    try { const r = await sb.auth.getSession(); session = r.data.session; err = r.error; } catch (e) { err = e; }

    // A saved login whose refresh failed because of the network is not a logout: wait for internet instead.
    if (!session && hasSavedLogin() && (err || !navigator.onLine)) { showOffline(); return; }

    $("#boot").hidden = true;
    if (!session) { $("#auth").hidden = false; $("#app").hidden = true; return; }

    const mem = await sb.from("members").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (mem.error) { showOffline(); return; }
    if (!mem.data) { $("#auth").hidden = true; $("#noAccess").hidden = false; return; }

    $("#auth").hidden = true; $("#noAccess").hidden = true; $("#app").hidden = false;
    if (!booted) { setDates(); resetIncForm(); resetExpForm(); showTab(location.hash.slice(1)); booted = true; }
    await loadAll();
  }

  // Only a real sign-out (here or token revoked) sends you back to the login screen.
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") { $("#app").hidden = true; $("#boot").hidden = true; $("#auth").hidden = false; }
  });
  window.addEventListener("online", () => { if (!$("#boot").hidden) boot(); });
  // Coming back to the tab after a while: refresh the numbers (token refresh resumes on its own).
  let lastLoad = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && booted && Date.now() - lastLoad > 60000) { lastLoad = Date.now(); loadAll(); }
  });

  window.__khataTest = { parseUrduNumber, parseIncome, parseExpense };
  boot();
})();
