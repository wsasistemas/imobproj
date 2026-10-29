// Centro de Treinamento (Fase 8): tipos das funções imobproj.tr_* (migration 20261031000700).
// Copiado do Portal Atendimento e adaptado: a trilha vem do perfil de acesso, não do setor.

export type Papel = "gerencia" | "campo" | "atende" | "cliente";
export type PosicaoBalao = "auto" | "direita" | "esquerda" | "abaixo" | "acima";
export type StatusModulo = "rascunho" | "publicado";
/** Contorno do elemento explicado: [x, y, largura, altura] em % da tela capturada. */
export type Alvo = [number, number, number, number];

export interface Trilha {
  id: number;
  codigo: string;
  nome: string;
  descricao: string;
  padrao: boolean;
}

export interface ModuloResumo {
  id: number;
  codigo: string;
  titulo: string;
  descricao: string;
  papel: Papel;
  minutos: number;
  rotaDemo: string;
  celular: boolean;
  status: StatusModulo;
  /** Quantidade de balões. */
  passos: number;
  /** Tela do 1º balão, usada como capa do cartão. */
  capa: string | null;
  passoAtual: number;
  concluidoEm: string | null;
  iniciado: boolean;
}

export interface Balao {
  id: number;
  ordem: number;
  tela: string;
  titulo: string;
  texto: string;
  alvo: Alvo;
  posicao: PosicaoBalao;
}

/** O módulo para o tour: sem o gabarito. */
export interface Modulo extends ModuloResumo {
  pergunta: string;
  opcoes: string[];
  baloes: Balao[];
}

export interface MeusTreinamentos {
  perfil: { chave: string; nome: string } | null;
  /** A pessoa ainda não tem perfil de acesso: vê a trilha padrão. */
  semPerfil: boolean;
  trilha: Trilha | null;
  modulos: ModuloResumo[];
}

export interface Resposta {
  certo: boolean;
  concluidoEm: string | null;
}

// ---------- Gerenciar tutoriais (super admin) ----------

export interface ModuloAdmin extends Modulo {
  resposta: number;
  trilhas: number[];
}

export interface TrilhaAdmin extends Trilha {
  perfis: string[];
  modulos: number[];
}

export interface PerfilAcesso {
  chave: string;
  nome: string;
}

export interface PainelTreinamento {
  trilhas: TrilhaAdmin[];
  modulos: (ModuloResumo & { concluiram: number; publico: number })[];
  perfis: PerfilAcesso[];
}

export interface ProgressoPerfil {
  perfil: string | null;
  nome: string;
  trilha: string;
  pessoas: number;
  concluiram: number;
  andamento: number;
  naoComecaram: number;
}

export interface ProgressoPessoa {
  usuarioId: string;
  nome: string;
  modulos: { id: number; titulo: string; passoAtual: number; passos: number; concluidoEm: string | null }[];
}

export interface SalvarModulo {
  id?: number;
  titulo: string;
  descricao: string;
  papel: Papel;
  minutos: number;
  rotaDemo: string;
  celular: boolean;
  pergunta: string;
  opcoes: string[];
  resposta: number;
  status: StatusModulo;
  trilhas: number[];
}

export interface SalvarBalao {
  id?: number;
  moduloId: number;
  tela: string;
  titulo: string;
  texto: string;
  alvo: Alvo;
  posicao: PosicaoBalao;
}

// ---------- Constantes de tela ----------

export const PAPEIS: Record<Papel, string> = {
  gerencia: "Quem gerencia",
  campo: "Quem vai a campo",
  atende: "Quem atende",
  cliente: "Quem aprova (cliente)",
};

/** Telas capturadas por scripts/capturar-treinamento.mjs (public/treinamento/<tela>.webp). */
export const TELAS = [
  "g-visao", "g-docs", "g-eap", "g-gantt", "g-os", "g-os-det", "g-atas", "g-medicao", "g-clientes", "g-usuarios",
  "a-monitor", "a-fila", "a-transferir", "a-conversas", "a-conversa",
  "c-visao", "c-os", "c-os-aceite", "c-atas",
  "app-login", "app-hoje", "app-os", "app-assinatura", "app-perfil", "app-nova",
] as const;

/** Progresso do cartão: concluído = 100%; senão, o passo em que parou. */
export const percentual = (m: Pick<ModuloResumo, "concluidoEm" | "passoAtual" | "passos">) =>
  m.concluidoEm ? 100 : m.passos > 0 ? Math.round((Math.min(m.passoAtual, m.passos) / m.passos) * 100) : 0;

export const telaUrl = (tela: string) => `/treinamento/${tela}.webp`;
export const ehTelaCelular = (tela: string) => tela.startsWith("app-");

/**
 * "Praticar na demonstração" (D2): a demo publicada (NEXT_PUBLIC_DEMO_URL). Na própria demo, o endereço relativo.
 * Sem nenhum dos dois, o botão não aparece.
 */
export const DEMO_URL: string | null =
  process.env.NEXT_PUBLIC_DEMO_URL?.replace(/\/$/, "") || (process.env.NEXT_PUBLIC_MODO === "demo" ? "" : null);

/**
 * Link da demo já na tela do módulo. Demo externa: passa pelo "Entrar como" e volta para a rota.
 * Dentro da própria demo (já logado): vai direto para a rota.
 */
export const linkPraticar = (rotaDemo: string) => {
  const rota = rotaDemo || "/";
  if (DEMO_URL === null) return null;
  return DEMO_URL === "" ? rota : `${DEMO_URL}/login?voltar=${encodeURIComponent(rota)}`;
};

/** Até 220 caracteres cabem no balão sem rolar (aviso do editor). */
export const TEXTO_RECOMENDADO = 220;

/** Rota de Meus treinamentos; o tour abre em <ROTA_MEUS>/<id do módulo>. */
export const ROTA_MEUS = "/treinamento/meus";
