// Centro de Treinamento: captura as telas dos balões e mede onde fica cada alvo.
//   1. o portal precisa estar no ar em MODO DEMO, num banco local com a demo aplicada:
//        npx supabase db reset --local
//        DEMO_SENHA='<senha>' SUPABASE_DEMO_DB_URL="postgresql://postgres:postgres@127.0.0.1:56322/postgres" bash scripts/publicar-demo.sh
//        NEXT_PUBLIC_MODO=demo npm run build && NEXT_PUBLIC_MODO=demo DEMO_SENHA='<senha>' npx next start -p 3229
//   2. node scripts/capturar-treinamento.mjs            (TREINAMENTO_URL muda o endereço; padrão http://localhost:3229)
//   3. node scripts/gerar-carga-treinamento.mjs         (escreve a carga na migration)
// Grava public/treinamento/<tela>.webp e scripts/treinamento/alvos.json ([x, y, largura, altura] em % de cada tela).
// Desktop: 1440×900, entrando pelo "Entrar como" da demo; a faixa da demo some (não existe em produção).
// Celular: o elemento `.tela` dos mockups aprovados do app, com deviceScaleFactor 2.
// Usa o Edge da máquina (playwright-core, sem baixar navegador).
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { MODULOS, PROJETO, TELAS } from "./treinamento/conteudo.mjs";

const BASE = process.env.TREINAMENTO_URL ?? "http://localhost:3229";
const SAIDA = "public/treinamento";
const ALVOS = "scripts/treinamento/alvos.json";
const DESKTOP = { width: 1440, height: 900 };
const ESCONDER = ".demo-faixa { display: none !important; } nextjs-portal { display: none !important; }";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (v) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;

/** Alvos de cada tela, a partir dos balões do conteúdo. */
function alvosDaTela(tela) {
  return MODULOS.flatMap((m) => m.baloes).filter((b) => b.tela === tela).map((b) => b.alvo);
}
const chave = (tela, alvo) => `${tela}|${alvo.sel}${alvo.card ? "|card" : ""}`;

/** Caixa do alvo (o cartão que o contém, se card) relativa à caixa da tela, em %. */
async function medir(page, alvo, area) {
  const loc = page.locator(alvo.sel).first();
  await loc.waitFor({ state: "attached", timeout: 8000 });
  const caixa = await loc.evaluate((el, card) => {
    // Cartão: o [data-slot=card] do shadcn ou, nos cartões próprios, o primeiro ancestral com borda e cantos.
    const ehCartao = (e) => {
      const s = getComputedStyle(e);
      return parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderTopLeftRadius) > 0 && e.tagName !== "MAIN";
    };
    let alvo = el;
    if (card) {
      alvo = el.closest("[data-slot='card']");
      for (let e = el.parentElement; !alvo && e && e.tagName !== "MAIN"; e = e.parentElement) if (ehCartao(e)) alvo = e;
      alvo ??= el;
    }
    const b = alvo.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, Boolean(alvo.card));
  if (caixa.w === 0 || caixa.h === 0) throw new Error(`alvo sem tamanho: ${alvo.sel}`);
  const x0 = Math.max(caixa.x, area.x), y0 = Math.max(caixa.y, area.y);
  const x1 = Math.min(caixa.x + caixa.w, area.x + area.w), y1 = Math.min(caixa.y + caixa.h, area.y + area.h);
  if (x1 <= x0 || y1 <= y0) throw new Error(`alvo fora da tela: ${alvo.sel}`);
  return [r1(((x0 - area.x) / area.w) * 100), r1(((y0 - area.y) / area.h) * 100), r1(((x1 - x0) / area.w) * 100), r1(((y1 - y0) / area.h) * 100)];
}

async function entrar(context, perfil) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator("button.demo-entrar__botao", { hasText: perfil }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  return page;
}

async function prepararDesktop(page, t) {
  await page.goto(BASE + t.rota.replace(":p", PROJETO));
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.addStyleTag({ content: ESCONDER });
  await espera(1200);
  if (t.rolar) {
    await page.mouse.move(800, 600);
    await page.mouse.wheel(0, t.rolar);
    await espera(900);
  }
  for (const c of t.clicar ?? []) {
    await page.locator(c).first().click({ timeout: 10000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await espera(1500);
  }
  await page.mouse.move(2, 2); // tira o hover de cima dos botões
  await espera(400);
}

async function gravar(png, tela) {
  const info = await sharp(png).webp({ quality: 82 }).toFile(`${SAIDA}/${tela}.webp`);
  console.log(`ok  ${tela.padEnd(15)} ${info.width}×${info.height}  ${Math.round(info.size / 1024)} KB`);
}

mkdirSync(SAIDA, { recursive: true });
const navegador = await chromium.launch({ channel: "msedge" });
const alvos = {};
const erros = [];
try {
  // ---------------- portal (desktop), um contexto por perfil
  const porPerfil = new Map();
  for (const t of TELAS.filter((x) => x.perfil)) {
    if (!porPerfil.has(t.perfil)) {
      const context = await navegador.newContext({ viewport: DESKTOP, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
      const page = await entrar(context, t.perfil);
      page.on("pageerror", (e) => erros.push(`${t.perfil}: ${e.message}`));
      porPerfil.set(t.perfil, page);
    }
    const page = porPerfil.get(t.perfil);
    await prepararDesktop(page, t);
    const area = { x: 0, y: 0, w: DESKTOP.width, h: DESKTOP.height };
    for (const a of alvosDaTela(t.tela)) alvos[chave(t.tela, a)] = await medir(page, a, area);
    await gravar(await page.screenshot({ animations: "disabled", caret: "hide" }), t.tela);
  }

  // ---------------- app de OS (celular), dos mockups aprovados
  const celular = await navegador.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  celular.on("pageerror", (e) => erros.push(`mockup: ${e.message}`));
  for (const t of TELAS.filter((x) => x.mockup)) {
    const [arquivo, hash] = t.mockup.split("#");
    await celular.goto(pathToFileURL(resolve(arquivo)).href + (hash ? `#${hash}` : ""));
    await celular.waitForLoadState("networkidle").catch(() => {});
    await espera(600);
    const tela = celular.locator(t.celula).first();
    await tela.scrollIntoViewIfNeeded();
    const b = await tela.boundingBox();
    const area = { x: b.x, y: b.y, w: b.width, h: b.height };
    for (const a of alvosDaTela(t.tela)) {
      alvos[chave(t.tela, a)] = await medir(celular, { ...a, sel: `${t.celula} ${a.sel}` }, area);
    }
    await gravar(await tela.screenshot({ animations: "disabled" }), t.tela);
  }
} finally {
  await navegador.close();
}
const ordenado = Object.fromEntries(Object.entries(alvos).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(ALVOS, JSON.stringify(ordenado, null, 2) + "\n");
console.log(`\n${Object.keys(alvos).length} alvos em ${ALVOS}`);
if (erros.length) {
  console.error("Erros na página:", erros);
  process.exitCode = 1;
}
