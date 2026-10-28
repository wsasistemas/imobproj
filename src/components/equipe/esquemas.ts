import { z } from "zod";
import type { PapelMembro } from "@/lib/projeto/tipos";

// Esquemas zod do módulo Equipe e permissões: usados no Dialog (cliente) e nas Server Actions (servidor).

export const PAPEIS_MEMBRO = [
  "diretor",
  "gerente",
  "usuario_chave",
  "analista",
  "prestador",
] as const satisfies readonly PapelMembro[];

const papel = z.enum(PAPEIS_MEMBRO, { message: "Escolha o papel no projeto." });
// z.guid (e não z.uuid): os ids do seed (c0000000-…) não seguem a RFC 4122.
const id = z.guid({ message: "Identificador inválido." });

export const esquemaNovoMembro = z.object({
  projectId: id,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Informe o e-mail.")
    .pipe(z.email({ message: "E-mail inválido." })),
  nome: z.string().trim().min(2, "Informe o nome (pelo menos 2 letras).").max(120, "Nome muito longo."),
  papel,
});
export type NovoMembro = z.input<typeof esquemaNovoMembro>;

export const esquemaAlterarPapel = z.object({ membroId: id, papel });
export const esquemaAlterarAtivo = z.object({ membroId: id, ativo: z.boolean() });
export const esquemaMembro = z.object({ membroId: id });
export const esquemaProjeto = z.object({ projectId: id });
