import {
  SITUACAO_ATA,
  SITUACAO_DOCUMENTO,
  SITUACAO_OS,
  SITUACAO_PROJETO,
  type DocumentStatus,
  type MeetingStatus,
  type OsStatus,
  type ProjectStatus,
  type RegistroAuditoria,
} from "@/lib/projeto/tipos";
import { dataCurta } from "../formatos";

// Frase legível para cada evento do audit_log (tabelas auditadas: projects, documents, wbs_items,
// meetings, service_orders). O ator ("Fernanda Rocha") é prefixado pela interface; aqui vem só o verbo.

type Linha = Record<string, unknown>;

const s = (v: unknown) => (v == null ? "" : String(v));

const ROTULO_CAMPO: Record<string, string> = {
  titulo: "título",
  descricao: "descrição",
  nome: "nome",
  codigo: "código",
  inicio: "início",
  fim: "fim",
  horas: "horas",
  horas_orcadas: "horas orçadas",
  responsavel_id: "responsável",
  executor_id: "executor",
  agendada_inicio: "agenda",
  agendada_fim: "agenda",
  wbs_item_id: "item da EAP",
  status: "situação",
  versao: "versão",
  conteudo: "conteúdo",
  storage_path: "arquivo",
  local: "local",
  data: "data",
  pauta: "pauta",
  decisoes: "decisões",
  cliente_org_id: "cliente",
  executora_org_id: "executora",
  parent_id: "posição na EAP",
  ordem: "ordem",
  is_milestone: "marco",
  is_fase: "fase",
  checkin_at: "check-in",
  checkout_at: "check-out",
};

function campos(alterados: string[] | undefined): string {
  const nomes = [...new Set((alterados ?? []).map((c) => ROTULO_CAMPO[c]).filter(Boolean))];
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return ` (${nomes[0]})`;
  return ` (${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)})`;
}

export function fraseAuditoria(r: RegistroAuditoria): string {
  const novo = (r.dados?.new ?? {}) as Linha;
  const velho = (r.dados?.old ?? {}) as Linha;
  const atual = r.acao === "DELETE" ? velho : novo;
  const alterados = r.dados?.alterados ?? [];
  const mudou = (c: string) => alterados.includes(c);

  switch (r.tabela) {
    case "service_orders": {
      const os = `a OS #${s(atual.numero)}`;
      if (r.acao === "INSERT") return `abriu ${os} · ${s(atual.titulo)}`;
      if (r.acao === "DELETE") return `excluiu ${os} · ${s(atual.titulo)}`;
      if (mudou("fora_escopo") && novo.fora_escopo === true) return `marcou ${os} como fora do escopo`;
      if (mudou("status")) {
        const para = novo.status as OsStatus;
        if (para === "aprovada") return `aprovou ${os}`;
        if (para === "recusada") return `recusou ${os}`;
        if (para === "em_execucao" && velho.status !== "aguardando_aceite") return `fez o check-in da OS #${s(atual.numero)}`;
        if (para === "aguardando_aceite") return `alterou ${os} para Aguardando aceite`;
        return `alterou ${os} para ${SITUACAO_OS[para]?.label ?? s(para)}`;
      }
      if (mudou("horas")) return `apontou ${s(novo.horas)} h na OS #${s(atual.numero)}`;
      return `editou ${os}${campos(alterados)}`;
    }

    case "documents": {
      const doc = `«${s(atual.titulo)}»`;
      if (r.acao === "INSERT") return `adicionou o documento ${doc}`;
      if (r.acao === "DELETE") return `excluiu o documento ${doc}`;
      if (mudou("status")) {
        const para = novo.status as DocumentStatus;
        if (para === "aprovado") return `aprovou o documento ${doc}`;
        return `moveu o documento ${doc} para ${SITUACAO_DOCUMENTO[para]?.label ?? s(para)}`;
      }
      if (mudou("versao")) return `publicou a versão ${s(novo.versao)} de ${doc}`;
      return `editou o documento ${doc}${campos(alterados)}`;
    }

    case "wbs_items": {
      const item = `«${s(atual.codigo)} ${s(atual.titulo)}»`;
      const tipo = atual.is_milestone ? "o marco" : atual.is_fase ? "a fase" : "o item";
      if (r.acao === "INSERT") return `incluiu ${tipo} ${item} na EAP`;
      if (r.acao === "DELETE") return `removeu ${tipo} ${item} da EAP`;
      if (mudou("inicio") || mudou("fim"))
        return `remarcou ${tipo} ${item} para ${dataCurta(s(novo.inicio) || null)} a ${dataCurta(s(novo.fim) || null)}`;
      if (mudou("horas_orcadas")) return `alterou as horas orçadas de ${item} para ${s(novo.horas_orcadas)} h`;
      return `editou ${tipo} ${item}${campos(alterados)}`;
    }

    case "meetings": {
      const ata = `a ata nº ${s(atual.numero)} · ${s(atual.titulo)}`;
      if (r.acao === "INSERT") return `criou ${ata}`;
      if (r.acao === "DELETE") return `excluiu ${ata}`;
      if (mudou("status")) {
        const para = novo.status as MeetingStatus;
        if (para === "publicada") return `publicou ${ata}`;
        if (para === "aprovada") return `aprovou ${ata}`;
        return `alterou ${ata} para ${SITUACAO_ATA[para]?.label ?? s(para)}`;
      }
      return `editou ${ata}${campos(alterados)}`;
    }

    case "projects": {
      if (r.acao === "INSERT") return `criou o projeto ${s(atual.codigo)} · ${s(atual.nome)}`;
      if (r.acao === "DELETE") return `excluiu o projeto ${s(atual.codigo)}`;
      if (mudou("status"))
        return `mudou a situação do projeto para ${SITUACAO_PROJETO[novo.status as ProjectStatus]?.label ?? s(novo.status)}`;
      return `editou os dados do projeto${campos(alterados)}`;
    }

    default: {
      const verbo = r.acao === "INSERT" ? "incluiu" : r.acao === "DELETE" ? "excluiu" : "alterou";
      return `${verbo} um registro em ${r.tabela}`;
    }
  }
}
