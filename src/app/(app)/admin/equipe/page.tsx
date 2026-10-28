import type { Metadata } from "next";
import { cookies } from "next/headers";
import { MatrizPermissoes } from "@/components/equipe/matriz-permissoes";
import { MembrosProjeto } from "@/components/equipe/membros-projeto";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { ehSuperAdmin } from "@/lib/projeto/servidor";
import { COOKIE_PROJETO_ATUAL } from "@/lib/tema";

export const metadata: Metadata = { title: "Equipe e permissões" };

type Props = { searchParams: Promise<{ aba?: string }> };

// Administração › Equipe e permissões. Todos os logados podem consultar; só o super admin altera
// (Server Actions com exigirSuperAdmin + RLS project_members_write).
export default async function EquipePage({ searchParams }: Props) {
  const [{ aba }, superAdmin, cookieStore] = await Promise.all([searchParams, ehSuperAdmin(), cookies()]);
  const matriz = aba === "matriz";

  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Administração" }, { label: "Equipe e permissões" }]}
        titulo="Equipe e permissões"
        subtitulo="Membros de cada projeto e o que cada papel pode fazer."
        abas={[
          { label: "Membros", href: "/admin/equipe", ativa: !matriz },
          { label: "Matriz de permissões", href: "/admin/equipe?aba=matriz", ativa: matriz },
        ]}
      />
      {matriz ? (
        <MatrizPermissoes />
      ) : (
        <MembrosProjeto superAdmin={superAdmin} projetoInicialId={cookieStore.get(COOKIE_PROJETO_ATUAL)?.value} />
      )}
    </>
  );
}
