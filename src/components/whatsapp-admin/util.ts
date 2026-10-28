import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ResultadoAcao } from "@/lib/acoes";

export const CHAVE_ADMIN_WHATSAPP = ["admin", "whatsapp"] as const;

/** Desembrulha o ResultadoAcao para o useMutation (erro vira exceção com a mensagem da action). */
export async function executar<T>(promessa: Promise<ResultadoAcao<T>>): Promise<T> {
  const r = await promessa;
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

/** "há 12 s", "há 3 min", "há 2 h", "há 4 dias". */
export function haQuanto(iso: string | null | undefined, agora: number): string {
  if (!iso) return "sem sinal";
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

export const formatarMs = (ms: number) => `${new Intl.NumberFormat("pt-BR").format(ms)} ms`;

/** 5511999990000 → +55 (11) 99999-0000 */
export function telefoneFormatado(tel: string | null | undefined): string {
  const d = String(tel ?? "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d || "—";
}

export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
