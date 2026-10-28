"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarCheck, ListTodo, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  alternarCronograma,
  atualizarEncaminhamento,
  criarEncaminhamento,
  mudarStatusEncaminhamento,
  removerEncaminhamento,
} from "@/app/(app)/projetos/[id]/atas/acoes";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { pode } from "@/lib/projeto/permissoes";
import { ROTULO_PAPEL, type Papel } from "@/lib/projeto/tipos";
import { cn } from "@/lib/utils";
import { Campo, CampoSelect, RotuloSecao } from "./campos";
import {
  buscarMembros,
  chavesAtas,
  formatarData,
  SITUACAO_ENCAMINHAMENTO,
  type ActionStatus,
  type AtaDetalhe,
  type Encaminhamento,
} from "./dados";
import { useAcaoAta } from "./use-acao";

type Props = { projetoId: string; ata: AtaDetalhe; papel: Papel; userId: string };

const ORDEM_STATUS: ActionStatus[] = ["aberta", "em_andamento", "concluida", "cancelada"];
const OPCOES_STATUS = ORDEM_STATUS.map((s) => ({ value: s, label: SITUACAO_ENCAMINHAMENTO[s].label }));

export function Encaminhamentos({ projetoId, ata, papel, userId }: Props) {
  const queryClient = useQueryClient();
  const podeRedigir = pode(papel, "ata_redigir");
  const podeEditar = podeRedigir && ata.status !== "aprovada";
  const [dialogo, setDialogo] = useState<{ aberto: boolean; enc: Encaminhamento | null; n: number }>({ aberto: false, enc: null, n: 0 });
  const [remover, setRemover] = useState<Encaminhamento | null>(null);

  const statusMut = useAcaoAta(projetoId, mudarStatusEncaminhamento, "Situação atualizada.");
  // O toggle mexe na EAP e na agenda: invalida tudo do projeto (cronograma, documentação/EAP, visão geral).
  const cronogramaMut = useAcaoAta(
    projetoId,
    alternarCronograma,
    (r, e) =>
      e.ligar ? "Encaminhamento incluído no cronograma." : r.itemRemovido ? "Encaminhamento retirado do cronograma." : "Evento retirado da agenda; a atividade da EAP foi mantida.",
    () => queryClient.invalidateQueries({ queryKey: ["projeto", projetoId] }),
  );
  const removerMut = useAcaoAta(projetoId, removerEncaminhamento, "Encaminhamento removido.", () => {
    setRemover(null);
    queryClient.invalidateQueries({ queryKey: ["projeto", projetoId] });
  });

  const hoje = format(new Date(), "yyyy-MM-dd");

  return (
    <Card className="gap-0 py-0" aria-labelledby={`encaminhamentos-${ata.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <RotuloSecao id={`encaminhamentos-${ata.id}`}>Encaminhamentos</RotuloSecao>
          {podeRedigir && ata.encaminhamentos.length > 0 && (
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              “No cronograma” cria a atividade na fase “Encaminhamentos de atas” da EAP e o evento na agenda.
            </p>
          )}
        </div>
        {podeEditar && (
          <Button variant="outline" size="sm" onClick={() => setDialogo((d) => ({ aberto: true, enc: null, n: d.n + 1 }))}>
            <Plus aria-hidden="true" />
            Novo encaminhamento
          </Button>
        )}
      </div>

      {ata.encaminhamentos.length === 0 ? (
        <CardContent className="flex flex-col items-center gap-1 py-8 text-center">
          <ListTodo className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhum encaminhamento</p>
          <p className="max-w-md text-[13px] text-muted-foreground">
            {podeEditar
              ? "Registre as ações combinadas na reunião, com responsável e prazo. Ligue “No cronograma” para acompanhá-las no calendário e no Gantt."
              : "Nenhuma ação foi combinada nesta reunião."}
          </p>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Ação</TableHead>
              <TableHead className="hidden md:table-cell">Responsável</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>No cronograma</TableHead>
              {podeEditar && (
                <TableHead className="w-24 pr-5">
                  <span className="sr-only">Ações</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ata.encaminhamentos.map((e) => {
              const podeStatus = podeRedigir || e.responsavel_id === userId;
              const atrasado = !!e.prazo && e.prazo < hoje && (e.status === "aberta" || e.status === "em_andamento");
              const situacao = SITUACAO_ENCAMINHAMENTO[e.status];
              const alternando = cronogramaMut.isPending && cronogramaMut.variables?.actionId === e.id;
              return (
                <TableRow key={e.id}>
                  <TableCell className="max-w-[320px] pl-5 whitespace-normal">
                    <span className="font-medium break-words">{e.acao}</span>
                    <span className="block text-[12px] text-muted-foreground md:hidden">{e.responsavel ?? "Sem responsável"}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {e.responsavel ?? <span className="text-muted-foreground">A definir</span>}
                  </TableCell>
                  <TableCell className={cn("tabular-nums", atrasado && "font-semibold text-danger")}>
                    {formatarData(e.prazo)}
                    {atrasado && <span className="sr-only"> (atrasado)</span>}
                  </TableCell>
                  <TableCell>
                    {podeStatus ? (
                      <CampoSelect
                        opcoes={OPCOES_STATUS}
                        valor={e.status}
                        aoMudar={(v) =>
                          v !== e.status &&
                          statusMut.mutate({ projectId: projetoId, actionId: e.id, status: v as ActionStatus })
                        }
                        desabilitado={statusMut.isPending && statusMut.variables?.actionId === e.id}
                        rotuloAcessivel={`Situação do encaminhamento: ${e.acao}`}
                        className="h-8 min-w-36"
                      />
                    ) : (
                      <Badge variant={situacao.variant}>{situacao.label}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {podeRedigir ? (
                        <Switch
                          checked={e.vincular_cronograma}
                          disabled={alternando}
                          onCheckedChange={(v) => cronogramaMut.mutate({ projectId: projetoId, actionId: e.id, ligar: v })}
                          aria-label={`No cronograma: ${e.acao}`}
                        />
                      ) : (
                        <Badge variant={e.vincular_cronograma ? "info" : "neutral"}>{e.vincular_cronograma ? "Sim" : "Não"}</Badge>
                      )}
                      {alternando && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
                      {e.vincular_cronograma && e.item && (
                        <span className="flex items-center gap-1 text-[12px] text-muted-foreground" title={e.item.titulo}>
                          <CalendarCheck className="size-3.5" aria-hidden="true" />
                          EAP {e.item.codigo}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {podeEditar && (
                    <TableCell className="pr-5">
                      <div className="flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar encaminhamento: ${e.acao}`}
                          onClick={() => setDialogo((d) => ({ aberto: true, enc: e, n: d.n + 1 }))}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remover encaminhamento: ${e.acao}`}
                          onClick={() => setRemover(e)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {podeEditar && (
        <DialogEncaminhamento
          key={dialogo.n}
          projetoId={projetoId}
          ata={ata}
          aberto={dialogo.aberto}
          enc={dialogo.enc}
          aoFechar={() => setDialogo((d) => ({ ...d, aberto: false }))}
        />
      )}

      <AlertDialog open={!!remover} onOpenChange={(a) => !a && !removerMut.isPending && setRemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover encaminhamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {remover?.vincular_cronograma
                ? "Ele está no cronograma: o evento sai da agenda e a atividade sai da EAP (a não ser que já tenha OS ligada)."
                : "O encaminhamento será removido desta ata."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removerMut.isPending}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={removerMut.isPending}
              onClick={() => remover && removerMut.mutate({ projectId: projetoId, actionId: remover.id })}
            >
              {removerMut.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Remover
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

const NENHUM = "__nenhum__";

const esquema = z.object({
  acao: z.string().trim().min(3, "Descreva a ação com ao menos 3 caracteres.").max(1000, "Ação muito longa."),
  responsavelId: z.string(),
  prazo: z.string(),
  status: z.enum(["aberta", "em_andamento", "concluida", "cancelada"]),
});
type Formulario = z.infer<typeof esquema>;

function DialogEncaminhamento({
  projetoId,
  ata,
  aberto,
  enc,
  aoFechar,
}: {
  projetoId: string;
  ata: AtaDetalhe;
  aberto: boolean;
  enc: Encaminhamento | null;
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const membros = useQuery({
    queryKey: chavesAtas.membros(projetoId),
    queryFn: () => buscarMembros(projetoId),
    enabled: aberto,
  });
  const valores = (): Formulario => ({
    acao: enc?.acao ?? "",
    responsavelId: enc?.responsavel_id ?? NENHUM,
    prazo: enc?.prazo ?? "",
    status: enc?.status ?? "aberta",
  });
  const form = useForm<Formulario>({ resolver: zodResolver(esquema), values: aberto ? valores() : undefined });
  const { errors } = form.formState;

  const criarMut = useAcaoAta(projetoId, criarEncaminhamento, "Encaminhamento incluído.", aoFechar);
  const editarMut = useAcaoAta(
    projetoId,
    atualizarEncaminhamento,
    (r) => (r.sincronizado ? "Encaminhamento e cronograma atualizados." : "Encaminhamento atualizado."),
    (r) => {
      if (r.sincronizado) queryClient.invalidateQueries({ queryKey: ["projeto", projetoId] });
      aoFechar();
    },
  );
  const pendente = criarMut.isPending || editarMut.isPending;

  const enviar = (v: Formulario) => {
    const base = {
      projectId: projetoId,
      acao: v.acao,
      responsavelId: v.responsavelId === NENHUM ? null : v.responsavelId,
      prazo: v.prazo || null,
      status: v.status,
    };
    if (enc) editarMut.mutate({ ...base, actionId: enc.id });
    else criarMut.mutate({ ...base, meetingId: ata.id });
  };

  const opcoesMembros = [
    { value: NENHUM, label: "A definir" },
    ...(membros.data ?? []).map((m) => ({ value: m.id, label: `${m.nome} (${ROTULO_PAPEL[m.papel]})` })),
  ];
  // Responsável que saiu da equipe continua aparecendo na edição
  if (enc?.responsavel_id && !opcoesMembros.some((o) => o.value === enc.responsavel_id))
    opcoesMembros.push({ value: enc.responsavel_id, label: enc.responsavel ?? "Responsável atual" });

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && !pendente && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{enc ? "Editar encaminhamento" : "Novo encaminhamento"}</DialogTitle>
          <DialogDescription>
            {enc?.vincular_cronograma
              ? "Este encaminhamento está no cronograma: ação, responsável e prazo também atualizam a atividade da EAP e o evento da agenda."
              : "Ação combinada na reunião, com responsável e prazo."}
          </DialogDescription>
        </DialogHeader>
        <form id="form-encaminhamento" noValidate onSubmit={form.handleSubmit(enviar)} className="grid gap-4">
          <Campo id="enc-acao" rotulo="Ação" erro={errors.acao?.message} obrigatorio>
            <Textarea
              id="enc-acao"
              rows={3}
              autoFocus
              aria-invalid={!!errors.acao}
              aria-describedby={errors.acao ? "enc-acao-erro" : undefined}
              placeholder="Ex.: Enviar planilha de categorias de chamados"
              {...form.register("acao")}
            />
          </Campo>
          <Campo
            id="enc-responsavel"
            rotulo="Responsável"
            erro={membros.isError ? membros.error.message : undefined}
          >
            <Controller
              control={form.control}
              name="responsavelId"
              render={({ field }) => (
                <CampoSelect
                  id="enc-responsavel"
                  opcoes={opcoesMembros}
                  valor={field.value}
                  aoMudar={field.onChange}
                  desabilitado={membros.isPending}
                />
              )}
            />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="enc-prazo"
              rotulo="Prazo"
              dica={enc?.vincular_cronograma ? "Obrigatório enquanto estiver no cronograma." : undefined}
            >
              <Input id="enc-prazo" type="date" {...form.register("prazo")} />
            </Campo>
            <Campo id="enc-status" rotulo="Situação">
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <CampoSelect id="enc-status" opcoes={OPCOES_STATUS} valor={field.value} aoMudar={field.onChange} />
                )}
              />
            </Campo>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={aoFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button type="submit" form="form-encaminhamento" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
            {enc ? "Salvar" : "Incluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
