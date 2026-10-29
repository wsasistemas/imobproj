import type { Metadata } from "next";
import { Setores } from "@/components/configuracoes/setores";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { SemAcesso } from "@/components/shell/sem-acesso";
import { pode } from "@/lib/perfil-acesso";

export const metadata: Metadata = { title: "Setores e números" };

// Configurações › Setores e números (Fase 3). Consulta quem tem "ver" em config_setores; grava conforme o perfil (RLS setores_*).
export default async function SetoresPage() {
  const [ver, criar, editar, excluir] = await Promise.all([
    pode("config_setores"),
    pode("config_setores", "criar"),
    pode("config_setores", "editar"),
    pode("config_setores", "excluir"),
  ]);
  if (!ver) return <SemAcesso menu="config_setores" />;
  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Configurações" }, { label: "Setores e números" }]}
        titulo="Setores e números"
        subtitulo="Setores de atendimento, os números de WhatsApp (OpenWA) de cada um e o gestor."
      />
      <Setores permissoes={{ criar, editar, excluir }} />
    </>
  );
}
