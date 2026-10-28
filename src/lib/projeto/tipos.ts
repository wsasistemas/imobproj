// Tipos das tabelas do Supabase usadas pelo portal (espelham supabase/migrations/20261028000002_tabelas.sql)
// e rótulos/cores das situações (Badge variant do design system).

export type Papel = "super_admin" | "diretor" | "gerente" | "usuario_chave" | "analista" | "prestador";
export type PapelMembro = Exclude<Papel, "super_admin">;

export type ProjectStatus = "planejamento" | "execucao" | "homologacao" | "encerrado" | "suspenso";
export type DocumentTipo =
  | "termo_abertura"
  | "escopo"
  | "processo_asis"
  | "processo_tobe"
  | "raci"
  | "plano_comunicacao"
  | "requisitos"
  | "outro";
export type DocumentStatus = "rascunho" | "revisao" | "aprovado" | "vivo";
export type EventTipo = "atividade" | "reuniao" | "os" | "marco";
export type MeetingStatus = "rascunho" | "publicada" | "aprovada";
export type OsStatus = "rascunho" | "agendada" | "em_execucao" | "aguardando_aceite" | "aprovada" | "recusada";
export type OsOrigem = "portal" | "app" | "whatsapp";
export type EvidenceTipo = "foto" | "arquivo" | "print" | "assinatura";
export type ScopeStatus = "pendente" | "aprovada" | "recusada";
export type DependencyTipo = "FS" | "SS" | "FF" | "SF";

export type Projeto = {
  id: string;
  codigo: string;
  nome: string;
  cliente_org_id: string | null;
  executora_org_id: string | null;
  inicio: string | null;
  fim: string | null;
  status: ProjectStatus;
  horas_orcadas: number;
  created_at: string;
  updated_at: string;
};

export type Perfil = { id: string; nome: string; email: string | null; avatar_url: string | null };

export type Membro = {
  id: string;
  project_id: string;
  user_id: string;
  role: PapelMembro;
  ativo: boolean;
  profiles?: Perfil | null;
};

export type Documento = {
  id: string;
  project_id: string;
  tipo: DocumentTipo;
  titulo: string;
  versao: string;
  status: DocumentStatus;
  storage_path: string | null;
  conteudo: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ComentarioDocumento = {
  id: string;
  document_id: string;
  autor_id: string | null;
  texto: string;
  resolvido: boolean;
  created_at: string;
};

export type ItemEap = {
  id: string;
  project_id: string;
  parent_id: string | null;
  codigo: string;
  titulo: string;
  responsavel_id: string | null;
  horas_orcadas: number;
  inicio: string | null;
  fim: string | null;
  ordem: number;
  is_milestone: boolean;
  is_fase: boolean;
};

export type DependenciaEap = {
  id: string;
  predecessora_id: string;
  sucessora_id: string;
  tipo: DependencyTipo;
  lag_dias: number;
};

/** v_wbs_progress: uma linha por item da EAP, somando a subárvore. */
export type ProgressoEap = {
  wbs_item_id: string;
  project_id: string;
  parent_id: string | null;
  fase_id: string | null;
  codigo: string;
  titulo: string;
  nivel: "fase" | "item";
  is_fase: boolean;
  is_milestone: boolean;
  is_folha: boolean;
  responsavel_id: string | null;
  inicio: string | null;
  fim: string | null;
  ordem: number;
  horas_orcadas: number;
  horas_aprovadas: number;
  horas_apontadas: number;
  percentual: number;
};

export type LinhaDeBase = { id: string; project_id: string; numero: number; congelada_em: string; snapshot: unknown };

/** schedule_changes (migration 20261029000300: wbs_item_id opcional; project_id preenchido por trigger). */
export type MudancaCronograma = {
  id: string;
  project_id: string;
  wbs_item_id: string | null;
  calendar_event_id: string | null;
  os_id: string | null;
  meeting_id: string | null;
  autor_id: string | null;
  de: Record<string, unknown>;
  para: Record<string, unknown>;
  justificativa: string;
  created_at: string;
};

export type EventoAgenda = {
  id: string;
  project_id: string;
  tipo: EventTipo;
  wbs_item_id: string | null;
  os_id: string | null;
  meeting_id: string | null;
  titulo: string;
  inicio: string;
  fim: string | null;
  local: string | null;
};

export type Ata = {
  id: string;
  project_id: string;
  numero: number;
  titulo: string;
  data: string;
  inicio: string | null;
  fim: string | null;
  local: string | null;
  status: MeetingStatus;
  redator_id: string | null;
};

export type OrdemServico = {
  id: string;
  project_id: string;
  numero: number;
  wbs_item_id: string | null;
  executor_id: string | null;
  titulo: string;
  descricao: string | null;
  agendada_inicio: string | null;
  agendada_fim: string | null;
  checkin_at: string | null;
  checkout_at: string | null;
  /** Apontadas (entram no avanço físico). */
  horas: number;
  /** Previstas na abertura da OS (migration 20261029000400); não entram no avanço. */
  horas_previstas?: number | null;
  status: OsStatus;
  fora_escopo: boolean;
  aceite_por: string | null;
  aceite_em: string | null;
  aceite_comentario: string | null;
  origem: OsOrigem;
  created_at: string;
  updated_at: string;
};

export type EvidenciaOs = {
  id: string;
  os_id: string;
  tipo: EvidenceTipo;
  storage_path: string;
  captured_at: string;
  lat: number | null;
  lng: number | null;
  origem: OsOrigem;
};

export type HistoricoOs = {
  id: string;
  os_id: string;
  de: OsStatus | null;
  para: OsStatus;
  autor_id: string | null;
  comentario: string | null;
  created_at: string;
};

export type RegistroAuditoria = {
  id: string;
  project_id: string | null;
  tabela: string;
  registro_id: string | null;
  acao: "INSERT" | "UPDATE" | "DELETE";
  autor_id: string | null;
  dados: { old?: Record<string, unknown>; new?: Record<string, unknown>; alterados?: string[] };
  created_at: string;
};

// ---------------------------------------------------------------------------------------------
// Rótulos e cores (variant do <Badge>)
// ---------------------------------------------------------------------------------------------
export type VarianteSituacao = "success" | "warning" | "info" | "danger" | "purple" | "neutral" | "primary";
type Situacao = { label: string; variant: VarianteSituacao };

export const ROTULO_PAPEL: Record<Papel, string> = {
  super_admin: "Super admin",
  diretor: "Diretor",
  gerente: "Gerente de projeto",
  usuario_chave: "Usuário-chave",
  analista: "Analista",
  prestador: "Prestador",
};

export const SITUACAO_PROJETO: Record<ProjectStatus, Situacao> = {
  planejamento: { label: "Planejamento", variant: "purple" },
  execucao: { label: "Em execução", variant: "info" },
  homologacao: { label: "Homologação", variant: "warning" },
  encerrado: { label: "Encerrado", variant: "success" },
  suspenso: { label: "Suspenso", variant: "danger" },
};

export const SITUACAO_DOCUMENTO: Record<DocumentStatus, Situacao> = {
  rascunho: { label: "Rascunho", variant: "neutral" },
  revisao: { label: "Em revisão", variant: "warning" },
  aprovado: { label: "Aprovado", variant: "success" },
  vivo: { label: "Documento vivo", variant: "info" },
};

export const TIPO_DOCUMENTO: Record<DocumentTipo, string> = {
  termo_abertura: "Termo de abertura",
  escopo: "Escopo",
  processo_asis: "Processo AS-IS",
  processo_tobe: "Processo TO-BE",
  raci: "Matriz RACI",
  plano_comunicacao: "Plano de comunicação",
  requisitos: "Requisitos",
  outro: "Outro",
};

export const SITUACAO_OS: Record<OsStatus, Situacao> = {
  rascunho: { label: "Rascunho", variant: "neutral" },
  agendada: { label: "Agendada", variant: "purple" },
  em_execucao: { label: "Em execução", variant: "info" },
  aguardando_aceite: { label: "Aguardando aceite", variant: "warning" },
  aprovada: { label: "Aprovada", variant: "success" },
  recusada: { label: "Recusada", variant: "danger" },
};

export const SITUACAO_ATA: Record<MeetingStatus, Situacao> = {
  rascunho: { label: "Rascunho", variant: "neutral" },
  publicada: { label: "Publicada", variant: "info" },
  aprovada: { label: "Aprovada", variant: "success" },
};

/** Cores do cronograma por tipo (PRD: atividade azul, reunião roxo, OS laranja, marco vermelho). */
export const COR_EVENTO: Record<EventTipo, { label: string; cor: string }> = {
  atividade: { label: "Atividade", cor: "var(--sys-blue)" },
  reuniao: { label: "Reunião", cor: "var(--sys-purple)" },
  os: { label: "Ordem de Serviço", cor: "var(--sys-orange)" },
  marco: { label: "Marco", cor: "var(--sys-red)" },
};
