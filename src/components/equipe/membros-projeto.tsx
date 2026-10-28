"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Info, Loader2, MailWarning, Send, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  alterarAtivo,
  alterarPapel,
  convitesPendentes,
  reenviarConvite,
  removerMembro,
} from "@/app/(app)/admin/equipe/acoes";
import { IconeMenu } from "@/components/shell/icone-menu";
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
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ResultadoAcao } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/client";
import { ROTULO_PAPEL, type PapelMembro, type VarianteSituacao } from "@/lib/projeto/tipos";
import { DialogAdicionarMembro } from "./dialog-adicionar-membro";
import { PAPEIS_MEMBRO } from "./esquemas";
import { SkeletonTabelaMembros } from "./skeletons";

type ProjetoResumo = { id: string; codigo: string; nome: string };
type MembroLinha = {
  id: string;
  user_id: string;
  role: PapelMembro;
  ativo: boolean;
  created_at: string;
  profiles: { nome: string; email: string | null } | null;
};

const VARIANTE_PAPEL: Record<PapelMembro, VarianteSituacao> = {
  diretor: "purple",
  gerente: "primary",
  usuario_chave: "info",
  analista: "neutral",
  prestador: "warning",
};

const ITENS_PAPEL = PAPEIS_MEMBRO.map((p) => ({ value: p, label: ROTULO_PAPEL[p] }));
const ITENS_FILTRO = [{ value: "todos", label: "Todos os papéis" }, ...ITENS_PAPEL];

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const a = partes[0][0] ?? "";
  const b = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (a + b).toUpperCase();
}

async function executar<T>(promessa: Promise<ResultadoAcao<T>>): Promise<T> {
  const r = await promessa;
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
}

export function MembrosProjeto({ superAdmin, projetoInicialId }: { superAdmin: boolean; projetoInicialId?: string }) {
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [filtroPapel, setFiltroPapel] = useState<string>("todos");
  const [aRemover, setARemover] = useState<MembroLinha | null>(null);
  const queryClient = useQueryClient();

  const projetos = useQuery({
    queryKey: ["projetos", "equipe-seletor"],
    queryFn: async () => {
      const { data, error } = await createClient().from("projects").select("id, codigo, nome").order("codigo");
      if (error) throw error;
      return (data ?? []) as ProjetoResumo[];
    },
  });

  const lista = projetos.data ?? [];
  const projetoId =
    (escolhido && lista.some((p) => p.id === escolhido) && escolhido) ||
    (projetoInicialId && lista.some((p) => p.id === projetoInicialId) && projetoInicialId) ||
    lista[0]?.id ||
    null;
  const projeto = lista.find((p) => p.id === projetoId) ?? null;

  const membros = useQuery({
    queryKey: ["projeto", projetoId, "equipe", "membros"],
    enabled: !!projetoId,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("project_members")
        .select("id, user_id, role, ativo, created_at, profiles(nome, email)")
        .eq("project_id", projetoId!)
        .order("created_at");
      if (error) throw error;
      const linhas = (data ?? []) as unknown as MembroLinha[];
      return linhas.sort((x, y) => (x.profiles?.nome ?? "").localeCompare(y.profiles?.nome ?? "", "pt-BR"));
    },
  });

  const pendentes = useQuery({
    queryKey: ["projeto", projetoId, "equipe", "convites"],
    enabled: !!projetoId && superAdmin,
    queryFn: () => executar(convitesPendentes({ projectId: projetoId })),
    select: (ids) => new Set(ids),
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["projeto", projetoId, "equipe"] });

  const mPapel = useMutation({
    mutationFn: (v: { membroId: string; papel: PapelMembro }) => executar(alterarPapel(v)),
    onSuccess: (_, v) => toast.success(`Papel alterado para ${ROTULO_PAPEL[v.papel]}.`),
    onError: (e: Error) => toast.error(e.message),
    onSettled: invalidar,
  });
  const mAtivo = useMutation({
    mutationFn: (v: { membroId: string; ativo: boolean }) => executar(alterarAtivo(v)),
    onSuccess: (_, v) => toast.success(v.ativo ? "Membro ativado." : "Membro desativado. Ele perde o acesso ao projeto."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: invalidar,
  });
  const mRemover = useMutation({
    mutationFn: (membroId: string) => executar(removerMembro({ membroId })),
    onSuccess: () => {
      toast.success("Membro removido do projeto.");
      setARemover(null);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: invalidar,
  });
  const mReenviar = useMutation({
    mutationFn: (membroId: string) => executar(reenviarConvite({ membroId })),
    onSuccess: (msg) => toast.success(msg),
    onError: (e: Error) => toast.error(e.message),
  });

  const filtrados = useMemo(
    () => (membros.data ?? []).filter((m) => filtroPapel === "todos" || m.role === filtroPapel),
    [membros.data, filtroPapel],
  );

  if (projetos.isPending) return <SkeletonTabelaMembros comSeletor />;
  if (projetos.isError)
    return <ErroBloco texto="Não foi possível carregar os projetos." onTentar={() => projetos.refetch()} />;

  if (lista.length === 0)
    return (
      <EstadoVazio
        titulo="Nenhum projeto por aqui"
        texto={
          superAdmin
            ? "Ainda não há projetos cadastrados. Crie um projeto para montar a equipe dele."
            : "Você ainda não participa de nenhum projeto. Os projetos aparecem aqui quando o super admin inclui você na equipe."
        }
        acao={
          superAdmin ? (
            <Link href="/projetos" className="text-sm font-semibold text-primary hover:underline">
              Ir para Projetos
            </Link>
          ) : undefined
        }
      />
    );

  return (
    <div className="grid gap-4">
      {!superAdmin && (
        <div
          role="note"
          className="flex items-start gap-3 rounded-[12px] border border-banner-info-border bg-banner-info-bg px-4 py-3 text-[13.5px]"
        >
          <Info size={18} className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
          <p>
            <b>Somente leitura.</b> Apenas o <b>super admin</b> pode adicionar pessoas, mudar papéis, ativar ou
            desativar e remover membros. Se precisar de alguma alteração na equipe, fale com o super admin da WSA
            Sistemas.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label id="rotulo-projeto">Projeto</Label>
            <Select
              items={lista.map((p) => ({ value: p.id, label: `${p.codigo} · ${p.nome}` }))}
              value={projetoId}
              onValueChange={(v) => {
                if (v) {
                  setEscolhido(v);
                  setFiltroPapel("todos");
                }
              }}
            >
              <SelectTrigger className="w-[min(340px,85vw)]" aria-labelledby="rotulo-projeto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lista.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.codigo} · {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label id="rotulo-filtro-papel">Papel</Label>
            <Select items={ITENS_FILTRO} value={filtroPapel} onValueChange={(v) => setFiltroPapel(v ?? "todos")}>
              <SelectTrigger className="w-[200px]" aria-labelledby="rotulo-filtro-papel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITENS_FILTRO.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {superAdmin && projeto && <DialogAdicionarMembro projetoId={projeto.id} projetoNome={projeto.nome} />}
      </div>

      {membros.isPending ? (
        <SkeletonTabelaMembros />
      ) : membros.isError ? (
        <ErroBloco texto="Não foi possível carregar a equipe deste projeto." onTentar={() => membros.refetch()} />
      ) : (membros.data ?? []).length === 0 ? (
        <EstadoVazio
          titulo="Equipe vazia"
          texto={
            superAdmin
              ? "Ninguém faz parte deste projeto ainda. Use “Adicionar membro” para incluir quem já tem cadastro ou convidar por e-mail."
              : "Ninguém faz parte deste projeto ainda. O super admin monta a equipe de cada projeto."
          }
        />
      ) : filtrados.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum membro com este papel"
          texto={`Não há ${ROTULO_PAPEL[filtroPapel as PapelMembro] ?? ""} neste projeto. Escolha outro papel no filtro.`}
          acao={
            <Button variant="outline" size="sm" onClick={() => setFiltroPapel("todos")}>
              Mostrar todos
            </Button>
          }
        />
      ) : (
        <Card className="p-0">
          <Table>
            <caption className="sr-only">
              Membros do projeto {projeto?.codigo} · {projeto?.nome}
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Membro</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Desde</TableHead>
                {superAdmin && (
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((m) => {
                const nome = m.profiles?.nome || m.profiles?.email || "Sem nome";
                const convitePendente = pendentes.data?.has(m.user_id) ?? false;
                const alterandoPapel = mPapel.isPending && mPapel.variables?.membroId === m.id;
                const alterandoAtivo = mAtivo.isPending && mAtivo.variables?.membroId === m.id;
                return (
                  <TableRow key={m.id} className={m.ativo ? undefined : "text-muted-foreground"}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar aria-hidden="true">
                          <AvatarFallback className="bg-primary-soft text-[12px] font-semibold text-primary">
                            {iniciais(nome)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <span className="font-medium text-foreground">{nome}</span>
                          {convitePendente && (
                            <Badge variant="warning" className="ml-2">
                              <MailWarning aria-hidden="true" />
                              Convite pendente
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{m.profiles?.email ?? "—"}</TableCell>
                    <TableCell>
                      {superAdmin ? (
                        <Select
                          items={ITENS_PAPEL}
                          value={m.role}
                          disabled={alterandoPapel}
                          onValueChange={(v) => {
                            if (v && v !== m.role) mPapel.mutate({ membroId: m.id, papel: v as PapelMembro });
                          }}
                        >
                          <SelectTrigger size="sm" className="w-[170px]" aria-label={`Papel de ${nome}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ITENS_PAPEL.map((i) => (
                              <SelectItem key={i.value} value={i.value}>
                                {i.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={VARIANTE_PAPEL[m.role]}>{ROTULO_PAPEL[m.role]}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={m.ativo}
                          disabled={!superAdmin || alterandoAtivo}
                          onCheckedChange={(ativo) => mAtivo.mutate({ membroId: m.id, ativo })}
                          aria-label={`${nome} ativo no projeto`}
                        />
                        <span className="text-[12.5px]">{m.ativo ? "Sim" : "Não"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(m.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    {superAdmin && (
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-1">
                          {convitePendente && (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Reenviar convite para ${nome}`}
                                    disabled={mReenviar.isPending && mReenviar.variables === m.id}
                                    onClick={() => mReenviar.mutate(m.id)}
                                  />
                                }
                              >
                                {mReenviar.isPending && mReenviar.variables === m.id ? (
                                  <Loader2 className="animate-spin" aria-hidden="true" />
                                ) : (
                                  <Send aria-hidden="true" />
                                )}
                              </TooltipTrigger>
                              <TooltipContent>Reenviar convite</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-danger hover:text-danger"
                                  aria-label={`Remover ${nome} do projeto`}
                                  onClick={() => setARemover(m)}
                                />
                              }
                            >
                              <Trash2 aria-hidden="true" />
                            </TooltipTrigger>
                            <TooltipContent>Remover do projeto</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="border-t border-border px-4 py-2.5 text-[12.5px] text-muted-foreground">
            {filtrados.length} {filtrados.length === 1 ? "membro" : "membros"}
            {filtroPapel !== "todos" && ` com o papel ${ROTULO_PAPEL[filtroPapel as PapelMembro]}`}. Membro inativo
            perde o acesso ao projeto, mas continua no histórico.
          </p>
        </Card>
      )}

      <AlertDialog open={!!aRemover} onOpenChange={(v) => !v && !mRemover.isPending && setARemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover do projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              {aRemover?.profiles?.nome || aRemover?.profiles?.email} deixa de ter acesso a {projeto?.codigo} ·{" "}
              {projeto?.nome}. O cadastro da pessoa continua no IMOBPROJ. Para só suspender o acesso, prefira
              desativar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mRemover.isPending}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={mRemover.isPending}
              onClick={() => aRemover && mRemover.mutate(aRemover.id)}
            >
              {mRemover.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Remover
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EstadoVazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <IconeMenu icon={Users} cor="var(--sys-teal)" tamanho={44} />
        <h2 className="mt-2 text-[15px] font-semibold">{titulo}</h2>
        <p className="max-w-md text-[13.5px] text-muted-foreground">{texto}</p>
        {acao && <div className="mt-2">{acao}</div>}
      </CardContent>
    </Card>
  );
}

function ErroBloco({ texto, onTentar }: { texto: string; onTentar: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
        <p className="text-[13.5px] text-danger">{texto}</p>
        <Button variant="outline" size="sm" onClick={onTentar}>
          Tentar de novo
        </Button>
      </CardContent>
    </Card>
  );
}
