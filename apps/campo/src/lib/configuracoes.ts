import { useEffect, useState } from "react";
import { lerCache, salvarCache, useFila } from "./fila";
import { supabase } from "./supabase";

// Regras de check-out definidas em Configurações gerais do portal (Fase 6), via imobproj.fn_config_publica().
// Ficam em cache para valer também sem rede. O servidor confere de novo ao receber o check-out.

export type RegrasCheckout = { exigirFoto: boolean; exigirAssinatura: boolean };

const CHAVE = "config:regras-checkout";
const PADRAO: RegrasCheckout = { exigirFoto: false, exigirAssinatura: false };

export function useRegrasCheckout(): RegrasCheckout {
  const { online } = useFila();
  const [regras, setRegras] = useState<RegrasCheckout>(PADRAO);

  useEffect(() => {
    let vivo = true;
    void lerCache<RegrasCheckout>(CHAVE).then((c) => {
      if (vivo && c) setRegras(c.valor);
    });
    if (online) {
      void supabase.rpc("fn_config_publica").then(({ data, error }) => {
        // Servidor sem a função (antes da migration da Fase 6): mantém o padrão, nada é exigido.
        if (!vivo || error) return;
        const linha = (Array.isArray(data) ? data[0] : data) as { exigir_foto_checkout?: boolean; exigir_assinatura_checkout?: boolean } | null;
        const novas = { exigirFoto: Boolean(linha?.exigir_foto_checkout), exigirAssinatura: Boolean(linha?.exigir_assinatura_checkout) };
        setRegras(novas);
        void salvarCache(CHAVE, novas);
      });
    }
    return () => {
      vivo = false;
    };
  }, [online]);

  return regras;
}
