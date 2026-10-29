// Datas no fuso do aparelho, sem depender do Intl do Hermes.

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const dois = (n: number) => String(n).padStart(2, "0");

export const hora = (d: Date) => `${dois(d.getHours())}:${dois(d.getMinutes())}`;
export const data = (d: Date) => `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
export const dataHora = (d: Date) => `${data(d)} ${hora(d)}`;
export const diaCurto = (d: Date) => DIAS_CURTOS[d.getDay()];

/** "Quarta-feira, 28 de outubro" — só a primeira letra maiúscula. */
export function dataPorExtenso(d: Date) {
  const s = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function horario(inicio: string | null, fim: string | null) {
  if (!inicio) return "Sem horário";
  const i = new Date(inicio);
  return fim ? `${hora(i)}–${hora(new Date(fim))}` : hora(i);
}

export function inicioDoDia(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Domingo da semana de d (a semana começa no domingo, como no portal). */
export function inicioDaSemana(d = new Date()) {
  const dia = inicioDoDia(d);
  dia.setDate(dia.getDate() - dia.getDay());
  return dia;
}

export function somarDias(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function mesmoDia(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function horasEntre(inicio: string, fim: Date) {
  const h = (fim.getTime() - new Date(inicio).getTime()) / 3_600_000;
  return Math.max(0, Math.round(h * 100) / 100);
}

export const formatarHoras = (h: number) => `${h.toFixed(2).replace(".", ",")} h`;

export function coordenadas(lat: number | null | undefined, lng: number | null | undefined) {
  if (lat == null || lng == null) return "sem GPS";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
