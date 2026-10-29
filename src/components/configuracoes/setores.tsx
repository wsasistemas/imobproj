"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { removerSetor, salvarSetor } from "@/app/(app)/configuracoes/setores/acoes";
import { EstadoVazio, ErroBloco, ErroCampo, RotuloSecao, SkeletonListaPainel } from "@/components/cadastros/blocos";
import { executar, formatarTelefone } from "@/components/cadastros/util";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MSG_BANCO_DESATUALIZADO, ehBancoDesatualizado } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { esquemaSetor } from "./esquemas-setores";

type Setor = {
  id: string;
  nome: string;
  gestor_id: string | null;
  ativo: boolean;
  setor_numeros: { session_id: string }[];
  teams: { id: string; nome: string }[];
};
type Sessao = { id: string; numero: string; status: string; projeto: string | null; setor_id: string | null };
type Pessoa = { id: string; nome: string; email: string | null };
type Equipe = { id: string; nome: string; setor_id: string | null };

export const CHAVE_SETORES = ["configuracoes", "setores"];

export type PermissoesSetores = { criar: boolean; editar: boolean; excluir: boolean };

export function Setores({ permissoes }: { permissoes: PermissoesSetores }) {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState<string | "novo" | null>(null);
  const [aRemover, setARemover] = useState<Setor | null>(null);

  const setores = useQuery({
    queryKey: CHAVE_SETORES,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("setores")
        .select("id, nome, gestor_id, ativo, setor_numeros(session_id), teams(id, nome)")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Setor[];
    },
  });
  const sessoes = useQuery({
    queryKey: ["configuracoes", "sessoes-setor"],
    queryFn: async () => {
      const { data, error } = await createClient().rpc("sessoes_para_setor");
      if (error) throw error;
      return (data ?? []) as Sessao[];
    },
  });
  const pessoas = useQuery({
    queryKey: ["cadastros", "pessoas-ativas-min"],
    queryFn: async () => {
      const { data, error } = await createClient().from("profiles").select("id, nome, email").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as Pessoa[];
    },
  });
  const equipes = useQuery({
    queryKey: ["cadastros", "equipes-setor"],
    queryFn: async () => {
      const { data, error } = await createClient().from("teams").select("id, nome, setor_id").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as Equipe[];
    },
  });

  const mRemover = useMutation({
    mutationFn: (id: string) => executar(removerSetor({ id })),
    onSuccess: () => {
      toast.success("Setor excluído. Os números dele ficaram sem setor.");
      setARemover(null);
      setAberto(null);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE_SETORES });
      queryClient.invalidateQueries({ queryKey: ["configuracoes", "sessoes-setor"] });
      queryClient.invalidateQueries({ queryKey: ["cadastros"] });
    },
  });

  if (setores.isPending) return <SkeletonListaPainel linhas={3} />;
  if (setores.isError)
    return (
      <ErroBloco
        texto={ehBancoDesatualizado(setores.error) ? MSG_BANCO_DESATUALIZADO : "Não foi possível carregar os setores."}
        onTentar={() => setores.refetch()}
      />
    );

  const lista = setores.data ?? [];
  const mapaSessoes = new Map((sessoes.data ?? []).map((s) => [s.id, s]));
  const nomePessoa = (id: string | null) => {
    const p = (pessoas.data ?? []).find((x) => x.id === id);
    return p ? p.nome || p.email || "Sem nome" : "—";
  };
  const selecionado = aberto && aberto !== "novo" ? (lista.find((s) => s.id === aberto) ?? null) : null;
  const podeAbrirForm = aberto === "novo" ? permissoes.criar : !!selecionado;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl rounded-[10px] bg-info-bg px-4 py-2.5 text-[13px] leading-relaxed text-info">
          Cada setor tem a própria fila no Monitor. A conversa entra pelo número que o cliente chamou e cai na fila do setor dono desse
          número. Número sem setor continua funcionando como antes.
        </p>
        {permissoes.criar && (
          <Button onClick={() => setAberto("novo")}>
            <Plus aria-hidden="true" />
            Novo setor
          </Button>
        )}
      </div>

      <div className={cn("grid items-start gap-4", podeAbrirForm && "xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]")}>
        <Card className="min-w-0 p-0">
          {lista.length === 0 ? (
            <div className="p-4">
              <EstadoVazio
                icone="setores"
                titulo="Nenhum setor ainda"
                texto={permissoes.criar ? "Cadastre o primeiro setor em “Novo setor” e ligue os números de WhatsApp dele." : "Os setores aparecem aqui quando alguém com permissão os cadastra."}
              />
            </div>
          ) : (
            <Table>
              <caption className="sr-only">Setores de atendimento</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Setor</TableHead>
                  <TableHead>Números WhatsApp</TableHead>
                  <TableHead>Gestor</TableHead>
                  <TableHead className="pr-4">Equipes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((s) => (
                  <TableRow
                    key={s.id}
                    className={cn("cursor-pointer", aberto === s.id && "bg-primary-soft hover:bg-primary-soft")}
                    onClick={() => setAberto(s.id)}
                  >
                    <TableCell className="pl-4">
                      <button
                        type="button"
                        className="text-left font-semibold text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setAberto(s.id);
                        }}
                      >
                        {s.nome}
                      </button>
                      {!s.ativo && (
                        <Badge variant="neutral" className="ml-2">
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.setor_numeros.length === 0 ? (
                        <span className="text-muted-foreground">Sem número</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {s.setor_numeros.map((n) => {
                            const sessao = mapaSessoes.get(n.session_id);
                            return (
                              <span key={n.session_id} className="flex items-center gap-2 tabular-nums">
                                {sessao ? formatarTelefone(sessao.numero) : "Número"}
                                {sessao && <SeloConexao status={sessao.status} />}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{nomePessoa(s.gestor_id)}</TableCell>
                    <TableCell className="pr-4 tabular-nums">{s.teams.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {podeAbrirForm && (
          <FormSetor
            key={selecionado?.id ?? "novo"}
            setor={selecionado}
            sessoes={sessoes.data ?? []}
            pessoas={pessoas.data ?? []}
            equipes={equipes.data ?? []}
            somenteLeitura={selecionado ? !permissoes.editar : !permissoes.criar}
            podeExcluir={!!selecionado && permissoes.excluir}
            onExcluir={() => selecionado && setARemover(selecionado)}
            onConcluir={(id) => setAberto(id)}
            onCancelar={() => setAberto(null)}
          />
        )}
      </div>

      <AlertDialog open={!!aRemover} onOpenChange={(v) => !v && !mRemover.isPending && setARemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o setor {aRemover?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Os números e as equipes dele ficam sem setor, e as conversas novas desses números deixam de entrar numa fila. Horários, regras e
              mensagens do setor são apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mRemover.isPending}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={mRemover.isPending} onClick={() => aRemover && mRemover.mutate(aRemover.id)}>
              {mRemover.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Excluir setor
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SeloConexao({ status }: { status: string }) {
  const conectado = status === "conectado";
  return <Badge variant={conectado ? "success" : "danger"}>{conectado ? "conectado" : status.replace("_", " ")}</Badge>;
}

const esquemaForm = esquemaSetor.omit({ id: true });
type Entrada = z.input<typeof esquemaForm>;
type Saida = z.output<typeof esquemaForm>;

function FormSetor({
  setor,
  sessoes,
  pessoas,
  equipes,
  somenteLeitura,
  podeExcluir,
  onExcluir,
  onConcluir,
  onCancelar,
}: {
  setor: Setor | null;
  sessoes: Sessao[];
  pessoas: Pessoa[];
  equipes: Equipe[];
  somenteLeitura: boolean;
  podeExcluir: boolean;
  onExcluir: () => void;
  onConcluir: (id: string) => void;
  onCancelar: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Entrada, unknown, Saida>({
    resolver: zodResolver(esquemaForm),
    defaultValues: {
      nome: setor?.nome ?? "",
      gestor_id: setor?.gestor_id ?? null,
      ativo: setor?.ativo ?? true,
      numeros: setor?.setor_numeros.map((n) => n.session_id) ?? [],
      equipes: setor?.teams.map((t) => t.id) ?? [],
    },
  });
  const m = useMutation({
    mutationFn: (d: Saida) => executar(salvarSetor({ ...d, id: setor?.id })),
    onSuccess: (r) => {
      toast.success(setor ? "Setor salvo." : "Setor criado. Ajuste o horário e as mensagens em Fila e horários.");
      queryClient.invalidateQueries({ queryKey: CHAVE_SETORES });
      queryClient.invalidateQueries({ queryKey: ["configuracoes", "sessoes-setor"] });
      queryClient.invalidateQueries({ queryKey: ["cadastros"] });
      onConcluir(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const itensGestor = [{ value: "", label: "Sem gestor" }, ...pessoas.map((p) => ({ value: p.id, label: p.nome || p.email || "Sem nome" }))];

  return (
    <Card className="min-w-0 gap-0 p-0">
      <form onSubmit={handleSubmit((d) => m.mutate(d))} noValidate>
        <div className="flex items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
          <h2 className="truncate text-[15px] font-semibold">{setor ? setor.nome : "Novo setor"}</h2>
          <Controller
            control={control}
            name="ativo"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-[13px]">
                Setor ativo
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={somenteLeitura} aria-label="Setor ativo" />
              </label>
            )}
          />
        </div>
        <fieldset disabled={m.isPending || somenteLeitura} className="grid min-w-0 grid-cols-1 gap-4 p-4">
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="setor-nome">Nome do setor</Label>
            <Input id="setor-nome" placeholder="Ex.: Suporte técnico" aria-invalid={!!errors.nome} aria-describedby="setor-nome-erro" {...register("nome")} />
            <ErroCampo id="setor-nome-erro" mensagem={errors.nome?.message} />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <RotuloSecao>Números WhatsApp (sessões OpenWA)</RotuloSecao>
            <Controller
              control={control}
              name="numeros"
              render={({ field }) => (
                <ListaMarcavel
                  vazio="Nenhum número cadastrado. Conecte uma sessão em WhatsApp OpenWA."
                  itens={sessoes.map((s) => {
                    const outro = s.setor_id && s.setor_id !== setor?.id;
                    return {
                      id: s.id,
                      titulo: formatarTelefone(s.numero) || s.numero,
                      detalhe: [s.projeto, outro ? "hoje em outro setor: muda para este" : null].filter(Boolean).join(" · "),
                      selo: <SeloConexao status={s.status} />,
                    };
                  })}
                  marcados={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <p className="text-[12px] text-muted-foreground">Um número pertence a um só setor. Número novo: conecte a sessão em WhatsApp OpenWA e marque aqui.</p>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <Label id="setor-gestor-rotulo">Gestor do setor</Label>
            <Controller
              control={control}
              name="gestor_id"
              render={({ field }) => (
                <Select items={itensGestor} value={field.value ?? ""} onValueChange={(v) => field.onChange(v ? v : null)}>
                  <SelectTrigger className="w-full" aria-labelledby="setor-gestor-rotulo" aria-describedby="setor-gestor-ajuda">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {itensGestor.map((i) => (
                      <SelectItem key={i.value || "sem"} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p id="setor-gestor-ajuda" className="text-[12px] text-muted-foreground">
              Vê o Monitor e os relatórios do setor.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <RotuloSecao>Equipes que atendem</RotuloSecao>
            <Controller
              control={control}
              name="equipes"
              render={({ field }) => (
                <ListaMarcavel
                  vazio="Nenhuma equipe cadastrada. Crie em Cadastros › Equipes."
                  itens={equipes.map((e) => ({
                    id: e.id,
                    titulo: e.nome,
                    detalhe: e.setor_id && e.setor_id !== setor?.id ? "hoje em outro setor: muda para este" : "",
                  }))}
                  marcados={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          {!somenteLeitura && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {podeExcluir ? (
                <Button type="button" variant="ghost" className="text-danger hover:text-danger" onClick={onExcluir}>
                  <Trash2 aria-hidden="true" />
                  Excluir setor
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onCancelar}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {m.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {setor ? "Salvar setor" : "Criar setor"}
                </Button>
              </div>
            </div>
          )}
        </fieldset>
      </form>
    </Card>
  );
}

function ListaMarcavel({
  itens,
  marcados,
  onChange,
  vazio,
}: {
  itens: { id: string; titulo: string; detalhe?: string; selo?: React.ReactNode }[];
  marcados: string[];
  onChange: (v: string[]) => void;
  vazio: string;
}) {
  if (itens.length === 0) return <p className="rounded-[10px] border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground">{vazio}</p>;
  return (
    <ul className="divide-y divide-border-soft rounded-[10px] border border-border">
      {itens.map((i) => {
        const marcado = marcados.includes(i.id);
        return (
          <li key={i.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[13.5px] hover:bg-muted">
              <Checkbox
                checked={marcado}
                onCheckedChange={(v) => onChange(v ? [...marcados, i.id] : marcados.filter((x) => x !== i.id))}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium tabular-nums">{i.titulo}</span>
                {i.detalhe && <span className="block text-[12px] text-muted-foreground">{i.detalhe}</span>}
              </span>
              {i.selo}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
