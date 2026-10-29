// Gera src/components/shell/icones-menu.data.ts com os ícones Fluent Color do Portal Atendimento,
// copiados do imobdesk (src/components/iconesMenu.data.ts). Só os ícones usados no menu do IMOBPROJ.
// Uso: node scripts/gerar-icones-menu.mjs [caminho do iconesMenu.data.ts do imobdesk]
import fs from "node:fs";
import path from "node:path";

const origem = process.argv[2] ?? "C:/Projetos VSCODE/Outros/imobdesk/src/components/iconesMenu.data.ts";
const destino = path.resolve("src/components/shell/icones-menu.data.ts");

// chave no IMOBPROJ → id no menuRegistry do imobdesk
const MAPA = {
  home: "home",
  projetos: "gestao_chamados",
  conversas: "gestao_atendimento_central",
  clientes: "gestao_atendimento_empreendimentos",
  usuarios: "manage_users",
  equipes: "manage_users_equipes",
  openwa: "gestao_atendimento_openwa",
  "app-campo": "gestao_atendimento_solicitante",
  configuracoes: "configuracoes",
  monitor: "gestao_chamados_monitor",
  perfis: "manage_permissions",
  aplicativos: "manage_app_access",
  setores: "gestao_atendimento_setores",
  fila: "gestao_atendimento_fila",
  treinamento: "centro_treinamento",
  recolher: "rodape_recolher",
  expandir: "rodape_expandir",
  senha: "rodape_senha",
  sair: "rodape_sair",
};

const texto = fs.readFileSync(origem, "utf8");
const todos = JSON.parse(texto.slice(texto.indexOf("= {") + 2, texto.lastIndexOf("}") + 1));
const saida = {};
for (const [chave, id] of Object.entries(MAPA)) {
  if (!todos[id]) throw new Error(`Ícone "${id}" não existe em ${origem}`);
  saida[chave] = todos[id];
}

fs.writeFileSync(
  destino,
  `// Gerado por scripts/gerar-icones-menu.mjs. Não edite à mão.\n` +
    `// Ícones Fluent Color do Portal Atendimento (via imobdesk), desenhados offline pelo @iconify/react.\n` +
    `import type { IconifyIcon } from "@iconify/react";\n\n` +
    `export type ChaveIcone = ${Object.keys(MAPA).map((k) => JSON.stringify(k)).join(" | ")};\n\n` +
    `export const ICONES_MENU: Record<ChaveIcone, { nome: string; data: IconifyIcon }> = ${JSON.stringify(saida, null, 2)};\n`,
);
console.log(`${Object.keys(saida).length} ícones → ${path.relative(process.cwd(), destino)}`);
