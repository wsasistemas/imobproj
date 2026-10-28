"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Copy, Loader2, RotateCw, ShieldCheck, Webhook } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { configurarReenvio, gerarSegredoWebhook, marcarAlertasLidos } from "@/app/(app)/admin/whatsapp/acoes";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { CHAVE_ADMIN_WHATSAPP, copiar, dataHora, executar } from "./util";

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={rotulo}
      onClick={async () => ((await copiar(texto)) ? toast.success("Copiado") : toast.error("Não foi possível copiar."))}
    >
      <Copy aria-hidden="true" />
    </Button>
  );
}

// ---------------------------------------------------------------- webhook

export function CartaoWebhook({ webhookUrl, geradoEm }: { webhookUrl: string; geradoEm: string | null }) {
  const ids = useId();
  const queryClient = useQueryClient();
  const [segredo, setSegredo] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  const gerar = useMutation({
    mutationFn: () => executar(gerarSegredoWebhook()),
    onSuccess: (r) => {
      setConfirmar(false);
      setSegredo(r.segredo);
      toast.success("Segredo do webhook gerado", { description: "Copie agora: ele não será mostrado de novo." });
      void queryClient.invalidateQueries({ queryKey: [...CHAVE_ADMIN_WHATSAPP] });
    },
    onError: (e: Error) => {
      setConfirmar(false);
      toast.error(e.message);
    },
  });

  const exemplo = JSON.stringify(
    {
      url: webhookUrl,
      events: ["message.received", "session.status", "session.authenticated", "session.disconnected"],
      secret: segredo ?? "<SEGREDO>",
      headers: { "x-openwa-secret": segredo ?? "<SEGREDO>" },
    },
    null,
    2,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconeMenu icon={Webhook} cor="var(--sys-indigo)" tamanho={36} />
          <div className="grid gap-0.5">
            <CardTitle>Webhook do OpenWA</CardTitle>
            <CardDescription>Cadastre esta URL e o segredo no webhook de cada sessão do OpenWA.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-url`}>URL do webhook</Label>
          <div className="flex gap-2">
            <Input id={`${ids}-url`} readOnly value={webhookUrl} className="font-mono text-[12.5px]" />
            <BotaoCopiar texto={webhookUrl} rotulo="Copiar a URL do webhook" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
          <span className="flex items-center gap-2">
            <ShieldCheck size={16} className={geradoEm ? "text-success" : "text-warning"} aria-hidden="true" />
            {geradoEm ? <>Segredo gerado em {dataHora(geradoEm)}</> : "Segredo ainda não gerado — o webhook recusa tudo (503)."}
          </span>
          <Button
            variant={geradoEm ? "outline" : "default"}
            disabled={gerar.isPending}
            onClick={() => (geradoEm ? setConfirmar(true) : gerar.mutate())}
          >
            {gerar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
            {geradoEm ? "Regenerar segredo" : "Gerar segredo"}
          </Button>
        </div>

        {segredo && (
          <div className="grid gap-2 rounded-[10px] border border-warning/40 bg-warning-bg px-3.5 py-3">
            <Label htmlFor={`${ids}-segredo`} className="text-warning">
              Copie agora — este segredo não será mostrado de novo
            </Label>
            <div className="flex gap-2">
              <Input id={`${ids}-segredo`} readOnly value={segredo} className="bg-card font-mono text-[12.5px]" />
              <BotaoCopiar texto={segredo} rotulo="Copiar o segredo do webhook" />
            </div>
          </div>
        )}

        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Como cadastrar no OpenWA (POST /api/sessions/&lt;id&gt;/webhooks)
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-[8px] bg-muted p-3 font-mono text-[12px] leading-relaxed">{exemplo}</pre>
          <p className="mt-1 text-muted-foreground">
            O IMOBPROJ aceita o header <b>x-openwa-secret</b> ou a assinatura <b>X-OpenWA-Signature</b> (HMAC do campo
            &quot;secret&quot;). Basta um dos dois.
          </p>
        </details>
      </CardContent>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerar o segredo do webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              O segredo atual deixa de valer na hora: os eventos do OpenWA serão recusados até você atualizar o webhook de
              cada sessão com o novo segredo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button disabled={gerar.isPending} onClick={() => gerar.mutate()}>
              {gerar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Regenerar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ---------------------------------------------------------------- fila de reenvio

type Fila = {
  pendentes: number;
  falhas: number;
  esgotadas: number;
  alertas: { id: string; titulo: string; detalhe: string | null; created_at: string }[];
};

export function CartaoReenvio({
  funcoesUrlSugerida,
  configurado,
  ativo,
}: {
  funcoesUrlSugerida: string;
  configurado: boolean;
  ativo: boolean;
}) {
  const ids = useId();
  const queryClient = useQueryClient();
  const [funcoesUrl, setFuncoesUrl] = useState(funcoesUrlSugerida);

  const fila = useQuery({
    queryKey: [...CHAVE_ADMIN_WHATSAPP, "fila"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<Fila> => {
      const supabase = createClient();
      const contar = async (status: "pendente" | "falhou", esgotada: boolean) => {
        let q = supabase
          .from("wa_messages")
          .select("id", { count: "exact", head: true })
          .eq("direction", "out")
          .eq("status", status);
        q = esgotada ? q.gte("tentativas", 5) : q.lt("tentativas", 5);
        const { count, error } = await q;
        if (error) throw new Error(error.message);
        return count ?? 0;
      };
      const [pendentes, falhas, esgotadas, alertas] = await Promise.all([
        contar("pendente", false),
        contar("falhou", false),
        contar("falhou", true),
        supabase
          .from("alertas")
          .select("id, titulo, detalhe, created_at")
          .eq("tipo", "whatsapp_envio_falhou")
          .is("lido_em", null)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      if (alertas.error) throw new Error(alertas.error.message);
      return { pendentes, falhas, esgotadas, alertas: (alertas.data as Fila["alertas"] | null) ?? [] };
    },
  });

  const salvar = useMutation({
    mutationFn: () => executar(configurarReenvio({ functionsUrl: funcoesUrl })),
    onSuccess: () => {
      toast.success("Reenvio automático configurado");
      void queryClient.invalidateQueries({ queryKey: [...CHAVE_ADMIN_WHATSAPP] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lidos = useMutation({
    mutationFn: () => executar(marcarAlertasLidos()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...CHAVE_ADMIN_WHATSAPP, "fila"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const f = fila.data;
  const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconeMenu icon={BellRing} cor="var(--sys-orange)" tamanho={36} />
          <div className="grid gap-0.5">
            <CardTitle>Fila de reenvio</CardTitle>
            <CardDescription>
              Job pg_cron a cada 2 minutos: reenvia as mensagens que falharam (até 5 tentativas) e alerta o super admin.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            { rotulo: "Pendentes", valor: f?.pendentes, cor: "text-info" },
            { rotulo: "Falharam (na fila)", valor: f?.falhas, cor: "text-warning" },
            { rotulo: "Desistidas (5×)", valor: f?.esgotadas, cor: "text-danger" },
          ].map((c) => (
            <div key={c.rotulo} className="rounded-[10px] border border-border-soft bg-surface px-2 py-2.5">
              <dd className={`text-[22px] font-semibold tabular-nums ${c.cor}`}>{c.valor === undefined ? "–" : fmt(c.valor)}</dd>
              <dt className="text-[12px] text-muted-foreground">{c.rotulo}</dt>
            </div>
          ))}
        </dl>

        {!ativo && <p className="text-[13px] text-muted-foreground">OpenWA desligado: o cron não envia nada até religar.</p>}

        {f && f.alertas.length > 0 && (
          <div className="grid gap-1.5 rounded-[10px] border border-danger/30 bg-danger-bg px-3.5 py-3 text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <b className="text-danger">Alertas não lidos</b>
              <Button variant="ghost" size="sm" disabled={lidos.isPending} onClick={() => lidos.mutate()}>
                Marcar como lidos
              </Button>
            </div>
            <ul className="grid gap-1">
              {f.alertas.map((a) => (
                <li key={a.id}>
                  <span className="text-muted-foreground">{dataHora(a.created_at)} · </span>
                  {a.detalhe ?? a.titulo}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form
          className="grid gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${ids}-funcoes`}>URL das Edge Functions vista pelo banco</Label>
            <Badge variant={configurado ? "success" : "warning"}>{configurado ? "Configurado" : "Não configurado"}</Badge>
          </div>
          <div className="flex gap-2">
            <Input
              id={`${ids}-funcoes`}
              value={funcoesUrl}
              onChange={(e) => setFuncoesUrl(e.target.value)}
              className="font-mono text-[12.5px]"
              autoComplete="off"
            />
            <Button type="submit" variant="outline" disabled={!funcoesUrl.trim() || salvar.isPending}>
              {salvar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Salvar
            </Button>
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            No Supabase local é <code>http://kong:8000/functions/v1</code>; na nuvem,{" "}
            <code>https://&lt;projeto&gt;.supabase.co/functions/v1</code>. Grava a URL e a chave anon no Vault.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
