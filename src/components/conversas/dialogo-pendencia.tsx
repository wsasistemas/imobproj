"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { criarPendencia, levarParaProximaAta, type AtaDestino } from "@/app/(app)/projetos/[id]/conversas/acoes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ROTULO_PAPEL } from "@/lib/projeto/tipos";
import { previa, type MensagemWa, type PessoaProjeto } from "./dados";

const SEM_RESPONSAVEL = "__nenhum__";

export const hrefAta = (projetoId: string, ataId: string) => `/projetos/${projetoId}/atas?ata=${ataId}`;

function rotuloAta(a: AtaDestino) {
  return `Ata nº ${a.numero} · ${a.titulo}`;
}

/** Invalida o que o módulo Atas lê (lista/detalhe), para a ata aparecer atualizada ao abrir. */
function invalidarAtas(queryClient: ReturnType<typeof useQueryClient>, projetoId: string) {
  queryClient.invalidateQueries({ queryKey: ["projeto", projetoId, "atas"] });
}

/** "Levar para a próxima ata": acrescenta a mensagem (com autor e data) à pauta da próxima ata em rascunho. */
export function useLevarParaAta(projetoId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (m: MensagemWa) => {
      const r = await levarParaProximaAta({ projectId: projetoId, messageId: m.id });
      if (!r.ok) throw new Error(r.erro);
      return r.dados;
    },
    onSuccess: (ata) => {
      invalidarAtas(queryClient, projetoId);
      toast.success(ata.criada ? `Criada a ${rotuloAta(ata)} com o item na pauta.` : `Item incluído na pauta da ${rotuloAta(ata)}.`, {
        action: { label: "Abrir ata", onClick: () => router.push(hrefAta(projetoId, ata.id)) },
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível levar a mensagem para a ata."),
  });
}

export function DialogoPendencia({
  projetoId,
  mensagem,
  autorNome,
  pessoas,
  onFechar,
}: {
  projetoId: string;
  mensagem: MensagemWa | null;
  autorNome: string;
  pessoas: PessoaProjeto[];
  onFechar: () => void;
}) {
  return (
    <Dialog open={!!mensagem} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        {mensagem && (
          <FormularioPendencia
            key={mensagem.id}
            projetoId={projetoId}
            mensagem={mensagem}
            autorNome={autorNome}
            pessoas={pessoas}
            onFechar={onFechar}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormularioPendencia({
  projetoId,
  mensagem,
  autorNome,
  pessoas,
  onFechar,
}: {
  projetoId: string;
  mensagem: MensagemWa;
  autorNome: string;
  pessoas: PessoaProjeto[];
  onFechar: () => void;
}) {
  const ids = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState(() => previa(mensagem).slice(0, 1000));
  // Pré-seleciona o autor da mensagem quando ele é membro ativo.
  const [responsavel, setResponsavel] = useState(() => {
    const autor = pessoas.find((p) => p.ativo && p.userId === mensagem.author_user_id);
    return autor?.userId ?? SEM_RESPONSAVEL;
  });
  const [prazo, setPrazo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const opcoes = [
    { value: SEM_RESPONSAVEL, label: "Sem responsável" },
    ...pessoas
      .filter((p) => p.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .map((p) => ({ value: p.userId, label: `${p.nome} · ${ROTULO_PAPEL[p.papel]}` })),
  ];

  const criar = useMutation({
    mutationFn: async () => {
      const r = await criarPendencia({
        projectId: projetoId,
        messageId: mensagem.id,
        acao: texto,
        responsavelId: responsavel === SEM_RESPONSAVEL ? null : responsavel,
        prazo: prazo || null,
      });
      if (!r.ok) throw new Error(r.erro);
      return r.dados;
    },
    onSuccess: (ata) => {
      invalidarAtas(queryClient, projetoId);
      toast.success(
        ata.criada ? `Pendência criada na nova ${rotuloAta(ata)}.` : `Pendência criada na ${rotuloAta(ata)}.`,
        { action: { label: "Abrir ata", onClick: () => router.push(hrefAta(projetoId, ata.id)) } },
      );
      onFechar();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Não foi possível criar a pendência."),
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        if (texto.trim().length < 3) {
          setErro("Descreva a pendência (mín. 3 caracteres).");
          return;
        }
        criar.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>Criar pendência</DialogTitle>
        <DialogDescription>
          Vira um encaminhamento da próxima ata em rascunho do projeto (a de data mais próxima a partir de hoje). Se não
          houver, criamos a ata “Pendências do WhatsApp” com a data de hoje.
        </DialogDescription>
      </DialogHeader>

      <p className="rounded-md border-l-4 border-(--cv-citacao-borda) bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
        <b className="text-foreground">{autorNome}</b> · {previa(mensagem).slice(0, 160)}
        {previa(mensagem).length > 160 ? "…" : ""}
      </p>

      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-texto`}>Pendência</Label>
        <Textarea
          id={`${ids}-texto`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          maxLength={1000}
          aria-invalid={!!erro && texto.trim().length < 3}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-resp`}>Responsável</Label>
          <Select items={opcoes} value={responsavel} onValueChange={(v) => setResponsavel((v as string | null) ?? SEM_RESPONSAVEL)}>
            <SelectTrigger id={`${ids}-resp`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opcoes.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-prazo`}>Prazo</Label>
          <Input id={`${ids}-prazo`} type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </div>
      </div>

      {erro && (
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {erro}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={criar.isPending}>
          {criar.isPending ? "Criando…" : "Criar pendência"}
        </Button>
      </DialogFooter>
    </form>
  );
}
