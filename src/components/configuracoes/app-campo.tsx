"use client";

import { useQuery } from "@tanstack/react-query";
import { Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ErroBloco, RotuloSecao } from "@/components/cadastros/blocos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MSG_BANCO_DESATUALIZADO, ehBancoDesatualizado } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/client";

type Painel = { aparelhos_ativos: number; os_app_mes: number; pendencias: number; versao: string | null };
type Aparelho = {
  id: string;
  usuario: string;
  modelo: string | null;
  sistema: string | null;
  versao_app: string | null;
  ultimo_acesso: string;
  pendencias: number;
  push_ativo: boolean;
};

export const CHAVE_APP_CAMPO = ["configuracoes", "app-campo"];

/** Endereço de instalação do app (build EAS). Sem a variável, o convite usa o portal. */
const LINK_INSTALACAO = process.env.NEXT_PUBLIC_APP_CAMPO_URL ?? "";

function quando(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoje.toDateString()) return `hoje, ${hora}`;
  if (d.toDateString() === ontem.toDateString()) return `ontem, ${hora}`;
  return `${d.toLocaleDateString("pt-BR")}, ${hora}`;
}

export function AppCampo() {
  const [convite, setConvite] = useState(false);

  const painel = useQuery({
    queryKey: [...CHAVE_APP_CAMPO, "painel"],
    queryFn: async () => {
      const { data, error } = await createClient().rpc("app_painel");
      if (error) throw error;
      return ((data ?? []) as Painel[])[0] ?? { aparelhos_ativos: 0, os_app_mes: 0, pendencias: 0, versao: null };
    },
  });
  const aparelhos = useQuery({
    queryKey: [...CHAVE_APP_CAMPO, "aparelhos"],
    queryFn: async () => {
      const { data, error } = await createClient().rpc("app_aparelhos_lista");
      if (error) throw error;
      return (data ?? []) as Aparelho[];
    },
  });

  const erro = painel.error ?? aparelhos.error;
  if (erro) {
    return (
      <ErroBloco
        texto={ehBancoDesatualizado(erro) ? MSG_BANCO_DESATUALIZADO : "Não foi possível carregar o painel do app."}
        onTentar={() => {
          void painel.refetch();
          void aparelhos.refetch();
        }}
      />
    );
  }

  const p = painel.data;
  const kpis = [
    { rotulo: "Aparelhos ativos", valor: p?.aparelhos_ativos, ajuda: "Acessaram nos últimos 30 dias" },
    { rotulo: "OS abertas pelo app (mês)", valor: p?.os_app_mes, ajuda: "Origem: app de campo" },
    { rotulo: "Pendências offline", valor: p?.pendencias, ajuda: "Itens parados na fila dos aparelhos" },
    { rotulo: "Versão publicada", valor: p?.versao ?? "—", ajuda: "Mais recente em uso" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => setConvite(true)}>
          <MessageCircle aria-hidden /> Convidar por WhatsApp
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.rotulo} className="gap-1 px-4 py-3.5">
            <span className="text-[12.5px] text-muted-foreground">{k.rotulo}</span>
            {painel.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <b className="text-2xl font-semibold tabular-nums">{k.valor ?? 0}</b>
            )}
            <span className="text-[11.5px] text-muted-foreground">{k.ajuda}</span>
          </Card>
        ))}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="border-b border-border-soft px-4 py-3.5">
          <h2 className="text-[15px] font-semibold">Aparelhos conectados</h2>
        </div>
        {aparelhos.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (aparelhos.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-[13.5px] text-muted-foreground">
            Nenhum aparelho ainda. Os aparelhos aparecem aqui depois do primeiro login no app.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Aparelho</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead>Push</TableHead>
                  <TableHead>Pendências</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(aparelhos.data ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.usuario}</TableCell>
                    <TableCell>{[a.modelo, a.sistema].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell className="tabular-nums">{a.versao_app ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{quando(a.ultimo_acesso)}</TableCell>
                    <TableCell>
                      <Badge variant={a.push_ativo ? "success" : "neutral"}>{a.push_ativo ? "ativo" : "sem push"}</Badge>
                    </TableCell>
                    <TableCell>
                      {a.pendencias > 0 ? <Badge variant="warning">{a.pendencias}</Badge> : <span className="tabular-nums">0</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <DialogoConvite aberto={convite} aoFechar={() => setConvite(false)} />
    </div>
  );
}

function DialogoConvite({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const link = LINK_INSTALACAO || (typeof window !== "undefined" ? `${window.location.origin}/login` : "");
  const mensagem =
    `Olá! Para registrar e executar as Ordens de Serviço pelo celular, instale o app IMOBPROJ Campo:\n${link}\n\n` +
    `Entre com o mesmo e-mail e senha do portal. Sem internet, o app guarda tudo e envia quando a rede voltar.`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      toast.success("Mensagem copiada. Cole no WhatsApp da pessoa.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar por WhatsApp</DialogTitle>
          <DialogDescription>Copie a mensagem e envie para a pessoa. Nada é enviado automaticamente.</DialogDescription>
        </DialogHeader>
        <RotuloSecao>Mensagem</RotuloSecao>
        <Textarea id="convite-app" readOnly rows={7} value={mensagem} onFocus={(e) => e.currentTarget.select()} />
        {!LINK_INSTALACAO && (
          <p className="text-[12px] text-muted-foreground">
            O link de instalação do build EAS ainda não foi configurado (NEXT_PUBLIC_APP_CAMPO_URL); por enquanto o convite leva ao portal.
          </p>
        )}
        <div className="flex justify-end">
          <Button onClick={() => void copiar()}>
            <Copy aria-hidden /> Copiar mensagem
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
