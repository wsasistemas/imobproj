"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Info, KeyRound, Loader2, PlugZap, RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ligarOpenwa, salvarConexao, testarConexao } from "@/app/(app)/admin/whatsapp/acoes";
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { CartaoReenvio, CartaoWebhook } from "./cartoes-webhook-reenvio";
import { SecaoGrupos, SecaoSessoes } from "./sessoes-grupos";
import { SkeletonPainelOpenwa } from "./skeleton";
import type { ConfigOpenwaTela, SegredoStatus } from "./tipos";
import { CHAVE_ADMIN_WHATSAPP, dataHora, executar, formatarMs, telefoneFormatado } from "./util";

export function PainelOpenwa({ webhookUrl, funcoesUrlSugerida }: { webhookUrl: string; funcoesUrlSugerida: string }) {
  const config = useQuery({
    queryKey: [...CHAVE_ADMIN_WHATSAPP, "config"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("openwa_config")
        .select("ativo, url, api_key_atualizada_em, webhook_secret_gerado_em, ultimo_teste, updated_at")
        .eq("id", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as ConfigOpenwaTela | null;
    },
  });
  const segredos = useQuery({
    queryKey: [...CHAVE_ADMIN_WHATSAPP, "segredos"],
    queryFn: async () => {
      const { data, error } = await createClient().rpc("fn_openwa_segredos_status");
      if (error) throw new Error(error.message);
      return (data as SegredoStatus[] | null) ?? [];
    },
  });

  if (config.isPending || segredos.isPending) return <SkeletonPainelOpenwa />;
  if (config.isError || !config.data) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px]">
            Não foi possível carregar a configuração do OpenWA. A migration <b>20261029000700</b> foi aplicada?
          </p>
          <Button variant="outline" onClick={() => void config.refetch()}>
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    );
  }
  const temSegredo = (nome: string) => (segredos.data ?? []).some((s) => s.nome === nome);

  return (
    <div className="grid gap-4">
      <div
        role="note"
        className="flex items-start gap-3 rounded-[12px] border border-banner-info-border bg-banner-info-bg px-4 py-3 text-[13.5px]"
      >
        <Info size={18} className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
        <p>
          Cada projeto tem uma <b>sessão do OpenWA</b> (o número do sistema) e <b>grupos por equipe</b>. O OpenWA avisa o
          IMOBPROJ pelo <b>webhook</b>: as mensagens dos grupos aparecem em <b>Conversas</b>, fotos que citam uma OS
          (<b>#231</b> ou <b>OS 231</b>) viram <b>evidência</b> e mensagens que começam com <b>#OS</b> abrem uma OS em
          rascunho (se o grupo tiver as automações ligadas). As respostas do portal entram numa <b>fila</b>: se o OpenWA
          não responder em 15 s, o reenvio automático tenta de novo a cada 2 minutos, até 5 vezes, e depois avisa o
          super admin.
        </p>
      </div>

      {/* key: ao salvar outra URL, o formulário reinicia com o valor gravado */}
      <CartaoConexao key={config.data.url ?? ""} cfg={config.data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CartaoWebhook webhookUrl={webhookUrl} geradoEm={config.data.webhook_secret_gerado_em} />
        <CartaoReenvio
          funcoesUrlSugerida={funcoesUrlSugerida}
          configurado={temSegredo("imobproj_openwa_functions_url") && temSegredo("imobproj_openwa_anon_key") && temSegredo("imobproj_openwa_cron_secret")}
          ativo={config.data.ativo}
        />
      </div>

      <SecaoSessoes />
      <SecaoGrupos ativo={config.data.ativo} />
    </div>
  );
}

// ---------------------------------------------------------------- conexão

function LinhaStatus({ ok, titulo, children }: { ok: boolean | null; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-border-soft bg-surface px-3.5 py-3">
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 shrink-0",
          ok === null ? "text-muted-foreground" : ok ? "text-success" : "text-warning",
        )}
      >
        {ok ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
      </span>
      <div className="grid min-w-0 gap-0.5 text-[13.5px]">
        <b className="font-semibold">{titulo}</b>
        <span className="break-words text-muted-foreground">{children}</span>
      </div>
    </div>
  );
}

function CartaoConexao({ cfg }: { cfg: ConfigOpenwaTela }) {
  const ids = useId();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(cfg.url ?? "");
  const [chave, setChave] = useState("");
  const [confirmarDesligar, setConfirmarDesligar] = useState(false);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: [...CHAVE_ADMIN_WHATSAPP] });

  const ligar = useMutation({
    mutationFn: (ativo: boolean) => executar(ligarOpenwa(ativo)),
    onSuccess: (r) => {
      setConfirmarDesligar(false);
      toast.success(r.ativo ? "WhatsApp OpenWA ligado" : "WhatsApp OpenWA desligado");
      void invalidar();
    },
    onError: (e: Error) => {
      setConfirmarDesligar(false);
      toast.error(e.message);
    },
  });

  const salvar = useMutation({
    mutationFn: () => executar(salvarConexao({ url, apiKey: chave.trim() || undefined })),
    onSuccess: (r) => {
      setChave("");
      toast.success(r.apiKeyAtualizadaEm ? "Endereço e API key salvos" : "Endereço salvo");
      void invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testar = useMutation({
    mutationFn: () => executar(testarConexao()),
    onSuccess: (r) => {
      if (r.ok) toast.success(`OpenWA respondeu em ${formatarMs(r.latenciaMs)}`, { description: `${r.sessoes.length} sessão(ões) encontrada(s).` });
      else toast.error(r.erro ?? "O OpenWA não respondeu.");
      void invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const t = cfg.ultimo_teste;
  const configurado = Boolean(cfg.url && cfg.api_key_atualizada_em);

  return (
    <Card aria-labelledby={`${ids}-titulo`}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconeMenu icon={PlugZap} cor="var(--sys-green)" tamanho={36} />
          <div className="grid gap-0.5">
            <CardTitle id={`${ids}-titulo`}>Conexão com o OpenWA</CardTitle>
            <CardDescription>
              Endereço do servidor OpenWA e a API key (header X-API-Key). A chave fica no cofre do Supabase (Vault) e
              não volta para o navegador.
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <Button variant="outline" disabled={testar.isPending || !configurado} onClick={() => testar.mutate()}>
            {testar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            {testar.isPending ? "Testando…" : "Testar conexão"}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-4">
        <div
          className={cn(
            "flex items-start gap-3 rounded-[10px] border px-3.5 py-3",
            cfg.ativo ? "border-success/30 bg-success-bg" : "border-border bg-muted/50",
          )}
        >
          <Switch
            checked={cfg.ativo}
            disabled={ligar.isPending}
            aria-labelledby={`${ids}-ligado`}
            className="mt-0.5"
            onCheckedChange={(v) => (v ? ligar.mutate(true) : setConfirmarDesligar(true))}
          />
          <div className="grid gap-0.5 text-[13.5px]">
            <b id={`${ids}-ligado`} className="font-semibold">
              {cfg.ativo ? "WhatsApp OpenWA ligado" : "WhatsApp OpenWA desligado"}
            </b>
            <span className="text-muted-foreground">
              {cfg.ativo
                ? "Recebe as mensagens dos grupos, cria evidências e OS automáticas e envia as respostas do portal."
                : "Nada é enviado e as mensagens que chegarem são ignoradas (só o sinal da sessão é registrado). As respostas do portal ficam na fila até religar."}
            </span>
          </div>
        </div>

        <LinhaStatus ok={cfg.url ? (t ? t.ok : null) : false} titulo="Endereço e API key">
          {cfg.url ? <>{cfg.url}</> : "Endereço ainda não informado."}
          {" · "}
          {cfg.api_key_atualizada_em ? <>API key configurada em {dataHora(cfg.api_key_atualizada_em)}</> : "API key não configurada"}
          {t && (
            <>
              {" · "}testado em {dataHora(t.em)} ({formatarMs(t.latenciaMs)})
              {t.erro && <em className="mt-1 block not-italic text-danger">{t.erro}</em>}
            </>
          )}
        </LinhaStatus>

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <div className="grid min-w-[min(320px,100%)] flex-[2] gap-1.5">
            <Label htmlFor={`${ids}-url`}>Endereço (URL) do OpenWA</Label>
            <Input
              id={`${ids}-url`}
              inputMode="url"
              autoComplete="off"
              placeholder="https://openwa.suaempresa.com.br"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="grid min-w-[min(260px,100%)] flex-1 gap-1.5">
            <Label htmlFor={`${ids}-chave`}>API key</Label>
            <Input
              id={`${ids}-chave`}
              type="password"
              autoComplete="new-password"
              placeholder={cfg.api_key_atualizada_em ? "Nova API key (substitui a atual)" : "Cole a API key do OpenWA"}
              value={chave}
              onChange={(e) => setChave(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={!url.trim() || salvar.isPending}>
            {salvar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
            Salvar
          </Button>
        </form>

        {t?.ok && t.sessoes.length > 0 && (
          <div className="overflow-x-auto rounded-[10px] border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-table-head">
                  <TableHead>Sessão no OpenWA</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.sessoes.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="font-medium">{s.nome ?? s.id}</span>
                      <span className="block font-mono text-[12px] text-muted-foreground">{s.id}</span>
                    </TableCell>
                    <TableCell>{telefoneFormatado(s.telefone)}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "ready" ? "success" : s.status === "failed" ? "danger" : "warning"}>
                        {s.status ?? "?"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="border-t border-border px-3 py-2 text-[12.5px] text-muted-foreground">
              Use o id da sessão no cadastro da sessão de cada projeto, abaixo.
            </p>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmarDesligar} onOpenChange={setConfirmarDesligar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar o WhatsApp OpenWA?</AlertDialogTitle>
            <AlertDialogDescription>
              As mensagens que chegarem aos grupos deixam de aparecer em Conversas e nada é enviado. As respostas do portal
              ficam na fila e saem quando você religar. A configuração fica guardada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={ligar.isPending} onClick={() => ligar.mutate(false)}>
              {ligar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Desligar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
