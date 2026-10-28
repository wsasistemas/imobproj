import type { Config } from "tailwindcss";

// Design system IMOBPROJ (docs/PRD.md, PARTE B — padrão IMOBSYSTEMS: IMOBDOCERIA / IMOBDESK).
// As cores apontam para as variáveis CSS de src/app/globals.css (:root = claro, .dark = escuro),
// então o tema escolhido pelo usuário troca tudo sem mudar classe nenhuma.
// Carregado pelo Tailwind v4 via `@config` no globals.css. Os nomes do shadcn (background, card,
// primary, muted…) ficam no `@theme inline` do globals.css; aqui ficam os tokens próprios do PRD.
const config = {
  theme: {
    extend: {
      colors: {
        "sidebar-bg": "var(--sidebar-bg)",
        "sidebar-hover": "var(--sidebar-hover)",
        "sidebar-text": "var(--sidebar-text)",
        "sidebar-label": "var(--sidebar-label)",
        "primary-hover": "var(--primary-hover)",
        "primary-soft": "var(--primary-soft)",
        "primary-border": "var(--primary-border)",
        page: "var(--page)",
        surface: "var(--surface)",
        "border-soft": "var(--border-soft)",
        "table-head": "var(--table-head)",
        success: { DEFAULT: "var(--success)", bg: "var(--success-bg)" },
        warning: { DEFAULT: "var(--warning)", bg: "var(--warning-bg)" },
        info: { DEFAULT: "var(--info)", bg: "var(--info-bg)" },
        danger: { DEFAULT: "var(--danger)", bg: "var(--danger-bg)" },
        purple: { DEFAULT: "var(--purple)", bg: "var(--purple-bg)" },
        neutral: { DEFAULT: "var(--neutral)", bg: "var(--neutral-bg)" },
        "banner-info": { bg: "var(--banner-info-bg)", border: "var(--banner-info-border)" },
        // Cores de sistema da Apple (HIG) para os ícones do menu
        sys: {
          blue: "var(--sys-blue)",
          green: "var(--sys-green)",
          indigo: "var(--sys-indigo)",
          orange: "var(--sys-orange)",
          pink: "var(--sys-pink)",
          purple: "var(--sys-purple)",
          red: "var(--sys-red)",
          teal: "var(--sys-teal)",
          yellow: "var(--sys-yellow)",
          gray: "var(--sys-gray)",
        },
      },
      fontSize: {
        // Rótulo de seção: 11.5px, maiúsculas, .07em, 700
        rotulo: ["11.5px", { lineHeight: "1.3", letterSpacing: "0.07em", fontWeight: "700" }],
        "titulo-pagina": ["24px", { lineHeight: "1.25", fontWeight: "700" }],
      },
      width: { sidebar: "250px", "sidebar-recolhida": "68px" },
      height: { cabecalho: "64px" },
    },
  },
} satisfies Omit<Config, "content">;

export default config;
