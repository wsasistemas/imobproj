"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, QrCode } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { novaSessaoOpenwa, qrDaSessao, salvarSessao, sessoesDoOpenwa } from "@/app/(app)/admin/whatsapp/acoes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ProjetoNumero, SessaoLinha } from "./tipos";
import { CHAVE_ADMIN_WHATSAPP, executar, telefoneFormatado } from "./util";

type Modo = "existente" | "nova";

/**
 * Conectar número (D1: o número é do projeto, em nome da empresa contratante).
 * "Usar sessão existente" aproveita uma sessão já pareada no OpenWA; "Nova sessão (QR)" cria e mostra o QR até o
 * celular ler. Montado só quando aberto (estado inicial = sessão editada).
 */
export function DialogSessao({
  sessao,
  projetos,
  cadastradas,
  onFechar,
}: {
  sessao: SessaoLinha | null;
  projetos: ProjetoNumero[];
  /** openwa_session_id já usados por outro número. */
  cadastradas: string[];
  onFechar: () => void;
}) {
  const ids = useId();
  const queryClient = useQueryClient();
  const [modo, setModo] = useState<Modo>("existente");
  const [projectId, setProjectId] = useState<string | null>(sessao?.project_id ?? null);
  const [numero, setNumero] = useState(sessao?.numero ?? "");
  const [openwaSessionId, setOpenwaSessionId] = useState(sessao?.openwa_session_id ?? "");
  const [nomeNova, setNomeNova] = useState("");
  const [qrDe, setQrDe] = useState<string | null>(null);
  const itens = projetos.map((p) => ({ value: p.id, label: `${p.codigo} · ${p.nome}` }));
  const titular = projetos.find((p) => p.id === projectId)?.cliente?.nome ?? null;

  const doOpenwa = useQuery({
    queryKey: [...CHAVE_ADMIN_WHATSAPP, "sessoes-openwa"],
    queryFn: () => executar(sessoesDoOpenwa()),
    enabled: !sessao,
  });
  const livres = (doOpenwa.data ?? []).filter((s) => s.id && !cadastradas.includes(s.id));

  const qr = useQuery({
    queryKey: [...CHAVE_ADMIN_WHATSAPP, "qr", qrDe],
    queryFn: () => executar(qrDaSessao(qrDe)),
    enabled: !!qrDe,
    refetchInterval: (q) => (q.state.data?.status === "ready" ? false : 3_000),
  });
  const pareada = qr.data?.status === "ready";

  const criar = useMutation({
    mutationFn: () => executar(novaSessaoOpenwa(nomeNova)),
    onSuccess: (r) => {
      setQrDe(r.id);
      setOpenwaSessionId(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvar = useMutation({
    mutationFn: () => {
      const tel = modo === "nova" && !sessao ? (qr.data?.telefone ?? numero) : numero;
      return executar(salvarSessao({ id: sessao?.id, projectId: projectId ?? "", numero: tel, openwaSessionId }));
    },
    onSuccess: () => {
      toast.success(sessao ? "Número atualizado" : "Número conectado ao projeto");
      void queryClient.invalidateQueries({ queryKey: [...CHAVE_ADMIN_WHATSAPP] });
      onFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const escolherExistente = (id: string | null) => {
    setOpenwaSessionId(id ?? "");
    const s = livres.find((x) => x.id === id);
    if (s?.telefone) setNumero(s.telefone);
  };

  const podeSalvar = !!projectId && (sessao || modo === "existente" ? !!openwaSessionId && !!numero : pareada);

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (podeSalvar) salvar.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{sessao ? "Editar número" : "Conectar número"}</DialogTitle>
            <DialogDescription>
              O número é do projeto, em nome da empresa contratante. Um projeto pode ter vários números; um número nunca
              atende dois projetos.
            </DialogDescription>
          </DialogHeader>

          {!sessao && (
            <div role="group" aria-label="Como conectar" className="inline-flex w-fit overflow-hidden rounded-[9px] border border-border">
              {(
                [
                  ["existente", "Usar sessão existente"],
                  ["nova", "Nova sessão (QR)"],
                ] as const
              ).map(([m, rotulo]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={modo === m}
                  onClick={() => setModo(m)}
                  className={cn(
                    "px-3.5 py-1.5 text-[13.5px] font-semibold text-muted-foreground",
                    modo === m && "bg-primary-soft text-primary",
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label id={`${ids}-projeto`}>Projeto</Label>
            <Select items={itens} value={projectId} onValueChange={(v) => setProjectId(v ?? null)}>
              <SelectTrigger className="w-full" aria-labelledby={`${ids}-projeto`}>
                <SelectValue placeholder="Escolha o projeto" />
              </SelectTrigger>
              <SelectContent>
                {itens.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projectId && (
              <p className="text-[12.5px] text-muted-foreground">
                Titular: <span className="font-medium text-foreground">{titular ?? "projeto sem cliente cadastrado"}</span>
              </p>
            )}
          </div>

          {sessao || modo === "existente" ? (
            <>
              {!sessao && (
                <div className="grid gap-1.5">
                  <Label id={`${ids}-existente`}>Sessão do OpenWA</Label>
                  {doOpenwa.isPending ? (
                    <p className="text-[13px] text-muted-foreground">Lendo as sessões do OpenWA…</p>
                  ) : doOpenwa.isError ? (
                    <p className="text-[13px] text-danger">{doOpenwa.error.message}</p>
                  ) : livres.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">Todas as sessões do OpenWA já estão cadastradas. Use “Nova sessão (QR)”.</p>
                  ) : (
                    <Select
                      items={livres.map((s) => ({ value: s.id, label: `${s.nome ?? s.id} · ${telefoneFormatado(s.telefone)}` }))}
                      value={openwaSessionId || null}
                      onValueChange={(v) => escolherExistente(v ?? null)}
                    >
                      <SelectTrigger className="w-full" aria-labelledby={`${ids}-existente`}>
                        <SelectValue placeholder="Escolha a sessão" />
                      </SelectTrigger>
                      <SelectContent>
                        {livres.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.nome ?? s.id} · {telefoneFormatado(s.telefone)} {s.status === "ready" ? "" : `(${s.status ?? "?"})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor={`${ids}-numero`}>Número do WhatsApp (com DDI e DDD)</Label>
                <Input
                  id={`${ids}-numero`}
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="5511999990000"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </div>
              {sessao && (
                <div className="grid gap-1.5">
                  <Label htmlFor={`${ids}-sid`}>Id da sessão no OpenWA</Label>
                  <Input
                    id={`${ids}-sid`}
                    autoComplete="off"
                    className="font-mono text-[12.5px]"
                    value={openwaSessionId}
                    onChange={(e) => setOpenwaSessionId(e.target.value)}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${ids}-nome`}>Nome da sessão no OpenWA</Label>
                <div className="flex gap-2">
                  <Input
                    id={`${ids}-nome`}
                    autoComplete="off"
                    placeholder="torre-norte-obra"
                    value={nomeNova}
                    disabled={!!qrDe}
                    onChange={(e) => setNomeNova(e.target.value)}
                  />
                  <Button type="button" variant="outline" disabled={!!qrDe || criar.isPending || !nomeNova.trim()} onClick={() => criar.mutate()}>
                    {criar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <QrCode aria-hidden="true" />}
                    Gerar QR
                  </Button>
                </div>
              </div>
              {qrDe && (
                <div className="grid justify-items-center gap-2 rounded-[10px] border border-border p-4 text-center" aria-live="polite">
                  {pareada ? (
                    <>
                      <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
                      <p className="font-semibold">Número pareado: {telefoneFormatado(qr.data?.telefone)}</p>
                    </>
                  ) : qr.data?.qr ? (
                    <>
                      {/* data URL vinda do OpenWA: next/image não otimiza e não precisa */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qr.data.qr} alt="QR Code para conectar o número" className="size-52 rounded-md bg-white p-2" />
                      <p className="text-[12.5px] text-muted-foreground">
                        No celular: WhatsApp › Aparelhos conectados › Conectar aparelho. O QR se renova sozinho.
                      </p>
                    </>
                  ) : (
                    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      {qr.isError ? qr.error.message : `Preparando o QR… (${qr.data?.status ?? "iniciando"})`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!podeSalvar || salvar.isPending}>
              {salvar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
