"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  CheckCheck,
  CircleCheck,
  Clock,
  Loader2,
  MapPin,
  Send,
  Trash2,
  Undo2,
  UserPen,
} from "lucide-react";
import { useState } from "react";
import {
  darCiencia,
  excluirAta,
  mudarSituacaoAta,
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
import { pode } from "@/lib/projeto/permissoes";
import { SITUACAO_ATA, type MeetingStatus, type Papel } from "@/lib/projeto/tipos";
import { cn } from "@/lib/utils";
import type { ProjetoAta } from "./atas";
import { Anexos } from "./anexos";
import { BotaoGerarPdf } from "./botao-pdf";
import {
  buscarAta,
  chavesAtas,
  formatarData,
  formatarDataHora,
  formatarHorario,
  numeroAta,
  type AtaDetalhe,
} from "./dados";
import { DialogDadosAta } from "./dialog-dados-ata";
import { DialogWhatsApp } from "./dialog-whatsapp";
import { Encaminhamentos } from "./encaminhamentos";
import { DetalheSkeleton } from "./esqueletos";
import { ListaEditavel } from "./lista-editavel";
import { Participantes } from "./participantes";
import { useAcaoAta } from "./use-acao";

type Props = {
  projeto: ProjetoAta;
  ataId: string;
  papel: Papel;
  userId: string;
  aoVoltar: () => void;
};

export function DetalheAta({ projeto, ataId, papel, userId, aoVoltar }: Props) {
  const consulta = useQuery({
    queryKey: chavesAtas.detalhe(projeto.id, ataId),
    queryFn: () => buscarAta(projeto.id, ataId),
  });

  const voltar = (
    <Button variant="ghost" size="sm" className="w-fit lg:hidden" onClick={aoVoltar}>
      <ArrowLeft aria-hidden="true" />
      Voltar para a lista
    </Button>
  );

  if (consulta.isPending)
    return (
      <div className="grid gap-3">
        {voltar}
        <DetalheSkeleton />
      </div>
    );

  if (consulta.isError || !consulta.data)
    return (
      <div className="grid gap-3">
        {voltar}
        <Card>
          <CardContent className="py-12 text-center">
            <p role={consulta.isError ? "alert" : undefined} className={cn("font-medium", consulta.isError && "text-danger")}>
              {consulta.isError ? consulta.error.message : "Ata não encontrada"}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {consulta.isError ? "Verifique a conexão e tente de novo." : "Ela pode ter sido excluída. Escolha outra ata na lista."}
            </p>
            {consulta.isError && (
              <Button variant="outline" className="mt-3" onClick={() => consulta.refetch()}>
                Tentar de novo
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );

  const ata = consulta.data;
  return (
    <div className="grid min-w-0 gap-4">
      {voltar}
      <Cabecalho projeto={projeto} ata={ata} papel={papel} userId={userId} aoExcluir={aoVoltar} />
      <Participantes projetoId={projeto.id} ata={ata} papel={papel} />
      <div className="grid gap-4 xl:grid-cols-2">
        <ListaEditavel
          projetoId={projeto.id}
          ata={ata}
          campo="pauta"
          titulo="Pauta"
          podeEditar={pode(papel, "ata_redigir") && ata.status === "rascunho"}
          vazio="Nenhum item de pauta. Liste os assuntos que serão (ou foram) tratados na reunião."
        />
        <ListaEditavel
          projetoId={projeto.id}
          ata={ata}
          campo="decisoes"
          titulo="Decisões"
          podeEditar={pode(papel, "ata_redigir") && ata.status === "rascunho"}
          vazio="Nenhuma decisão registrada. Anote aqui o que ficou decidido na reunião."
        />
      </div>
      <Encaminhamentos projetoId={projeto.id} ata={ata} papel={papel} userId={userId} />
      <Anexos projetoId={projeto.id} ata={ata} papel={papel} />
    </div>
  );
}

function Cabecalho({
  projeto,
  ata,
  papel,
  userId,
  aoExcluir,
}: {
  projeto: ProjetoAta;
  ata: AtaDetalhe;
  papel: Papel;
  userId: string;
  aoExcluir: () => void;
}) {
  const situacao = SITUACAO_ATA[ata.status];
  const horario = formatarHorario(ata.inicio, ata.fim);
  const podeRedigir = pode(papel, "ata_redigir");
  const [confirmar, setConfirmar] = useState<null | "publicar" | "aprovar" | "reabrir" | "excluir">(null);

  const eu = ata.participantes.find((p) => p.user_id === userId);
  const podeDarCiencia = pode(papel, "ata_ciencia") && ata.status === "publicada" && !!eu && !eu.ciente_em;

  const situacaoMut = useAcaoAta(
    projeto.id,
    mudarSituacaoAta,
    (_, e) =>
      e.para === "publicada" ? "Ata publicada." : e.para === "aprovada" ? "Ata aprovada." : "Ata voltou para rascunho.",
    () => setConfirmar(null),
  );
  const excluirMut = useAcaoAta(projeto.id, excluirAta, "Ata excluída.", () => {
    setConfirmar(null);
    aoExcluir();
  });
  const cienciaMut = useAcaoAta(projeto.id, darCiencia, "Ciência registrada. Obrigado!");

  const mudar = (para: MeetingStatus) => situacaoMut.mutate({ projectId: projeto.id, meetingId: ata.id, para });

  const semCiencia = ata.participantes.filter((p) => !p.ciente_em).length;

  const confirmacoes = {
    publicar: {
      titulo: `Publicar a ${numeroAta(ata.numero)}?`,
      texto:
        "Com a ata publicada, dados, pauta e decisões ficam congelados e os diretores e usuários-chave participantes podem dar ciência. Você pode voltar para rascunho enquanto ela não for aprovada.",
      botao: "Publicar",
      acao: () => mudar("publicada"),
    },
    aprovar: {
      titulo: `Aprovar a ${numeroAta(ata.numero)}?`,
      texto:
        semCiencia > 0
          ? `Ainda há ${semCiencia} participante(s) sem ciência. Depois de aprovada, a ata não pode mais ser alterada.`
          : "Depois de aprovada, a ata não pode mais ser alterada (só a situação dos encaminhamentos).",
      botao: "Aprovar",
      acao: () => mudar("aprovada"),
    },
    reabrir: {
      titulo: "Voltar para rascunho?",
      texto: "A ata deixa de estar disponível para ciência até ser publicada de novo. As ciências já dadas são mantidas.",
      botao: "Voltar para rascunho",
      acao: () => mudar("rascunho"),
    },
    excluir: {
      titulo: `Excluir a ${numeroAta(ata.numero)}?`,
      texto:
        "A ata, os participantes, os encaminhamentos e os anexos serão removidos. Encaminhamentos levados ao cronograma saem da EAP e da agenda. Não é possível desfazer.",
      botao: "Excluir ata",
      acao: () => excluirMut.mutate({ projectId: projeto.id, meetingId: ata.id }),
    },
  } as const;
  const atual = confirmar ? confirmacoes[confirmar] : null;
  const ocupado = situacaoMut.isPending || excluirMut.isPending;

  return (
    <Card className="gap-0 py-0">
      <CardContent className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-muted-foreground">{numeroAta(ata.numero)}</p>
            <h2 className="text-[20px] leading-tight font-bold">{ata.titulo}</h2>
          </div>
          <Badge variant={situacao.variant}>{situacao.label}</Badge>
        </div>

        <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13.5px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <dt>
              <CalendarDays className="size-4" aria-label="Data" />
            </dt>
            <dd className="first-letter:uppercase">{formatarData(ata.data, "EEEE, dd 'de' MMMM 'de' yyyy")}</dd>
          </div>
          {horario && (
            <div className="flex items-center gap-1.5">
              <dt>
                <Clock className="size-4" aria-label="Horário" />
              </dt>
              <dd>{horario}</dd>
            </div>
          )}
          {ata.local && (
            <div className="flex items-center gap-1.5">
              <dt>
                <MapPin className="size-4" aria-label="Local" />
              </dt>
              <dd>{ata.local}</dd>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <dt>
              <UserPen className="size-4" aria-label="Redator" />
            </dt>
            <dd>Redigida por {ata.redator ?? "—"}</dd>
          </div>
        </dl>

        <FluxoSituacao status={ata.status} />

        {eu?.ciente_em && ata.status !== "rascunho" && (
          <p className="flex items-center gap-1.5 text-[13px] text-success">
            <CircleCheck className="size-4" aria-hidden="true" />
            Você deu ciência em {formatarDataHora(eu.ciente_em)}.
          </p>
        )}
        {ata.ultimaSolicitacao && ata.status === "publicada" && podeRedigir && (
          <p className="text-[12.5px] text-muted-foreground">
            Ciência solicitada pela última vez em {formatarDataHora(ata.ultimaSolicitacao.created_at)}.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {podeDarCiencia && (
            <Button
              onClick={() => cienciaMut.mutate({ projectId: projeto.id, meetingId: ata.id })}
              disabled={cienciaMut.isPending}
            >
              {cienciaMut.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}
              Dar ciência
            </Button>
          )}
          {podeRedigir && ata.status === "rascunho" && (
            <>
              <Button onClick={() => setConfirmar("publicar")}>
                <Send aria-hidden="true" />
                Publicar
              </Button>
              <DialogDadosAta projetoId={projeto.id} ata={ata} />
            </>
          )}
          {podeRedigir && ata.status === "publicada" && (
            <>
              <Button onClick={() => setConfirmar("aprovar")}>
                <CircleCheck aria-hidden="true" />
                Aprovar
              </Button>
              <Button variant="outline" size="sm" className="h-9" onClick={() => setConfirmar("reabrir")}>
                <Undo2 aria-hidden="true" />
                Voltar para rascunho
              </Button>
            </>
          )}
          <BotaoGerarPdf projeto={projeto} ata={ata} />
          {podeRedigir && ata.status === "publicada" && <DialogWhatsApp projetoId={projeto.id} ata={ata} modo="ciencia" />}
          {podeRedigir && ata.status !== "rascunho" && <DialogWhatsApp projetoId={projeto.id} ata={ata} modo="resumo" />}
          {podeRedigir && ata.status === "rascunho" && (
            <Button variant="destructive" size="sm" className="h-9" onClick={() => setConfirmar("excluir")}>
              <Trash2 aria-hidden="true" />
              Excluir
            </Button>
          )}
        </div>
      </CardContent>

      <AlertDialog open={!!confirmar} onOpenChange={(a) => !a && !ocupado && setConfirmar(null)}>
        <AlertDialogContent>
          {atual && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{atual.titulo}</AlertDialogTitle>
                <AlertDialogDescription>{atual.texto}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
                <Button variant={confirmar === "excluir" ? "destructive" : "default"} onClick={atual.acao} disabled={ocupado}>
                  {ocupado && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {atual.botao}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

const ETAPAS: MeetingStatus[] = ["rascunho", "publicada", "aprovada"];

/** Trilha rascunho → publicada → aprovada com a etapa atual destacada. */
function FluxoSituacao({ status }: { status: MeetingStatus }) {
  const atual = ETAPAS.indexOf(status);
  return (
    <ol aria-label="Fluxo da ata" className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
      {ETAPAS.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          <span
            aria-current={i === atual ? "step" : undefined}
            className={cn(
              "rounded-full border px-2.5 py-0.5 font-medium",
              i < atual && "border-transparent bg-success-bg text-success",
              i === atual && "border-primary-border bg-primary-soft text-primary",
              i > atual && "border-border text-muted-foreground",
            )}
          >
            {SITUACAO_ATA[s].label}
          </span>
          {i < ETAPAS.length - 1 && (
            <span aria-hidden="true" className="text-muted-foreground">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
