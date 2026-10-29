import { z } from "zod";

// Esquemas zod de Configurações gerais (Fase 6): um por aba, usados no formulário e nas Server Actions.

const url = z
  .string()
  .trim()
  .max(300, "Endereço muito longo.")
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Use um endereço que comece com http:// ou https://.")
  .transform((v) => v || null)
  .nullable();

export const FUSOS = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Cuiaba", label: "Cuiabá (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT-2)" },
] as const;

export const esquemaEmpresa = z.object({
  empresa_nome: z.string().trim().min(2, "Informe o nome da empresa.").max(120, "Nome muito longo."),
  empresa_cnpj: z
    .string()
    .trim()
    .refine((v) => v === "" || v.replace(/\D/g, "").length === 14, "O CNPJ tem 14 dígitos.")
    .transform((v) => v || null)
    .nullable(),
  fuso: z.enum(FUSOS.map((f) => f.value) as [string, ...string[]], { message: "Escolha um fuso da lista." }),
  valor_hora_tecnica: z.number({ message: "Informe o valor da hora." }).min(0, "O valor não pode ser negativo.").max(100000, "Valor alto demais."),
});

export const esquemaOs = z.object({
  os_numero_inicial: z.number().int("Use um número inteiro.").min(1, "O número começa em 1.").max(999999, "Número alto demais."),
  aceite_automatico_horas: z.number().int("Use horas inteiras.").min(0, "Use 0 para desligar.").max(2160, "No máximo 2160 h (90 dias)."),
  exigir_foto_checkout: z.boolean(),
  exigir_assinatura_checkout: z.boolean(),
  avisar_cliente_abertura_os: z.boolean(),
  resumo_semanal_usuario_chave: z.boolean(),
});

export const esquemaNotificacoes = z.object({
  notificar_os_atribuida: z.boolean(),
  notificar_os_decidida: z.boolean(),
  notificar_ata_publicada: z.boolean(),
  email_remetente_nome: z.string().trim().min(2, "Informe o nome do remetente.").max(60, "Nome muito longo."),
});

export const esquemaIntegracoes = z.object({
  app_campo_url: url,
  portal_url: url,
});

export const ABAS_CONFIG = ["empresa", "os", "notificacoes", "integracoes"] as const;
export type AbaConfig = (typeof ABAS_CONFIG)[number];

export type Configuracoes = z.output<typeof esquemaEmpresa> &
  z.output<typeof esquemaOs> &
  z.output<typeof esquemaNotificacoes> &
  z.output<typeof esquemaIntegracoes> & { logo_path: string | null; updated_at: string | null };
