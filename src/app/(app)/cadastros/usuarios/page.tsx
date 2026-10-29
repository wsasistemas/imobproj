import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Usuarios } from "@/components/cadastros/usuarios";
import { MatrizPermissoes } from "@/components/equipe/matriz-permissoes";
import { MembrosProjeto } from "@/components/equipe/membros-projeto";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { ehSuperAdmin } from "@/lib/projeto/servidor";
import { COOKIE_PROJETO_ATUAL } from "@/lib/tema";

export const metadata: Metadata = { title: "Usuários" };

type Props = { searchParams: Promise<{ aba?: string }> };

// Cadastros › Usuários (antiga "Equipe e permissões"). Abas: cadastro das pessoas, acesso por projeto
// (membros e papéis) e a matriz do que cada papel pode fazer. Só o super admin altera.
export default async function UsuariosPage({ searchParams }: Props) {
  const [{ aba }, superAdmin, cookieStore] = await Promise.all([searchParams, ehSuperAdmin(), cookies()]);
  const atual = aba === "projetos" || aba === "matriz" ? aba : "usuarios";

  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Cadastros" }, { label: "Usuários" }]}
        titulo="Usuários"
        subtitulo="Quem acessa o portal e o app: equipe interna, prestadores e contatos dos clientes."
        abas={[
          { label: "Usuários", href: "/cadastros/usuarios", ativa: atual === "usuarios" },
          { label: "Acesso por projeto", href: "/cadastros/usuarios?aba=projetos", ativa: atual === "projetos" },
          { label: "Matriz de permissões", href: "/cadastros/usuarios?aba=matriz", ativa: atual === "matriz" },
        ]}
      />
      {atual === "usuarios" && <Usuarios superAdmin={superAdmin} />}
      {atual === "projetos" && (
        <MembrosProjeto superAdmin={superAdmin} projetoInicialId={cookieStore.get(COOKIE_PROJETO_ATUAL)?.value} />
      )}
      {atual === "matriz" && <MatrizPermissoes />}
    </>
  );
}
