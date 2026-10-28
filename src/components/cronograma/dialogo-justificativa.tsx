"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COR_EVENTO } from "@/lib/projeto/tipos";
import type { EventoCronograma } from "./eventos";

export type Remarcacao = {
  evento: EventoCronograma;
  novoInicio: string;
  novoFim: string | null;
};

function periodo(inicio: string, fim: string | null, diaInteiro: boolean) {
  const fmt = diaInteiro ? "EEE, d 'de' MMM" : "EEE, d 'de' MMM, HH:mm";
  const a = format(new Date(inicio), fmt, { locale: ptBR });
  if (!fim) return a;
  const b = format(new Date(fim), fmt, { locale: ptBR });
  return a === b ? a : `${a} – ${b}`;
}

/** Pede a justificativa obrigatória antes de gravar a mudança de datas (schedule_changes). */
export function DialogoJustificativa({
  remarcacao,
  salvando,
  onConfirmar,
  onCancelar,
}: {
  remarcacao: Remarcacao | null;
  salvando: boolean;
  onConfirmar: (justificativa: string) => void;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [tocado, setTocado] = useState(false);
  const idCampo = useId();
  const idErro = useId();
  const valido = texto.trim().length >= 5;
  const ev = remarcacao?.evento;
  const cancelar = () => {
    setTexto("");
    setTocado(false);
    onCancelar();
  };

  return (
    <Dialog
      open={!!remarcacao}
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) cancelar();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTocado(true);
            if (!valido || salvando) return;
            onConfirmar(texto.trim());
            setTexto("");
            setTocado(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Justificar mudança no cronograma</DialogTitle>
            <DialogDescription>
              Toda remarcação fica registrada no histórico do projeto com autor, datas anteriores e novas.
            </DialogDescription>
          </DialogHeader>

          {ev && remarcacao && (
            <div className="rounded-lg border border-border bg-table-head p-3 text-[13px]">
              <p className="flex items-center gap-2 font-semibold">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: COR_EVENTO[ev.tipo].cor }}
                />
                <span className="truncate">{ev.titulo}</span>
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                <span className="line-through decoration-muted-foreground/60">
                  {periodo(ev.inicio, ev.fim, ev.diaInteiro)}
                </span>
                <ArrowRight size={14} aria-label="para" />
                <span className="font-medium text-foreground">
                  {periodo(remarcacao.novoInicio, remarcacao.novoFim, ev.diaInteiro)}
                </span>
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor={idCampo}>Justificativa (obrigatória)</Label>
            <Textarea
              id={idCampo}
              rows={3}
              autoFocus
              value={texto}
              maxLength={1000}
              onChange={(e) => setTexto(e.target.value)}
              onBlur={() => setTocado(true)}
              placeholder="Ex.: cliente pediu para adiar a validação por causa do fechamento do mês."
              aria-invalid={tocado && !valido}
              aria-describedby={tocado && !valido ? idErro : undefined}
            />
            {tocado && !valido && (
              <p id={idErro} className="text-[12.5px] text-danger">
                Escreva o motivo da mudança (mínimo de 5 caracteres).
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={salvando} onClick={cancelar}>
              Cancelar e desfazer
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Confirmar mudança"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
