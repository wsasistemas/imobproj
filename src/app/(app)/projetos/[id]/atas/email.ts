import "server-only";

// Envio de e-mail das Atas ("Solicitar ciência").
//
// O projeto ainda NÃO tem provedor de e-mail transacional configurado (o SMTP do Supabase Auth só serve para
// convites/recuperação de senha e não aceita e-mail livre). Por isso o envio é desacoplado:
//   * se RESEND_API_KEY e EMAIL_REMETENTE estiverem definidos no servidor, envia pela API HTTP do Resend;
//   * senão, devolve status "sem_provedor" — a solicitação fica registrada em meeting_ciencia_solicitacoes
//     (email_status = 'sem_provedor') e pode ser processada depois por um job/Edge Function.
//
// TODO(e-mail): escolher o provedor oficial (Resend, SES, SMTP corporativo), cadastrar as variáveis no
// .env.example/Vercel e, se preferir, mover o envio para uma Edge Function que leia as linhas 'sem_provedor'.

export type ResultadoEmail = { status: "enviado" | "sem_provedor" | "falhou" | "sem_destinatario"; erro?: string };

export type NovoEmail = { para: string[]; assunto: string; texto: string; html?: string };

export async function enviarEmail(email: NovoEmail): Promise<ResultadoEmail> {
  const para = email.para.filter((e) => /.+@.+\..+/.test(e));
  if (para.length === 0) return { status: "sem_destinatario" };

  const chave = process.env.RESEND_API_KEY;
  const remetente = process.env.EMAIL_REMETENTE;
  if (!chave || !remetente) return { status: "sem_provedor" };

  try {
    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: remetente, to: para, subject: email.assunto, text: email.texto, html: email.html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resposta.ok) return { status: "falhou", erro: `Provedor de e-mail respondeu ${resposta.status}` };
    return { status: "enviado" };
  } catch (e) {
    return { status: "falhou", erro: e instanceof Error ? e.message : "Falha ao chamar o provedor de e-mail" };
  }
}
