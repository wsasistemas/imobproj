// Design system da PARTE B (IMOBSYSTEMS) adaptado ao celular:
// cabeçalho escuro, botões vermelhos com no mínimo 48 px de altura e cartões brancos com raio 14.

export const cor = {
  cabecalho: "#1E2126",
  cabecalhoHover: "#2A2E35",
  cabecalhoTexto: "#D1D5DB",
  cabecalhoRotulo: "#9CA3AF",
  primaria: "#D52B36",
  primariaPressionada: "#B91C1C",
  primariaSuave: "#FFF5F5",
  primariaBorda: "#F5C2C5",
  fundo: "#F5F6F8",
  superficie: "#FFFFFF",
  borda: "#E5E7EB",
  bordaSuave: "#F0F1F3",
  texto: "#1F2937",
  suave: "#6B7280",
  sucessoFundo: "#E7F5EC",
  sucesso: "#166534",
  alertaFundo: "#FEF3C7",
  alerta: "#92400E",
  infoFundo: "#E6EEFD",
  info: "#1D4ED8",
  perigoFundo: "#FDECEC",
  perigo: "#B91C1C",
  roxoFundo: "#F1EAFD",
  roxo: "#6D28D9",
  bannerInfoFundo: "#EFF6FF",
  bannerInfoBorda: "#BFDBFE",
} as const;

export const raio = { cartao: 14, botao: 10, pilula: 999 } as const;
export const espaco = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const ALTURA_MINIMA_BOTAO = 48;

export const texto = {
  titulo: { fontSize: 22, fontWeight: "700", color: cor.texto },
  subtitulo: { fontSize: 14, color: cor.suave },
  corpo: { fontSize: 15, color: cor.texto },
  rotuloSecao: { fontSize: 11.5, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: cor.suave },
} as const;
