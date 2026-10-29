"use server";

import { z } from "zod";
import { localMidia } from "@/components/conversas/dados";
import { falha, sucesso, type ResultadoAcao } from "@/lib/acoes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Anotações da equipe (D5/D8): quem é da equipe do grupo lê, mesmo sem ver o projeto inteiro (ex.: prestador).
// A RLS do Storage só libera mídia a quem vê o projeto inteiro, então a URL da mídia é assinada aqui, depois de
// conferir no banco (fn_pode_ver_anotacao) que o usuário pode ler o grupo e que o arquivo é de uma mensagem dele.

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Identificador inválido.");

export async function urlMidiaAnotacao(groupId: unknown, caminho: unknown): Promise<ResultadoAcao<string | null>> {
  const g = uuid.safeParse(groupId);
  const c = z.string().trim().min(1).max(500).safeParse(caminho);
  if (!g.success || !c.success) return falha("Arquivo inválido.");

  const supabase = await createClient();
  const { data: pode, error } = await supabase.rpc("fn_pode_ver_anotacao", { p_group_id: g.data });
  if (error || pode !== true) return falha("Você não tem acesso às anotações deste grupo.");

  const admin = createAdminClient();
  const { count } = await admin
    .from("wa_messages")
    .select("id", { count: "exact", head: true })
    .eq("group_id", g.data)
    .eq("media_path", c.data);
  if (!count) return falha("Arquivo não encontrado neste grupo.");

  const local = localMidia(c.data);
  const { data } = await admin.storage.from(local.bucket).createSignedUrl(local.caminho, 60 * 60);
  return sucesso(data?.signedUrl ?? null);
}
