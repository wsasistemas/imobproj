import { useCallback, useEffect, useState } from "react";
import { lerCache, salvarCache, useFila, type ItemFila } from "./fila";
import { horasEntre } from "./formato";
import { BUCKET_EVIDENCIAS, supabase } from "./supabase";
import type { Evidencia, Os } from "./tipos";

const COLUNAS_BASE = `id, project_id, numero, titulo, descricao, status, agendada_inicio, agendada_fim, checkin_at, checkout_at,
  horas, fora_escopo, relato, aceite_comentario, executor_id,
  projeto:projects(codigo, nome), executor:profiles!executor_id(nome), eventos:calendar_events(local)`;
const COLUNAS_OS = `${COLUNAS_BASE}, materiais, tipo`;

type Resposta = { data: unknown; error: { code?: string } | null };

/** Consulta com as colunas da Fase 5; se o servidor ainda não as tem (42703), repete sem elas. */
async function comColunas(consulta: (colunas: string) => PromiseLike<Resposta>): Promise<unknown> {
  let r = await consulta(COLUNAS_OS);
  if (r.error?.code === "42703" || r.error?.code === "PGRST204") r = await consulta(COLUNAS_BASE);
  if (r.error) throw r.error;
  return r.data;
}

type LinhaOs = Omit<Os, "local"> & { eventos: { local: string | null }[] | null };

function normalizar(l: LinhaOs): Os {
  const { eventos, ...resto } = l;
  return { ...resto, horas: Number(resto.horas ?? 0), local: eventos?.find((e) => e.local)?.local ?? null };
}

/** OS abertas neste aparelho que ainda não subiram (aparecem com "OS nova" e "Aguardando envio"). */
export function osLocais(itens: ItemFila[]): Os[] {
  return itens.flatMap((item) =>
    item.tipo !== "abrir_os"
      ? []
      : [
          {
            id: item.os_id,
            project_id: item.project_id,
            numero: 0,
            titulo: item.payload.titulo,
            descricao: item.payload.descricao,
            status: item.payload.inicio ? "agendada" : "rascunho",
            agendada_inicio: item.payload.inicio,
            agendada_fim: item.payload.fim,
            checkin_at: null,
            checkout_at: null,
            horas: 0,
            fora_escopo: false,
            relato: null,
            materiais: null,
            tipo: item.payload.tipo,
            aceite_comentario: null,
            executor_id: item.payload.executor_id,
            projeto: item.payload.projeto,
            executor: { nome: item.payload.executor_nome },
            local: null,
          } satisfies Os,
        ],
  );
}

/** Situação local da OS enquanto o check-in/check-out ainda está na fila. */
export function aplicarPendencias(lista: Os[], itens: ItemFila[]): Os[] {
  return lista.map((os) => {
    let r = os;
    for (const item of itens) {
      if (item.os_id !== os.id) continue;
      if (item.tipo === "checkin" && r.status === "agendada") r = { ...r, status: "em_execucao", checkin_at: item.payload.em };
      if (item.tipo === "checkout" && r.status === "em_execucao")
        r = {
          ...r,
          status: "aguardando_aceite",
          checkout_at: item.payload.em,
          horas: r.checkin_at ? horasEntre(r.checkin_at, new Date(item.payload.em)) : r.horas,
          relato: item.payload.relato,
          materiais: item.payload.materiais ?? r.materiais,
          fora_escopo: r.fora_escopo || item.payload.fora_escopo,
        };
    }
    return r;
  });
}

export async function buscarMinhasOs(userId: string, de: Date, ate: Date, incluirEmExecucao: boolean): Promise<Os[]> {
  const periodo = `and(agendada_inicio.gte.${de.toISOString()},agendada_inicio.lt.${ate.toISOString()})`;
  const data = await comColunas((colunas) =>
    supabase
      .from("service_orders")
      .select(colunas)
      .eq("executor_id", userId)
      .neq("status", "rascunho")
      .or(incluirEmExecucao ? `${periodo},status.eq.em_execucao` : periodo)
      .order("agendada_inicio", { ascending: true, nullsFirst: false }),
  );
  return (data as LinhaOs[]).map(normalizar);
}

export async function buscarOs(id: string): Promise<Os | null> {
  const data = await comColunas((colunas) => supabase.from("service_orders").select(colunas).eq("id", id).maybeSingle());
  return data ? normalizar(data as LinhaOs) : null;
}

export async function buscarAguardandoAceite(projetos: string[]): Promise<Os[]> {
  if (projetos.length === 0) return [];
  const data = await comColunas((colunas) =>
    supabase
      .from("service_orders")
      .select(colunas)
      .eq("status", "aguardando_aceite")
      .in("project_id", projetos)
      .order("checkout_at", { ascending: true }),
  );
  return (data as LinhaOs[]).map(normalizar);
}

export type EvidenciaComUrl = Evidencia & { url: string | null };

export async function buscarEvidencias(osId: string): Promise<EvidenciaComUrl[]> {
  const { data, error } = await supabase
    .from("os_evidences")
    .select("id, tipo, storage_path, captured_at, lat, lng, descricao")
    .eq("os_id", osId)
    .order("captured_at");
  if (error) throw error;
  const lista = data as Evidencia[];
  if (lista.length === 0) return [];
  const { data: urls } = await supabase.storage
    .from(BUCKET_EVIDENCIAS)
    .createSignedUrls(lista.map((e) => e.storage_path), 3600);
  return lista.map((e, i) => ({ ...e, url: urls?.[i]?.signedUrl ?? null }));
}

export async function decidirAceite(osId: string, decisao: "aprovada" | "recusada", comentario: string) {
  // aceite_por/aceite_em e a exigência de comentário na recusa ficam no trigger fn_os_guard.
  const { data, error } = await supabase
    .from("service_orders")
    .update({ status: decisao, aceite_comentario: comentario.trim() || null })
    .eq("id", osId)
    .eq("status", "aguardando_aceite")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("A OS mudou de situação enquanto você decidia. Atualize a lista.");
}

/**
 * Carrega do servidor e guarda em cache; sem rede, mostra o cache (com a data) e as pendências da fila.
 * Recarrega sozinho quando a fila termina de sincronizar.
 */
export function useOsCarregadas(chave: string | null, buscar: () => Promise<Os[]>) {
  const { itens, versao } = useFila();
  const [lista, setLista] = useState<Os[] | null>(null);
  const [cacheDe, setCacheDe] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!chave) return;
    setCarregando(true);
    try {
      const dados = await buscar();
      setLista(dados);
      setCacheDe(null);
      setErro(null);
      await salvarCache(chave, dados);
      // Cada OS também fica em cache sozinha: o detalhe abre sem rede depois de ter aparecido numa lista.
      for (const os of dados) if (chave !== `os:${os.id}`) await salvarCache(`os:${os.id}`, [os]);
    } catch (e) {
      const cache = await lerCache<Os[]>(chave);
      if (cache) {
        setLista(cache.valor);
        setCacheDe(cache.atualizadoEm);
        setErro(null);
      } else {
        setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
      }
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  useEffect(() => {
    void recarregar();
  }, [recarregar, versao]);

  return { lista: lista ? aplicarPendencias(lista, itens) : null, cacheDe, erro, carregando, recarregar };
}
