import type { Papel } from "./tipos";

// O que cada papel pode fazer (PRD, PARTE A), espelhando as políticas RLS de
// supabase/migrations/20261028000005_rls.sql. Usado em dois lugares:
//  - no servidor (exigirPermissao em Server Actions) — a validação que vale, junto com a RLS;
//  - na interface, só para esconder botões que o papel não pode usar.
// super_admin pode tudo.

export const PERMISSOES = {
  projeto_criar: [],
  projeto_editar: ["gerente"],
  equipe_gerir: [],
  documento_editar: ["gerente"],
  documento_comentar: ["diretor", "gerente", "usuario_chave"],
  eap_editar: ["gerente"],
  cronograma_editar: ["gerente"],
  linha_base_criar: ["gerente"],
  os_criar: ["gerente"],
  os_editar: ["gerente"],
  os_aceitar: ["diretor", "usuario_chave"],
  os_fora_escopo: ["gerente", "diretor", "usuario_chave"],
  os_apontar_propria: ["analista", "prestador"],
  medicao_ver: ["diretor", "gerente"],
  ata_redigir: ["gerente"],
  ata_ciencia: ["diretor", "usuario_chave"],
  whatsapp_grupos_gerir: ["gerente"],
  whatsapp_responder: ["diretor", "gerente", "usuario_chave", "analista"],
  openwa_configurar: [],
  configuracoes_gerir: [],
  auditoria_ver: ["diretor", "gerente"],
} as const satisfies Record<string, readonly Exclude<Papel, "super_admin">[]>;

export type Acao = keyof typeof PERMISSOES;

export function pode(papel: Papel | null | undefined, acao: Acao): boolean {
  if (!papel) return false;
  if (papel === "super_admin") return true;
  return (PERMISSOES[acao] as readonly string[]).includes(papel);
}

/** Papéis que enxergam o projeto inteiro (o prestador só vê as próprias OS). */
export function veProjetoInteiro(papel: Papel | null | undefined) {
  return !!papel && papel !== "prestador";
}
