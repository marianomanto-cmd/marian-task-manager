import { chromium } from "playwright";

const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const fails = [];
function ck(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; fails.push(name + (extra ? ` — ${extra}` : "")); console.log(`  FALLA ${name} ${extra}`); }
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function open(path, opts = {}) {
  const p = await browser.newPage({ viewport: { width: 1600, height: 950 }, ...opts });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message.slice(0, 160)));
  p.on("console", m => { if (m.type() === "error" && !/getServerSnapshot|Failed to load resource/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0,120)); });
  await p.goto(BASE + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(3200);
  return { p, errs };
}
const log = (p) => p.evaluate(() => (window.__qa || []).map(e => `${e.kind} ${e.detail}`));
const bars = (p) => p.evaluate(() => [...document.querySelectorAll(".wx-bar")].map((e, i) => {
  const r = e.getBoundingClientRect();
  return { i, id: (e.dataset.taskId || "").replace(/^:/, ""), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), ms: e.className.includes("milestone") };
}));
const vis = (bs) => bs.filter(b => b.x > 340 && b.x < 1400 && b.y > 60 && b.y < 880);

// ══════════════ 1. CHART EDITABLE ══════════════
console.log("\n═══ 1. Chart editable ═══");
{
  const { p, errs } = await open("/qa/chart");

  ck("monta sin errores de página", errs.length === 0, errs.join(" | "));
  ck("dibuja las 22 barras + 2 grupos", (await bars(p)).length >= 22, String((await bars(p)).length));
  ck("una sola columna en la lista",
    (await p.evaluate(() => [...document.querySelectorAll("[class*='wx-grid'] [class*='wx-cell']")]
      .slice(0,6).map(c=>c.textContent.trim()).filter(Boolean))).filter(t=>/Inicio|Duraci|Días/.test(t)).length === 0);
  ck("la fila muestra título + owner·fechas",
    /·/.test(await p.evaluate(() => document.querySelector(".tl-name-meta")?.textContent || "")));

  // grupos como summary
  ck("los grupos se dibujan como summary",
    await p.evaluate(() => document.querySelectorAll(".wx-bar.wx-summary").length) >= 2);

  // fin de semana en el cuerpo
  const wkBody = await p.evaluate(() => {
    const c = [...document.querySelectorAll(".tl-weekend")].find(e => e.getBoundingClientRect().height > 100);
    return c ? getComputedStyle(c).backgroundColor : null;
  });
  ck("fin de semana pintado en el cuerpo", !!wkBody && wkBody !== "rgba(0, 0, 0, 0)", String(wkBody));
  const holBody = await p.evaluate(() => {
    const c = [...document.querySelectorAll("[class*='tl-holiday-AR']")].find(e => e.getBoundingClientRect().height > 100);
    return c ? getComputedStyle(c).backgroundColor : null;
  });
  ck("feriado AR pintado en el cuerpo", !!holBody, String(holBody));

  // hitos: rombo bajo la columna de su fecha
  const msOk = await p.evaluate(() => {
    const scale = [...document.querySelectorAll("[class*='wx-scale'] [class*='wx-cell']")]
      .map(c => ({ t: c.textContent.trim(), x: c.getBoundingClientRect().x, w: c.getBoundingClientRect().width }))
      .filter(o => /^\d+$/.test(o.t));
    const out = [];
    for (const m of document.querySelectorAll(".wx-bar.wx-milestone")) {
      const r = m.getBoundingClientRect();
      if (r.x < 340 || r.x > 1400) continue;
      const cx = r.x + r.width / 2;
      const col = scale.find(c => cx >= c.x && cx < c.x + c.w);
      const label = m.querySelector(".tl-milestone-label")?.textContent || "";
      out.push({ col: col?.t, label: label.slice(0, 20) });
      if (out.length >= 3) break;
    }
    return out;
  });
  ck("los hitos caen en una columna de día", msOk.length > 0 && msOk.every(o => o.col), JSON.stringify(msOk));
  ck("las etiquetas de hito están acotadas",
    await p.evaluate(() => [...document.querySelectorAll(".tl-milestone-label")]
      .every(l => l.getBoundingClientRect().width <= 250)));

  // ---- mover una barra: cascada + persistencia ----
  const bs = await bars(p);
  const movable = vis(bs).find(b => !b.ms && b.w > 80 && b.id && !b.id.startsWith("g:"));
  if (movable) {
    const gx = movable.x + Math.min(movable.w / 2, 60), gy = movable.y + movable.h / 2;
    await p.mouse.move(gx, gy); await p.mouse.down();
    for (let i = 1; i <= 16; i++) await p.mouse.move(gx + i * 8, gy);
    await p.mouse.up(); await p.waitForTimeout(1200);
    const l = await log(p);
    const dates = l.find(e => e.startsWith("dates"));
    ck("mover una barra dispara el guardado", !!dates, l.join(" ; ").slice(0, 120));
    ck("el guardado incluye la cascada", !!dates && (dates.match(/"id"/g) || []).length > 1,
      dates ? `${(dates.match(/"id"/g) || []).length} filas` : "");
  } else ck("hay una barra movible visible", false);

  // ---- drag-to-link entre un par libre (página limpia para no pelear con el scroll) ----
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  const LINKED = new Set(["i0","i1","i2","i3","i4","i5","i6"]); // deps = slice(0,6)
  const bs2 = await bars(p);
  const free = vis(bs2).filter(b => b.id && !b.id.startsWith("g:") && !LINKED.has(b.id));
  if (free.length >= 2) {
    const A = free[0], B = free[1];
    await p.locator(`[data-task-id=":${A.id}"]`).hover(); await p.waitForTimeout(350);
    const hb = await p.locator(`[data-task-id=":${A.id}"] .wx-link.wx-right`).boundingBox();
    if (hb) {
      await p.mouse.move(hb.x + hb.width/2, hb.y + hb.height/2); await p.mouse.down();
      const tx = B.x + Math.min(B.w/2, 12), ty = B.y + B.h/2;
      for (let i = 1; i <= 20; i++) { await p.mouse.move(hb.x+(tx-hb.x)*i/20, hb.y+(ty-hb.y)*i/20); await p.waitForTimeout(10); }
      await p.mouse.up(); await p.waitForTimeout(1000);
    }
    const l = await log(p);
    ck(`arrastrar un conector crea el vínculo (${A.id}→${B.id})`, l.some(e => e.startsWith("add-link")),
      l.join(" ; ").slice(0,140));
  } else ck("hay dos barras libres visibles", false, JSON.stringify(free.map(f=>f.id)));

  // ---- dos clicks: el flujo nativo de SVAR sigue vivo ----
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  const bs3 = await bars(p);
  const free2 = vis(bs3).filter(b => b.id && !b.id.startsWith("g:") && !LINKED.has(b.id));
  if (free2.length >= 2) {
    const [A, B] = free2;
    await p.locator(`[data-task-id=":${A.id}"]`).hover(); await p.waitForTimeout(300);
    await p.locator(`[data-task-id=":${A.id}"] .wx-link.wx-right`).click({ force: true });
    await p.waitForTimeout(500);
    await p.locator(`[data-task-id=":${B.id}"] .wx-link.wx-left`).click({ force: true });
    await p.waitForTimeout(900);
    const l = await log(p);
    ck("dos clicks también crean el vínculo", l.some(e => e.startsWith("add-link")), l.join(" ; ").slice(0,120));
  }

  // ---- abrir el editor (owner / grupo / estrella) ----
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  const bs4 = await bars(p);
  const target = vis(bs4).find(b => !b.ms && b.w > 70 && b.id && !b.id.startsWith("g:"));
  if (target) {
    await p.mouse.dblclick(target.x + Math.min(target.w/2, 50), target.y + target.h/2);
    await p.waitForTimeout(900);
    let l = await log(p);
    if (!l.some(e => e.startsWith("edit-item"))) {
      // probar doble click en la fila de la lista
      await p.locator(".tl-name").first().dblclick();
      await p.waitForTimeout(900);
      l = await log(p);
    }
    ck("se puede abrir el editor de un ítem", l.some(e => e.startsWith("edit-item")),
      "ni doble click en la barra ni en la fila abren el editor");
  }

  // ---- reordenar verticalmente ----
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  const gridRows = await p.evaluate(() =>
    [...document.querySelectorAll("[class*='wx-grid'] [class*='wx-row']")]
      .map(r => ({ t: r.textContent.trim().slice(0,18), y: Math.round(r.getBoundingClientRect().y), h: Math.round(r.getBoundingClientRect().height) }))
      .filter(o => o.t));
  if (gridRows.length > 5) {
    const from = gridRows[5], to = gridRows[2];
    await p.mouse.move(200, from.y + from.h/2); await p.mouse.down();
    for (let i=1;i<=16;i++) await p.mouse.move(200, from.y + (to.y - from.y)*i/16);
    await p.waitForTimeout(200);
    await p.mouse.up(); await p.waitForTimeout(1000);
    const after = await p.evaluate(() =>
      [...document.querySelectorAll("[class*='wx-grid'] [class*='wx-row']")]
        .map(r => r.textContent.trim().slice(0,18)).filter(Boolean));
    ck("reordenar filas cambia el orden", after[5] !== from.t, `${from.t} seguía en la fila 5`);
    ck("reordenar dispara el guardado", (await log(p)).some(e => e.startsWith("reorder")));
  }

  // ---- zoom ----
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  const cellBefore = await p.evaluate(() => {
    const c = document.querySelector("[class*='wx-scale'] [class*='wx-cell']");
    return c ? Math.round(c.getBoundingClientRect().width) : 0;
  });
  await p.mouse.move(900, 400);
  await p.keyboard.down("Control");
  await p.mouse.wheel(0, -300);
  await p.keyboard.up("Control");
  await p.waitForTimeout(900);
  const cellAfter = await p.evaluate(() => {
    const c = document.querySelector("[class*='wx-scale'] [class*='wx-cell']");
    return c ? Math.round(c.getBoundingClientRect().width) : 0;
  });
  ck("el zoom cambia la escala", cellBefore !== cellAfter, `${cellBefore}px -> ${cellAfter}px`);

  // ---- errores acumulados ----
  ck("sin errores tras interactuar", errs.length === 0, errs.join(" | "));
  await p.screenshot({ path: "qa/capturas/qa-chart.png" });
  await p.close();
}

// ══════════════ 2. VISTA PÚBLICA (readonly) ══════════════
console.log("\n═══ 2. Vista pública (sólo lectura) ═══");
{
  const { p, errs } = await open("/qa/publica");
  ck("monta sin errores", errs.length === 0, errs.join(" | "));
  ck("dibuja las barras", (await bars(p)).length >= 22);
  ck("no muestra puntitos de conector",
    await p.evaluate(() => document.querySelectorAll(".wx-link").length) === 0,
    String(await p.evaluate(() => document.querySelectorAll(".wx-link").length)));
  const bs = await bars(p);
  const b = vis(bs).find(x => !x.ms && x.w > 80);
  const before = b && { x: b.x };
  if (b) {
    const gx = b.x + 40, gy = b.y + b.h/2;
    await p.mouse.move(gx, gy); await p.mouse.down();
    for (let i=1;i<=14;i++) await p.mouse.move(gx + i*10, gy);
    await p.mouse.up(); await p.waitForTimeout(900);
    const after = (await bars(p)).find(x => x.i === b.i);
    ck("no se puede arrastrar en sólo lectura", after && after.x === before.x, `${before?.x} -> ${after?.x}`);
  }
  await p.screenshot({ path: "qa/capturas/qa-publica.png" });
  await p.close();
}

// ══════════════ 3. MASTER ══════════════
console.log("\n═══ 3. MASTER ═══");
{
  const { p, errs } = await open("/qa/master");
  ck("monta sin errores", errs.length === 0, errs.join(" | "));
  const txt = await p.locator("body").innerText();
  ck("lista los dos proyectos", /Colombia Positioning/.test(txt) && /Puerto Rico Creative/.test(txt));
  ck("arranca colapsado", await p.locator("[aria-expanded='false']").count() >= 2,
    String(await p.locator("[aria-expanded='false']").count()));
  const before = await p.locator("body").innerText();
  await p.locator("[aria-expanded='false']").first().click();
  await p.waitForTimeout(600);
  ck("se puede expandir un proyecto", (await p.locator("body").innerText()).length > before.length);
  for (const h of ["1 mes", "3 meses"]) {
    await p.getByRole("button", { name: h }).click();
    await p.waitForTimeout(500);
    ck(`horizonte ${h} responde`, await p.locator(`button[aria-pressed='true']`).filter({ hasText: h }).count() === 1);
  }
  await p.locator("button", { hasText: "Colombia Positioning" }).first().click();
  await p.waitForTimeout(400);
  ck("click en el nombre abre el timeline",
    (await p.locator("#qa-opened").innerText()) !== "(ninguno)",
    await p.locator("#qa-opened").innerText());
  await p.screenshot({ path: "qa/capturas/qa-master.png" });
  await p.close();
}

// ══════════════ 4. MODO OSCURO ══════════════
console.log("\n═══ 4. Modo oscuro ═══");
{
  const { p, errs } = await open("/qa/chart", { colorScheme: "dark" });
  await p.evaluate(() => document.documentElement.classList.add("dark"));
  await p.waitForTimeout(900);
  ck("monta en oscuro sin errores", errs.length === 0, errs.join(" | "));
  const wk = await p.evaluate(() => {
    const c = [...document.querySelectorAll(".tl-weekend")].find(e => e.getBoundingClientRect().height > 100);
    return c ? getComputedStyle(c).backgroundColor : null;
  });
  ck("el fin de semana también se tiñe en oscuro", !!wk && wk !== "rgba(0, 0, 0, 0)", String(wk));
  await p.screenshot({ path: "qa/capturas/qa-dark.png" });
  await p.close();
}

console.log(`\n═══ RESUMEN: ${pass} ok, ${fail} fallas ═══`);
if (fails.length) console.log("Fallas:\n - " + fails.join("\n - "));
await browser.close();
process.exit(fail === 0 ? 0 : 1);
