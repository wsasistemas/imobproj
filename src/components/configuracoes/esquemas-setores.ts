import { z } from "zod";

// Esquemas zod de Setores e números e de Fila e horários (Fase 3): usados nos formulários e nas Server Actions.

// z.guid (e não z.uuid): os ids do seed (b3000000-…) não seguem a RFC 4122.
const id = z.guid({ message: "Identificador inválido." });
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM.");

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

export const TIPOS_MENSAGEM = ["boas_vindas", "fora_horario", "encerramento"] as const;
export type TipoMensagem = (typeof TIPOS_MENSAGEM)[number];
export const ROTULO_MENSAGEM: Record<TipoMensagem, string> = {
  boas_vindas: "Boas-vindas",
  fora_horario: "Fora do horário",
  encerramento: "Encerramento",
};
export const VARIAVEIS_MENSAGEM = ["{cliente}", "{ticket}", "{setor}", "{atendente}"] as const;

export const esquemaSetor = z.object({
  id: id.optional(),
  nome: z.string().trim().min(2, "Informe o nome do setor.").max(60, "Nome muito longo."),
  gestor_id: id.nullable().optional(),
  ativo: z.boolean(),
  numeros: z.array(id).max(20, "Muitos números."),
  equipes: z.array(id).max(50, "Muitas equipes."),
});
export type SetorEntrada = z.input<typeof esquemaSetor>;

export const esquemaIdSetor = z.object({ id });

export const esquemaHorarios = z.object({
  setor_id: id,
  horarios: z
    .array(
      z
        .object({ dia_semana: z.number().int().min(0).max(6), aberto: z.boolean(), abre: hora, fecha: hora })
        .refine((h) => !h.aberto || h.fecha > h.abre, { message: "O fechamento precisa ser depois da abertura." }),
    )
    .length(7, "Informe os 7 dias da semana."),
});

export const esquemaFeriado = z.object({
  setor_id: id,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
  descricao: z.string().trim().max(80, "Descrição muito longa."),
});
export const esquemaFeriadoChave = z.object({ setor_id: id, data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export const esquemaRegras = z.object({
  setor_id: id,
  limite_por_atendente: z.coerce.number().int().min(1, "Mínimo 1.").max(50, "Máximo 50."),
  distribuicao_automatica: z.boolean(),
  devolver_sem_resposta_min: z.coerce.number().int().min(1, "Mínimo 1 minuto.").max(1440, "Máximo 24 h."),
  encerrar_inatividade_min: z.coerce.number().int().min(5, "Mínimo 5 minutos.").max(10080, "Máximo 7 dias."),
  pesquisa_satisfacao: z.boolean(),
});

export const esquemaMensagens = z.object({
  setor_id: id,
  mensagens: z
    .array(
      z.object({
        tipo: z.enum(TIPOS_MENSAGEM),
        texto: z.string().trim().max(1000, "Mensagem muito longa."),
        ativo: z.boolean(),
      }),
    )
    .min(1),
});
