import { PERMISSOES, type Acao } from "@/lib/projeto/permissoes";
import type { Papel, PapelMembro } from "@/lib/projeto/tipos";

// Linhas da matriz de permissões (somente leitura). A fonte é PERMISSOES (src/lib/projeto/permissoes.ts);
// as ações das atas, do WhatsApp e da administração que ainda não existem lá ficam descritas aqui, espelhando
// a PARTE A do PRD e as políticas RLS de 20261028000005_rls.sql. Quando entrarem em PERMISSOES, troque
// `papeis: [...]` por `acao: "<chave>"`.

export type LinhaMatriz = { id: string; rotulo: string; detalhe?: string } & (
  | { acao: Acao }
  | { papeis: readonly PapelMembro[] }
);
export type GrupoMatriz = { id: string; titulo: string; linhas: LinhaMatriz[] };

const TODOS: readonly PapelMembro[] = ["diretor", "gerente", "usuario_chave", "analista", "prestador"];
const VEEM_PROJETO: readonly PapelMembro[] = ["diretor", "gerente", "usuario_chave", "analista"];

export const GRUPOS_MATRIZ: GrupoMatriz[] = [
  {
    id: "projeto",
    titulo: "Projeto",
    linhas: [
      {
        id: "projeto_ver",
        rotulo: "Ver o projeto inteiro",
        detalhe: "O prestador vê só o cabeçalho do projeto e as OS atribuídas a ele.",
        papeis: VEEM_PROJETO,
      },
      { id: "projeto_criar", rotulo: "Criar projeto", acao: "projeto_criar" },
      { id: "projeto_editar", rotulo: "Editar dados do projeto", acao: "projeto_editar" },
      { id: "auditoria_ver", rotulo: "Ver o histórico de alterações (auditoria)", acao: "auditoria_ver" },
    ],
  },
  {
    id: "documentacao",
    titulo: "Documentação e EAP",
    linhas: [
      { id: "documento_editar", rotulo: "Criar, editar e aprovar documentos", acao: "documento_editar" },
      { id: "documento_comentar", rotulo: "Comentar documentos e processos", acao: "documento_comentar" },
      { id: "eap_editar", rotulo: "Manter a EAP (inclusive importar .xlsx)", acao: "eap_editar" },
    ],
  },
  {
    id: "cronograma",
    titulo: "Cronograma",
    linhas: [
      { id: "cronograma_editar", rotulo: "Alterar datas e dependências do cronograma", acao: "cronograma_editar" },
      { id: "linha_base_criar", rotulo: "Criar linha de base", acao: "linha_base_criar" },
    ],
  },
  {
    id: "os",
    titulo: "Ordens de Serviço",
    linhas: [
      { id: "os_criar", rotulo: "Abrir OS", acao: "os_criar" },
      { id: "os_editar", rotulo: "Editar e agendar OS", acao: "os_editar" },
      { id: "os_apontar_propria", rotulo: "Executar e apontar as próprias OS", acao: "os_apontar_propria" },
      { id: "os_aceitar", rotulo: "Aprovar ou recusar OS", acao: "os_aceitar" },
      { id: "os_fora_escopo", rotulo: "Marcar OS fora do escopo", acao: "os_fora_escopo" },
      { id: "medicao_ver", rotulo: "Ver a medição do mês", acao: "medicao_ver" },
    ],
  },
  {
    id: "atas",
    titulo: "Atas e WhatsApp",
    linhas: [
      { id: "ata_redigir", rotulo: "Redigir e publicar atas", acao: "ata_redigir" },
      // Ainda fora de PERMISSOES (sugestão: ata_ciencia)
      { id: "ata_ciencia", rotulo: "Dar ciência em atas", papeis: ["diretor", "usuario_chave"] },
      // Ainda fora de PERMISSOES (sugestão: whatsapp_grupos_gerir) — RLS wa_groups_write / wa_group_members_write
      { id: "whatsapp_grupos_gerir", rotulo: "Administrar grupos de WhatsApp", papeis: ["gerente"] },
      // Ainda fora de PERMISSOES (sugestão: whatsapp_responder) — RLS wa_messages_insert
      {
        id: "whatsapp_responder",
        rotulo: "Ver as conversas e responder pelo portal",
        papeis: VEEM_PROJETO,
      },
    ],
  },
  {
    id: "administracao",
    titulo: "Administração",
    linhas: [
      { id: "equipe_gerir", rotulo: "Gerir equipe e papéis dos projetos", acao: "equipe_gerir" },
      // Ainda fora de PERMISSOES (sugestão: openwa_configurar) — RLS wa_sessions_super_admin
      { id: "openwa_configurar", rotulo: "Configurar o OpenWA e as sessões", papeis: [] },
      // Ainda fora de PERMISSOES (sugestão: configuracoes_gerir)
      { id: "configuracoes_gerir", rotulo: "Alterar as configurações gerais", papeis: [] },
    ],
  },
];

/** Colunas da matriz, na ordem da PARTE A. */
export const PAPEIS_MATRIZ: Papel[] = ["super_admin", ...TODOS];

export function papelPode(linha: LinhaMatriz, papel: Papel): boolean {
  if (papel === "super_admin") return true;
  const papeis = "acao" in linha ? (PERMISSOES[linha.acao] as readonly string[]) : linha.papeis;
  return papeis.includes(papel);
}

/** Resumo de cada papel (PRD, PARTE A). */
export const RESUMO_PAPEL: Record<Papel, string> = {
  super_admin: "Tudo, inclusive configurar o OpenWA, os níveis de acesso e os projetos.",
  diretor: "Vê avanço, custos e marcos; dá ciência em atas; aceita OS.",
  gerente: "Mantém EAP, cronograma e linha de base; abre OS; redige atas; administra grupos.",
  usuario_chave: "Comenta documentos e processos; aceita ou recusa OS; dá ciência em atas.",
  analista: "Executa e aponta as próprias OS; vê as próprias atividades e horas.",
  prestador: "Igual ao analista, restrito às OS atribuídas a ele.",
};
