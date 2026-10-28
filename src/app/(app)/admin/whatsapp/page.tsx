import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { PainelOpenwa } from "@/components/whatsapp-admin/painel-openwa";
import { ehSuperAdmin } from "@/lib/projeto/servidor";
import { SUPABASE_URL } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "WhatsApp OpenWA" };

/** URL das Edge Functions como o Postgres (pg_net) enxerga: no Supabase local, o gateway interno "kong". */
function urlFuncoesParaOBanco(url: string): string {
  try {
    const u = new URL(url);
    if (["127.0.0.1", "localhost", "0.0.0.0"].includes(u.hostname)) return "http://kong:8000/functions/v1";
  } catch {
    /* URL inválida: devolve a padrão abaixo */
  }
  return `${url.replace(/\/+$/, "")}/functions/v1`;
}

// Administração › WhatsApp OpenWA. Só o super admin (configuração, segredos e sessões são RLS só super_admin);
// os demais papéis recebem 404 — o status da sessão para eles fica no selo da tela de Conversas (fn_wa_status).
export default async function WhatsappOpenwaPage() {
  if (!(await ehSuperAdmin())) notFound();
  const base = SUPABASE_URL.replace(/\/+$/, "");

  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Administração" }, { label: "WhatsApp OpenWA" }]}
        titulo="WhatsApp OpenWA"
        subtitulo="Conexão com o OpenWA, webhook, fila de reenvio e sessões por projeto."
      />
      <PainelOpenwa webhookUrl={`${base}/functions/v1/openwa-webhook`} funcoesUrlSugerida={urlFuncoesParaOBanco(base)} />
    </>
  );
}
