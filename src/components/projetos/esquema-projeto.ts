import { z } from "zod";

// Validação do "Novo projeto": usada no Dialog (react-hook-form) e de novo na Server Action.

export const SITUACOES_PROJETO = ["planejamento", "execucao", "homologacao", "encerrado", "suspenso"] as const;

const dataOpcional = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida.");

export const esquemaNovoProjeto = z
  .object({
    codigo: z
      .string()
      .trim()
      .min(2, "Informe o código (ex.: PRJ-015).")
      .max(30, "Use no máximo 30 caracteres.")
      .regex(/^[A-Za-z0-9._-]+$/, "Use letras, números, ponto, hífen ou sublinhado."),
    nome: z.string().trim().min(3, "Informe o nome do projeto.").max(160, "Use no máximo 160 caracteres."),
    cliente_org_id: z.guid("Escolha o cliente."),
    executora_org_id: z.union([z.guid(), z.literal("")]),
    inicio: dataOpcional,
    fim: dataOpcional,
    horas_orcadas: z
      .number({ error: "Informe as horas orçadas (0 se ainda não houver)." })
      .min(0, "As horas não podem ser negativas.")
      .max(99_999_999, "Valor alto demais."),
    status: z.enum(SITUACOES_PROJETO),
  })
  .refine((d) => !d.inicio || !d.fim || d.fim >= d.inicio, {
    path: ["fim"],
    message: "O fim deve ser igual ou posterior ao início.",
  });

export type DadosNovoProjeto = z.infer<typeof esquemaNovoProjeto>;
