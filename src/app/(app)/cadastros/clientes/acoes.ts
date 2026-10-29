"use server";

import { esquemaCliente, esquemaContato, esquemaId } from "@/components/cadastros/esquemas";
import { primeiroErro } from "@/components/cadastros/util";
import { falha, mensagemErroBanco, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { garantirSuperAdmin } from "@/lib/cadastros-servidor";
import { createClient } from "@/lib/supabase/server";

// Cadastros › Clientes: empresas (organizations) e seus contatos. Só o super admin grava (RLS organizations_write).

export async function salvarCliente(entrada: unknown): Promise<ResultadoAcao<string>> {
  const v = esquemaCliente.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;

  const { id, ...dados } = v.data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("organizations").update(dados).eq("id", id).select("id").single()
    : await supabase.from("organizations").insert(dados).select("id").single();
  if (error) {
    if (error.code === "23505") return falha("Já existe uma empresa com este CNPJ.");
    return falha(mensagemErroBanco(error));
  }
  return sucesso(data.id as string);
}

export async function salvarContato(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaContato.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;

  const { id, ...dados } = v.data;
  const supabase = await createClient();
  // Só um contato principal por empresa (índice único parcial): desmarca o atual antes.
  if (dados.principal) {
    let q = supabase.from("organization_contacts").update({ principal: false }).eq("organization_id", dados.organization_id).eq("principal", true);
    if (id) q = q.neq("id", id);
    const { error } = await q;
    if (error) return falha(mensagemErroBanco(error));
  }
  const { error } = id
    ? await supabase.from("organization_contacts").update(dados).eq("id", id).select("id").single()
    : await supabase.from("organization_contacts").insert(dados).select("id").single();
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}

export async function removerContato(entrada: unknown): Promise<ResultadoAcao> {
  const v = esquemaId.safeParse(entrada);
  if (!v.success) return falha(primeiroErro(v.error));
  const negado = await garantirSuperAdmin();
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase.from("organization_contacts").delete().eq("id", v.data.id).select("id").single();
  return error ? falha(mensagemErroBanco(error)) : sucesso(undefined);
}
