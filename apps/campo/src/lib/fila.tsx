// Fila offline (expo-sqlite): OS nova, check-in, check-out e evidências são gravados aqui primeiro e enviados
// ao Supabase em ordem quando há rede. Arquivos ficam em Documentos/fila até subirem para o Storage.
//
// Regras:
//  * erro de rede → para a sincronização e tenta de novo quando a rede voltar;
//  * erro de negócio (RLS, situação da OS mudou...) → o item fica com o erro visível e os itens seguintes
//    da MESMA OS esperam (um check-out não pode passar na frente de um check-in que falhou);
//  * o servidor é idempotente (fn_app_abrir_os/checkin/checkout/registrar_evidencia), então reenviar é seguro.
//  * a OS aberta no aparelho já nasce com o id definitivo (UUID local), então o check-in feito offline
//    entra na fila com o mesmo os_id e sobe logo depois da criação.

import NetInfo from "@react-native-community/netinfo";
import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { registrarAparelho } from "./aparelho";
import { BUCKET_EVIDENCIAS, supabase } from "./supabase";
import type { EvidenceTipo } from "./tipos";

export type PayloadCheckin = { em: string; lat: number | null; lng: number | null };
export type PayloadCheckout = PayloadCheckin & { relato: string; fora_escopo: boolean; materiais?: string };
export type TipoOs = "corretiva" | "preventiva" | "implantacao" | "visita";
export type PayloadAbrirOs = {
  tipo: TipoOs;
  titulo: string;
  descricao: string | null;
  inicio: string | null;
  fim: string | null;
  executor_id: string;
  executor_nome: string;
  projeto: { codigo: string; nome: string };
};
export type PayloadEvidencia = {
  tipo: EvidenceTipo;
  storage_path: string;
  content_type: string;
  nome: string;
  capturado_em: string;
  lat: number | null;
  lng: number | null;
  precisao: number | null;
  descricao: string | null;
};

type Base = { id: string; os_id: string; project_id: string; criado_em: string; tentativas: number; erro: string | null };
export type ItemFila =
  | (Base & { tipo: "abrir_os"; payload: PayloadAbrirOs; arquivo: null })
  | (Base & { tipo: "checkin"; payload: PayloadCheckin; arquivo: null })
  | (Base & { tipo: "checkout"; payload: PayloadCheckout; arquivo: null })
  | (Base & { tipo: "evidencia"; payload: PayloadEvidencia; arquivo: string });

export type NovoItem =
  | { tipo: "abrir_os"; os_id: string; project_id: string; payload: PayloadAbrirOs }
  | { tipo: "checkin"; os_id: string; project_id: string; payload: PayloadCheckin }
  | { tipo: "checkout"; os_id: string; project_id: string; payload: PayloadCheckout }
  | { tipo: "evidencia"; os_id: string; project_id: string; payload: Omit<PayloadEvidencia, "storage_path">; arquivo: string; extensao: string };

type Linha = { id: string; tipo: string; os_id: string; project_id: string; payload: string; arquivo: string | null; criado_em: string; tentativas: number; erro: string | null };

let bancoPromessa: Promise<SQLite.SQLiteDatabase> | null = null;

export function banco() {
  bancoPromessa ??= (async () => {
    const db = await SQLite.openDatabaseAsync("campo.db");
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS fila (
        id TEXT PRIMARY KEY NOT NULL,
        tipo TEXT NOT NULL,
        os_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        arquivo TEXT,
        criado_em TEXT NOT NULL,
        tentativas INTEGER NOT NULL DEFAULT 0,
        erro TEXT
      );
      CREATE TABLE IF NOT EXISTS cache (
        chave TEXT PRIMARY KEY NOT NULL,
        valor TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
      );
    `);
    return db;
  })();
  return bancoPromessa;
}

/** Guarda a última resposta do servidor para mostrar a tela sem rede. */
export async function salvarCache(chave: string, valor: unknown) {
  const db = await banco();
  await db.runAsync(
    "INSERT OR REPLACE INTO cache (chave, valor, atualizado_em) VALUES (?, ?, ?)",
    chave,
    JSON.stringify(valor),
    new Date().toISOString(),
  );
}

export async function lerCache<T>(chave: string): Promise<{ valor: T; atualizadoEm: string } | null> {
  const db = await banco();
  const linha = await db.getFirstAsync<{ valor: string; atualizado_em: string }>(
    "SELECT valor, atualizado_em FROM cache WHERE chave = ?",
    chave,
  );
  return linha ? { valor: JSON.parse(linha.valor) as T, atualizadoEm: linha.atualizado_em } : null;
}

function pastaFila() {
  const pasta = new Directory(Paths.document, "fila");
  pasta.create({ idempotent: true, intermediates: true });
  return pasta;
}

async function listar(): Promise<ItemFila[]> {
  const db = await banco();
  const linhas = await db.getAllAsync<Linha>("SELECT * FROM fila ORDER BY criado_em, rowid");
  return linhas.map((l) => ({ ...l, payload: JSON.parse(l.payload) }) as ItemFila);
}

/** SQLSTATE do PostgREST ou 4xx do Storage = erro de negócio; o resto é tratado como falta de rede. */
function ehErroDeNegocio(e: unknown) {
  const erro = e as { code?: unknown; statusCode?: unknown; status?: unknown };
  if (typeof erro?.code === "string" && /^[0-9A-Z]{5}$/.test(erro.code)) return true;
  const status = Number(erro?.statusCode ?? erro?.status);
  return status >= 400 && status < 500;
}

function mensagem(e: unknown) {
  return e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
}

async function enviar(item: ItemFila) {
  if (item.tipo === "abrir_os") {
    const p = item.payload;
    const { error } = await supabase.rpc("fn_app_abrir_os", {
      p_id: item.os_id,
      p_project_id: item.project_id,
      p_tipo: p.tipo,
      p_titulo: p.titulo,
      p_descricao: p.descricao,
      p_inicio: p.inicio,
      p_fim: p.fim,
      p_executor_id: p.executor_id,
    });
    if (error) throw error;
    return;
  }
  if (item.tipo === "checkin") {
    const { error } = await supabase.rpc("fn_app_checkin", {
      p_os_id: item.os_id,
      p_em: item.payload.em,
      p_lat: item.payload.lat,
      p_lng: item.payload.lng,
    });
    if (error) throw error;
    return;
  }
  if (item.tipo === "checkout") {
    const base = {
      p_os_id: item.os_id,
      p_em: item.payload.em,
      p_lat: item.payload.lat,
      p_lng: item.payload.lng,
      p_relato: item.payload.relato,
      p_fora_escopo: item.payload.fora_escopo,
    };
    const materiais = item.payload.materiais?.trim();
    let { error } = await supabase.rpc("fn_app_checkout", materiais ? { ...base, p_materiais: materiais } : base);
    // Servidor ainda sem a Fase 5 (função de 7 parâmetros): grava o check-out sem os materiais.
    if (error && materiais && error.code === "PGRST202") ({ error } = await supabase.rpc("fn_app_checkout", base));
    if (error) throw error;
    return;
  }

  const p = item.payload;
  const arquivo = new File(item.arquivo);
  if (arquivo.exists) {
    const { error } = await supabase.storage
      .from(BUCKET_EVIDENCIAS)
      .upload(p.storage_path, await arquivo.arrayBuffer(), { contentType: p.content_type, upsert: false });
    // Reenvio depois de uma queda: o arquivo já subiu.
    const jaExiste = error && (/already exists|duplicate/i.test(error.message) || (error as { statusCode?: string }).statusCode === "409");
    if (error && !jaExiste) throw error;
  }
  const { error } = await supabase.rpc("fn_app_registrar_evidencia", {
    p_os_id: item.os_id,
    p_tipo: p.tipo,
    p_storage_path: p.storage_path,
    p_capturado_em: p.capturado_em,
    p_lat: p.lat,
    p_lng: p.lng,
    p_precisao_m: p.precisao,
    p_descricao: p.descricao,
  });
  if (error) throw error;
}

type ContextoFila = {
  itens: ItemFila[];
  online: boolean;
  sincronizando: boolean;
  /** Muda a cada sincronização com sucesso: as telas recarregam do servidor. */
  versao: number;
  enfileirar: (item: NovoItem) => Promise<void>;
  sincronizar: () => Promise<void>;
  descartar: (id: string) => Promise<void>;
};

const Contexto = createContext<ContextoFila | null>(null);

export function FilaProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemFila[]>([]);
  const [online, setOnline] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [versao, setVersao] = useState(0);
  const rodando = useRef(false);

  const recarregar = useCallback(async () => setItens(await listar()), []);

  const sincronizar = useCallback(async () => {
    if (rodando.current) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    rodando.current = true;
    setSincronizando(true);
    let enviados = 0;
    try {
      const db = await banco();
      const travadas = new Set<string>();
      for (const item of await listar()) {
        if (travadas.has(item.os_id)) continue;
        try {
          await enviar(item);
          await db.runAsync("DELETE FROM fila WHERE id = ?", item.id);
          if (item.arquivo) {
            const f = new File(item.arquivo);
            if (f.exists) f.delete();
          }
          enviados++;
        } catch (e) {
          if (!ehErroDeNegocio(e)) break; // sem rede: tenta de novo depois
          await db.runAsync("UPDATE fila SET tentativas = tentativas + 1, erro = ? WHERE id = ?", mensagem(e), item.id);
          travadas.add(item.os_id);
        }
      }
    } finally {
      rodando.current = false;
      setSincronizando(false);
      await recarregar();
      if (enviados > 0) setVersao((v) => v + 1);
      void listar().then((restantes) => registrarAparelho(restantes.length));
    }
  }, [recarregar]);

  const enfileirar = useCallback(
    async (novo: NovoItem) => {
      const db = await banco();
      const id = randomUUID();
      let arquivo: string | null = null;
      let payload: unknown = novo.payload;
      if (novo.tipo === "evidencia") {
        // Copia para Documentos: o cache da câmera pode ser limpo pelo sistema antes de a rede voltar.
        const destino = new File(pastaFila(), `${id}.${novo.extensao}`);
        await new File(novo.arquivo).copy(destino);
        arquivo = destino.uri;
        payload = { ...novo.payload, storage_path: `${novo.project_id}/${novo.os_id}/${id}.${novo.extensao}` };
      }
      await db.runAsync(
        "INSERT INTO fila (id, tipo, os_id, project_id, payload, arquivo, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id,
        novo.tipo,
        novo.os_id,
        novo.project_id,
        JSON.stringify(payload),
        arquivo,
        new Date().toISOString(),
      );
      await recarregar();
      void sincronizar();
    },
    [recarregar, sincronizar],
  );

  const descartar = useCallback(
    async (id: string) => {
      const db = await banco();
      const item = (await listar()).find((i) => i.id === id);
      if (item?.arquivo) {
        const f = new File(item.arquivo);
        if (f.exists) f.delete();
      }
      await db.runAsync("DELETE FROM fila WHERE id = ?", id);
      await recarregar();
    },
    [recarregar],
  );

  useEffect(() => {
    void recarregar();
    const semRede = NetInfo.addEventListener((estado) => {
      const conectado = estado.isConnected !== false && estado.isInternetReachable !== false;
      setOnline(conectado);
      if (conectado) void sincronizar();
    });
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active") void sincronizar();
    });
    const auth = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN") void sincronizar();
    });
    return () => {
      semRede();
      appState.remove();
      auth.data.subscription.unsubscribe();
    };
  }, [recarregar, sincronizar]);

  const valor = useMemo(
    () => ({ itens, online, sincronizando, versao, enfileirar, sincronizar, descartar }),
    [itens, online, sincronizando, versao, enfileirar, sincronizar, descartar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useFila() {
  const c = useContext(Contexto);
  if (!c) throw new Error("useFila fora do FilaProvider");
  return c;
}
