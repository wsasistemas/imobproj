// Utilidades puras do módulo Documentação e EAP (usadas no cliente e nas Server Actions).
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// ---------------------------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------------------------
export const formatoHoras = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
export const formatoPercentual = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** "2026-08-03" → "03/08/2026". */
export function dataCurta(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "dd/MM/yyyy", { locale: ptBR }) : "—";
}

/** Timestamp → "03/08/2026 14:32". */
export function dataHora(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";
}

// ---------------------------------------------------------------------------------------------
// Versionamento de documentos
//   - cada arquivo enviado sobe a versão menor: 1.0 → 1.1 → 1.2 (…1.9 → 1.10);
//   - aprovar fecha a versão maior: 1.2 → 2.0, 0.3 → 1.0. Se já está em X.0 (ex.: primeiro envio 1.0),
//     a aprovação mantém X.0 — não faz sentido aprovar 1.0 e virar 2.0 sem nenhuma alteração.
// ---------------------------------------------------------------------------------------------
export function partesVersao(versao: string): [number, number] {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(versao.trim());
  if (!m) return [1, 0];
  return [Number(m[1]), Number(m[2] ?? 0)];
}

export function proximaVersaoMenor(versao: string) {
  const [maior, menor] = partesVersao(versao);
  return `${maior}.${menor + 1}`;
}

export function versaoAoAprovar(versao: string) {
  const [maior, menor] = partesVersao(versao);
  return menor === 0 ? `${maior}.0` : `${maior + 1}.0`;
}

/** Nome de arquivo seguro para o Storage: sem acento, minúsculo, só [a-z0-9._-]. */
export function sanitizarNomeArquivo(nome: string) {
  const semAcento = nome.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const ponto = semAcento.lastIndexOf(".");
  const base = ponto > 0 ? semAcento.slice(0, ponto) : semAcento;
  const ext = ponto > 0 ? semAcento.slice(ponto + 1) : "";
  const limpar = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  const b = limpar(base).slice(0, 80) || "arquivo";
  const e = limpar(ext).slice(0, 10);
  return e ? `${b}.${e}` : b;
}

/** <project_id>/<document_id>/<versao>-<nome-sanitizado> (o 1º segmento é o que a política de storage confere). */
export function caminhoArquivo(projectId: string, documentId: string, versao: string, nomeArquivo: string) {
  return `${projectId}/${documentId}/${versao}-${sanitizarNomeArquivo(nomeArquivo)}`;
}

export const TAMANHO_MAXIMO_ARQUIVO = 50 * 1024 * 1024; // igual ao file_size_limit do bucket

// ---------------------------------------------------------------------------------------------
// Códigos da EAP (1, 1.2, 1.2.3)
// ---------------------------------------------------------------------------------------------
export const REGEX_CODIGO_EAP = /^\d+(\.\d+)*$/;

export function segmentosCodigo(codigo: string) {
  return codigo.split(".").map((s) => Number(s));
}

/** Ordenação natural: 1 < 1.2 < 1.10 < 2. */
export function compararCodigos(a: string, b: string) {
  const sa = segmentosCodigo(a);
  const sb = segmentosCodigo(b);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const x = sa[i];
    const y = sb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x !== y) return x - y;
  }
  return 0;
}

/** "2.3.1" → "2.3"; "2" → null. */
export function codigoPai(codigo: string) {
  const i = codigo.lastIndexOf(".");
  return i === -1 ? null : codigo.slice(0, i);
}

/** Próximo código livre sob um pai (null = raiz), olhando os códigos já existentes. */
export function proximoCodigoFilho(codigoDoPai: string | null, codigosExistentes: string[]) {
  const prefixo = codigoDoPai ? `${codigoDoPai}.` : "";
  let maior = 0;
  for (const c of codigosExistentes) {
    if (codigoPai(c) !== codigoDoPai) continue;
    const ultimo = Number(c.slice(prefixo.length));
    if (Number.isFinite(ultimo) && ultimo > maior) maior = ultimo;
  }
  return `${prefixo}${maior + 1}`;
}

/** Converte "12,5" / "12.5" / 12.5 em número; "" → 0; inválido → NaN. */
export function numeroBr(valor: unknown): number {
  if (typeof valor === "number") return valor;
  if (valor === null || valor === undefined) return 0;
  const s = String(valor).trim();
  if (s === "") return 0;
  const normalizado = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(normalizado);
}
