"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, CheckCheck, MessageCircle, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { devolverAtendimento, encerrarAtendimento, transferirAtendimento } from "@/app/(app)/atendimento/acoes";
import { executar, formatarTelefone } from "@/components/cadastros/util";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { chavesMonitor, hrefConversa, type MonitorAtendente, type MonitorConversa, type SetorMonitor } from "./dados";

/** "Abrir / transferir": abrir a conversa, transferir para pessoa ou setor, devolver à fila ou encerrar. */
export function DialogoAtendimento({
  conversa,
  atendentes,
  setores,
  onFechar,
}: {
  conversa: MonitorConversa | null;
  atendentes: MonitorAtendente[];
  setores: SetorMonitor[];
  onFechar: () => void;
}) {
  return (
    <Dialog open={conversa !== null} onOpenChange={(a) => !a && onFechar()}>
      <DialogContent className="sm:max-w-md">
        {conversa && <Conteudo key={conversa.atendimento_id} conversa={conversa} atendentes={atendentes} setores={setores} onFechar={onFechar} />}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({
  conversa: c,
  atendentes,
  setores,
  onFechar,
}: {
  conversa: MonitorConversa;
  atendentes: MonitorAtendente[];
  setores: SetorMonitor[];
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [setorDestino, setSetorDestino] = useState<string>(c.setor_id);
  const [pessoa, setPessoa] = useState<string>("");

  // Pessoas do setor de destino (sem quem já está atendendo).
  const pessoas = atendentes.filter((a) => a.setor_id === setorDestino && a.usuario_id !== c.atendente_id);
  const itensSetor = setores.map((s) => ({ value: s.id, label: s.nome }));
  const itensPessoa = [
    { value: "", label: setorDestino === c.setor_id ? "Escolha a pessoa" : "Fila do setor (quem estiver livre)" },
    ...pessoas.map((p) => ({ value: p.usuario_id, label: p.nome })),
  ];
  const mudouSetor = setorDestino !== c.setor_id;

  const depois = (msg: string) => ({
    onSuccess: () => {
      toast.success(msg);
      onFechar();
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: chavesMonitor.tudo }),
  });

  const mTransferir = useMutation({
    mutationFn: () =>
      executar(transferirAtendimento({ id: c.atendimento_id, atendenteId: pessoa || null, setorId: mudouSetor ? setorDestino : null })),
    ...depois("Atendimento transferido"),
  });
  const mDevolver = useMutation({ mutationFn: () => executar(devolverAtendimento(c.atendimento_id)), ...depois("Conversa devolvida à fila") });
  const mEncerrar = useMutation({ mutationFn: () => executar(encerrarAtendimento(c.atendimento_id)), ...depois("Atendimento encerrado") });
  const ocupado = mTransferir.isPending || mDevolver.isPending || mEncerrar.isPending;
  const href = hrefConversa(c);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Ticket #{c.ticket} · {c.cliente ?? c.grupo_nome}
        </DialogTitle>
        <DialogDescription>
          {c.setor_nome} · {c.atendente_nome ? `com ${c.atendente_nome}` : "na fila"}
          {c.telefone ? ` · ${formatarTelefone(c.telefone)}` : ""}
        </DialogDescription>
      </DialogHeader>

      {c.ultima_previa && (
        <p className="rounded-[10px] bg-table-head px-3 py-2 text-[13px] text-muted-foreground">
          <span className="font-semibold text-foreground">Última mensagem: </span>
          {c.ultima_previa}
        </p>
      )}

      <div className="grid gap-3">
        <span className="text-[11px] font-bold tracking-[.07em] text-muted-foreground uppercase">Transferir</span>
        <div className="grid gap-1.5">
          <Label id="transf-setor">Setor</Label>
          <Select
            items={itensSetor}
            value={setorDestino}
            onValueChange={(v) => {
              setSetorDestino(String(v));
              setPessoa("");
            }}
          >
            <SelectTrigger className="w-full" aria-labelledby="transf-setor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {itensSetor.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label id="transf-pessoa">Pessoa</Label>
          <Select items={itensPessoa} value={pessoa} onValueChange={(v) => setPessoa(v ? String(v) : "")}>
            <SelectTrigger className="w-full" aria-labelledby="transf-pessoa">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {itensPessoa.map((i) => (
                <SelectItem key={i.value || "fila"} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" disabled={ocupado || (!pessoa && !mudouSetor)} onClick={() => mTransferir.mutate()}>
          <ArrowRightLeft aria-hidden="true" />
          Transferir
        </Button>
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {href ? (
          <Button variant="ghost" render={<Link href={href} />} nativeButton={false}>
            <MessageCircle aria-hidden="true" />
            Abrir conversa
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={ocupado} onClick={() => mDevolver.mutate()}>
            <Undo2 aria-hidden="true" />
            Devolver à fila
          </Button>
          <Button disabled={ocupado} onClick={() => mEncerrar.mutate()}>
            <CheckCheck aria-hidden="true" />
            Encerrar
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
