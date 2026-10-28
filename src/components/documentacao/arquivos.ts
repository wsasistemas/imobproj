"use client";

// Arquivos no bucket privado "documentos": envio direto do navegador (RLS de storage: gerente/super_admin)
// e download por URL assinada de curta duração (RLS de storage: quem vê o projeto).
import { createClient } from "@/lib/supabase/client";

const BUCKET = "documentos";

export async function enviarArquivo(caminho: string, arquivo: File) {
  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    contentType: arquivo.type || "application/octet-stream",
    upsert: true, // reenvio depois de uma falha no registro não deve travar
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("row-level security") || m.includes("unauthorized") || m.includes("403"))
      throw new Error("Você não tem permissão para enviar arquivos neste projeto.");
    if (m.includes("exceeded") || m.includes("too large") || m.includes("413"))
      throw new Error("O arquivo passa do limite de 50 MB.");
    throw new Error("Não foi possível enviar o arquivo. Verifique a conexão e tente de novo.");
  }
}

/** Remove um arquivo enviado cujo registro falhou (melhor esforço). */
export async function removerArquivo(caminho: string) {
  try {
    await createClient().storage.from(BUCKET).remove([caminho]);
  } catch {
    // sem efeito para o usuário
  }
}

/** Gera URL assinada (60 s) e inicia o download com o nome original. */
export async function baixarArquivo(caminho: string, nome?: string | null) {
  const supabase = createClient();
  const nomeDownload = nome || caminho.slice(caminho.lastIndexOf("/") + 1);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 60, { download: nomeDownload });
  if (error || !data?.signedUrl) throw new Error("Não foi possível gerar o link do arquivo. Ele pode ter sido removido.");
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
