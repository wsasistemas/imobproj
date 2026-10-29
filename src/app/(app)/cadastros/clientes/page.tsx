import type { Metadata } from "next";
import { Clientes } from "@/components/cadastros/clientes";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { ehSuperAdmin } from "@/lib/projeto/servidor";

export const metadata: Metadata = { title: "Clientes" };

// Cadastros › Clientes. Todos os logados consultam; só o super admin altera (Server Actions + RLS organizations_write).
export default async function ClientesPage() {
  const superAdmin = await ehSuperAdmin();
  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Cadastros" }, { label: "Clientes" }]}
        titulo="Clientes"
        subtitulo="Empresas atendidas, contatos principais e os projetos de cada uma."
      />
      <Clientes superAdmin={superAdmin} />
    </>
  );
}
