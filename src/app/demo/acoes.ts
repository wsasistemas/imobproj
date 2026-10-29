"use server";

import { falha, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { perfilDemo, perfilDemoPorEmail } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

// Ações da versão de demonstração. Todas recusam a chamada fora do modo demo (NEXT_PUBLIC_MODO=demo),
// lido aqui no servidor a cada chamada: em produção não fazem nada, mesmo que alguém as chame direto.

const FORA_DA_DEMO = "Disponível só na versão de demonstração.";

function senhaDemo(): string | null {
  if (process.env.NEXT_PUBLIC_MODO !== "demo") return null;
  return process.env.DEMO_SENHA || null;
}

async function entrar(email: string, senha: string): Promise<ResultadoAcao> {
  const supabase = await createClient();
  // scope local: sai só desta sessão (o global derrubaria quem mais estiver usando a demo com o mesmo usuário).
  await supabase.auth.signOut({ scope: "local" });
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return falha("Não foi possível entrar na demonstração. Avise o administrador.");
  return sucesso(undefined);
}

/** Tela de entrada da demo: entra como um dos usuários fictícios, sem digitar senha. */
export async function entrarComoDemo(chave: string): Promise<ResultadoAcao> {
  const senha = senhaDemo();
  if (!senha) return falha(FORA_DA_DEMO);
  const perfil = perfilDemo(chave);
  if (!perfil) return falha("Perfil de demonstração desconhecido.");
  return entrar(perfil.email, senha);
}

/** Faixa "Ver como": troca de usuário fictício sem pedir senha. */
export async function verComoDemo(chave: string): Promise<ResultadoAcao> {
  return entrarComoDemo(chave);
}

/** "Restaurar dados da demo": só o super admin; apaga tudo e recria os dados fictícios. */
export async function restaurarDemo(): Promise<ResultadoAcao> {
  const senha = senhaDemo();
  if (!senha) return falha(FORA_DA_DEMO);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const perfil = user?.email ? perfilDemoPorEmail(user.email) : undefined;
  if (!user || !perfil) return falha("Entre como um usuário da demonstração.");

  const { error } = await supabase.rpc("demo_restaurar");
  if (error) {
    if (error.code === "42501") return falha("Só o super admin da demonstração pode restaurar os dados.");
    return falha("Não foi possível restaurar os dados da demonstração.");
  }
  // Os usuários fictícios foram recriados (e as sessões apagadas): entra de novo com o mesmo usuário.
  return entrar(perfil.email, senha);
}
