"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Loader2, MoreHorizontal, Pencil, Plus, Trash2, UserMinus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import {
  adicionarMembroEquipe,
  adicionarProjetoEquipe,
  removerEquipe,
  removerMembroEquipe,
  removerProjetoEquipe,
  salvarEquipe,
} from "@/app/(app)/cadastros/equipes/acoes";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { EstadoVazio, ErroBloco, ErroCampo } from "./blocos";
import { esquemaEquipe } from "./esquemas";
import { executar, iniciais } from "./util";
import { MSG_BANCO_DESATUALIZADO, ehBancoDesatualizado } from "@/lib/acoes";

type Pessoa = { id: string; nome: string; email: string | null; cargo: string | null };
type Equipe = {
  id: string;
  nome: string;
  setor: string | null;
  lider_id: string | null;
  team_members: { user_id: string; profiles: Pessoa | null }[];
  /** Ausente enquanto a migration de project_teams não chegou ao banco. */
  project_teams?: { project_id: string }[];
};
type Projeto = { id: string; codigo: string; nome: string };

const CHAVE = ["cadastros", "equipes"];

export function Equipes({ podeEditar }: { podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<Equipe | null>(null);
  const [aRemover, setARemover] = useState<Equipe | null>(null);

  const equipes = useQuery({
    queryKey: CHAVE,
    queryFn: async () => {
      const base = "id, nome, setor, lider_id, team_members(user_id, profiles(id, nome, email, cargo))";
      const consulta = (colunas: string) => createClient().from("teams").select(colunas).eq("ativo", true).order("nome");
      // Com project_teams (plano de conversas): projetos que a equipe atende. Sem a tabela, carrega como antes.
      let { data, error } = await consulta(`${base}, project_teams(project_id)`);
      if (error) ({ data, error } = await consulta(base));
      if (error) throw error;
      return (data ?? []) as unknown as Equipe[];
    },
  });
  // Setores da Fase 3. Se o banco ainda não tem a tabela, o formulário volta ao campo de texto.
  const setores = useQuery({
    queryKey: ["cadastros", "setores-opcoes"],
    queryFn: async () => {
      const { data, error } = await createClient().from("setores").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
    retry: false,
  });
  const projetos = useQuery({
    queryKey: ["cadastros", "projetos-opcoes"],
    queryFn: async () => {
      const { data, error } = await createClient().from("projects").select("id, codigo, nome").order("codigo");
      if (error) throw error;
      return (data ?? []) as Projeto[];
    },
  });
  const pessoas = useQuery({
    queryKey: ["cadastros", "pessoas-ativas"],
    queryFn: async () => {
      const { data, error } = await createClient().from("profiles").select("id, nome, email, cargo").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as Pessoa[];
    },
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: CHAVE });
    queryClient.invalidateQueries({ queryKey: ["cadastros", "usuarios"] });
  };
  const mAdicionar = useMutation({
    mutationFn: (v: { team_id: string; user_id: string }) => executar(adicionarMembroEquipe(v)),
    onSuccess: () => toast.success("Pessoa incluída na equipe."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: invalidar,
  });
  const mTirar = useMutation({
    mutationFn: (v: { team_id: string; user_id: string }) => executar(removerMembroEquipe(v)),
    onSuccess: () => toast.success("Pessoa retirada da equipe."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: invalidar,
  });
  const mProjeto = useMutation({
    mutationFn: (v: { team_id: string; project_id: string; ligar: boolean }) =>
      executar(
        v.ligar
          ? adicionarProjetoEquipe({ team_id: v.team_id, project_id: v.project_id })
          : removerProjetoEquipe({ team_id: v.team_id, project_id: v.project_id }),
      ),
    onSuccess: (_, v) => toast.success(v.ligar ? "Projeto incluído na equipe." : "Projeto retirado da equipe."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: invalidar,
  });
  const mRemover = useMutation({
    mutationFn: (id: string) => executar(removerEquipe({ id })),
    onSuccess: () => {
      toast.success("Equipe excluída.");
      setARemover(null);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: invalidar,
  });

  if (equipes.isPending)
    return (
      <div aria-busy="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-[12px]" />
        ))}
      </div>
    );
  if (equipes.isError) return <ErroBloco texto={ehBancoDesatualizado(equipes.error) ? MSG_BANCO_DESATUALIZADO : "Não foi possível carregar as equipes."} onTentar={() => equipes.refetch()} />;

  const lista = equipes.data ?? [];

  return (
    <div className="grid gap-4">
      {lista.length === 0 && !podeEditar && (
        <EstadoVazio icone="equipes" titulo="Nenhuma equipe" texto="As equipes aparecem aqui quando o super admin as cria." />
      )}
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lista.map((eq) => (
          <CartaoEquipe
            key={eq.id}
            equipe={eq}
            pessoas={pessoas.data ?? []}
            projetos={projetos.data ?? []}
            podeEditar={podeEditar}
            adicionando={mAdicionar.isPending && mAdicionar.variables?.team_id === eq.id}
            mudandoProjeto={mProjeto.isPending && mProjeto.variables?.team_id === eq.id}
            onProjeto={(project_id, ligar) => mProjeto.mutate({ team_id: eq.id, project_id, ligar })}
            onAdicionar={(user_id) => mAdicionar.mutate({ team_id: eq.id, user_id })}
            onTirar={(user_id) => mTirar.mutate({ team_id: eq.id, user_id })}
            onEditar={() => setEditando(eq)}
            onExcluir={() => setARemover(eq)}
          />
        ))}
        {podeEditar && (
          <FormEquipe
            key={editando?.id ?? "nova"}
            equipe={editando}
            pessoas={pessoas.data ?? []}
            setores={setores.isSuccess ? setores.data : null}
            onConcluir={() => setEditando(null)}
          />
        )}
      </div>

      <AlertDialog open={!!aRemover} onOpenChange={(v) => !v && !mRemover.isPending && setARemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a equipe {aRemover?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              As pessoas continuam cadastradas; só deixam de fazer parte desta equipe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mRemover.isPending}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={mRemover.isPending} onClick={() => aRemover && mRemover.mutate(aRemover.id)}>
              {mRemover.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Excluir equipe
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CartaoEquipe({
  equipe,
  pessoas,
  projetos,
  podeEditar,
  adicionando,
  mudandoProjeto,
  onProjeto,
  onAdicionar,
  onTirar,
  onEditar,
  onExcluir,
}: {
  equipe: Equipe;
  pessoas: Pessoa[];
  projetos: Projeto[];
  podeEditar: boolean;
  adicionando: boolean;
  mudandoProjeto: boolean;
  onProjeto: (projectId: string, ligar: boolean) => void;
  onAdicionar: (userId: string) => void;
  onTirar: (userId: string) => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const membros = useMemo(
    () =>
      equipe.team_members
        .map((m) => ({ id: m.user_id, pessoa: m.profiles }))
        .sort((a, b) => Number(b.id === equipe.lider_id) - Number(a.id === equipe.lider_id) || (a.pessoa?.nome ?? "").localeCompare(b.pessoa?.nome ?? "", "pt-BR")),
    [equipe],
  );
  const fora = pessoas.filter((p) => !membros.some((m) => m.id === p.id));
  const itensFora = fora.map((p) => ({ value: p.id, label: p.nome || p.email || "Sem nome" }));
  const ligados = new Set((equipe.project_teams ?? []).map((x) => x.project_id));
  const atende = projetos.filter((p) => ligados.has(p.id));
  const itensProjetos = projetos.filter((p) => !ligados.has(p.id)).map((p) => ({ value: p.id, label: `${p.codigo} · ${p.nome}` }));

  return (
    <Card className="min-w-0 gap-0 p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{equipe.nome}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {equipe.setor && <Badge variant="info">Setor {equipe.setor}</Badge>}
          {podeEditar && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Ações da equipe ${equipe.nome}`} />}>
                <MoreHorizontal aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditar}>
                  <Pencil aria-hidden="true" />
                  Editar equipe
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onExcluir}>
                  <Trash2 aria-hidden="true" />
                  Excluir equipe
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {membros.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">Ninguém nesta equipe ainda.</p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {membros.map((m) => {
            const nome = m.pessoa?.nome || m.pessoa?.email || "Pessoa sem acesso visível";
            return (
              <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar aria-hidden="true">
                    <AvatarFallback className="bg-primary-soft text-[12px] font-semibold text-primary">{iniciais(nome)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{nome}</p>
                    {m.pessoa?.cargo && <p className="truncate text-[12px] text-muted-foreground">{m.pessoa.cargo}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {m.id === equipe.lider_id && <Badge variant="success">Líder</Badge>}
                  {podeEditar && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-danger"
                      aria-label={`Tirar ${nome} da equipe`}
                      onClick={() => onTirar(m.id)}
                    >
                      <UserMinus aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {equipe.project_teams && (
        <div className="grid gap-2 border-t border-border-soft px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            <FolderKanban className="size-3.5" aria-hidden="true" />
            Projetos que atende
          </p>
          {atende.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">Nenhum. Os grupos de WhatsApp só aceitam equipes ligadas ao projeto.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {atende.map((p) => (
                <li key={p.id}>
                  <Badge variant="info" className="gap-1">
                    {p.codigo}
                    {podeEditar && (
                      <button
                        type="button"
                        className="rounded-sm hover:text-danger"
                        aria-label={`Tirar o projeto ${p.codigo} da equipe ${equipe.nome}`}
                        disabled={mudandoProjeto}
                        onClick={() => onProjeto(p.id, false)}
                      >
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    )}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {podeEditar && itensProjetos.length > 0 && (
            <Select items={itensProjetos} value={null} onValueChange={(v) => v && onProjeto(v, true)} disabled={mudandoProjeto}>
              <SelectTrigger size="sm" className="w-[220px]" aria-label={`Incluir projeto na equipe ${equipe.nome}`}>
                <SelectValue placeholder="+ Incluir projeto" />
              </SelectTrigger>
              <SelectContent>
                {itensProjetos.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-border-soft px-4 py-3">
        {podeEditar && itensFora.length > 0 ? (
          <Select items={itensFora} value={null} onValueChange={(v) => v && onAdicionar(v)} disabled={adicionando}>
            <SelectTrigger size="sm" className="w-[200px]" aria-label={`Adicionar pessoa à equipe ${equipe.nome}`}>
              <SelectValue placeholder="+ Adicionar pessoa" />
            </SelectTrigger>
            <SelectContent>
              {itensFora.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span />
        )}
        <span className="text-[12.5px] text-muted-foreground">
          {membros.length} {membros.length === 1 ? "pessoa" : "pessoas"}
        </span>
      </div>
    </Card>
  );
}

const esquemaForm = esquemaEquipe.omit({ id: true });
type Entrada = z.input<typeof esquemaForm>;
type Saida = z.output<typeof esquemaForm>;

function FormEquipe({
  equipe,
  pessoas,
  setores,
  onConcluir,
}: {
  equipe: Equipe | null;
  pessoas: Pessoa[];
  setores: { id: string; nome: string }[] | null;
  onConcluir: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Entrada, unknown, Saida>({
    resolver: zodResolver(esquemaForm),
    defaultValues: {
      nome: equipe?.nome ?? "",
      setor: equipe?.setor ?? "",
      setor_id: setores?.find((x) => x.nome === equipe?.setor)?.id ?? null,
      lider_id: equipe?.lider_id ?? null,
    },
  });
  const m = useMutation({
    // Com setores (Fase 3): grava setor_id e mantém o texto teams.setor com o nome do setor.
    mutationFn: (d: Saida) =>
      executar(
        salvarEquipe(
          setores
            ? { ...d, id: equipe?.id, setor: setores.find((x) => x.id === d.setor_id)?.nome ?? null }
            : { ...d, id: equipe?.id, setor_id: undefined },
        ),
      ),
    onSuccess: () => {
      toast.success(equipe ? "Equipe salva." : "Equipe criada. Agora inclua as pessoas.");
      queryClient.invalidateQueries({ queryKey: CHAVE });
      queryClient.invalidateQueries({ queryKey: ["cadastros", "opcoes-usuario"] });
      reset({ nome: "", setor: "", setor_id: null, lider_id: null });
      onConcluir();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const itensLider = [{ value: "", label: "Sem líder" }, ...pessoas.map((p) => ({ value: p.id, label: p.nome || p.email || "Sem nome" }))];

  return (
    <Card className="min-w-0 gap-0 border-dashed p-0">
      <form onSubmit={handleSubmit((d) => m.mutate(d))} noValidate>
        <div className="border-b border-border-soft px-4 py-3">
          <h2 className="text-[15px] font-semibold">{equipe ? `Editar ${equipe.nome}` : "Nova equipe"}</h2>
        </div>
        <fieldset disabled={m.isPending} className="grid gap-3 p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="eq-nome">Nome da equipe</Label>
            <Input id="eq-nome" placeholder="Ex.: Infraestrutura" aria-invalid={!!errors.nome} aria-describedby="eq-nome-erro" {...register("nome")} />
            <ErroCampo id="eq-nome-erro" mensagem={errors.nome?.message} />
          </div>
          {setores ? (
            <div className="grid gap-1.5">
              <Label id="eq-setor-rotulo">Setor</Label>
              <Controller
                control={control}
                name="setor_id"
                render={({ field }) => {
                  const itens = [{ value: "", label: "Sem setor" }, ...setores.map((x) => ({ value: x.id, label: x.nome }))];
                  return (
                    <Select items={itens} value={field.value ?? ""} onValueChange={(v) => field.onChange(v ? v : null)}>
                      <SelectTrigger className="w-full" aria-labelledby="eq-setor-rotulo" aria-describedby="eq-setor-ajuda">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {itens.map((i) => (
                          <SelectItem key={i.value || "sem"} value={i.value}>
                            {i.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />
              <p id="eq-setor-ajuda" className="text-[12px] text-muted-foreground">
                Os setores são cadastrados em Configurações › Setores e números.
              </p>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="eq-setor">Setor</Label>
              <Input id="eq-setor" placeholder="Ex.: Suporte" {...register("setor")} />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label id="eq-lider-rotulo">Líder</Label>
            <Controller
              control={control}
              name="lider_id"
              render={({ field }) => (
                <Select items={itensLider} value={field.value ?? ""} onValueChange={(v) => field.onChange(v ? v : null)}>
                  <SelectTrigger className="w-full" aria-labelledby="eq-lider-rotulo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {itensLider.map((i) => (
                      <SelectItem key={i.value || "sem"} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="flex justify-end gap-2">
            {equipe && (
              <Button type="button" variant="outline" onClick={onConcluir}>
                Cancelar
              </Button>
            )}
            <Button type="submit">
              {m.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : !equipe && <Plus aria-hidden="true" />}
              {equipe ? "Salvar equipe" : "Criar equipe"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Card>
  );
}
