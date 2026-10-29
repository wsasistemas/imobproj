import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import { minhasPermissoes } from "@/lib/perfil-acesso";
import { usuarioLogado } from "@/lib/sessao";
import { COOKIE_MENU_RECOLHIDO, COOKIE_PROJETO_ATUAL } from "@/lib/tema";

// Área logada: o middleware já barra quem não tem sessão; aqui buscamos o perfil para o cabeçalho.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [usuario, cookieStore, permissoes] = await Promise.all([usuarioLogado(), cookies(), minhasPermissoes()]);
  // Menu pelo perfil de acesso (D1): super admin vê tudo; os demais, os itens com "ver".
  const acesso = {
    superAdmin: permissoes.superAdmin,
    visiveis: Object.entries(permissoes.menus)
      .filter(([, p]) => p.ver)
      .map(([menu]) => menu),
  };
  const dataExtenso = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  return (
    <AppShell
      usuario={usuario}
      dataExtenso={dataExtenso}
      recolhidoInicial={cookieStore.get(COOKIE_MENU_RECOLHIDO)?.value === "1"}
      projetoAtualId={cookieStore.get(COOKIE_PROJETO_ATUAL)?.value}
      acesso={acesso}
    >
      {children}
    </AppShell>
  );
}
