export type OsStatus = "rascunho" | "agendada" | "em_execucao" | "aguardando_aceite" | "aprovada" | "recusada";
export type EvidenceTipo = "foto" | "arquivo" | "print" | "assinatura";
export type Papel = "diretor" | "gerente" | "usuario_chave" | "analista" | "prestador";

export type Os = {
  id: string;
  project_id: string;
  /** 0 enquanto a OS aberta no aparelho ainda não subiu (o servidor dá o número). */
  numero: number;
  titulo: string;
  descricao: string | null;
  status: OsStatus;
  agendada_inicio: string | null;
  agendada_fim: string | null;
  checkin_at: string | null;
  checkout_at: string | null;
  horas: number;
  fora_escopo: boolean;
  relato: string | null;
  materiais?: string | null;
  tipo?: string | null;
  aceite_comentario: string | null;
  executor_id: string | null;
  projeto: { codigo: string; nome: string } | null;
  executor: { nome: string } | null;
  local: string | null;
};

export type Evidencia = {
  id: string;
  tipo: EvidenceTipo;
  storage_path: string;
  captured_at: string;
  lat: number | null;
  lng: number | null;
  descricao: string | null;
};

export const SITUACAO: Record<OsStatus, { rotulo: string; fundo: string; texto: string }> = {
  rascunho: { rotulo: "Rascunho", fundo: "#F3F4F6", texto: "#374151" },
  agendada: { rotulo: "Agendada", fundo: "#E6EEFD", texto: "#1D4ED8" },
  em_execucao: { rotulo: "Em execução", fundo: "#FEF3C7", texto: "#92400E" },
  aguardando_aceite: { rotulo: "Aguardando aceite", fundo: "#F1EAFD", texto: "#6D28D9" },
  aprovada: { rotulo: "Aprovada", fundo: "#E7F5EC", texto: "#166534" },
  recusada: { rotulo: "Recusada", fundo: "#FDECEC", texto: "#B91C1C" },
};

export const ROTULO_EVIDENCIA: Record<EvidenceTipo, string> = {
  foto: "Foto",
  arquivo: "Arquivo",
  print: "Print",
  assinatura: "Assinatura",
};

export const ROTULO_TIPO_OS: Record<string, string> = {
  corretiva: "Corretiva",
  preventiva: "Preventiva",
  implantacao: "Implantação",
  visita: "Visita",
};

/** "OS 1046" ou "OS nova" enquanto aguarda o envio. */
export const rotuloOs = (os: Pick<Os, "numero">) => (os.numero > 0 ? `OS ${os.numero}` : "OS nova");
