// Formato do processo (AS-IS / TO-BE) guardado em documents.conteudo.
//
//   {
//     formato: 2,
//     etapas:  [{ id, titulo, responsavel }],             // em sequência
//     decisao: { aposEtapaId, pergunta, sim, nao } | null // UM ponto de decisão; sim/nao = id da etapa ou null (fim)
//     versoes: [...]                                      // histórico de arquivos (mantido intacto ao salvar)
//   }
//
// O seed antigo usa { etapas: [{ ordem, titulo, decisao?: true, sim?: ordem, nao?: ordem }] }; normalizarProcesso
// converte esse formato na leitura (a etapa marcada como decisão vira o ponto de decisão).
import { z } from "zod";

export type EtapaProcesso = { id: string; titulo: string; responsavel: string };
export type DecisaoProcesso = { aposEtapaId: string; pergunta: string; sim: string | null; nao: string | null };
export type Processo = { etapas: EtapaProcesso[]; decisao: DecisaoProcesso | null };

export const esquemaEtapa = z.object({
  id: z.string().min(1).max(40),
  titulo: z.string().trim().min(1, "Toda etapa precisa de um título.").max(200),
  responsavel: z.string().trim().max(120),
});

export const esquemaDecisao = z.object({
  aposEtapaId: z.string().min(1).max(40),
  pergunta: z.string().trim().min(1, "Escreva a pergunta da decisão.").max(200),
  sim: z.string().max(40).nullable(),
  nao: z.string().max(40).nullable(),
});

export const esquemaProcesso = z
  .object({
    etapas: z.array(esquemaEtapa).max(100),
    decisao: esquemaDecisao.nullable(),
  })
  .superRefine((p, ctx) => {
    const ids = new Set(p.etapas.map((e) => e.id));
    if (ids.size !== p.etapas.length) ctx.addIssue({ code: "custom", message: "Etapas com identificador repetido." });
    if (p.decisao) {
      const { aposEtapaId, sim, nao } = p.decisao;
      if (!ids.has(aposEtapaId)) ctx.addIssue({ code: "custom", message: "A decisão precisa vir depois de uma etapa existente." });
      if ((sim && !ids.has(sim)) || (nao && !ids.has(nao)))
        ctx.addIssue({ code: "custom", message: "Os caminhos Sim/Não precisam apontar para etapas existentes." });
    }
  });

export function novoIdEtapa() {
  return `e${Math.random().toString(36).slice(2, 10)}`;
}

type EtapaAntiga = { ordem?: number; titulo?: string; responsavel?: string; decisao?: boolean; sim?: number; nao?: number };

/** Lê documents.conteudo (formato novo ou o do seed) e devolve um Processo válido. */
export function normalizarProcesso(conteudo: Record<string, unknown> | null | undefined): Processo {
  const etapasBrutas = Array.isArray(conteudo?.etapas) ? (conteudo.etapas as unknown[]) : [];

  // Formato novo: etapas com id
  if (etapasBrutas.every((e) => typeof (e as { id?: unknown })?.id === "string")) {
    const etapas = etapasBrutas.map((e) => {
      const x = e as Partial<EtapaProcesso>;
      return { id: String(x.id), titulo: String(x.titulo ?? ""), responsavel: String(x.responsavel ?? "") };
    });
    const ids = new Set(etapas.map((e) => e.id));
    const d = conteudo?.decisao as Partial<DecisaoProcesso> | null | undefined;
    const decisao =
      d && typeof d.aposEtapaId === "string" && ids.has(d.aposEtapaId)
        ? {
            aposEtapaId: d.aposEtapaId,
            pergunta: String(d.pergunta ?? ""),
            sim: d.sim && ids.has(d.sim) ? d.sim : null,
            nao: d.nao && ids.has(d.nao) ? d.nao : null,
          }
        : null;
    return { etapas, decisao };
  }

  // Formato do seed: { ordem, titulo, decisao, sim, nao }
  const antigas = (etapasBrutas as EtapaAntiga[]).slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const idDe = (ordem: number | undefined) => (ordem === undefined ? null : `e${ordem}`);
  const etapas: EtapaProcesso[] = [];
  let decisao: DecisaoProcesso | null = null;
  for (const e of antigas) {
    if (e.decisao && !decisao && etapas.length > 0) {
      decisao = { aposEtapaId: etapas[etapas.length - 1].id, pergunta: e.titulo ?? "", sim: idDe(e.sim), nao: idDe(e.nao) };
      continue;
    }
    etapas.push({ id: idDe(e.ordem) ?? novoIdEtapa(), titulo: e.titulo ?? "", responsavel: e.responsavel ?? "" });
  }
  if (decisao) {
    const ids = new Set(etapas.map((e) => e.id));
    if (decisao.sim && !ids.has(decisao.sim)) decisao.sim = null;
    if (decisao.nao && !ids.has(decisao.nao)) decisao.nao = null;
  }
  return { etapas, decisao };
}
