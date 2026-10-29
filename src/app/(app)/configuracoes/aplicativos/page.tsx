import type { Metadata } from "next";
import { PermissoesAplicativo, type Aplicativo } from "@/components/configuracoes/permissoes-aplicativo";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { SemAcesso } from "@/components/shell/sem-acesso";
import { Card, CardContent } from "@/components/ui/card";
import { minhasPermissoes } from "@/lib/perfil-acesso";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Permissões por aplicativo" };

// Configurações › Permissões por aplicativo (D3): a Central de Acessos compartilhada (schema `acessos`).
// Só o super admin do IMOBPROJ abre a tela; quem grava é a Central, que exige a conta proprietária.
export default async function AplicativosPage() {
  const permissoes = await minhasPermissoes();
  if (!permissoes.superAdmin) return <SemAcesso menu="config_aplicativos" />;

  const central = (await createClient()).schema("public");
  const { data: souSuperAdmin } = await central.rpc("pa_sou_super_admin");
  const apps = souSuperAdmin ? await central.rpc("pa_listar_aplicativos") : null;

  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Configurações" }, { label: "Permissões por aplicativo" }]}
        titulo="Permissões por aplicativo"
        subtitulo="Cada schema exposto no Supabase é um aplicativo. Escolha quem pode entrar em cada um. O login e a senha continuam os mesmos em todos; o perfil dentro de cada aplicativo continua sendo definido nele."
      />
      {!souSuperAdmin ? (
        <Card>
          <CardContent className="py-10 text-center">
            <h2 className="text-[16px] font-semibold">Somente o super admin da Central de Acessos</h2>
            <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
              As permissões por aplicativo valem para todos os sistemas IMOBSYSTEMS e só a conta proprietária da Central as
              altera. Peça a ela para liberar ou bloquear quem precisa.
            </p>
          </CardContent>
        </Card>
      ) : apps?.error ? (
        <p role="alert" className="text-destructive">
          Não foi possível carregar os aplicativos da Central de Acessos. Recarregue a página.
        </p>
      ) : (
        <PermissoesAplicativo aplicativos={(apps?.data ?? []) as Aplicativo[]} />
      )}
    </>
  );
}
