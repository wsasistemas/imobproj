"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ResultadoAcao } from "@/lib/acoes";
import { chavesAtas } from "./dados";

/**
 * Mutação padrão do módulo: chama a Server Action, mostra o toast e invalida as consultas de atas do projeto.
 * `mensagem` pode ser texto fixo, função do retorno ou null (sem toast de sucesso).
 */
export function useAcaoAta<E, R>(
  projetoId: string,
  acao: (entrada: E) => Promise<ResultadoAcao<R>>,
  mensagem: string | ((r: R, entrada: E) => string) | null,
  aoConcluir?: (r: R, entrada: E) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: E) => {
      const r = await acao(entrada);
      if (!r.ok) throw new Error(r.erro);
      return r.dados;
    },
    onSuccess: (r, entrada) => {
      if (mensagem) toast.success(typeof mensagem === "function" ? mensagem(r, entrada) : mensagem);
      queryClient.invalidateQueries({ queryKey: chavesAtas.raiz(projetoId) });
      aoConcluir?.(r, entrada);
    },
    onError: (e) => {
      toast.error(e.message);
      queryClient.invalidateQueries({ queryKey: chavesAtas.raiz(projetoId) });
    },
  });
}
