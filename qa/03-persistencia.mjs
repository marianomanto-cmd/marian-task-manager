import { chromium } from "playwright";
let pass = 0, fail = 0; const fails = [];
const ck = (n, c, x = "") => { if (c) { pass++; console.log(`  ok    ${n}`); }
  else { fail++; fails.push(n + (x?` — ${x}`:"")); console.log(`  FALLA ${n} ${x}`); } };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1700, height: 950 } });
const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0,150)));
await p.goto("http://localhost:3000/qa/chart", { waitUntil: "networkidle" });
await p.waitForTimeout(3000);

const bars = () => p.evaluate(() => [...document.querySelectorAll(".wx-bar")].map(e => {
  const r = e.getBoundingClientRect();
  return { id: (e.dataset.taskId||"").replace(/^:/,""), x: Math.round(r.x), y: Math.round(r.y),
           w: Math.round(r.width), h: Math.round(r.height), ms: e.className.includes("milestone"),
           sum: e.className.includes("summary") };
}));
const dayW = () => p.evaluate(() => {
  const rows=[...document.querySelectorAll("[class*='wx-scale'] [class*='wx-row']")];
  const c=rows[rows.length-1]?.querySelector("[class*='wx-cell']");
  return c?c.getBoundingClientRect().width:34;
});
const stored = () => p.locator("#qa-dates").innerText();
const listedFor = (id) => p.evaluate((tid) => {
  const bar = document.querySelector(`[data-task-id=":${tid}"]`);
  return bar ? bar.getBoundingClientRect().x : null;
}, id);

console.log("\n═══ Arrastrar → ir y volver ═══");
const cw = await dayW();
const t = (await bars()).filter(x => !x.ms && !x.sum && x.id.startsWith("i") && x.x>340 && x.x<1400 && x.y>60 && x.y<880)[0];
console.log(`  (barra ${t.id}, celda ${Math.round(cw)}px)`);
const storedBefore = await stored();
const xBefore = await listedFor(t.id);

await p.mouse.move(t.x + Math.min(t.w/2, 50), t.y + t.h/2);
await p.mouse.down();
for (let i=1;i<=16;i++) await p.mouse.move(t.x + Math.min(t.w/2,50) + cw*3*i/16, t.y + t.h/2);
await p.mouse.up(); await p.waitForTimeout(1200);

const storedAfter = await stored();
ck("el arrastre actualiza la caché", storedBefore !== storedAfter);
const xAfterDrag = await listedFor(t.id);
ck("la barra se movió en pantalla", xAfterDrag > xBefore, `${xBefore} -> ${xAfterDrag}`);

// registrar la fecha guardada del ítem arrastrado
const savedDates = await p.evaluate((tid) => {
  const m = document.querySelector("#qa-dates").textContent.match(new RegExp(tid + "=([0-9-]+)\\\\.\\\\.([0-9-]+)"));
  return m ? { start: m[1], end: m[2] } : null;
}, t.id);
console.log("  guardado:", JSON.stringify(savedDates));

// ir y volver
await p.locator("#qa-away").click();
await p.waitForTimeout(2800);
const xAfterReturn = await listedFor(t.id);
ck("al volver la barra sigue donde la dejaste", xAfterReturn === xAfterDrag, `${xAfterDrag} -> ${xAfterReturn}`);
const storedReturn = await stored();
ck("las fechas guardadas sobreviven la vuelta", storedReturn === storedAfter);

console.log("\n═══ Vínculo nuevo sobrevive la vuelta ═══");
const LINKED = new Set(["i0","i1","i2","i3","i4","i5","i6"]);
const free = (await bars()).filter(x => !x.sum && x.id.startsWith("i") && !LINKED.has(x.id) && x.x>340 && x.x<1400 && x.y>60 && x.y<880);
if (free.length >= 2) {
  const [A, B] = free;
  await p.locator(`[data-task-id=":${A.id}"]`).hover(); await p.waitForTimeout(350);
  const hb = await p.locator(`[data-task-id=":${A.id}"] .wx-link.wx-right`).boundingBox();
  const linksBefore = await p.evaluate(() => document.querySelectorAll("[class*='wx-link-'], [class*='wx-links'] > *").length);
  if (hb) {
    await p.mouse.move(hb.x+hb.width/2, hb.y+hb.height/2); await p.mouse.down();
    const tx=B.x+12, ty=B.y+B.h/2;
    for (let i=1;i<=20;i++){ await p.mouse.move(hb.x+(tx-hb.x)*i/20, hb.y+(ty-hb.y)*i/20); await p.waitForTimeout(10);}
    await p.mouse.up(); await p.waitForTimeout(1100);
  }
  const log = await p.evaluate(() => (window.__qa||[]).map(e=>e.kind));
  ck(`el conector ${A.id}→${B.id} se creó`, log.includes("add-link"));
  await p.locator("#qa-away").click();
  await p.waitForTimeout(2800);
  const linksAfter = await p.evaluate(() => document.querySelectorAll("[class*='wx-link-'], [class*='wx-links'] > *").length);
  ck("el vínculo nuevo sigue después de ir y volver", linksAfter >= linksBefore, `${linksBefore} -> ${linksAfter}`);
}

ck("sin errores de página en todo el recorrido", errs.length === 0, errs.join(" | "));
await p.screenshot({ path: "qa/capturas/qa-roundtrip.png" });
console.log(`\n═══ RESUMEN: ${pass} ok, ${fail} fallas ═══`);
if (fails.length) console.log("Fallas:\n - " + fails.join("\n - "));
await b.close();
process.exit(fail === 0 ? 0 : 1);
