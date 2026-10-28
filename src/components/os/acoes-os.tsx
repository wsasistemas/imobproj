"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, FileWarning, Loader2, LogIn, LogOut, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { apontarOs, decidirAceite, marcarForaEscopo } from "@/app/(app)/projetos/[id]/os/acoes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { pode } from "@/lib/projeto/permissoes";
import type { Papel } from "@/lib/projeto/tipos";
import { Campo } from "./campos";
import { numeroOs, type OsLinha } from "./dados";

type Props = { projetoId: string; os: OsLinha; papel: Papel; userId: string };

const numeroBr = (v: string) => Number(v.replace(/\./g, "").replace(",", "."));
const numeroHoras = (v: string) => Number(v.replace(",", "."));

/** Ações do painel de detalhe. Os botões só aparecem para quem pode; a Server Action confere de novo. */
export function AcoesOs({ projetoId, os, papel, userId }: Props) {
  const podeAceitar = pode(papel, "os_aceitar") && os.status === "aguardando_aceite";
  const podeForaEscopo = pode(papel, "os_fora_escopo") && !os.fora_escopo;
  const ehExecutor = pode(papel, "os_apontar_propria") && os.executor_id === userId;
  const podeCheckin = ehExecutor && os.status === "agendada";
  const podeCheckout = ehExecutor && os.status === "em_execucao";

  if (!podeAceitar && !podeForaEscopo && !podeCheckin && !podeCheckout) return null;

  return (
    <section aria-labelledby="os-acoes-titulo" className="grid gap-2">
      <h3 id="os-acoes-titulo" className="rotulo-secao">
        Ações
      </h3>
      <div className="flex flex-wrap gap-2">
        {podeAceitar && <AceiteOs projetoId={projetoId} os={os} decisao="aprovada" />}
        {podeAceitar && <AceiteOs projetoId={projetoId} os={os} decisao="recusada" />}
        {podeCheckin && <CheckinOs projetoId={projetoId} os={os} />}
        {podeCheckout && <CheckoutOs projetoId={projetoId} os={os} />}
        {podeForaEscopo && <ForaEscopoOs projetoId={projetoId} os={os} />}
      </div>
      {pode(papel, "os_aceitar") && os.status !== "aguardando_aceite" && os.status !== "aprovada" && os.status !== "recusada" && (
        <p className="text-[12.5px] text-muted-foreground">
          Aprovar e recusar ficam disponíveis quando o executor fizer o check-out e a OS for para aceite.
        </p>
      )}
    </section>
  );
}

function useInvalidarProjeto(projetoId: string) {
  const queryClient = useQueryClient();
  // Aceite e fora do escopo mudam o avanço da EAP e os painéis de outros módulos do projeto.
  return () => queryClient.invalidateQueries({ queryKey: ["projeto", projetoId] });
}

function DialogAcao({
  aberto,
  setAberto,
  gatilho,
  titulo,
  descricao,
  children,
  rotuloConfirmar,
  pendente,
  aoConfirmar,
  perigo,
}: {
  aberto: boolean;
  setAberto: (a: boolean) => void;
  gatilho: ReactNode;
  titulo: string;
  descricao: string;
  children?: ReactNode;
  rotuloConfirmar: string;
  pendente: boolean;
  aoConfirmar: () => void;
  perigo?: boolean;
}) {
  return (
    <>
      {gatilho}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              aoConfirmar();
            }}
          >
            {children}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant={perigo ? "destructive" : "default"} disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
                {rotuloConfirmar}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
const esquemaRecusa = z.string().trim().min(3, "Explique o motivo da recusa (comentário obrigatório).").max(2000);

function AceiteOs({ projetoId, os, decisao }: { projetoId: string; os: OsLinha; decisao: "aprovada" | "recusada" }) {
  const [aberto, setAberto] = useState(false);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string>();
  const invalidar = useInvalidarProjeto(projetoId);
  const recusa = decisao === "recusada";

  const mutacao = useMutation({
    mutationFn: async () => {
      const r = await decidirAceite({ projectId: projetoId, osId: os.id, decisao, comentario });
      if (!r.ok) throw new Error(r.erro);
    },
    onSuccess: () => {
      toast.success(recusa ? `${numeroOs(os.numero)} recusada.` : `${numeroOs(os.numero)} aprovada.`);
      invalidar();
      setAberto(false);
      setComentario("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DialogAcao
      aberto={aberto}
      setAberto={(a) => {
        setAberto(a);
        if (!a) setErro(undefined);
      }}
      gatilho={
        <Button variant={recusa ? "destructive" : "default"} onClick={() => setAberto(true)}>
          {recusa ? <X aria-hidden="true" /> : <Check aria-hidden="true" />}
          {recusa ? "Recusar" : "Aprovar"}
        </Button>
      }
      titulo={recusa ? `Recusar ${numeroOs(os.numero)}` : `Aprovar ${numeroOs(os.numero)}`}
      descricao={
        recusa
          ? "O executor verá o motivo no histórico da OS. O comentário é obrigatório."
          : `As ${os.horas.toLocaleString("pt-BR")} h apontadas passam a contar no avanço da atividade${os.fora_escopo ? " (exceto por estar fora do escopo)" : ""}.`
      }
      rotuloConfirmar={recusa ? "Recusar OS" : "Aprovar OS"}
      perigo={recusa}
      pendente={mutacao.isPending}
      aoConfirmar={() => {
        if (recusa) {
          const v = esquemaRecusa.safeParse(comentario);
          if (!v.success) return setErro(v.error.issues[0]?.message);
        }
        setErro(undefined);
        mutacao.mutate();
      }}
    >
      <Campo
        id={`aceite-comentario-${decisao}`}
        rotulo={recusa ? "Motivo da recusa" : "Comentário (opcional)"}
        erro={erro}
        obrigatorio={recusa}
      >
        <Textarea
          id={`aceite-comentario-${decisao}`}
          rows={4}
          autoFocus
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          aria-invalid={!!erro}
          aria-describedby={erro ? `aceite-comentario-${decisao}-erro` : undefined}
          placeholder={recusa ? "O que precisa ser corrigido para aprovar?" : "Ex.: Entrega validada com a equipe."}
        />
      </Campo>
    </DialogAcao>
  );
}

// ---------------------------------------------------------------------------------------------
const esquemaForaEscopo = z.object({
  descricao: z.string().trim().min(5, "Descreva o que está fora do escopo (ao menos 5 caracteres)."),
  horas: z
    .string()
    .refine((v) => v.trim() !== "" && !Number.isNaN(numeroHoras(v)) && numeroHoras(v) >= 0, "Informe as horas (zero ou mais)."),
  valor: z
    .string()
    .refine((v) => v.trim() === "" || (!Number.isNaN(numeroBr(v)) && numeroBr(v) >= 0), "Informe um valor válido ou deixe em branco."),
});

function ForaEscopoOs({ projetoId, os }: { projetoId: string; os: OsLinha }) {
  const [aberto, setAberto] = useState(false);
  const [campos, setCampos] = useState({ descricao: "", horas: os.horas ? String(os.horas).replace(".", ",") : "", valor: "" });
  const [erros, setErros] = useState<Partial<Record<keyof typeof campos, string>>>({});
  const invalidar = useInvalidarProjeto(projetoId);

  const mutacao = useMutation({
    mutationFn: async () => {
      const r = await marcarForaEscopo({
        projectId: projetoId,
        osId: os.id,
        descricao: campos.descricao,
        horas: numeroHoras(campos.horas),
        valor: campos.valor.trim() === "" ? null : numeroBr(campos.valor),
      });
      if (!r.ok) throw new Error(r.erro);
    },
    onSuccess: () => {
      toast.success(`${numeroOs(os.numero)} marcada como fora do escopo. Proposta de escopo criada (pendente).`);
      invalidar();
      setAberto(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCampos((c) => ({ ...c, [k]: e.target.value }));
  const descr = (k: keyof typeof campos) => (erros[k] ? `fora-escopo-${k}-erro` : undefined);

  return (
    <DialogAcao
      aberto={aberto}
      setAberto={(a) => {
        setAberto(a);
        if (!a) setErros({});
      }}
      gatilho={
        <Button variant="outline" onClick={() => setAberto(true)}>
          <FileWarning aria-hidden="true" />
          Marcar fora do escopo
        </Button>
      }
      titulo={`${numeroOs(os.numero)} fora do escopo`}
      descricao="A OS deixa de contar no avanço da EAP e uma proposta de escopo (pendente) é criada para aprovação."
      rotuloConfirmar="Marcar e criar proposta"
      pendente={mutacao.isPending}
      aoConfirmar={() => {
        const v = esquemaForaEscopo.safeParse(campos);
        if (!v.success) {
          const e: typeof erros = {};
          for (const i of v.error.issues) e[i.path[0] as keyof typeof campos] ??= i.message;
          return setErros(e);
        }
        setErros({});
        mutacao.mutate();
      }}
    >
      <Campo id="fora-escopo-descricao" rotulo="O que está fora do escopo" erro={erros.descricao} obrigatorio>
        <Textarea
          id="fora-escopo-descricao"
          rows={3}
          autoFocus
          value={campos.descricao}
          onChange={set("descricao")}
          aria-invalid={!!erros.descricao}
          aria-describedby={descr("descricao")}
          placeholder="Ex.: Relatório de SLA por filial não previsto no escopo."
        />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="fora-escopo-horas" rotulo="Horas" erro={erros.horas} obrigatorio>
          <Input
            id="fora-escopo-horas"
            inputMode="decimal"
            value={campos.horas}
            onChange={set("horas")}
            aria-invalid={!!erros.horas}
            aria-describedby={descr("horas")}
            placeholder="Ex.: 16"
          />
        </Campo>
        <Campo id="fora-escopo-valor" rotulo="Valor (R$, opcional)" erro={erros.valor}>
          <Input
            id="fora-escopo-valor"
            inputMode="decimal"
            value={campos.valor}
            onChange={set("valor")}
            aria-invalid={!!erros.valor}
            aria-describedby={descr("valor")}
            placeholder="Ex.: 2.400,00"
          />
        </Campo>
      </div>
    </DialogAcao>
  );
}

// ---------------------------------------------------------------------------------------------
function CheckinOs({ projetoId, os }: { projetoId: string; os: OsLinha }) {
  const [aberto, setAberto] = useState(false);
  const invalidar = useInvalidarProjeto(projetoId);
  const mutacao = useMutation({
    mutationFn: async () => {
      const r = await apontarOs({ tipo: "checkin", projectId: projetoId, osId: os.id });
      if (!r.ok) throw new Error(r.erro);
    },
    onSuccess: () => {
      toast.success("Check-in registrado. Bom trabalho!");
      invalidar();
      setAberto(false);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <DialogAcao
      aberto={aberto}
      setAberto={setAberto}
      gatilho={
        <Button onClick={() => setAberto(true)}>
          <LogIn aria-hidden="true" />
          Fazer check-in
        </Button>
      }
      titulo={`Check-in na ${numeroOs(os.numero)}`}
      descricao="Registra agora como início da execução. A OS passa para “Em execução”."
      rotuloConfirmar="Fazer check-in"
      pendente={mutacao.isPending}
      aoConfirmar={() => mutacao.mutate()}
    />
  );
}

function horasDesde(iso: string | null) {
  if (!iso) return "";
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (!(h > 0)) return "";
  return String(Math.round(h * 4) / 4).replace(".", ",");
}

function CheckoutOs({ projetoId, os }: { projetoId: string; os: OsLinha }) {
  const [aberto, setAberto] = useState(false);
  const [horas, setHoras] = useState("");
  const [erro, setErro] = useState<string>();
  const invalidar = useInvalidarProjeto(projetoId);
  const mutacao = useMutation({
    mutationFn: async () => {
      const r = await apontarOs({ tipo: "checkout", projectId: projetoId, osId: os.id, horas: numeroHoras(horas) });
      if (!r.ok) throw new Error(r.erro);
    },
    onSuccess: () => {
      toast.success("Check-out registrado. A OS foi enviada para aceite.");
      invalidar();
      setAberto(false);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <DialogAcao
      aberto={aberto}
      setAberto={(a) => {
        setAberto(a);
        if (a) setHoras(horasDesde(os.checkin_at));
        else setErro(undefined);
      }}
      gatilho={
        <Button
          onClick={() => {
            setHoras(horasDesde(os.checkin_at));
            setAberto(true);
          }}
        >
          <LogOut aria-hidden="true" />
          Fazer check-out
        </Button>
      }
      titulo={`Check-out da ${numeroOs(os.numero)}`}
      descricao="Informe as horas trabalhadas. A OS vai para “Aguardando aceite” do usuário-chave ou diretor."
      rotuloConfirmar="Fazer check-out"
      pendente={mutacao.isPending}
      aoConfirmar={() => {
        const n = numeroHoras(horas);
        if (horas.trim() === "" || Number.isNaN(n) || n <= 0) return setErro("Informe as horas trabalhadas.");
        setErro(undefined);
        mutacao.mutate();
      }}
    >
      <Campo id="checkout-horas" rotulo="Horas trabalhadas" erro={erro} obrigatorio dica="Sugestão calculada desde o check-in.">
        <Input
          id="checkout-horas"
          inputMode="decimal"
          autoFocus
          value={horas}
          onChange={(e) => setHoras(e.target.value)}
          aria-invalid={!!erro}
          aria-describedby={erro ? "checkout-horas-erro" : "checkout-horas-dica"}
        />
      </Campo>
    </DialogAcao>
  );
}
