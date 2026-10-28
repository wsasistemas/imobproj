"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { adicionarMembro } from "@/app/(app)/admin/equipe/acoes";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROTULO_PAPEL } from "@/lib/projeto/tipos";
import { PAPEIS_MEMBRO, esquemaNovoMembro } from "./esquemas";

const esquemaForm = esquemaNovoMembro.omit({ projectId: true });
type Entrada = z.input<typeof esquemaForm>;
type Saida = z.output<typeof esquemaForm>;

const ITENS_PAPEL = PAPEIS_MEMBRO.map((p) => ({ value: p, label: ROTULO_PAPEL[p] }));

/** "Adicionar membro": vincula quem já tem cadastro ou convida por e-mail (Supabase Auth). */
export function DialogAdicionarMembro({ projetoId, projetoNome }: { projetoId: string; projetoNome: string }) {
  const [aberto, setAberto] = useState(false);
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Entrada, unknown, Saida>({
    resolver: zodResolver(esquemaForm),
    defaultValues: { email: "", nome: "", papel: undefined },
  });

  const mutacao = useMutation({
    mutationFn: async (dados: Saida) => {
      const r = await adicionarMembro({ ...dados, projectId: projetoId });
      if (!r.ok) throw new Error(r.erro);
      return r.dados;
    },
    onSuccess: (r) => {
      toast.success(r.mensagem, {
        description:
          r.tipo === "convidado" ? "A pessoa recebe um link para definir a senha e entrar no IMOBPROJ." : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["projeto", projetoId, "equipe"] });
      reset();
      setAberto(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <UserPlus aria-hidden="true" />
            Adicionar membro
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit((d) => mutacao.mutate(d))} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Adicionar membro</DialogTitle>
            <DialogDescription>
              Projeto <b>{projetoNome}</b>. Se o e-mail já tiver cadastro, a pessoa entra direto na equipe; se não,
              ela recebe um convite por e-mail.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="membro-email">E-mail</Label>
            <Input
              id="membro-email"
              type="email"
              autoComplete="off"
              placeholder="nome@empresa.com.br"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "membro-email-erro" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p id="membro-email-erro" className="text-[13px] text-danger">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="membro-nome">Nome</Label>
            <Input
              id="membro-nome"
              autoComplete="off"
              placeholder="Nome e sobrenome"
              aria-invalid={!!errors.nome}
              aria-describedby={errors.nome ? "membro-nome-erro" : undefined}
              {...register("nome")}
            />
            {errors.nome && (
              <p id="membro-nome-erro" className="text-[13px] text-danger">
                {errors.nome.message}
              </p>
            )}
            <p className="text-[12.5px] text-muted-foreground">Usado no convite; quem já tem cadastro mantém o nome atual.</p>
          </div>

          <div className="grid gap-1.5">
            <Label id="membro-papel-rotulo">Papel no projeto</Label>
            <Controller
              control={control}
              name="papel"
              render={({ field }) => (
                <Select
                  items={ITENS_PAPEL}
                  value={field.value ?? null}
                  onValueChange={(v) => field.onChange(v ?? undefined)}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-labelledby="membro-papel-rotulo"
                    aria-invalid={!!errors.papel}
                    onBlur={field.onBlur}
                  >
                    <SelectValue placeholder="Escolha o papel" />
                  </SelectTrigger>
                  <SelectContent>
                    {ITENS_PAPEL.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.papel && <p className="text-[13px] text-danger">{errors.papel.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutacao.isPending}>
              {mutacao.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
