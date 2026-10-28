"use client";

import { useQuery } from "@tanstack/react-query";
import { FileWarning } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { pode } from "@/lib/projeto/permissoes";
import { SITUACAO_OS, type Papel } from "@/lib/projeto/tipos";
import { AcoesOs } from "./acoes-os";
import {
  buscarOs,
  chavesOs,
  formatarAgendamento,
  formatarDataHora,
  formatarHoras,
  numeroOs,
  ROTULO_ORIGEM,
  type OsLinha,
} from "./dados";
import { GaleriaEvidencias } from "./galeria-evidencias";
import { HistoricoOs } from "./historico-os";

type Props = {
  projetoId: string;
  osId: string | null;
  papel: Papel;
  userId: string;
  /** Linha já carregada na lista (aparece na hora, sem esperar a consulta do detalhe). */
  inicial?: OsLinha;
  aoFechar: () => void;
};

/** Painel de detalhe (Sheet à direita) controlado por ?os=<id> na URL. */
export function PainelOs({ projetoId, osId, papel, userId, inicial, aoFechar }: Props) {
  const consulta = useQuery({
    queryKey: chavesOs.detalhe(projetoId, osId ?? ""),
    queryFn: () => buscarOs(projetoId, osId!),
    enabled: !!osId,
    initialData: inicial,
  });
  const os = consulta.data;

  return (
    <Sheet open={!!osId} onOpenChange={(a) => !a && aoFechar()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {!os && consulta.isPending ? (
          <div className="grid gap-4 p-5" aria-busy="true" aria-label="Carregando OS">
            <SheetTitle className="sr-only">Carregando OS</SheetTitle>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !os ? (
          <div className="grid gap-2 p-5">
            <SheetTitle>OS não encontrada</SheetTitle>
            <SheetDescription>
              {consulta.isError
                ? consulta.error.message
                : "Ela pode ter sido excluída ou não está visível para o seu papel neste projeto."}
            </SheetDescription>
          </div>
        ) : (
          <ConteudoOs projetoId={projetoId} os={os} papel={papel} userId={userId} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ConteudoOs({ projetoId, os, papel, userId }: { projetoId: string; os: OsLinha; papel: Papel; userId: string }) {
  const situacao = SITUACAO_OS[os.status];
  const podeEnviar = pode(papel, "os_editar") || (pode(papel, "os_apontar_propria") && os.executor_id === userId);

  return (
    <>
      <SheetHeader className="border-b border-border p-5 pr-12">
        <p className="text-[12.5px] font-semibold text-muted-foreground">{numeroOs(os.numero)}</p>
        <SheetTitle className="text-[18px] leading-snug font-semibold">{os.titulo}</SheetTitle>
        <SheetDescription render={<div />} className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant={situacao.variant}>{situacao.label}</Badge>
          {os.fora_escopo && (
            <Badge variant="warning">
              <FileWarning aria-hidden="true" />
              Fora do escopo
            </Badge>
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="grid gap-6 p-5">
        <AcoesOs projetoId={projetoId} os={os} papel={papel} userId={userId} />

        <section aria-labelledby="os-dados-titulo" className="grid gap-2">
          <h3 id="os-dados-titulo" className="rotulo-secao">
            Dados
          </h3>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
            <Dado rotulo="Atividade da EAP" largo>
              {os.atividade ? (
                <>
                  <span className="font-mono text-[12.5px] text-muted-foreground">{os.atividade.codigo}</span>{" "}
                  {os.atividade.titulo}
                </>
              ) : (
                "Sem atividade vinculada"
              )}
            </Dado>
            <Dado rotulo="Executor">{os.executor?.nome ?? "Não definido"}</Dado>
            <Dado rotulo="Origem">{ROTULO_ORIGEM[os.origem]}</Dado>
            <Dado rotulo="Agendamento" largo>
              {formatarAgendamento(os.agendada_inicio, os.agendada_fim)}
            </Dado>
            <Dado rotulo="Check-in">{formatarDataHora(os.checkin_at)}</Dado>
            <Dado rotulo="Check-out">{formatarDataHora(os.checkout_at)}</Dado>
            <Dado rotulo="Horas apontadas">{formatarHoras(os.horas)}</Dado>
            <Dado rotulo="Horas previstas">{formatarHoras(os.horas_previstas ?? null)}</Dado>
            {(os.aceite_em || os.aceite_comentario) && (
              <Dado rotulo={os.status === "recusada" ? "Recusa" : "Aceite"} largo>
                {formatarDataHora(os.aceite_em)}
                {os.aceite_comentario && (
                  <span className="mt-0.5 block text-muted-foreground">“{os.aceite_comentario}”</span>
                )}
              </Dado>
            )}
          </dl>
        </section>

        <section aria-labelledby="os-descricao-titulo" className="grid gap-2">
          <h3 id="os-descricao-titulo" className="rotulo-secao">
            Descrição
          </h3>
          <p className="text-[14px] whitespace-pre-line">
            {os.descricao?.trim() || <span className="text-muted-foreground">Sem descrição.</span>}
          </p>
        </section>

        <GaleriaEvidencias projetoId={projetoId} osId={os.id} podeEnviar={podeEnviar} />
        <HistoricoOs projetoId={projetoId} osId={os.id} />
      </div>
    </>
  );
}

function Dado({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children: ReactNode }) {
  return (
    <div className={largo ? "sm:col-span-2" : undefined}>
      <dt className="text-[12px] text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-[14px]">{children}</dd>
    </div>
  );
}
