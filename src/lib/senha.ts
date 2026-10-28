import { z } from "zod";

/** Regra de senha nova (redefinição e "Alterar senha"): 8+ caracteres, com letra e número. */
export const esquemaNovaSenha = z
  .object({
    senha: z
      .string()
      .min(8, "Use pelo menos 8 caracteres.")
      .regex(/[A-Za-z]/, "Inclua pelo menos uma letra.")
      .regex(/\d/, "Inclua pelo menos um número."),
    confirmacao: z.string().min(1, "Repita a senha."),
  })
  .refine((v) => v.senha === v.confirmacao, { message: "As senhas não conferem.", path: ["confirmacao"] });

export type NovaSenha = z.infer<typeof esquemaNovaSenha>;
