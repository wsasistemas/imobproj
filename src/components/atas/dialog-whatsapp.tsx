"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, CircleCheck, Clock, Loader2, MessageCircle, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import {
  enviarResumoWhatsApp,
  solicitarCiencia,
  type ResultadoSolicitacao,
} from "@/app/(app)/projetos/[id]/atas/acoes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Campo, CampoSelect } from "./campos";
import { buscarGrupos, buscarMembros, chavesAtas, numeroAta, PAPEIS_CIENCIA, type AtaDetalhe } from "./dados";
import { useAcaoAta } from "./use-acao";

type Modo = "ciencia" | "resumo";

type Resultado =
  | { modo: "resumo"; enviadaAgora: boolean }
  | { modo: "ciencia"; dados: ResultadoSolicitacao };

const TEXTO_EMAIL: Record<ResultadoSolicitacao["email"], string> = {
  enviado: "E-mail enviado aos pendentes.",
  sem_provedor:
    "E-mail registrado, mas não enviado: o provedor de e-mail ainda não está configurado no servidor (a solicitação ficou guardada para envio posterior).",
  falhou: "O envio do e-mail falhou. A solicitação ficou registrada.",
  sem_destinatario: "Nenhum pendente tem e-mail cadastrado.",
};

/** "Solicitar ciência" (e-mail + grupo) ou "Enviar ao grupo WhatsApp" (resumo da ata). Só gerente. */
export function DialogWhatsApp({ projetoId, ata, modo }: { projetoId: string; ata: AtaDetalhe; modo: Modo }) {
  const [aberto, setAberto] = useState(false);
  const [grupo, setGrupo] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const grupos = useQuery({
    queryKey: chavesAtas.grupos(projetoId),
    queryFn: () => buscarGrupos(projetoId),
    enabled: aberto,
  });
  const membros = useQuery({
    queryKey: chavesAtas.membros(projetoId),
    queryFn: () => buscarMembros(projetoId),
    enabled: aberto && modo === "ciencia",
  });

  const pendentes = useMemo(() => {
    const papel = new Map((membros.data ?? []).map((m) => [m.id, m.papel]));
    return ata.participantes.filter((p) => {
      const r = papel.get(p.user_id);
      return !p.ciente_em && !!r && PAPEIS_CIENCIA.includes(r);
    });
  }, [ata.participantes, membros.data]);

  const resumoMut = useAcaoAta(projetoId, enviarResumoWhatsApp, null, (r) => setResultado({ modo: "resumo", enviadaAgora: r.enviadaAgora }));
  const cienciaMut = useAcaoAta(projetoId, solicitarCiencia, null, (r) => setResultado({ modo: "ciencia", dados: r }));
  const pendente = resumoMut.isPending || cienciaMut.isPending;

  const listaGrupos = grupos.data ?? [];
  const opcoes = listaGrupos.map((g) => ({ value: g.id, label: g.nome }));
  const grupoValido = listaGrupos.some((g) => g.id === grupo);
  const semGrupos = grupos.isSuccess && listaGrupos.length === 0;

  const enviar = () => {
    if (modo === "resumo") resumoMut.mutate({ projectId: projetoId, meetingId: ata.id, groupId: grupo });
    else cienciaMut.mutate({ projectId: projetoId, meetingId: ata.id, groupId: grupoValido ? grupo : null });
  };

  const podeEnviar =
    !pendente &&
    (modo === "resumo" ? grupoValido : !membros.isPending && pendentes.length > 0 && (grupoValido || semGrupos));

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => {
        if (pendente) return;
        setAberto(a);
        if (a) {
          setResultado(null);
          setGrupo("");
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-9" />}>
        {modo === "ciencia" ? <BellRing aria-hidden="true" /> : <MessageCircle aria-hidden="true" />}
        {modo === "ciencia" ? "Solicitar ciência" : "Enviar ao grupo WhatsApp"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{modo === "ciencia" ? "Solicitar ciência" : "Enviar ao grupo WhatsApp"}</DialogTitle>
          <DialogDescription>
            {modo === "ciencia"
              ? `Avisa por e-mail e no grupo do WhatsApp os diretores e usuários-chave que ainda não deram ciência na ${numeroAta(ata.numero)}.`
              : "Envia um resumo em texto: título, data, decisões e encaminhamentos com responsável e prazo."}
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <Retorno resultado={resultado} />
        ) : (
          <div className="grid gap-4">
            {modo === "ciencia" && (
              <div className="grid gap-1.5">
                <p className="text-[13px] font-medium">Pendentes</p>
                {membros.isPending ? (
                  <Skeleton className="h-5 w-2/3" />
                ) : pendentes.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Ninguém pendente: todos os diretores e usuários-chave participantes já deram ciência.
                  </p>
                ) : (
                  <p className="text-[13px]">{pendentes.map((p) => p.nome).join(", ")}</p>
                )}
              </div>
            )}
            {grupos.isPending ? (
              <Skeleton className="h-14 w-full" />
            ) : grupos.isError ? (
              <p role="alert" className="text-[13px] text-danger">
                {grupos.error.message}
              </p>
            ) : semGrupos ? (
              <p className="rounded-lg border border-border bg-muted px-3 py-2 text-[13px] text-muted-foreground">
                Nenhum grupo do WhatsApp ativo neste projeto.{" "}
                {modo === "ciencia" ? "A solicitação seguirá só por e-mail." : "Cadastre um grupo em Conversas WhatsApp."}
              </p>
            ) : (
              <Campo id={`grupo-${modo}-${ata.id}`} rotulo="Grupo do WhatsApp" obrigatorio>
                <CampoSelect
                  id={`grupo-${modo}-${ata.id}`}
                  opcoes={opcoes}
                  valor={grupo}
                  aoMudar={setGrupo}
                  placeholder="Escolha o grupo"
                />
              </Campo>
            )}
          </div>
        )}

        <DialogFooter>
          {resultado ? (
            <Button onClick={() => setAberto(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" type="button" onClick={() => setAberto(false)} disabled={pendente}>
                Cancelar
              </Button>
              <Button onClick={enviar} disabled={!podeEnviar}>
                {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
                {modo === "ciencia" ? "Solicitar" : "Enviar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinhaRetorno({ tipo, children }: { tipo: "ok" | "fila" | "alerta"; children: React.ReactNode }) {
  const Icone = tipo === "ok" ? CircleCheck : tipo === "fila" ? Clock : TriangleAlert;
  const cor = tipo === "ok" ? "text-success" : tipo === "fila" ? "text-warning" : "text-danger";
  return (
    <p className="flex items-start gap-2 text-[13.5px]">
      <Icone className={`mt-0.5 size-4 shrink-0 ${cor}`} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function Retorno({ resultado }: { resultado: Resultado }) {
  if (resultado.modo === "resumo")
    return (
      <div role="status" className="grid gap-2">
        {resultado.enviadaAgora ? (
          <LinhaRetorno tipo="ok">
            <strong>Enviada.</strong> O resumo foi entregue ao OpenWA para o grupo.
          </LinhaRetorno>
        ) : (
          <LinhaRetorno tipo="fila">
            <strong>Na fila para reenvio.</strong> O OpenWA não respondeu agora; a mensagem será reenviada automaticamente
            (até 5 tentativas).
          </LinhaRetorno>
        )}
      </div>
    );

  const d = resultado.dados;
  return (
    <div role="status" className="grid gap-2">
      <p className="text-[13.5px]">
        Solicitação registrada para: <strong>{d.pendentes.join(", ")}</strong>.
      </p>
      <LinhaRetorno tipo={d.email === "enviado" ? "ok" : d.email === "falhou" ? "alerta" : "fila"}>{TEXTO_EMAIL[d.email]}</LinhaRetorno>
      {d.whatsapp === "enviada" && (
        <LinhaRetorno tipo="ok">
          <strong>WhatsApp: enviada</strong> ao grupo.
        </LinhaRetorno>
      )}
      {d.whatsapp === "fila" && (
        <LinhaRetorno tipo="fila">
          <strong>WhatsApp: na fila para reenvio.</strong> Será reenviada automaticamente.
        </LinhaRetorno>
      )}
      {d.whatsapp === "nao_enviada" && (
        <LinhaRetorno tipo="alerta">
          WhatsApp não enviado{d.erroWhatsApp ? `: ${d.erroWhatsApp}` : " (nenhum grupo escolhido)."}
        </LinhaRetorno>
      )}
    </div>
  );
}
