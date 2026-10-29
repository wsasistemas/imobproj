import { z } from "zod";

// Esquemas zod dos Cadastros (Clientes, Usuários e Equipes): usados nos formulários e nas Server Actions.

// z.guid (e não z.uuid): os ids do seed (b0000000-…) não seguem a RFC 4122.
const id = z.guid({ message: "Identificador inválido." });
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Texto muito longo.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

/** Só dígitos; número brasileiro sem DDI ganha o 55. Vazio vira null. */
export const telefone = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .transform((v) => (v.length === 10 || v.length === 11 ? `55${v}` : v))
  .refine((v) => v === "" || (v.length >= 12 && v.length <= 13), "WhatsApp inválido. Use DDD + número.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const email = z.string().trim().toLowerCase().min(1, "Informe o e-mail.").pipe(z.email({ message: "E-mail inválido." }));
const emailOpcional = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const TIPOS_ORGANIZACAO = ["cliente", "prestador", "executora"] as const;
export type TipoOrganizacao = (typeof TIPOS_ORGANIZACAO)[number];
export const ROTULO_TIPO_ORGANIZACAO: Record<TipoOrganizacao, string> = {
  cliente: "Cliente",
  prestador: "Prestador",
  executora: "Interna",
};

export const esquemaCliente = z.object({
  id: id.optional(),
  nome: z.string().trim().min(2, "Informe a razão social.").max(160, "Nome muito longo."),
  nome_fantasia: textoOpcional(120),
  tipo: z.enum(TIPOS_ORGANIZACAO, { message: "Escolha o tipo." }),
  cnpj: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 14, "CNPJ deve ter 14 dígitos.")
    .transform((v) => (v === "" ? null : v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")))
    .nullable()
    .optional(),
  segmento: textoOpcional(80),
  endereco: textoOpcional(240),
  ativo: z.boolean(),
});
export type ClienteEntrada = z.input<typeof esquemaCliente>;

export const esquemaContato = z.object({
  id: id.optional(),
  organization_id: id,
  nome: z.string().trim().min(2, "Informe o nome.").max(120, "Nome muito longo."),
  cargo: textoOpcional(80),
  email: emailOpcional,
  telefone_whatsapp: telefone,
  principal: z.boolean(),
});
export type ContatoEntrada = z.input<typeof esquemaContato>;

export const esquemaUsuario = z.object({
  id: id.optional(),
  nome: z.string().trim().min(2, "Informe o nome (pelo menos 2 letras).").max(120, "Nome muito longo."),
  email,
  telefone_whatsapp: telefone,
  cargo: textoOpcional(80),
  organization_id: id.nullable().optional(),
  atende_whatsapp: z.boolean(),
  ativo: z.boolean(),
  equipes: z.array(id),
  /** Chave do perfil de acesso (imobproj.perfis). Só o super admin troca. */
  perfil: z.string().max(41).nullable().optional(),
});
export type UsuarioEntrada = z.input<typeof esquemaUsuario>;

export const esquemaEquipe = z.object({
  id: id.optional(),
  nome: z.string().trim().min(2, "Informe o nome da equipe.").max(80, "Nome muito longo."),
  setor: textoOpcional(80),
  lider_id: id.nullable().optional(),
});
export type EquipeEntrada = z.input<typeof esquemaEquipe>;

export const esquemaMembroEquipe = z.object({ team_id: id, user_id: id });
export const esquemaId = z.object({ id });
