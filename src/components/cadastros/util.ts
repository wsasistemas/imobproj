import type { ResultadoAcao } from "@/lib/acoes";

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const a = partes[0][0] ?? "";
  const b = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (a + b).toUpperCase();
}

/** "5519998124410" → "(19) 99812-4410". */
export function formatarTelefone(digitos: string | null | undefined) {
  if (!digitos) return "";
  const local = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
  const m = /^(\d{2})(\d{4,5})(\d{4})$/.exec(local);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : digitos;
}

export async function executar<T>(promessa: Promise<ResultadoAcao<T>>): Promise<T> {
  const r = await promessa;
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
}

export function primeiroErro(e: { issues: { message: string }[] }) {
  return e.issues[0]?.message ?? "Dados inválidos.";
}
