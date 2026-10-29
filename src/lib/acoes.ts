// Retorno padrão das Server Actions: nunca lançam para a interface; devolvem ok/erro com texto útil.
export type ResultadoAcao<T = void> = { ok: true; dados: T } | { ok: false; erro: string };

export const sucesso = <T,>(dados: T): ResultadoAcao<T> => ({ ok: true, dados });
export const falha = (erro: string): ResultadoAcao<never> => ({ ok: false, erro });

/** Traduz erros do PostgREST/RLS para mensagens em português. */
export function mensagemErroBanco(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return "Erro desconhecido.";
  const m = (error.message ?? "").toLowerCase();
  const ehRls = m.includes("row-level security") || m.includes("permission denied");
  // Os triggers de regra (ex.: aceite de OS) lançam 42501/23514 com a frase já em português: repassa.
  if ((error.code === "42501" || error.code === "23514") && !ehRls && error.message && !m.includes("violates"))
    return error.message;
  if (error.code === "42501" || ehRls) return "Você não tem permissão para esta ação neste projeto.";
  // update/delete com .select().single() que a RLS barrou: nenhuma linha afetada
  if (error.code === "PGRST116") return "Registro não encontrado (ou você não tem permissão para alterá-lo).";
  if (error.code === "23505") return "Já existe um registro com esses dados.";
  if (error.code === "23503") return "Registro vinculado não encontrado (ou em uso por outro registro).";
  if (error.code === "23514") return "Dados inválidos para esta operação.";
  if (error.code === "P0001" && error.message) return error.message; // raise exception dos triggers
  return "Não foi possível concluir a operação. Tente novamente.";
}

/**
 * Banco desatualizado: tabela, coluna ou função que uma migration ainda não criou (ex.: a nuvem antes do
 * scripts/migrar-nuvem.sh). As telas mostram um aviso claro em vez de quebrar.
 */
export function ehBancoDesatualizado(error: unknown) {
  const code = (error as { code?: string } | null)?.code ?? "";
  return ["42P01", "42703", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(code);
}

export const MSG_BANCO_DESATUALIZADO =
  "O banco ainda não recebeu a atualização desta tela. Peça ao administrador para aplicar as migrations pendentes.";
