import type { Metadata } from "next";
import { PerfisPermissoes, type Perfil, type RegraPerfil } from "@/components/configuracoes/perfis-permissoes";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { SemAcesso } from "@/components/shell/sem-acesso";
import { minhasPermissoes } from "@/lib/perfil-acesso";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Perfis e permissões" };

// Configurações › Perfis e permissões (D1): cada perfil define os menus e as ações no sistema todo.
// Só o super admin vê e altera (RLS perfis_write e perfil_permissoes_write).
export default async function PerfisPage() {
  const permissoes = await minhasPermissoes();
  if (!permissoes.superAdmin) return <SemAcesso menu="config_perfis" />;

  const supabase = await createClient();
  const [perfis, regras, pessoas] = await Promise.all([
    supabase.from("perfis").select("chave, nome, descricao, ordem, fixo").order("ordem"),
    supabase.from("perfil_permissoes").select("perfil, menu, ver, criar, editar, excluir, aprovar"),
    supabase.from("profiles").select("perfil").not("perfil", "is", null),
  ]);
  const contagem = new Map<string, number>();
  for (const p of pessoas.data ?? []) contagem.set(p.perfil as string, (contagem.get(p.perfil as string) ?? 0) + 1);
  const lista: Perfil[] = (perfis.data ?? []).map((p) => ({ ...p, usuarios: contagem.get(p.chave) ?? 0 }) as Perfil);

  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Configurações" }, { label: "Perfis e permissões" }]}
        titulo="Perfis e permissões"
        subtitulo="Cada perfil define quais menus a pessoa vê e o que pode fazer em cada um."
      />
      {perfis.error || regras.error ? (
        <p role="alert" className="text-destructive">
          Não foi possível carregar os perfis. Recarregue a página.
        </p>
      ) : (
        <PerfisPermissoes perfis={lista} regras={(regras.data ?? []) as RegraPerfil[]} />
      )}
    </>
  );
}
