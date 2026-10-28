"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { criarProjeto } from "@/app/(app)/projetos/acoes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SITUACAO_PROJETO } from "@/lib/projeto/tipos";
import { useOrganizacoes } from "./consultas";
import { esquemaNovoProjeto, SITUACOES_PROJETO, type DadosNovoProjeto } from "./esquema-projeto";

const VAZIO: DadosNovoProjeto = {
  codigo: "",
  nome: "",
  cliente_org_id: "",
  executora_org_id: "",
  inicio: "",
  fim: "",
  horas_orcadas: 0,
  status: "planejamento",
};

function Erro({ id, mensagem }: { id: string; mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <p id={id} className="text-[12.5px] text-danger">
      {mensagem}
    </p>
  );
}

/** Botão "Novo projeto" + Dialog. Só é renderizado para o super admin (a Server Action confere de novo). */
export function DialogNovoProjeto() {
  const [aberto, setAberto] = useState(false);
  const [enviando, iniciar] = useTransition();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: orgs = [], isLoading: carregandoOrgs } = useOrganizacoes();
  const clientes = orgs.filter((o) => o.tipo === "cliente");
  const executoras = orgs.filter((o) => o.tipo === "executora");

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DadosNovoProjeto>({ resolver: zodResolver(esquemaNovoProjeto), defaultValues: VAZIO });

  const enviar = handleSubmit((dados) =>
    iniciar(async () => {
      const r = await criarProjeto(dados);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(`Projeto ${dados.codigo.toUpperCase()} criado.`);
      await queryClient.invalidateQueries({ queryKey: ["projetos"] });
      setAberto(false);
      reset(VAZIO);
      router.push(`/projetos/${r.dados.id}`);
    }),
  );

  const itensCliente = Object.fromEntries(clientes.map((o) => [o.id, o.nome]));
  const itensExecutora = { "": "Sem executora", ...Object.fromEntries(executoras.map((o) => [o.id, o.nome])) };
  const itensSituacao = Object.fromEntries(SITUACOES_PROJETO.map((s) => [s, SITUACAO_PROJETO[s].label]));

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) reset(VAZIO);
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus aria-hidden="true" />
        Novo projeto
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>
            Cadastre os dados básicos. Depois de criar, inclua a equipe em Administração e monte a EAP em Documentação.
          </DialogDescription>
        </DialogHeader>

        <form id="form-novo-projeto" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="np-codigo">Código</Label>
            <Input
              id="np-codigo"
              placeholder="PRJ-015"
              autoComplete="off"
              className="uppercase"
              aria-invalid={!!errors.codigo}
              aria-describedby={errors.codigo ? "np-codigo-erro" : undefined}
              {...register("codigo")}
            />
            <Erro id="np-codigo-erro" mensagem={errors.codigo?.message} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="np-status">Situação</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select items={itensSituacao} value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                  <SelectTrigger id="np-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SITUACOES_PROJETO.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SITUACAO_PROJETO[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="np-nome">Nome</Label>
            <Input
              id="np-nome"
              placeholder="Portal de Tickets Calper"
              aria-invalid={!!errors.nome}
              aria-describedby={errors.nome ? "np-nome-erro" : undefined}
              {...register("nome")}
            />
            <Erro id="np-nome-erro" mensagem={errors.nome?.message} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="np-cliente">Cliente</Label>
            <Controller
              control={control}
              name="cliente_org_id"
              render={({ field }) => (
                <Select
                  items={itensCliente}
                  value={field.value || null}
                  onValueChange={(v) => field.onChange(v ?? "")}
                  disabled={carregandoOrgs || clientes.length === 0}
                >
                  <SelectTrigger id="np-cliente" className="w-full" aria-invalid={!!errors.cliente_org_id}>
                    <SelectValue placeholder={carregandoOrgs ? "Carregando…" : "Escolha o cliente"} />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {!carregandoOrgs && clientes.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                Nenhuma organização do tipo cliente cadastrada. Cadastre em Administração.
              </p>
            ) : (
              <Erro id="np-cliente-erro" mensagem={errors.cliente_org_id?.message} />
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="np-executora">Executora</Label>
            <Controller
              control={control}
              name="executora_org_id"
              render={({ field }) => (
                <Select
                  items={itensExecutora}
                  value={field.value}
                  onValueChange={(v) => field.onChange(v ?? "")}
                  disabled={carregandoOrgs}
                >
                  <SelectTrigger id="np-executora" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sem executora</SelectItem>
                    {executoras.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="np-inicio">Início</Label>
            <Input id="np-inicio" type="date" {...register("inicio")} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="np-fim">Fim</Label>
            <Input
              id="np-fim"
              type="date"
              aria-invalid={!!errors.fim}
              aria-describedby={errors.fim ? "np-fim-erro" : undefined}
              {...register("fim")}
            />
            <Erro id="np-fim-erro" mensagem={errors.fim?.message} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="np-horas">Horas orçadas</Label>
            <Input
              id="np-horas"
              type="number"
              min={0}
              step="0.5"
              inputMode="decimal"
              aria-invalid={!!errors.horas_orcadas}
              aria-describedby="np-horas-dica"
              {...register("horas_orcadas", { valueAsNumber: true })}
            />
            {errors.horas_orcadas ? (
              <Erro id="np-horas-dica" mensagem={errors.horas_orcadas.message} />
            ) : (
              <p id="np-horas-dica" className="text-[12.5px] text-muted-foreground">
                Usado no avanço enquanto a EAP estiver vazia.
              </p>
            )}
          </div>
        </form>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancelar</DialogClose>
          <Button type="submit" form="form-novo-projeto" disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" aria-hidden="true" />}
            Criar projeto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
