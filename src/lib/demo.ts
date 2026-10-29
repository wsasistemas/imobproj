// Versão de demonstração (Fase 7). O mesmo código roda na demo e em produção; o que separa é
// NEXT_PUBLIC_MODO=demo, definido só no projeto Vercel da demo (ligado a um Supabase próprio).
// Sem essa variável, a faixa e o "Entrar como" não aparecem e as ações em app/demo/acoes.ts recusam a chamada.
// A senha dos usuários fictícios fica em DEMO_SENHA, variável só do servidor (nunca no navegador).

export const MODO_DEMO = process.env.NEXT_PUBLIC_MODO === "demo";

export type PerfilDemo = { chave: string; rotulo: string; nome: string; email: string; descricao: string };

/** Usuários fictícios do supabase/demo/seed-demo.sql que aparecem no "Entrar como" e no "Ver como". */
export const PERFIS_DEMO: PerfilDemo[] = [
  { chave: "superadmin", rotulo: "Super admin", nome: "Sofia Andrade", email: "superadmin@demo.imobproj.com.br", descricao: "Vê e configura tudo" },
  { chave: "gerente", rotulo: "Gerente de projetos", nome: "Carla Mendes", email: "gerente@demo.imobproj.com.br", descricao: "Projetos, OS, atas e Monitor" },
  { chave: "analista", rotulo: "Técnico / analista", nome: "Rafael Lima", email: "analista@demo.imobproj.com.br", descricao: "Executa as OS e atende" },
  { chave: "atendente", rotulo: "Atendente", nome: "Juliana Prado", email: "atendente@demo.imobproj.com.br", descricao: "Monitor e conversas do setor" },
  { chave: "usuario_chave", rotulo: "Usuário-chave (cliente)", nome: "Mariana Costa", email: "usuario.chave@demo.imobproj.com.br", descricao: "Acompanha e aprova as OS" },
];

export const perfilDemo = (chave: string) => PERFIS_DEMO.find((p) => p.chave === chave);
export const perfilDemoPorEmail = (email: string) => PERFIS_DEMO.find((p) => p.email === email.toLowerCase());
