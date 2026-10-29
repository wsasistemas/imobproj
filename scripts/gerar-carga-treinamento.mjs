// Centro de Treinamento: escreve a carga inicial (trilhas, perfis de cada trilha, módulos e balões) na migration
// supabase/migrations/20261031000700_treinamento.sql, entre os marcadores "CARGA GERADA".
// Fontes: scripts/treinamento/conteudo.mjs (textos) + scripts/treinamento/alvos.json (medido pela captura).
//   node scripts/gerar-carga-treinamento.mjs
// A carga só entra onde ainda não existe (on conflict do nothing; balões só em módulo sem balões): o que o
// super admin editar em Gerenciar tutoriais nunca é sobrescrito.
import { readFileSync, writeFileSync } from "node:fs";
import { MODULOS, PROJETO, TELAS, TRILHAS } from "./treinamento/conteudo.mjs";

const MIGRATION = "supabase/migrations/20261031000700_treinamento.sql";
const INICIO = "-- >>> CARGA GERADA (scripts/gerar-carga-treinamento.mjs) >>>";
const FIM = "-- <<< CARGA GERADA <<<";

const alvos = JSON.parse(readFileSync("scripts/treinamento/alvos.json", "utf8"));
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const chave = (tela, alvo) => `${tela}|${alvo.sel}${alvo.card ? "|card" : ""}`;
const telas = new Set(TELAS.map((t) => t.tela));

const faltando = [];
for (const m of MODULOS) {
  if (m.resposta < 0 || m.resposta >= m.opcoes.length) throw new Error(`${m.codigo}: resposta fora das opções`);
  for (const b of m.baloes) {
    if (!telas.has(b.tela)) throw new Error(`${m.codigo}: tela desconhecida ${b.tela}`);
    if (!alvos[chave(b.tela, b.alvo)]) faltando.push(`${m.codigo} · ${chave(b.tela, b.alvo)}`);
    if (b.texto.length > 220) console.warn(`aviso: ${m.codigo} "${b.titulo}" tem ${b.texto.length} caracteres (até 220 cabem no balão)`);
  }
}
for (const t of TRILHAS) for (const c of t.modulos) if (!MODULOS.some((m) => m.codigo === c)) throw new Error(`trilha ${t.codigo}: módulo ${c} não existe`);
if (faltando.length) {
  console.error("Alvos sem medida (rode scripts/capturar-treinamento.mjs):\n  " + faltando.join("\n  "));
  process.exit(1);
}

const linhas = [];
linhas.push(INICIO);
linhas.push(`-- ${TRILHAS.length} trilhas, ${MODULOS.length} módulos e ${MODULOS.reduce((n, m) => n + m.baloes.length, 0)} balões.`);

linhas.push("insert into imobproj.tr_trilhas (codigo, nome, descricao, padrao, ordem) values");
linhas.push(TRILHAS.map((t, i) => `  (${q(t.codigo)}, ${q(t.nome)}, ${q(t.descricao)}, ${t.padrao}, ${i + 1})`).join(",\n"));
linhas.push("on conflict (codigo) do nothing;\n");

linhas.push("insert into imobproj.tr_trilha_perfis (perfil, trilha_id)");
linhas.push("select v.perfil, t.id from (values");
linhas.push(TRILHAS.flatMap((t) => t.perfis.map((p) => `  (${q(p)}, ${q(t.codigo)})`)).join(",\n"));
linhas.push(") as v (perfil, trilha) join imobproj.tr_trilhas t on t.codigo = v.trilha");
linhas.push("on conflict (perfil) do nothing;\n");

linhas.push("insert into imobproj.tr_modulos (codigo, titulo, descricao, papel, minutos, rota_demo, celular, pergunta, opcoes, resposta, status, ordem) values");
linhas.push(
  MODULOS.map(
    (m, i) =>
      `  (${q(m.codigo)}, ${q(m.titulo)}, ${q(m.descricao)}, ${q(m.papel)}, ${m.minutos}, ${q(m.rotaDemo.replace(":p", PROJETO))}, ${Boolean(m.celular)},\n` +
      `   ${q(m.pergunta)}, ${q(JSON.stringify(m.opcoes))}::jsonb, ${m.resposta}, 'publicado', ${i + 1})`,
  ).join(",\n"),
);
linhas.push("on conflict (codigo) do nothing;\n");

linhas.push("insert into imobproj.tr_trilha_modulos (trilha_id, modulo_id, ordem)");
linhas.push("select t.id, m.id, v.ordem from (values");
linhas.push(TRILHAS.flatMap((t) => t.modulos.map((c, k) => `  (${q(t.codigo)}, ${q(c)}, ${k + 1})`)).join(",\n"));
linhas.push(") as v (trilha, modulo, ordem)");
linhas.push("join imobproj.tr_trilhas t on t.codigo = v.trilha");
linhas.push("join imobproj.tr_modulos m on m.codigo = v.modulo");
linhas.push("on conflict (trilha_id, modulo_id) do nothing;\n");

linhas.push("insert into imobproj.tr_passos (modulo_id, ordem, tela, titulo, texto, alvo)");
linhas.push("select m.id, v.ordem, v.tela, v.titulo, v.texto, v.alvo from (values");
linhas.push(
  MODULOS.flatMap((m) =>
    m.baloes.map((b, k) => `  (${q(m.codigo)}, ${k + 1}, ${q(b.tela)}, ${q(b.titulo)}, ${q(b.texto)}, array[${alvos[chave(b.tela, b.alvo)].join(", ")}]::numeric[])`),
  ).join(",\n"),
);
linhas.push(") as v (modulo, ordem, tela, titulo, texto, alvo)");
linhas.push("join imobproj.tr_modulos m on m.codigo = v.modulo");
linhas.push("where not exists (select 1 from imobproj.tr_passos p where p.modulo_id = m.id);");
linhas.push(FIM);

const sql = readFileSync(MIGRATION, "utf8");
const a = sql.indexOf(INICIO), b = sql.indexOf(FIM);
if (a < 0 || b < 0) throw new Error(`marcadores não encontrados em ${MIGRATION}`);
writeFileSync(MIGRATION, sql.slice(0, a) + linhas.join("\n") + sql.slice(b + FIM.length));
console.log(`Carga escrita em ${MIGRATION}.`);
