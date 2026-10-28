"use client";

// Importação da EAP por planilha .xlsx (SheetJS), lida no navegador, com validação por linha para a pré-visualização.
import * as XLSX from "xlsx";
import { codigoPai, compararCodigos, numeroBr, REGEX_CODIGO_EAP } from "./utilidades";

export const COLUNAS_MODELO = ["codigo", "titulo", "responsavel_email", "horas_orcadas", "inicio", "fim", "marco"] as const;

/** Linha pronta para a Server Action importarEap. */
export type LinhaImportacao = {
  codigo: string;
  titulo: string;
  responsavel_email: string | null;
  horas_orcadas: number;
  inicio: string | null;
  fim: string | null;
  marco: boolean;
};

export type LinhaPrevia = {
  /** Número da linha na planilha (1 = cabeçalho). */
  numero: number;
  dados: LinhaImportacao;
  responsavelNome: string | null;
  acao: "criar" | "atualizar";
  erros: string[];
  avisos: string[];
};

type Bruta = Record<string, unknown>;

const ALIASES: Record<string, (typeof COLUNAS_MODELO)[number]> = {
  codigo: "codigo",
  cod: "codigo",
  titulo: "titulo",
  atividade: "titulo",
  responsavel_email: "responsavel_email",
  responsavel: "responsavel_email",
  email: "responsavel_email",
  e_mail: "responsavel_email",
  horas_orcadas: "horas_orcadas",
  horas: "horas_orcadas",
  inicio: "inicio",
  data_inicio: "inicio",
  fim: "fim",
  termino: "fim",
  data_fim: "fim",
  marco: "marco",
};

function normalizarCabecalho(c: string) {
  return c
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Lê a primeira aba da planilha. Devolve as linhas com cabeçalhos normalizados e o nº da linha. */
export async function lerPlanilha(arquivo: File): Promise<{ linhas: (Bruta & { __linha: number })[]; colunasFaltando: string[] }> {
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
  const aba = wb.Sheets[wb.SheetNames[0]];
  if (!aba) return { linhas: [], colunasFaltando: [...COLUNAS_MODELO] };
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, raw: true, defval: "", blankrows: false });
  const [cabecalho = [], ...resto] = matriz;
  const colunas = cabecalho.map((c) => ALIASES[normalizarCabecalho(String(c ?? ""))] ?? null);
  const linhas = resto
    .map((valores, i) => {
      const obj: Bruta & { __linha: number } = { __linha: i + 2 };
      colunas.forEach((col, j) => {
        if (col) obj[col] = valores[j];
      });
      return obj;
    })
    .filter((o) => COLUNAS_MODELO.some((c) => String(o[c] ?? "").trim() !== ""));
  const presentes = new Set(colunas.filter(Boolean));
  const colunasFaltando = (["codigo", "titulo"] as const).filter((c) => !presentes.has(c));
  return { linhas, colunasFaltando };
}

const pad = (n: number) => String(n).padStart(2, "0");

function dataValida(a: number, m: number, d: number) {
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && a >= 1900 && a <= 2200;
}

/** Aceita data serial do Excel, dd/mm/aaaa, dd-mm-aaaa e aaaa-mm-dd. "" → null; inválida → undefined. */
export function lerData(valor: unknown): string | null | undefined {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  if (typeof valor === "number") {
    const p = XLSX.SSF.parse_date_code(valor);
    if (!p || !dataValida(p.y, p.m, p.d)) return undefined;
    return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  }
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return undefined;
    return `${valor.getFullYear()}-${pad(valor.getMonth() + 1)}-${pad(valor.getDate())}`;
  }
  const s = String(valor).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return dataValida(a, mes, d) ? `${a}-${pad(mes)}-${pad(d)}` : undefined;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return dataValida(a, mes, d) ? `${a}-${pad(mes)}-${pad(d)}` : undefined;
  }
  return undefined;
}

function lerMarco(valor: unknown): boolean | undefined {
  if (typeof valor === "boolean") return valor;
  const s = String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (["", "nao", "n", "no", "false", "0", "-"].includes(s)) return false;
  if (["sim", "s", "x", "yes", "y", "true", "1"].includes(s)) return true;
  return undefined;
}

/**
 * Valida cada linha: código obrigatório/único/no formato 1.2.3, pai existente (na EAP ou na planilha, e válido),
 * título, horas numéricas, datas válidas (fim ≥ início), responsável por e-mail que seja membro (senão: aviso e
 * grava sem responsável), marco sim/não. Define criar × atualizar pelo código.
 */
export function validarLinhas(
  brutas: (Bruta & { __linha: number })[],
  codigosExistentes: Set<string>,
  membrosPorEmail: Map<string, string>,
): LinhaPrevia[] {
  const contagem = new Map<string, number>();
  for (const b of brutas) {
    const c = String(b.codigo ?? "").trim();
    if (c) contagem.set(c, (contagem.get(c) ?? 0) + 1);
  }

  const previas: LinhaPrevia[] = brutas.map((b) => {
    const erros: string[] = [];
    const avisos: string[] = [];
    const codigo = String(b.codigo ?? "").trim().replace(/\.$/, "");
    const titulo = String(b.titulo ?? "").trim();

    if (!codigo) erros.push("Código obrigatório.");
    else if (!REGEX_CODIGO_EAP.test(codigo)) erros.push("Código inválido (use 1, 1.2, 1.2.3).");
    else if ((contagem.get(codigo) ?? 0) > 1) erros.push("Código repetido na planilha.");

    if (!titulo) erros.push("Título obrigatório.");
    else if (titulo.length > 200) erros.push("Título com mais de 200 caracteres.");

    const horas = numeroBr(b.horas_orcadas);
    if (!Number.isFinite(horas)) erros.push("Horas orçadas não é um número.");
    else if (horas < 0) erros.push("Horas orçadas não pode ser negativa.");

    const inicio = lerData(b.inicio);
    const fim = lerData(b.fim);
    if (inicio === undefined) erros.push("Início não é uma data válida (dd/mm/aaaa).");
    if (fim === undefined) erros.push("Fim não é uma data válida (dd/mm/aaaa).");
    if (inicio && fim && fim < inicio) erros.push("Fim antes do início.");

    const marco = lerMarco(b.marco);
    if (marco === undefined) erros.push("Marco deve ser sim ou não.");

    const email = String(b.responsavel_email ?? "").trim().toLowerCase();
    let responsavelEmail: string | null = null;
    if (email) {
      if (membrosPorEmail.has(email)) responsavelEmail = email;
      else avisos.push(`${email} não é membro do projeto: o item fica sem responsável.`);
    }

    return {
      numero: b.__linha,
      dados: {
        codigo,
        titulo,
        responsavel_email: responsavelEmail,
        horas_orcadas: Number.isFinite(horas) && horas >= 0 ? Math.round(horas * 100) / 100 : 0,
        inicio: inicio ?? null,
        fim: fim ?? null,
        marco: marco ?? false,
      },
      responsavelNome: responsavelEmail ? (membrosPorEmail.get(responsavelEmail) ?? null) : null,
      acao: codigosExistentes.has(codigo) ? "atualizar" : "criar",
      erros,
      avisos,
    };
  });

  // Hierarquia: processa do nível mais raso ao mais fundo; o pai precisa existir na EAP ou ser linha válida.
  const validos = new Set<string>();
  const porProfundidade = [...previas]
    .filter((p) => p.erros.length === 0)
    .sort((a, b) => a.dados.codigo.split(".").length - b.dados.codigo.split(".").length || compararCodigos(a.dados.codigo, b.dados.codigo));
  const codigosNaPlanilha = new Set(previas.map((p) => p.dados.codigo));
  for (const p of porProfundidade) {
    const pai = codigoPai(p.dados.codigo);
    if (pai && !codigosExistentes.has(pai) && !validos.has(pai)) {
      p.erros.push(
        codigosNaPlanilha.has(pai) ? `O pai ${pai} tem erro nesta planilha.` : `O pai ${pai} não existe na EAP nem na planilha.`,
      );
      continue;
    }
    validos.add(p.dados.codigo);
  }

  return previas;
}

/** Gera e baixa o modelo .xlsx com as colunas esperadas e linhas de exemplo. */
export function baixarModelo() {
  const linhas = [
    [...COLUNAS_MODELO],
    ["1", "Iniciação e Planejamento", "", "", "03/08/2026", "28/08/2026", "não"],
    ["1.1", "Termo de abertura e kickoff", "gerente@exemplo.com.br", 16, "03/08/2026", "07/08/2026", "não"],
    ["1.2", "Levantamento de requisitos", "analista@exemplo.com.br", 40, "10/08/2026", "21/08/2026", "não"],
    ["1.3", "Marco: escopo aprovado", "diretor@exemplo.com.br", 0, "28/08/2026", "28/08/2026", "sim"],
    ["2", "Desenho da Solução", "", "", "31/08/2026", "25/09/2026", "não"],
    ["2.1", "Mapeamento de processos", "analista@exemplo.com.br", "32,5", "31/08/2026", "11/09/2026", "não"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws["!cols"] = [{ wch: 8 }, { wch: 36 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 8 }];
  const instrucoes = XLSX.utils.aoa_to_sheet([
    ["Como preencher"],
    ["codigo: obrigatório e único (1, 1.1, 1.1.2). O pai (prefixo) precisa existir na EAP ou na planilha."],
    ["titulo: obrigatório. Itens de 1º nível (sem ponto) entram como fase."],
    ["responsavel_email: e-mail de um membro do projeto (opcional)."],
    ["horas_orcadas: número (aceita vírgula). Some só nas atividades; fases somam os filhos."],
    ["inicio / fim: dd/mm/aaaa. O fim não pode ser antes do início."],
    ["marco: sim ou não."],
    ["Códigos que já existem na EAP são ATUALIZADOS; os novos são CRIADOS. Nada é excluído."],
  ]);
  instrucoes["!cols"] = [{ wch: 100 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "EAP");
  XLSX.utils.book_append_sheet(wb, instrucoes, "Instruções");
  XLSX.writeFile(wb, "modelo-eap.xlsx");
}
