"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Organizacao = { id: string; nome: string; tipo: "executora" | "cliente" | "prestador" };

/** Organizações (leitura liberada a autenticados pela RLS). */
export function useOrganizacoes() {
  return useQuery({
    queryKey: ["organizacoes"],
    queryFn: async (): Promise<Organizacao[]> => {
      const { data, error } = await createClient().from("organizations").select("id, nome, tipo").order("nome");
      if (error) throw error;
      return (data ?? []) as Organizacao[];
    },
    staleTime: 5 * 60_000,
  });
}
