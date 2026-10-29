"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, RefreshCcw, Smartphone, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { criarGrupoWhatsApp, excluirSessao, sincronizarGrupoWhatsApp } from "@/app/(app)/admin/whatsapp/acoes";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import type { VarianteSituacao } from "@/lib/projeto/tipos";
import { DialogSessao } from "./dialog-sessao";
import type { GrupoLinha, ProjetoNumero, SessaoLinha, StatusSessao } from "./tipos";
import { CHAVE_ADMIN_WHATSAPP, executar, haQuanto, telefoneFormatado } from "./util";

const STATUS: Record<StatusSessao, { rotulo: string; variante: VarianteSituacao }> = {
  conectado: { rotulo: "Conectado", variante: "success" },
  desconectado: { rotulo: "Desconectado", variante: "warning" },
  erro: { rotulo: "Erro", variante: "danger" },
};

/** Relógio que anda a cada 10 s para o "há X s". */
function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  return agora;
}

// O titular do número é o cliente do projeto (D1). projects tem duas FKs para organizations: a dica escolhe a do cliente.
const CLIENTE = "cliente:organizations!projects_cliente_org_id_fkey(nome)";

/** Projeto de demonstração (D7): o número da WSA usado nas apresentações, até o projeto real ter número próprio. */
export const ehDemonstracao = (nome: string | null | undefined) => /demonstra[cç][aã]o/i.test(nome ?? "");

function useProjetos() {
  return useQuery({
    queryKey: [...CHAVE_ADMIN_WHATSAPP, "projetos"],
    queryFn: async () => {
      const { data, error } = await createClient().from("projects").select(`id, codigo, nome, ${CLIENTE}`).order("codigo");
      if (error) throw new Error(error.message);
      return (data as unknown as ProjetoNumero[] | null) ?? [];
    },
  });
}

// ---------------------------------------------------------------- sessões

export function SecaoSessoes() {
  const agora = useAgora();
  const queryClient = useQueryClient();
  const projetos = useProjetos();
  const [editando, setEditando] = useState<SessaoLinha | "nova" | null>(null);
  const [excluindo, setExcluindo] = useState<SessaoLinha | null>(null);
  const [filtroProjeto, setFiltroProjeto] = useState<string>("todos");

  const sessoes = useQuery({
    queryKey: [...CHAVE_ADMIN_WHATSAPP, "sessoes"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_sessions")
        .select(`id, project_id, numero, openwa_url, openwa_session_id, status, last_heartbeat, projects(codigo, nome, ${CLIENTE})`)
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data as unknown as SessaoLinha[] | null) ?? [];
    },
  });

  const excluir = useMutation({
    mutationFn: (id: string) => executar(excluirSessao(id)),
    onSuccess: () => {
      setExcluindo(null);
      toast.success("Sessão excluída");
      void queryClient.invalidateQueries({ queryKey: [...CHAVE_ADMIN_WHATSAPP] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconeMenu icon={Smartphone} cor="var(--sys-teal)" tamanho={36} />
          <div className="grid gap-0.5">
            <CardTitle>Números</CardTitle>
            <CardDescription>
              Cada número é do projeto, em nome da empresa contratante. Um projeto pode ter vários números; um número nunca
              atende dois projetos.
            </CardDescription>
          </div>
        </div>
        <CardAction className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar por projeto"
            className="h-9 rounded-md border border-input bg-background px-2 text-[13.5px]"
            value={filtroProjeto}
            onChange={(e) => setFiltroProjeto(e.target.value)}
          >
            <option value="todos">Todos os projetos</option>
            {(projetos.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} · {p.nome}
              </option>
            ))}
          </select>
          <Button onClick={() => setEditando("nova")} disabled={!projetos.data?.length}>
            <Plus aria-hidden="true" />
            Conectar número
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {sessoes.isPending ? (
          <p className="text-[13.5px] text-muted-foreground">Carregando…</p>
        ) : sessoes.isError ? (
          <p className="text-[13.5px] text-danger">Não foi possível carregar as sessões.</p>
        ) : sessoes.data.length === 0 ? (
          <p className="text-[13.5px] text-muted-foreground">
            Nenhum número cadastrado. Use “Conectar número” para ler o QR Code ou aproveitar uma sessão que já está no
            OpenWA.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-table-head">
                  <TableHead>Projeto</TableHead>
                  <TableHead>Titular</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Sessão no OpenWA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último sinal</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessoes.data
                  .filter((s) => filtroProjeto === "todos" || s.project_id === filtroProjeto)
                  .map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="font-medium">{s.projects?.codigo ?? "—"}</span>
                      {ehDemonstracao(s.projects?.nome) && (
                        <Badge variant="neutral" className="ml-2">
                          Demonstração
                        </Badge>
                      )}
                      <span className="block text-[12.5px] text-muted-foreground">{s.projects?.nome}</span>
                    </TableCell>
                    <TableCell className="text-[13.5px]">{s.projects?.cliente?.nome ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{telefoneFormatado(s.numero)}</TableCell>
                    <TableCell>
                      {s.openwa_session_id ? (
                        <span className="font-mono text-[12px]">{s.openwa_session_id}</span>
                      ) : (
                        <Badge variant="warning">Sem id</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS[s.status].variante}>{STATUS[s.status].rotulo}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{haQuanto(s.last_heartbeat, agora)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" aria-label={`Editar a sessão de ${s.projects?.codigo ?? ""}`} onClick={() => setEditando(s)}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Excluir a sessão de ${s.projects?.codigo ?? ""}`} onClick={() => setExcluindo(s)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {editando && (
        <DialogSessao
          sessao={editando === "nova" ? null : editando}
          projetos={projetos.data ?? []}
          cadastradas={(sessoes.data ?? [])
            .filter((s) => editando === "nova" || s.id !== editando.id)
            .map((s) => s.openwa_session_id)
            .filter((x): x is string => !!x)}
          onFechar={() => setEditando(null)}
        />
      )}

      <AlertDialog open={!!excluindo} onOpenChange={(v) => !v && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              Os grupos do projeto ficam sem sessão: nada é enviado nem recebido até cadastrar outra. As mensagens já
              gravadas continuam no portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={excluir.isPending} onClick={() => excluindo && excluir.mutate(excluindo.id)}>
              {excluir.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ---------------------------------------------------------------- grupos

export function SecaoGrupos({ ativo }: { ativo: boolean }) {
  const queryClient = useQueryClient();
  const projetos = useProjetos();
  const grupos = useQuery({
    queryKey: [...CHAVE_ADMIN_WHATSAPP, "grupos"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_groups")
        .select("id, project_id, session_id, equipe, nome, wa_group_id, ativo, auto_evidencia, auto_os, wa_group_members(count)")
        .order("nome");
      if (error) throw new Error(error.message);
      return (data as unknown as GrupoLinha[] | null) ?? [];
    },
  });

  const acao = useMutation({
    mutationFn: ({ tipo, id }: { tipo: "criar" | "sincronizar"; id: string }) =>
      executar(tipo === "criar" ? criarGrupoWhatsApp(id) : sincronizarGrupoWhatsApp(id)),
    onSuccess: (r, v) => {
      toast.success(v.tipo === "criar" ? "Grupo criado no WhatsApp" : "Participantes sincronizados", {
        description: `${r.adicionados.length} adicionado(s), ${r.removidos.length} removido(s), ${r.promovidos.length} promovido(s) a admin.`,
      });
      void queryClient.invalidateQueries({ queryKey: [...CHAVE_ADMIN_WHATSAPP, "grupos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const codigo = (id: string) => projetos.data?.find((p) => p.id === id)?.codigo ?? "—";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconeMenu icon={Users} cor="var(--sys-blue)" tamanho={36} />
          <div className="grid gap-0.5">
            <CardTitle>Grupos no WhatsApp</CardTitle>
            <CardDescription>
              Cria o grupo no WhatsApp com os participantes cadastrados e mantém a lista em dia. Os grupos e participantes
              são cadastrados pelo gerente em Conversas.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {grupos.isPending ? (
          <p className="text-[13.5px] text-muted-foreground">Carregando…</p>
        ) : grupos.isError ? (
          <p className="text-[13.5px] text-danger">Não foi possível carregar os grupos.</p>
        ) : grupos.data.length === 0 ? (
          <p className="text-[13.5px] text-muted-foreground">Nenhum grupo cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-table-head">
                  <TableHead>Projeto</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-right">Participantes</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Automações</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.data.map((g) => {
                  const ocupado = acao.isPending && acao.variables?.id === g.id;
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{codigo(g.project_id)}</TableCell>
                      <TableCell>
                        {g.nome}
                        <span className="block text-[12.5px] text-muted-foreground">
                          Equipe {g.equipe}
                          {!g.ativo && " · inativo"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{g.wa_group_members[0]?.count ?? 0}</TableCell>
                      <TableCell>
                        {g.wa_group_id ? (
                          <Badge variant="success" title={g.wa_group_id}>
                            Criado
                          </Badge>
                        ) : (
                          <Badge variant="neutral">Não criado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-[12.5px] text-muted-foreground">
                        {[g.auto_evidencia && "Evidência", g.auto_os && "#OS"].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!ativo || ocupado}
                          onClick={() => acao.mutate({ tipo: g.wa_group_id ? "sincronizar" : "criar", id: g.id })}
                        >
                          {ocupado ? (
                            <Loader2 className="animate-spin" aria-hidden="true" />
                          ) : g.wa_group_id ? (
                            <RefreshCcw aria-hidden="true" />
                          ) : (
                            <Plus aria-hidden="true" />
                          )}
                          {g.wa_group_id ? "Sincronizar" : "Criar no WhatsApp"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {!ativo && <p className="mt-2 text-[12.5px] text-muted-foreground">Ligue o OpenWA para criar ou sincronizar grupos.</p>}
      </CardContent>
    </Card>
  );
}
