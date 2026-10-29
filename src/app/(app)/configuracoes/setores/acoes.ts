"use server";

import { primeiroErro } from "@/components/cadastros/util";
import { esquemaIdSetor, esquemaSetor } from "@/components/configuracoes/esquemas-setores";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { garantirPermissao } from "@/lib/perfil-acesso";
import { createClient } from "@/lib/supabase/server";

// Configurações › Setores e números (Fase 3). Grava o super admin ou quem o perfil autoriza em config_setores
// (RLS setores_* / setor_numeros_write). Um número (sessão OpenWA) pertence a um só setor.

export async function salvarSetor(entrada: unknown): Promise<ResultadoAcao<{ id: string }>> {
  const v = esquemaSetor.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("config_setores", v.data.id ? "editar" : "criar");
  if (negado) return negado;

  const { id, numeros, equipes, ...dados } = v.data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("setores").update(dados).eq("id", id).select("id").single()
    : await supabase.from("setores").insert(dados).select("id").single();
  if (error) {
    if (error.code === "23505") return falha("Já existe um setor com este nome.");
    return falha(mensagemErroBanco(error));
  }
  const setorId = data.id as string;

  // Números: o que saiu do setor é desligado; o que entrou é ligado (se estava em outro setor, muda para este).
  const { error: erroTira } = await supabase
    .from("setor_numeros")
    .delete()
    .eq("setor_id", setorId)
    .not("session_id", "in", `(${numeros.length ? numeros.join(",") : "00000000-0000-0000-0000-000000000000"})`);
  if (erroTira) return falha(mensagemErroBanco(erroTira));
  if (numeros.length) {
    const { error: erroPoe } = await supabase
      .from("setor_numeros")
      .upsert(numeros.map((session_id) => ({ session_id, setor_id: setorId })), { onConflict: "session_id" });
    if (erroPoe) return falha(mensagemErroBanco(erroPoe));
  }

  // Equipes que atendem: teams.setor_id (o texto teams.setor acompanha o nome, para as telas antigas).
  const { error: erroSolta } = await supabase
    .from("teams")
    .update({ setor_id: null })
    .eq("setor_id", setorId)
    .not("id", "in", `(${equipes.length ? equipes.join(",") : "00000000-0000-0000-0000-000000000000"})`);
  if (erroSolta) return falha(mensagemErroBanco(erroSolta));
  if (equipes.length) {
    const { error: erroLiga } = await supabase.from("teams").update({ setor_id: setorId, setor: dados.nome }).in("id", equipes);
    if (erroLiga) return falha(mensagemErroBanco(erroLiga));
  }
  return sucesso({ id: setorId });
}

export async function removerSetor(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaIdSetor.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirPermissao("config_setores", "excluir");
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase.from("setores").delete().eq("id", v.data.id).select("id").single();
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}
