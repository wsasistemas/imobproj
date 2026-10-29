import type { Metadata } from "next";
import { ConfiguracoesGerais } from "@/components/configuracoes/gerais";
import { ABAS_CONFIG, type AbaConfig } from "@/components/configuracoes/esquemas-gerais";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { SemAcesso } from "@/components/shell/sem-acesso";
import { pode } from "@/lib/perfil-acesso";

export const metadata: Metadata = { title: "Configurações gerais" };

const ROTULOS: Record<AbaConfig, string> = {
  empresa: "Empresa",
  os: "Ordens de Serviço",
  notificacoes: "Notificações",
  integracoes: "Integrações",
};

type Props = { searchParams: Promise<{ aba?: string }> };

// Configurações › Configurações gerais (Fase 6). Consulta quem tem "ver" em config_gerais; grava quem tem "editar".
export default async function ConfiguracoesGeraisPage({ searchParams }: Props) {
  const [{ aba }, ver, editar] = await Promise.all([searchParams, pode("config_gerais"), pode("config_gerais", "editar")]);
  if (!ver) return <SemAcesso menu="config_gerais" />;
  const atual: AbaConfig = (ABAS_CONFIG as readonly string[]).includes(aba ?? "") ? (aba as AbaConfig) : "empresa";
  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Configurações" }, { label: "Configurações gerais" }]}
        titulo="Configurações gerais"
        subtitulo="Dados da empresa, regras de OS e avisos do IMOBPROJ."
        abas={ABAS_CONFIG.map((a) => ({
          label: ROTULOS[a],
          href: a === "empresa" ? "/configuracoes/gerais" : `/configuracoes/gerais?aba=${a}`,
          ativa: a === atual,
        }))}
      />
      <ConfiguracoesGerais aba={atual} podeEditar={editar} />
    </>
  );
}
