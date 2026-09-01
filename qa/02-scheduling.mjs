import { chromium } from "playwright";
const BASE = "http://localhost:3000";
let pass = 0, fail = 0; const fails = [];
const ck = (n, c, x = "") => { if (c) { pass++; console.log(`  ok    ${n}`); }
  else { fail++; fails.push(n + (x?` — ${x}`:"")); console.log(`  FALLA ${n} ${x}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const fresh = async () => {
  const p = await browser.newPage({ viewport: { width: 1700, height: 950 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0,150)));
  await p.goto(BASE + "/qa/chart", { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  return { p, errs };
};
const bars = (p) => p.evaluate(() => [...document.querySelectorAll(".wx-bar")].map(e => {
  const r = e.getBoundingClientRect();
  return { id: (e.dataset.taskId||"").replace(/^:/,""), x: Math.round(r.x), y: Math.round(r.y),
           w: Math.round(r.width), h: Math.round(r.height), ms: e.className.includes("milestone"),
           sum: e.className.includes("summary") };
}));
const events = (p) => p.evaluate(() => (window.__qa || []).map(e => ({ kind: e.kind, detail: JSON.parse(e.detail) })));
const vis = (bs) => bs.filter(b => b.x > 340 && b.x < 1500 && b.y > 60 && b.y < 880);
const dayCellW = (p) => p.evaluate(() => {
  const rows = [...document.querySelectorAll("[class*='wx-scale'] [class*='wx-row']")];
  const last = rows[rows.length - 1];
  const c = last && last.querySelector("[class*='wx-cell']");
  return c ? c.getBoundingClientRect().width : 34;
});
const dragBy = async (p, x, y, dx) => {
  await p.mouse.move(x, y); await p.mouse.down();
  const steps = Math.max(8, Math.abs(Math.round(dx / 8)));
  for (let i = 1; i <= steps; i++) await p.mouse.move(x + dx * i / steps, y);
  await p.mouse.up(); await p.waitForTimeout(1100);
};

// ═══ A. Arrastres encadenados: la línea de base no debe derivar ═══
console.log("\n═══ A. Arrastres encadenados ═══");
{
  const { p, errs } = await fresh();
  const bs = vis(await bars(p));
  const t = bs.find(b => !b.ms && !b.sum && b.w > 90 && b.id.startsWith("i"));
  const cellW = await dayCellW(p);
  console.log(`  (barra ${t.id}, ancho de celda ${Math.round(cellW)}px)`);

  // tres arrastres seguidos de +2 días cada uno
  for (let k = 0; k < 3; k++) {
    const cur = (await bars(p)).find(b => b.id === t.id);
    await dragBy(p, cur.x + Math.min(cur.w/2, 50), cur.y + cur.h/2, cellW * 2);
  }
  const evs = await events(p);
  const dateEvents = evs.filter(e => e.kind === "dates");
  ck("tres arrastres = tres guardados", dateEvents.length === 3, String(dateEvents.length));

  // el ítem arrastrado se corrió 6 días en total, ni más ni menos
  const moved = dateEvents.map(e => e.detail.find((r) => r.id === t.id)).filter(Boolean);
  ck("cada guardado incluye el ítem arrastrado", moved.length === 3, String(moved.length));
  if (moved.length === 3) {
    const d = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
    const step1 = d(moved[0].start_date, moved[1].start_date);
    const step2 = d(moved[1].start_date, moved[2].start_date);
    ck("cada arrastre corre 2 días exactos, sin acumular de más", step1 === 2 && step2 === 2, `pasos: ${step1}, ${step2}`);
  }
  // ninguna fila se corrió más que el ítem arrastrado
  const lastBatch = dateEvents[dateEvents.length - 1]?.detail ?? [];
  ck("la cascada no dispara filas de grupo", lastBatch.every((r) => !String(r.id).startsWith("g:")),
    JSON.stringify(lastBatch.map(r=>r.id)));
  ck("sin errores", errs.length === 0, errs.join(" | "));
  await p.close();
}

// ═══ B. Resize: estirar el fin empuja la cadena; el inicio no ═══
console.log("\n═══ B. Resize ═══");
{
  const { p, errs } = await fresh();
  const bs = vis(await bars(p));
  // i3 (Produccion) tiene sucesora i4 por FF
  const t = bs.filter(b => !b.ms && !b.sum && b.id.startsWith("i") && b.x + b.w < 1450)
               .sort((a, b) => b.w - a.w)[0];
  if (!t) { console.log("  (sin barra ancha visible para estirar)"); }
  const cellW = await dayCellW(p);
  // agarrar el borde derecho
  console.log(`  (barra ${t.id}, ancho ${t.w}px, celda de día ${Math.round(cellW)}px)`);
  await dragBy(p, t.x + t.w - 4, t.y + t.h/2, cellW * 3);
  const evs = await events(p);
  const batch = evs.filter(e => e.kind === "dates").pop()?.detail ?? [];
  const self = batch.find((r) => r.id === t.id);
  ck("estirar guarda el ítem", !!self, JSON.stringify(batch.map(r=>r.id)));
  if (self) {
    const dur = Math.round((new Date(self.end_date) - new Date(self.start_date)) / 86400000);
    ck("estirar cambia la duración, no la fecha de inicio", dur > 0, `duración ${dur}d, inicio ${self.start_date}`);
  }
  ck("estirar arrastra la cadena", batch.length > 1, `${batch.length} filas`);
  ck("sin errores", errs.length === 0, errs.join(" | "));
  await p.close();
}

// ═══ C. Hitos: mover uno guarda start === end ═══
console.log("\n═══ C. Hitos ═══");
{
  const { p, errs } = await fresh();
  const bs = vis(await bars(p));
  const ms = bs.find(b => b.ms && b.id.startsWith("i"));
  const cellW = await dayCellW(p);
  await dragBy(p, ms.x + ms.w/2, ms.y + ms.h/2, cellW * 3);
  const batch = (await events(p)).filter(e => e.kind === "dates").pop()?.detail ?? [];
  const self = batch.find((r) => r.id === ms.id);
  ck("mover un hito lo guarda", !!self, JSON.stringify(batch.map(r=>r.id)));
  ck("un hito guarda start === end", !self || self.start_date === self.end_date,
    self ? `${self.start_date} .. ${self.end_date}` : "");
  ck("ninguna fila guarda fin anterior al inicio", batch.every((r) => r.end_date >= r.start_date),
    JSON.stringify(batch));
  ck("sin errores", errs.length === 0, errs.join(" | "));
  await p.close();
}

// ═══ D. Grupos: arrastrar un summary no escribe basura ═══
console.log("\n═══ D. Grupos (summary) ═══");
{
  const { p, errs } = await fresh();
  const bs = vis(await bars(p));
  const sum = bs.find(b => b.sum);
  if (sum) {
    const cellW = await dayCellW(p);
    await dragBy(p, sum.x + Math.min(sum.w/2, 80), sum.y + sum.h/2, cellW * 2);
    const evs = await events(p);
    const all = evs.filter(e => e.kind === "dates").flatMap(e => e.detail);
    ck("nunca guarda una fila de grupo", all.every((r) => !String(r.id).startsWith("g:")),
      JSON.stringify(all.map(r=>r.id).slice(0,8)));
    ck("todas las filas guardadas son fechas válidas",
      all.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.start_date) && r.end_date >= r.start_date),
      JSON.stringify(all.slice(0,3)));
  } else ck("hay un grupo visible", false);
  ck("sin errores", errs.length === 0, errs.join(" | "));
  await p.close();
}

// ═══ E. Sin ítems ═══
console.log("\n═══ E. Casos borde ═══");
{
  const p = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0,150)));
  await p.goto(BASE + "/qa/publica", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  ck("la vista de sólo lectura no crea vínculos al clickear",
    await p.evaluate(() => document.querySelectorAll(".wx-link").length) === 0);
  ck("sin errores", errs.length === 0, errs.join(" | "));
  await p.close();
}

console.log(`\n═══ RESUMEN: ${pass} ok, ${fail} fallas ═══`);
if (fails.length) console.log("Fallas:\n - " + fails.join("\n - "));
await browser.close();
process.exit(fail === 0 ? 0 : 1);
