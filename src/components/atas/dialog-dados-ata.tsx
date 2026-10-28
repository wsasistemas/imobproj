"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { atualizarDadosAta, criarAta } from "@/app/(app)/projetos/[id]/atas/acoes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Campo } from "./campos";
import { chavesAtas, numeroAta, type AtaResumo } from "./dados";

const esquema = z
  .object({
    titulo: z.string().trim().min(3, "Informe um título com ao menos 3 caracteres.").max(200, "Título muito longo."),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da reunião."),
    inicio: z.string(),
    fim: z.string(),
    local: z.string().max(200, "Local muito longo."),
  })
  .refine((v) => !v.fim || !!v.inicio, { message: "Informe o horário de início.", path: ["inicio"] })
  .refine((v) => !v.inicio || !v.fim || v.fim >= v.inicio, { message: "O fim deve ser depois do início.", path: ["fim"] });

type Formulario = z.infer<typeof esquema>;

const vazio = (): Formulario => ({ titulo: "", data: format(new Date(), "yyyy-MM-dd"), inicio: "", fim: "", local: "" });

/** "Nova ata" (sem `ata`) ou "Editar dados" (com `ata`). O número é gerado pelo trigger trg_meetings_numero. */
export function DialogDadosAta({
  projetoId,
  ata,
  aoSalvar,
}: {
  projetoId: string;
  ata?: AtaResumo;
  aoSalvar?: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const queryClient = useQueryClient();
  const edicao = !!ata;
  const inicial = (): Formulario =>
    ata
      ? {
          titulo: ata.titulo,
          data: ata.data,
          inicio: ata.inicio?.slice(0, 5) ?? "",
          fim: ata.fim?.slice(0, 5) ?? "",
          local: ata.local ?? "",
        }
      : vazio();

  const form = useForm<Formulario>({ resolver: zodResolver(esquema), defaultValues: inicial() });
  const { errors } = form.formState;

  const mutacao = useMutation({
    mutationFn: async (v: Formulario) => {
      const base = {
        projectId: projetoId,
        titulo: v.titulo,
        data: v.data,
        inicio: v.inicio || null,
        fim: v.fim || null,
        local: v.local.trim() || null,
      };
      if (ata) {
        const r = await atualizarDadosAta({ ...base, meetingId: ata.id });
        if (!r.ok) throw new Error(r.erro);
        return { id: ata.id, numero: ata.numero };
      }
      const r = await criarAta(base);
      if (!r.ok) throw new Error(r.erro);
      return r.dados;
    },
    onSuccess: (d) => {
      toast.success(edicao ? "Dados da ata atualizados." : `${numeroAta(d.numero)} criada em rascunho.`);
      queryClient.invalidateQueries({ queryKey: chavesAtas.raiz(projetoId) });
      setAberto(false);
      aoSalvar?.(d.id);
    },
    onError: (e) => toast.error(e.message),
  });

  const id = edicao ? "editar-ata" : "nova-ata";

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => {
        setAberto(a);
        if (a) form.reset(inicial());
      }}
    >
      {edicao ? (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Pencil aria-hidden="true" />
          Editar dados
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus aria-hidden="true" />
          Nova ata
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{edicao ? `Editar ${numeroAta(ata.numero)}` : "Nova ata de reunião"}</DialogTitle>
          <DialogDescription>
            {edicao
              ? "Título, data, horário e local da reunião."
              : "A ata nasce em rascunho com número automático. Depois inclua participantes, pauta, decisões e encaminhamentos."}
          </DialogDescription>
        </DialogHeader>

        <form id={`form-${id}`} noValidate onSubmit={form.handleSubmit((v) => mutacao.mutate(v))} className="grid gap-4">
          <Campo id={`${id}-titulo`} rotulo="Título" erro={errors.titulo?.message} obrigatorio>
            <Input
              id={`${id}-titulo`}
              autoFocus
              aria-invalid={!!errors.titulo}
              aria-describedby={errors.titulo ? `${id}-titulo-erro` : undefined}
              placeholder="Ex.: Status semanal nº 13"
              {...form.register("titulo")}
            />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo id={`${id}-data`} rotulo="Data" erro={errors.data?.message} obrigatorio>
              <Input
                id={`${id}-data`}
                type="date"
                aria-invalid={!!errors.data}
                aria-describedby={errors.data ? `${id}-data-erro` : undefined}
                {...form.register("data")}
              />
            </Campo>
            <Campo id={`${id}-inicio`} rotulo="Início" erro={errors.inicio?.message}>
              <Input
                id={`${id}-inicio`}
                type="time"
                aria-invalid={!!errors.inicio}
                aria-describedby={errors.inicio ? `${id}-inicio-erro` : undefined}
                {...form.register("inicio")}
              />
            </Campo>
            <Campo id={`${id}-fim`} rotulo="Fim" erro={errors.fim?.message}>
              <Input
                id={`${id}-fim`}
                type="time"
                aria-invalid={!!errors.fim}
                aria-describedby={errors.fim ? `${id}-fim-erro` : undefined}
                {...form.register("fim")}
              />
            </Campo>
          </div>
          <Campo id={`${id}-local`} rotulo="Local" erro={errors.local?.message}>
            <Input id={`${id}-local`} placeholder="Ex.: Calper · Sala 3 ou Google Meet" {...form.register("local")} />
          </Campo>
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button type="submit" form={`form-${id}`} disabled={mutacao.isPending}>
            {mutacao.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {edicao ? "Salvar" : "Criar ata"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
