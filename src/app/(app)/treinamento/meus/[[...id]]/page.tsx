import type { Metadata } from "next";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { MeusTreinamentos } from "@/components/treinamento/meus-treinamentos";
import { minhasPermissoes } from "@/lib/perfil-acesso";
import { usuarioLogado } from "@/lib/sessao";

export const metadata: Metadata = { title: "Meus treinamentos" };

type Props = { params: Promise<{ id?: string[] }> };

// Centro de Treinamento (Fase 8): a trilha do perfil da pessoa. /treinamento/meus/<módulo> abre o tour por cima.
// As regras (trilha, progresso, gabarito) ficam nas funções imobproj.tr_*; a página só monta a tela.
export default async function MeusTreinamentosPage({ params }: Props) {
  const { id } = await params;
  const [usuario, permissoes] = await Promise.all([usuarioLogado(), minhasPermissoes()]);
  const moduloId = id?.[0] && /^\d+$/.test(id[0]) ? Number(id[0]) : null;

  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Centro de Treinamento", href: "/treinamento/meus" }, { label: "Meus treinamentos" }]}
        titulo="Centro de Treinamento"
        subtitulo="Tutoriais passo a passo na própria tela do sistema. Clique em Começar e siga os balões."
        abas={
          permissoes.superAdmin
            ? [
                { label: "Meus treinamentos", href: "/treinamento/meus", ativa: true },
                { label: "Gerenciar tutoriais", href: "/treinamento/gerenciar" },
              ]
            : undefined
        }
      />
      <MeusTreinamentos superAdmin={permissoes.superAdmin} nome={usuario.nome} moduloId={moduloId} />
    </>
  );
}
