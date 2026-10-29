import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Configurações gerais (Fase 6) que portal e app precisam saber, via imobproj.fn_config_publica().
// Banco desatualizado (função ausente): devolve os padrões, sem quebrar a tela.

export type ConfigPublica = {
  empresa_nome: string;
  logo_path: string | null;
  fuso: string;
  /** Só para quem vê a medição (diretor, gerente, super admin) ou as configurações. */
  valor_hora_tecnica: number | null;
  exigir_foto_checkout: boolean;
  exigir_assinatura_checkout: boolean;
  aceite_automatico_horas: number;
  app_campo_url: string | null;
};

const PADRAO: ConfigPublica = {
  empresa_nome: "IMOBPROJ",
  logo_path: null,
  fuso: "America/Sao_Paulo",
  valor_hora_tecnica: null,
  exigir_foto_checkout: false,
  exigir_assinatura_checkout: false,
  aceite_automatico_horas: 0,
  app_campo_url: null,
};

export const configPublica = cache(async (): Promise<ConfigPublica> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_config_publica");
  const linha = (Array.isArray(data) ? data[0] : data) as (Omit<ConfigPublica, "valor_hora_tecnica"> & { valor_hora_tecnica: number | string | null }) | null;
  if (error || !linha) return PADRAO;
  return { ...linha, valor_hora_tecnica: linha.valor_hora_tecnica == null ? null : Number(linha.valor_hora_tecnica) };
});
