// Gemini (Google AI) para a Base de Conhecimento: vetores (embeddings) dos trechos e das perguntas.
// Chave no Vault: imobproj_gemini_api_key (lida com lerSegredo, só service_role).
// O vetor tem 768 dimensões — o mesmo tamanho da coluna kb_trechos.vetor.

const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const MODELO_VETOR = "gemini-embedding-001";
export const DIMENSOES = 768;
const TIMEOUT_MS = 30_000;
const LOTE = 100; // limite de requests do batchEmbedContents

export type Tarefa = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
export type Entrada = { texto: string; titulo?: string };

/** Vetores na mesma ordem das entradas. Lança erro se o Gemini recusar. */
export async function gerarVetores(chave: string, entradas: Entrada[], tarefa: Tarefa): Promise<number[][]> {
  const vetores: number[][] = [];
  for (let i = 0; i < entradas.length; i += LOTE) {
    const lote = entradas.slice(i, i + LOTE);
    const resp = await fetch(`${BASE}/models/${MODELO_VETOR}:batchEmbedContents`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        requests: lote.map((e) => ({
          model: `models/${MODELO_VETOR}`,
          content: { parts: [{ text: e.texto }] },
          taskType: tarefa,
          ...(tarefa === "RETRIEVAL_DOCUMENT" && e.titulo ? { title: e.titulo } : {}),
          outputDimensionality: DIMENSOES,
        })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const corpo = (await resp.json().catch(() => ({}))) as {
      embeddings?: { values?: number[] }[];
      error?: { message?: string };
    };
    if (!resp.ok) throw new Error(`Gemini respondeu ${resp.status}: ${corpo.error?.message ?? "sem detalhe"}`);
    const recebidos = corpo.embeddings ?? [];
    if (recebidos.length !== lote.length) throw new Error("Gemini devolveu quantidade de vetores diferente da pedida.");
    for (const r of recebidos) {
      if (!r.values || r.values.length !== DIMENSOES) throw new Error("Gemini devolveu vetor de tamanho inesperado.");
      vetores.push(normalizar(r.values));
    }
  }
  return vetores;
}

// Com menos de 3072 dimensões o Gemini não devolve o vetor normalizado; a distância de cosseno não exige,
// mas normalizar deixa a similaridade comparável entre trechos.
function normalizar(v: number[]): number[] {
  const n = Math.hypot(...v);
  return n > 0 ? v.map((x) => x / n) : v;
}

/** Formato aceito pelo cast ::vector do pgvector. */
export function vetorTexto(v: number[]): string {
  return `[${v.join(",")}]`;
}
