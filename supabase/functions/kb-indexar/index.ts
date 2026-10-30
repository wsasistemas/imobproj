// Edge Function kb-indexar — processa a fila da Base de Conhecimento (kb_fila).
//
// Entrada: POST {} (opcional { limite }).
// Quem chama: o pg_cron imobproj-kb-indexar (fn_kb_disparar via pg_net, a cada 1 min, só com fila),
// com "Authorization: Bearer <anon>" + x-openwa-cron = openwa_cron_secret do Vault; ou a service_role.
// Para cada item: fn_kb_pegar_fila devolve os trechos já montados e mascarados (fn_kb_preparar), esta função
// gera os vetores no Gemini e fn_kb_gravar troca os trechos do item. Lista vazia = item sai da base.
// Falha volta para a fila (até 5 tentativas). Resposta: {indexados, removidos, falhas}.

import { json, preflight } from "../_shared/cors.ts";
import { gerarVetores, vetorTexto } from "../_shared/gemini.ts";
import { clienteServico, ehChamadaDeServico, iguaisTempoConstante, mensagemDe, type Cliente } from "../_shared/supabase.ts";
import { lerSegredo } from "../_shared/vault.ts";

const ORCAMENTO_MS = 45_000; // o pg_net espera 55 s; o cron roda de novo em 1 min
const LOTE_PADRAO = 10;

type Trecho = { ordem: number; project_id: string; team_id: string | null; titulo: string; texto: string };
type ItemFila = { fonte: string; fonte_id: string; trechos: Trecho[] };

async function ehCron(admin: Cliente, req: Request): Promise<boolean> {
  const recebido = req.headers.get("x-openwa-cron");
  if (!recebido) return false;
  const segredo = await lerSegredo(admin, "imobproj_openwa_cron_secret");
  return !!segredo && iguaisTempoConstante(recebido.trim(), segredo);
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  let limite = LOTE_PADRAO;
  try {
    const corpo = (await req.json().catch(() => ({}))) as { limite?: unknown };
    const n = Number(corpo.limite);
    if (Number.isInteger(n) && n >= 1 && n <= 50) limite = n;
  } catch {
    // corpo vazio: segue com o padrão
  }

  const inicio = Date.now();
  let indexados = 0;
  let removidos = 0;
  let falhas = 0;
  try {
    const admin = clienteServico();
    if (!(ehChamadaDeServico(req) || (await ehCron(admin, req)))) return json(401, { erro: "Não autorizado." });

    // Sem chave não pega nada: pegar contaria tentativa à toa.
    const chave = await lerSegredo(admin, "imobproj_gemini_api_key");
    if (!chave) return json(503, { erro: "Chave do Gemini ausente no Vault (imobproj_gemini_api_key)." });

    while (Date.now() - inicio < ORCAMENTO_MS) {
      const { data, error } = await admin.rpc("fn_kb_pegar_fila", { p_limite: limite });
      if (error) throw new Error(`fn_kb_pegar_fila: ${error.message}`);
      const itens = (data ?? []) as ItemFila[];
      if (itens.length === 0) break;

      for (const item of itens) {
        try {
          const trechos = item.trechos ?? [];
          const vetores = trechos.length
            ? await gerarVetores(chave, trechos.map((t) => ({ texto: t.texto, titulo: t.titulo })), "RETRIEVAL_DOCUMENT")
            : [];
          const { error: e } = await admin.rpc("fn_kb_gravar", {
            p_fonte: item.fonte,
            p_fonte_id: item.fonte_id,
            p_trechos: trechos.map((t, i) => ({ ...t, vetor: vetorTexto(vetores[i]) })),
          });
          if (e) throw new Error(`fn_kb_gravar: ${e.message}`);
          if (trechos.length) indexados++;
          else removidos++;
        } catch (e) {
          falhas++;
          await admin.rpc("fn_kb_falhou", { p_fonte: item.fonte, p_fonte_id: item.fonte_id, p_erro: mensagemDe(e) });
          console.error(JSON.stringify({ evento: "kb.indexar_item_erro", fonte: item.fonte, id: item.fonte_id, erro: mensagemDe(e) }));
        }
      }
      if (itens.length < limite) break;
    }

    console.log(JSON.stringify({ evento: "kb.indexar", indexados, removidos, falhas, ms: Date.now() - inicio }));
    return json(200, { indexados, removidos, falhas });
  } catch (e) {
    console.error(JSON.stringify({ evento: "kb.indexar_erro", erro: mensagemDe(e) }));
    return json(500, { erro: "Falha ao indexar.", detalhe: mensagemDe(e), indexados, removidos, falhas });
  }
});
