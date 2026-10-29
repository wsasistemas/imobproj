// Gera supabase/demo/seed-demo.sql a partir do seed de desenvolvimento (supabase/seed.sql)
// + supabase/demo/extra-demo.sql, trocando nomes, empresas e e-mails pelos fictícios da demonstração.
// A senha dos usuários vira o marcador __DEMO_SENHA__, trocado só na hora de publicar (scripts/publicar-demo.sh).
//
// Uso: node scripts/gerar-seed-demo.mjs   (rode de novo sempre que o seed.sql mudar)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seed = fs.readFileSync(path.join(raiz, "supabase/seed.sql"), "utf8");
const extra = fs.readFileSync(path.join(raiz, "supabase/demo/extra-demo.sql"), "utf8");

// Ordem importa: nomes completos antes dos primeiros nomes; textos maiores antes dos menores.
const trocas = [
  ["Portal de Tickets Calper", "Portal de Atendimento Alfa"],
  ["PRJ-014", "ALF-PRT"],
  ["TecnoCampo Serviços de TI", "Redes BT Serviços de TI"],
  ["TecnoCampo", "Redes BT"],
  ["Marina Castro", "Sofia Andrade"],
  ["Ricardo Almeida", "Ricardo Nunes"],
  ["Fernanda Rocha", "Carla Mendes"],
  ["Paulo Mendes", "Mariana Costa"],
  ["Lucas Oliveira", "Rafael Lima"],
  ["Jorge Ferreira", "Bruno Teixeira"],
  [/\bMarina\b/g, "Sofia"],
  [/\bFernanda\b/g, "Carla"],
  [/\bPaulo\b/g, "Mariana"],
  [/\bLucas\b/g, "Rafael"],
  [/\bJorge\b/g, "Bruno"],
  ["Calper", "Construtora Alfa"],
  ["calper.exemplo.com.br", "alfa.demo.com.br"],
  ["@exemplo.com.br", "@demo.imobproj.com.br"],
  [".exemplo.com.br", ".demo.com.br"],
  ["extensions.crypt('Imobproj@2026'", "extensions.crypt('__DEMO_SENHA__'"],
  ["portal_url                   = 'http://localhost:3000'", "portal_url                   = '__DEMO_PORTAL_URL__'"],
];

// O cabeçalho do seed de desenvolvimento cita a senha local: troca pelo cabeçalho da demo.
const corpo = seed.slice(seed.indexOf("-- Auth:") > 0 ? seed.lastIndexOf("-- ----", seed.indexOf("-- Auth:")) : 0);
let sql = corpo;
for (const [de, para] of trocas) sql = typeof de === "string" ? sql.split(de).join(para) : sql.replace(de, para);

const sobras = sql.match(/calper|tecnocampo|exemplo\.com|Imobproj@2026/gi);
if (sobras) {
  console.error("Sobrou texto do seed de desenvolvimento:", [...new Set(sobras)].join(", "));
  process.exit(1);
}

const cabecalho = `-- =============================================================================
-- IMOBPROJ · seed da VERSÃO DEMO (gerado por scripts/gerar-seed-demo.mjs — não edite à mão)
-- Fonte: supabase/seed.sql + supabase/demo/extra-demo.sql, com nomes e empresas fictícios.
-- A senha dos usuários é o marcador __DEMO_SENHA__, trocado pelo scripts/publicar-demo.sh.
--
-- Usuários (e-mail @demo.imobproj.com.br):
--   superadmin    Sofia Andrade   super admin
--   gerente       Carla Mendes    gerente de projetos
--   analista      Rafael Lima     técnico / analista
--   atendente     Juliana Prado   atendente
--   usuario.chave Mariana Costa   usuária-chave (Construtora Alfa)
--   diretor       Ricardo Nunes   diretor (Construtora Alfa)
--   prestador     Bruno Teixeira  prestador (Redes BT)
-- =============================================================================

`;
fs.writeFileSync(path.join(raiz, "supabase/demo/seed-demo.sql"), cabecalho + sql.trimEnd() + "\n\n" + extra);
console.log("supabase/demo/seed-demo.sql gerado.");
