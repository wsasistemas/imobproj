import type { Metadata } from "next";
import { AppCampo } from "@/components/configuracoes/app-campo";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { SemAcesso } from "@/components/shell/sem-acesso";
import { pode } from "@/lib/perfil-acesso";

export const metadata: Metadata = { title: "App de OS" };

// Configurações › App de OS (Fase 5): indicadores e aparelhos do app de campo. Só leitura (app_painel / app_aparelhos_lista).
export default async function AppCampoPage() {
  if (!(await pode("admin_app_campo"))) return <SemAcesso menu="admin_app_campo" />;
  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Configurações" }, { label: "App de OS" }]}
        titulo="App de OS"
        subtitulo="Aplicativo para registrar e executar Ordens de Serviço no celular (Android e iOS)."
      />
      <AppCampo />
    </>
  );
}
