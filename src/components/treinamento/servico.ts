import { createClient } from "@/lib/supabase/client";
import type {
  MeusTreinamentos, Modulo, ModuloAdmin, PainelTreinamento, ProgressoPerfil, ProgressoPessoa, Resposta, SalvarBalao, SalvarModulo,
} from "./tipos";

// Centro de Treinamento: chamadas às funções imobproj.tr_* (security definer). As regras ficam no banco: trilha pelo
// perfil da pessoa, gabarito conferido no banco e edição só do super admin. O navegador só lê e grava por elas.

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClient().rpc(nome, args);
  if (error) throw new Error(error.message || "Não foi possível falar com o servidor. Tente de novo.");
  return data as T;
}

export const treinamento = {
  /** p_perfil (só super admin): ver como as pessoas daquele perfil veem. */
  meus: (perfil: string | null = null) => rpc<MeusTreinamentos>("tr_meus_treinamentos", { p_perfil: perfil }),
  modulo: (id: number) => rpc<Modulo>("tr_modulo", { p_id: id }),
  salvarProgresso: (moduloId: number, passo: number) => rpc<void>("tr_progresso_salvar", { p_modulo: moduloId, p_passo: passo }),
  responder: (moduloId: number, opcao: number) => rpc<Resposta>("tr_responder", { p_modulo: moduloId, p_opcao: opcao }),

  // Gerenciar tutoriais (super admin)
  painel: () => rpc<PainelTreinamento>("tr_admin_painel"),
  moduloAdmin: (id: number) => rpc<ModuloAdmin>("tr_admin_modulo", { p_id: id }),
  salvarModulo: (p: SalvarModulo) => rpc<number>("tr_modulo_salvar", { p }),
  salvarBalao: (p: SalvarBalao) => rpc<number>("tr_passo_salvar", { p }),
  excluirBalao: (id: number) => rpc<void>("tr_passo_excluir", { p_id: id }),
  reordenarBaloes: (moduloId: number, ids: number[]) => rpc<void>("tr_passos_reordenar", { p_modulo: moduloId, p_ids: ids }),
  salvarPerfisDaTrilha: (trilhaId: number, perfis: string[]) => rpc<void>("tr_trilha_perfis_salvar", { p_trilha: trilhaId, p_perfis: perfis }),
  progressoPorPerfil: () => rpc<ProgressoPerfil[]>("tr_progresso_por_perfil"),
  progressoPessoas: (perfil: string | null) => rpc<ProgressoPessoa[]>("tr_progresso_pessoas", { p_perfil: perfil }),
};
