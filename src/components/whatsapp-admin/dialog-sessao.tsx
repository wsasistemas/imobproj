"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { salvarSessao } from "@/app/(app)/admin/whatsapp/acoes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SessaoLinha } from "./tipos";
import { CHAVE_ADMIN_WHATSAPP, executar } from "./util";

type Projeto = { id: string; codigo: string; nome: string };

/** Criar/editar a sessão do OpenWA de um projeto. Montado só quando aberto (estado inicial = sessão editada). */
export function DialogSessao({
  sessao,
  projetos,
  onFechar,
}: {
  sessao: SessaoLinha | null;
  projetos: Projeto[];
  onFechar: () => void;
}) {
  const ids = useId();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState<string | null>(sessao?.project_id ?? null);
  const [numero, setNumero] = useState(sessao?.numero ?? "");
  const [openwaSessionId, setOpenwaSessionId] = useState(sessao?.openwa_session_id ?? "");
  const itens = projetos.map((p) => ({ value: p.id, label: `${p.codigo} · ${p.nome}` }));

  const salvar = useMutation({
    mutationFn: () =>
      executar(salvarSessao({ id: sessao?.id, projectId: projectId ?? "", numero, openwaSessionId })),
    onSuccess: () => {
      toast.success(sessao ? "Sessão atualizada" : "Sessão criada");
      void queryClient.invalidateQueries({ queryKey: [...CHAVE_ADMIN_WHATSAPP] });
      onFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{sessao ? "Editar sessão" : "Nova sessão"}</DialogTitle>
            <DialogDescription>
              O número do sistema que fica nos grupos do projeto. O id da sessão aparece em &quot;Testar conexão&quot;.
            </DialogDescription>
          </DialogHeader>

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
          </div>

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

          <div className="grid gap-1.5">
            <Label htmlFor={`${ids}-sid`}>Id da sessão no OpenWA</Label>
            <Input
              id={`${ids}-sid`}
              autoComplete="off"
              className="font-mono text-[12.5px]"
              placeholder="8f3c2b1a-9d4e-…"
              value={openwaSessionId}
              onChange={(e) => setOpenwaSessionId(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
