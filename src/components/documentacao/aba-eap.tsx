"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Diamond,
  Download,
  FileSpreadsheet,
  FolderTree,
  ListPlus,
  MoreHorizontal,
  Plus,
  Trash2,
  CornerDownRight,
  Layers,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { atualizarCampoEap, criarItemEap, excluirItemEap } from "@/app/(app)/projetos/[id]/documentacao/acoes-eap";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pode } from "@/lib/projeto/permissoes";
import { cn } from "@/lib/utils";
import { CelulaEditavel } from "./celula-editavel";
import { EsqueletoTabela, EstadoVazio, ErroCarregar } from "./comum";
import { chaves, montarArvore, useEap, useMembros, type LinhaEap } from "./consultas";
import { DialogImportarEap } from "./dialog-importar-eap";
import type { PropsModulo } from "./documentacao";
import { baixarModelo } from "./eap-planilha";
import { dataCurta, formatoHoras, formatoPercentual, numeroBr } from "./utilidades";

type Alteracao =
  | { campo: "titulo"; valor: string }
  | { campo: "horas_orcadas"; valor: number }
  | { campo: "inicio" | "fim"; valor: string | null }
  | { campo: "responsavel_id"; valor: string | null }
  | { campo: "is_fase" | "is_milestone"; valor: boolean };

export function AbaEap({ projetoId, papel }: PropsModulo) {
  const queryClient = useQueryClient();
  const chave = chaves.eap(projetoId);
  const { data: itens, isPending, isError, error, refetch } = useEap(projetoId);
  const { data: membros = [] } = useMembros(projetoId);
  const podeEditar = pode(papel, "eap_editar");
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [excluir, setExcluir] = useState<LinhaEap | null>(null);
  const [importarAberto, setImportarAberto] = useState(false);

  const nomeMembro = useMemo(() => new Map(membros.map((m) => [m.user_id, m.nome])), [membros]);

  // Esconde descendentes de itens recolhidos.
  const visiveis = useMemo(() => {
    if (!itens) return [];
    const porId = new Map(itens.map((i) => [i.id, i]));
    return itens.filter((i) => {
      let pai = i.parent_id ? porId.get(i.parent_id) : undefined;
      while (pai) {
        if (recolhidos.has(pai.id)) return false;
        pai = pai.parent_id ? porId.get(pai.parent_id) : undefined;
      }
      return true;
    });
  }, [itens, recolhidos]);

  // ---- Edição inline com otimismo + rollback ----
  const atualizar = useMutation({
    mutationFn: async (v: { item: LinhaEap; alteracao: Alteracao }) => {
      const r = await atualizarCampoEap({ projectId: projetoId, itemId: v.item.id, alteracao: v.alteracao });
      if (!r.ok) throw new Error(r.erro);
    },
    onMutate: async ({ item, alteracao }) => {
      await queryClient.cancelQueries({ queryKey: chave });
      const anterior = queryClient.getQueryData<LinhaEap[]>(chave);
      queryClient.setQueryData<LinhaEap[]>(chave, (atual) => {
        if (!atual) return atual;
        const novos = atual.map((i) => (i.id === item.id ? { ...i, [alteracao.campo]: alteracao.valor } : i));
        const avanco = new Map(novos.map((i) => [i.id, { percentual: i.percentual, horas_aprovadas: i.horas_aprovadas }]));
        return montarArvore(novos, avanco);
      });
      return { anterior };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.anterior) queryClient.setQueryData(chave, ctx.anterior);
      toast.error(e.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: chave }),
  });

  function salvar(item: LinhaEap, alteracao: Alteracao) {
    atualizar.mutate({ item, alteracao });
  }

  const criar = useMutation({
    mutationFn: async (v: { parentId: string | null; isFase?: boolean; isMilestone?: boolean }) => {
      const r = await criarItemEap({ projectId: projetoId, ...v });
      if (!r.ok) throw new Error(r.erro);
      return r.dados;
    },
    onSuccess: (d, v) => {
      toast.success(`Item ${d.codigo} criado. Clique no título para renomear.`);
      if (v.parentId)
        setRecolhidos((s) => {
          const n = new Set(s);
          n.delete(v.parentId!);
          return n;
        });
      queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (item: LinhaEap) => {
      const r = await excluirItemEap({ projectId: projetoId, itemId: item.id });
      if (!r.ok) throw new Error(r.erro);
    },
    onSuccess: (_, item) => {
      toast.success(`Item ${item.codigo} excluído.`);
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternarRecolhido = (id: string) =>
    setRecolhidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const descendentes = (item: LinhaEap) => (itens ?? []).filter((i) => i.codigo.startsWith(`${item.codigo}.`)).length;

  const opcoesResponsavel = [{ valor: "", rotulo: "Sem responsável" }, ...membros.map((m) => ({ valor: m.user_id, rotulo: m.nome }))];

  const comFilhos = (itens ?? []).filter((i) => i.temFilhos);
  const tudoRecolhido = comFilhos.length > 0 && comFilhos.every((i) => recolhidos.has(i.id));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] text-muted-foreground">
          Avanço = horas de OS aprovadas ÷ horas orçadas (somadas nas atividades).{" "}
          {podeEditar ? "Clique numa célula para editar; Enter salva, Esc cancela." : "Somente o gerente edita a EAP."}
        </p>
        <div className="flex flex-wrap gap-2">
          {comFilhos.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => setRecolhidos(tudoRecolhido ? new Set() : new Set(comFilhos.map((i) => i.id)))}
            >
              {tudoRecolhido ? <ChevronsUpDown aria-hidden="true" /> : <ChevronsDownUp aria-hidden="true" />}
              {tudoRecolhido ? "Expandir tudo" : "Recolher tudo"}
            </Button>
          )}
          {podeEditar && (
            <>
              <Button variant="outline" onClick={baixarModelo}>
                <Download aria-hidden="true" /> Baixar modelo
              </Button>
              <Button variant="outline" onClick={() => setImportarAberto(true)}>
                <FileSpreadsheet aria-hidden="true" /> Importar planilha
              </Button>
              <Button onClick={() => criar.mutate({ parentId: null, isFase: true })} disabled={criar.isPending}>
                <Plus aria-hidden="true" /> Nova fase
              </Button>
            </>
          )}
        </div>
      </div>

      {isPending ? (
        <EsqueletoTabela linhas={8} rotulo="Carregando EAP" />
      ) : isError ? (
        <ErroCarregar mensagem={error.message} tentar={() => refetch()} />
      ) : itens.length === 0 ? (
        <EstadoVazio
          icone={FolderTree}
          cor="var(--sys-indigo)"
          titulo="A EAP deste projeto ainda está vazia"
          acao={
            podeEditar && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => criar.mutate({ parentId: null, isFase: true })}>
                  <Plus aria-hidden="true" /> Criar a primeira fase
                </Button>
                <Button variant="outline" onClick={() => setImportarAberto(true)}>
                  <FileSpreadsheet aria-hidden="true" /> Importar planilha
                </Button>
              </div>
            )
          }
        >
          A EAP divide o projeto em fases e atividades com horas orçadas e datas. É a base do cronograma e do avanço físico.
          {podeEditar ? " Crie as fases aqui ou importe uma planilha (baixe o modelo)." : " O gerente do projeto monta a EAP."}
        </EstadoVazio>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-card">
          <Table aria-label="Estrutura analítica do projeto">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Código</TableHead>
                <TableHead className="min-w-[280px]">Título</TableHead>
                <TableHead className="min-w-[160px]">Responsável</TableHead>
                <TableHead className="w-[100px] text-right">Horas</TableHead>
                <TableHead className="w-[130px]">Início</TableHead>
                <TableHead className="w-[130px]">Fim</TableHead>
                <TableHead className="w-[150px]">Avanço</TableHead>
                {podeEditar && (
                  <TableHead className="w-[52px]">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((item) => {
                const fase = item.is_fase;
                const recolhido = recolhidos.has(item.id);
                const editavelHoras = podeEditar && !item.temFilhos;
                return (
                  <TableRow key={item.id} className={cn(fase && "bg-table-head")}>
                    <TableCell className={cn("tabular-nums", fase ? "font-bold" : "text-muted-foreground")}>{item.codigo}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex items-center gap-1" style={{ paddingLeft: item.nivel * 20 }}>
                        {item.temFilhos ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-expanded={!recolhido}
                            aria-label={`${recolhido ? "Expandir" : "Recolher"} ${item.codigo} ${item.titulo}`}
                            onClick={() => alternarRecolhido(item.id)}
                          >
                            {recolhido ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                          </Button>
                        ) : (
                          <span className="inline-block size-7 shrink-0" aria-hidden="true" />
                        )}
                        {item.is_milestone && (
                          <Diamond size={14} className="shrink-0 fill-[var(--sys-red)] text-[var(--sys-red)]" aria-label="Marco" />
                        )}
                        <div className="min-w-0 flex-1">
                          <CelulaEditavel
                            tipo="texto"
                            editavel={podeEditar}
                            rotulo={`título de ${item.codigo}`}
                            valor={item.titulo}
                            className={cn(fase && "font-bold")}
                            exibicao={<span className={cn(fase && "font-bold")}>{item.titulo}</span>}
                            aoSalvar={(v) => {
                              const t = v.trim();
                              if (!t) {
                                toast.error("O título não pode ficar vazio.");
                                return false;
                              }
                              salvar(item, { campo: "titulo", valor: t });
                            }}
                          />
                        </div>
                        {fase && <Badge variant="primary" className="ml-1">Fase</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <CelulaEditavel
                        tipo="opcoes"
                        opcoes={opcoesResponsavel}
                        editavel={podeEditar}
                        rotulo={`responsável de ${item.codigo}`}
                        valor={item.responsavel_id ?? ""}
                        exibicao={
                          <span className={cn(!item.responsavel_id && "text-muted-foreground")}>
                            {item.responsavel_id ? (nomeMembro.get(item.responsavel_id) ?? "Fora da equipe") : "—"}
                          </span>
                        }
                        aoSalvar={(v) => salvar(item, { campo: "responsavel_id", valor: v || null })}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <CelulaEditavel
                        tipo="numero"
                        editavel={editavelHoras}
                        rotulo={`horas orçadas de ${item.codigo}`}
                        valor={String(item.horas_orcadas).replace(".", ",")}
                        className="justify-end text-right"
                        exibicao={
                          <span
                            className={cn("w-full text-right", item.temFilhos && "font-semibold")}
                            title={item.temFilhos ? "Soma das atividades filhas" : undefined}
                          >
                            {formatoHoras.format(item.temFilhos ? somaFolhas(item, itens) : item.horas_orcadas)} h
                          </span>
                        }
                        aoSalvar={(v) => {
                          const n = numeroBr(v);
                          if (!Number.isFinite(n) || n < 0) {
                            toast.error("Informe um número de horas válido (ex.: 12,5).");
                            return false;
                          }
                          salvar(item, { campo: "horas_orcadas", valor: Math.round(n * 100) / 100 });
                        }}
                      />
                    </TableCell>
                    {(["inicio", "fim"] as const).map((campo) => (
                      <TableCell key={campo} className="tabular-nums">
                        <CelulaEditavel
                          tipo="data"
                          editavel={podeEditar}
                          rotulo={`${campo === "inicio" ? "início" : "fim"} de ${item.codigo}`}
                          valor={item[campo] ?? ""}
                          exibicao={<span className={cn(!item[campo] && "text-muted-foreground")}>{dataCurta(item[campo])}</span>}
                          aoSalvar={(v) => {
                            const valor = v || null;
                            const inicio = campo === "inicio" ? valor : item.inicio;
                            const fim = campo === "fim" ? valor : item.fim;
                            if (inicio && fim && fim < inicio) {
                              toast.error("O fim não pode ser antes do início.");
                              return false;
                            }
                            salvar(item, { campo, valor });
                          }}
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <BarraAvanco percentual={item.percentual} rotulo={`Avanço de ${item.codigo}`} />
                    </TableCell>
                    {podeEditar && (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon" aria-label={`Ações de ${item.codigo} ${item.titulo}`} />}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-56">
                            <DropdownMenuItem onClick={() => criar.mutate({ parentId: item.id })}>
                              <CornerDownRight aria-hidden="true" /> Adicionar item filho
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => criar.mutate({ parentId: item.parent_id, isFase: item.parent_id ? false : true })}>
                              <ListPlus aria-hidden="true" /> Adicionar item irmão
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => criar.mutate({ parentId: item.id, isMilestone: true })}>
                              <Diamond aria-hidden="true" /> Adicionar marco filho
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => salvar(item, { campo: "is_fase", valor: !item.is_fase })}>
                              <Layers aria-hidden="true" /> {item.is_fase ? "Desmarcar como fase" : "Marcar como fase"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => salvar(item, { campo: "is_milestone", valor: !item.is_milestone })}>
                              <Diamond aria-hidden="true" /> {item.is_milestone ? "Desmarcar como marco" : "Marcar como marco"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => setExcluir(item)}>
                              <Trash2 aria-hidden="true" /> Excluir…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!excluir} onOpenChange={(a) => !a && !remover.isPending && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {excluir?.codigo} · {excluir?.titulo}?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluir && descendentes(excluir) > 0
                ? `Os ${descendentes(excluir)} subitens também serão excluídos. `
                : ""}
              OS ligadas a estes itens continuam existindo, mas ficam sem item da EAP. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remover.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={remover.isPending} onClick={() => excluir && remover.mutate(excluir)}>
              <Trash2 aria-hidden="true" /> Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {podeEditar && (
        <DialogImportarEap
          projetoId={projetoId}
          aberto={importarAberto}
          aoMudar={setImportarAberto}
          itens={itens ?? []}
          membros={membros}
        />
      )}
    </div>
  );
}

/** Soma das horas orçadas das folhas da subárvore (igual à regra da v_wbs_progress). */
function somaFolhas(item: LinhaEap, itens: LinhaEap[]) {
  return itens
    .filter((i) => !i.temFilhos && i.codigo.startsWith(`${item.codigo}.`))
    .reduce((s, i) => s + Number(i.horas_orcadas), 0);
}

function BarraAvanco({ percentual, rotulo }: { percentual: number; rotulo: string }) {
  const p = Math.max(0, Math.min(100, percentual));
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p)}
        className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full", p >= 100 ? "bg-success" : "bg-primary")} style={{ width: `${p}%` }} />
      </div>
      <span className="w-9 text-right text-[12px] text-muted-foreground tabular-nums">{formatoPercentual.format(p)}%</span>
    </div>
  );
}
