import type { Metadata } from "next";
import { Monitor } from "@/components/atendimento/monitor";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { SemAcesso } from "@/components/shell/sem-acesso";
import { pode } from "@/lib/perfil-acesso";
import { usuarioLogado } from "@/lib/sessao";

export const metadata: Metadata = { title: "Monitor de atendimento" };

// Atendimento › Monitor (Fase 4). Precisa de "ver" em atendimento_monitor; os setores visíveis vêm do banco
// (imobproj.fn_monitor_setores: super admin e Gerente veem todos; gestor e equipe, só os setores deles).
export default async function MonitorPage() {
  const [ver, atender, eu] = await Promise.all([pode("atendimento_monitor"), pode("atendimento_monitor", "editar"), usuarioLogado()]);
  if (!ver) return <SemAcesso menu="atendimento_monitor" />;
  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Atendimento" }, { label: "Monitor de atendimento" }]}
        titulo="Monitor de atendimento"
        subtitulo="Indicadores, atendentes e conversas em tempo real. Gestores veem os setores deles; o super admin vê todos."
      />
      <Monitor userId={eu.id} podeAtender={atender} />
    </>
  );
}
