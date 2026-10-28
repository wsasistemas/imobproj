import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// Formatação usada nas telas de Projetos (lista e visão geral).

const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Horas/percentuais em pt-BR, com no máximo 1 casa decimal. */
export const numero = (n: number | string | null | undefined) => nf1.format(Number(n ?? 0));

/** Data de hoje no fuso local, no formato do banco (yyyy-MM-dd). */
export const hojeISO = () => format(new Date(), "yyyy-MM-dd");

/** Datas "date" do Postgres (yyyy-MM-dd) lidas sem deslocamento de fuso. */
export const lerData = (iso: string) => parseISO(iso.length === 10 ? `${iso}T12:00:00` : iso);

/** 18/12/2026 (ou "—"). */
export const dataCurta = (iso: string | null | undefined) => (iso ? format(lerData(iso), "dd/MM/yyyy") : "—");

/** "sexta-feira, 18 de dezembro de 2026". */
export const dataExtenso = (iso: string) => format(lerData(iso), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

/** "hoje", "amanhã", "em 12 dias". */
export function distanciaDias(iso: string): string {
  const dias = differenceInCalendarDays(lerData(iso), new Date());
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias < 0) return `há ${-dias} dias`;
  return `em ${dias} dias`;
}

/** Período do projeto: "03/08/2026 a 18/12/2026". */
export const periodo = (inicio: string | null, fim: string | null) =>
  !inicio && !fim ? "Sem período definido" : `${dataCurta(inicio)} a ${dataCurta(fim)}`;

/** Iniciais para o avatar: "Fernanda Rocha" → "FR". */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}
