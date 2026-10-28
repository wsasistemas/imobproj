"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { criarOs } from "@/app/(app)/projetos/[id]/os/acoes";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ROTULO_PAPEL } from "@/lib/projeto/tipos";
import { Campo, CampoSelect } from "./campos";
import { buscarOpcoesNovaOs, chavesOs, numeroOs } from "./dados";

const NENHUM = "__nenhum__";

const esquema = z
  .object({
    titulo: z.string().trim().min(3, "Informe um título com ao menos 3 caracteres.").max(200, "Título muito longo."),
    descricao: z.string().max(5000, "Descrição muito longa."),
    wbsItemId: z.string(),
    executorId: z.string(),
    inicio: z.string(),
    fim: z.string(),
    horasPrevistas: z
      .string()
      .refine((v) => v.trim() === "" || (!Number.isNaN(Number(v.replace(",", "."))) && Number(v.replace(",", ".")) >= 0), {
        message: "Informe um número de horas válido.",
      }),
  })
  .refine((v) => !v.fim || !!v.inicio, { message: "Informe o início do agendamento.", path: ["inicio"] })
  .refine((v) => !v.fim || !v.inicio || new Date(v.fim) >= new Date(v.inicio), {
    message: "O fim deve ser depois do início.",
    path: ["fim"],
  });

type Formulario = z.infer<typeof esquema>;

const VAZIO: Formulario = {
  titulo: "",
  descricao: "",
  wbsItemId: NENHUM,
  executorId: NENHUM,
  inicio: "",
  fim: "",
  horasPrevistas: "",
};

/** "Nova OS" (gerente). O número é gerado pelo trigger trg_service_orders_numero. */
export function DialogNovaOs({ projetoId, aoCriar }: { projetoId: string; aoCriar?: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const queryClient = useQueryClient();

  const opcoes = useQuery({
    queryKey: chavesOs.opcoes(projetoId),
    queryFn: () => buscarOpcoesNovaOs(projetoId),
    enabled: aberto,
  });

  const form = useForm<Formulario>({ resolver: zodResolver(esquema), defaultValues: VAZIO });
  const { errors } = form.formState;

  const mutacao = useMutation({
    mutationFn: async (v: Formulario) => {
      const horas = v.horasPrevistas.trim() === "" ? null : Number(v.horasPrevistas.replace(",", "."));
      const r = await criarOs({
        projectId: projetoId,
        titulo: v.titulo,
        descricao: v.descricao,
        wbsItemId: v.wbsItemId === NENHUM ? null : v.wbsItemId,
        executorId: v.executorId === NENHUM ? null : v.executorId,
        // datetime-local é hora local do navegador → ISO com fuso
        agendadaInicio: v.inicio ? new Date(v.inicio).toISOString() : null,
        agendadaFim: v.fim ? new Date(v.fim).toISOString() : null,
        horasPrevistas: horas,
      });
      if (!r.ok) throw new Error(r.erro);
      return r.dados;
    },
    onSuccess: (d) => {
      toast.success(`${numeroOs(d.numero)} criada.`);
      queryClient.invalidateQueries({ queryKey: chavesOs.raiz(projetoId) });
      form.reset(VAZIO);
      setAberto(false);
      aoCriar?.(d.id);
    },
    onError: (e) => toast.error(e.message),
  });

  const atividades = [
    { value: NENHUM, label: "Sem atividade vinculada" },
    ...(opcoes.data?.atividades ?? []).map((a) => ({ value: a.id, label: `${a.codigo} · ${a.titulo}` })),
  ];
  const membros = [
    { value: NENHUM, label: "Definir depois" },
    ...(opcoes.data?.membros ?? []).map((m) => ({ value: m.id, label: `${m.nome} (${ROTULO_PAPEL[m.papel]})` })),
  ];

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => {
        setAberto(a);
        if (!a) form.reset(VAZIO);
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus aria-hidden="true" />
        Nova OS
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Serviço</DialogTitle>
          <DialogDescription>
            O número é gerado automaticamente. Com agendamento, a OS já nasce como &quot;Agendada&quot;; sem, fica em
            rascunho.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-nova-os"
          noValidate
          onSubmit={form.handleSubmit((v) => mutacao.mutate(v))}
          className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1"
        >
          <Campo id="nova-os-titulo" rotulo="Título" erro={errors.titulo?.message} obrigatorio>
            <Input
              id="nova-os-titulo"
              autoFocus
              aria-invalid={!!errors.titulo}
              aria-describedby={errors.titulo ? "nova-os-titulo-erro" : undefined}
              placeholder="Ex.: Workshop de requisitos com a central"
              {...form.register("titulo")}
            />
          </Campo>

          <Campo id="nova-os-descricao" rotulo="Descrição" erro={errors.descricao?.message}>
            <Textarea
              id="nova-os-descricao"
              rows={3}
              placeholder="O que será feito, onde e o que se espera como entrega."
              {...form.register("descricao")}
            />
          </Campo>

          {opcoes.isPending ? (
            <div className="grid gap-4" aria-busy="true" aria-label="Carregando EAP e equipe">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : opcoes.isError ? (
            <p role="alert" className="text-[13px] text-danger">
              {opcoes.error.message}{" "}
              <button type="button" className="underline" onClick={() => opcoes.refetch()}>
                Tentar de novo
              </button>
            </p>
          ) : (
            <>
              <Campo
                id="nova-os-atividade"
                rotulo="Atividade da EAP"
                dica={atividades.length === 1 ? "A EAP ainda não tem atividades. Cadastre-as em Documentação e EAP." : undefined}
              >
                <Controller
                  control={form.control}
                  name="wbsItemId"
                  render={({ field }) => (
                    <CampoSelect id="nova-os-atividade" opcoes={atividades} valor={field.value} aoMudar={field.onChange} />
                  )}
                />
              </Campo>
              <Campo id="nova-os-executor" rotulo="Executor">
                <Controller
                  control={form.control}
                  name="executorId"
                  render={({ field }) => (
                    <CampoSelect id="nova-os-executor" opcoes={membros} valor={field.value} aoMudar={field.onChange} />
                  )}
                />
              </Campo>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="nova-os-inicio" rotulo="Início agendado" erro={errors.inicio?.message}>
              <Input
                id="nova-os-inicio"
                type="datetime-local"
                aria-invalid={!!errors.inicio}
                aria-describedby={errors.inicio ? "nova-os-inicio-erro" : undefined}
                {...form.register("inicio")}
              />
            </Campo>
            <Campo id="nova-os-fim" rotulo="Fim agendado" erro={errors.fim?.message}>
              <Input
                id="nova-os-fim"
                type="datetime-local"
                aria-invalid={!!errors.fim}
                aria-describedby={errors.fim ? "nova-os-fim-erro" : undefined}
                {...form.register("fim")}
              />
            </Campo>
          </div>

          <Campo id="nova-os-horas" rotulo="Horas previstas" erro={errors.horasPrevistas?.message} className="sm:max-w-[50%]">
            <Input
              id="nova-os-horas"
              inputMode="decimal"
              placeholder="Ex.: 8"
              aria-invalid={!!errors.horasPrevistas}
              aria-describedby={errors.horasPrevistas ? "nova-os-horas-erro" : undefined}
              {...form.register("horasPrevistas")}
            />
          </Campo>
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="form-nova-os" disabled={mutacao.isPending}>
            {mutacao.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Criar OS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
