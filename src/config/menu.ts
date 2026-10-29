import type { ChaveIcone } from "@/components/shell/icones-menu.data";
import {
  CalendarRange,
  ClipboardCheck,
  FileText,
  FolderKanban,
  House,
  LayoutDashboard,
  MessageCircle,
  NotebookPen,
  Settings,
  Building2,
  Smartphone,
  UserRound,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";

// Fonte única do menu lateral (grupos, itens e submenus) e dos títulos das páginas.
// Cada item tem um ícone HIG: símbolo branco num tile na cor de sistema (`cor`, variável de globals.css).
// Itens de projeto usam ":id" no href; o menu troca pelo projeto aberto (ou o último visitado) com hrefDoItem.
// `colorido`: ícone Fluent Color do Portal Atendimento (src/components/shell/icones-menu.data.ts), que substitui o tile.
// Telas ainda não implementadas abrem a página "Em construção" (rota coringa).

export type ItemMenu = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Cor de sistema do tile do ícone (ex.: "var(--sys-blue)"). */
  cor: string;
  /** Ícone Fluent Color (Portal Atendimento) no lugar do tile. */
  colorido?: ChaveIcone;
  /** Subtítulo da página. */
  descricao: string;
  filhos?: ItemMenu[];
};

export type GrupoMenu = { id: string; label: string; itens: ItemMenu[] };

export const MENU: GrupoMenu[] = [
  {
    id: "principal",
    label: "Menu principal",
    itens: [
      {
        id: "inicio",
        colorido: "home",
        label: "Página Inicial",
        href: "/",
        icon: House,
        cor: "var(--sys-blue)",
        descricao: "Resumo dos seus projetos, pendências e próximos marcos.",
      },
      {
        id: "projetos",
        colorido: "projetos",
        label: "Projetos",
        href: "/projetos",
        icon: FolderKanban,
        cor: "var(--sys-orange)",
        descricao: "Projetos de tecnologia geridos junto com o cliente.",
        filhos: [
          {
            id: "projetos_visao_geral",
            label: "Visão geral",
            href: "/projetos/:id",
            icon: LayoutDashboard,
            cor: "var(--sys-blue)",
            descricao: "Avanço físico, horas, OS por situação e marcos do projeto.",
          },
          {
            id: "projetos_documentacao",
            label: "Documentação e EAP",
            href: "/projetos/:id/documentacao",
            icon: FileText,
            cor: "var(--sys-indigo)",
            descricao: "Documentos versionados, processos AS-IS/TO-BE e a EAP do projeto.",
          },
          {
            id: "projetos_cronograma",
            label: "Cronograma",
            href: "/projetos/:id/cronograma",
            icon: CalendarRange,
            cor: "var(--sys-red)",
            descricao: "Calendário (dia, semana e mês) e Gantt com linha de base.",
          },
          {
            id: "projetos_atas",
            label: "Atas de reunião",
            href: "/projetos/:id/atas",
            icon: NotebookPen,
            cor: "var(--sys-purple)",
            descricao: "Participantes, pauta, decisões e encaminhamentos.",
          },
          {
            id: "projetos_os",
            label: "Ordens de Serviço",
            href: "/projetos/:id/os",
            icon: ClipboardCheck,
            cor: "var(--sys-green)",
            descricao: "Execução, evidências, aceite e medição mensal.",
          },
        ],
      },
    ],
  },
  {
    id: "comunicacao",
    label: "Comunicação",
    itens: [
      {
        id: "conversas",
        colorido: "conversas",
        label: "Conversas WhatsApp",
        href: "/projetos/:id/conversas",
        icon: MessageCircle,
        cor: "var(--sys-green)",
        descricao: "Grupos por equipe espelhados em tempo real pelo OpenWA.",
      },
    ],
  },
  {
    id: "cadastros",
    label: "Cadastros",
    itens: [
      {
        id: "cadastros_clientes",
        colorido: "clientes",
        label: "Clientes",
        href: "/cadastros/clientes",
        icon: Building2,
        cor: "var(--sys-orange)",
        descricao: "Empresas atendidas, contatos principais e os projetos de cada uma.",
      },
      {
        id: "cadastros_usuarios",
        colorido: "usuarios",
        label: "Usuários",
        href: "/cadastros/usuarios",
        icon: UserRound,
        cor: "var(--sys-blue)",
        descricao: "Quem acessa o portal e o app: equipe interna, prestadores e contatos dos clientes.",
      },
      {
        id: "cadastros_equipes",
        colorido: "equipes",
        label: "Equipes",
        href: "/cadastros/equipes",
        icon: Users,
        cor: "var(--sys-pink)",
        descricao: "Grupos de pessoas dentro de um setor. Uma pessoa pode estar em várias equipes.",
      },
    ],
  },
  {
    id: "administracao",
    label: "Administração",
    itens: [
      {
        id: "admin_whatsapp",
        colorido: "openwa",
        label: "WhatsApp OpenWA",
        href: "/admin/whatsapp",
        icon: Webhook,
        cor: "var(--sys-green)",
        descricao: "Conexão com o OpenWA, sessões e saúde do envio.",
      },
      {
        id: "admin_app_campo",
        colorido: "app-campo",
        label: "App de campo",
        href: "/admin/app-campo",
        icon: Smartphone,
        cor: "var(--sys-orange)",
        descricao: "Aplicativo de campo: check-in/out, fotos, assinatura e modo offline.",
      },
      {
        id: "admin_configuracoes",
        colorido: "configuracoes",
        label: "Configurações",
        href: "/admin/configuracoes",
        icon: Settings,
        cor: "var(--sys-gray)",
        descricao: "Configurações gerais do IMOBPROJ.",
      },
    ],
  },
];

/** Todas as telas (folhas) do menu, com o grupo pai quando houver. */
export function telasDoMenu(): { item: ItemMenu; pai?: ItemMenu }[] {
  return MENU.flatMap((g) =>
    g.itens.flatMap((item) => (item.filhos ? item.filhos.map((filho) => ({ item: filho, pai: item })) : [{ item }])),
  );
}

const UUID = "[0-9a-fA-F-]{36}";
const regexDoHref = (href: string, prefixo: boolean) =>
  new RegExp(`^${href.replace(":id", UUID)}${prefixo && href !== "/" ? "(/.*)?" : ""}$`);

/** Tela do menu que corresponde ao caminho (exata primeiro; senão, a mais específica que for prefixo). */
export function telaPorCaminho(pathname: string) {
  const telas = telasDoMenu();
  return (
    telas.find(({ item }) => regexDoHref(item.href, false).test(pathname)) ??
    telas
      .filter(({ item }) => regexDoHref(item.href, true).test(pathname))
      .sort((a, b) => b.item.href.length - a.item.href.length)[0]
  );
}

/** Tela cujo href casa exatamente com o caminho (":id" aceita qualquer projeto). */
export function telaExata(pathname: string) {
  return telasDoMenu().find(({ item }) => regexDoHref(item.href, false).test(pathname));
}

/** Projeto aberto no caminho atual (/projetos/<uuid>/...), se houver. */
export function projetoDoCaminho(pathname: string): string | undefined {
  return new RegExp(`^/projetos/(${UUID})(/|$)`).exec(pathname)?.[1];
}

/** href real do item: troca ":id" pelo projeto; sem projeto, itens de projeto levam à lista /projetos. */
export function hrefDoItem(item: ItemMenu, projetoId?: string) {
  if (!item.href.includes(":id")) return item.href;
  return projetoId ? item.href.replace(":id", projetoId) : "/projetos";
}
