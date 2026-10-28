// Tipos da tela Administração › WhatsApp OpenWA (compartilhados entre cliente e Server Actions).

export type SessaoOpenwaTeste = { id: string; nome: string | null; status: string | null; telefone: string | null };

export type ResultadoTeste = {
  ok: boolean;
  latenciaMs: number;
  em: string;
  erro: string | null;
  sessoes: SessaoOpenwaTeste[];
};

export type ConfigOpenwaTela = {
  ativo: boolean;
  url: string | null;
  api_key_atualizada_em: string | null;
  webhook_secret_gerado_em: string | null;
  ultimo_teste: ResultadoTeste | null;
  updated_at: string;
};

export type SegredoStatus = { nome: string; atualizado_em: string };

export type StatusSessao = "conectado" | "desconectado" | "erro";

export type SessaoLinha = {
  id: string;
  project_id: string;
  numero: string;
  openwa_url: string;
  openwa_session_id: string | null;
  status: StatusSessao;
  last_heartbeat: string | null;
  projects: { codigo: string; nome: string } | null;
};

export type GrupoLinha = {
  id: string;
  project_id: string;
  session_id: string | null;
  equipe: string;
  nome: string;
  wa_group_id: string | null;
  ativo: boolean;
  auto_evidencia: boolean;
  auto_os: boolean;
  wa_group_members: { count: number }[];
};

export type ResultadoGrupo = {
  waGroupId: string | null;
  adicionados: string[];
  removidos: string[];
  promovidos: string[];
};
