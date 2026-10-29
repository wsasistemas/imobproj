"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { gruposDoNumero, vincularGrupo } from "@/app/(app)/admin/whatsapp/acoes";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { ProjetoNumero } from "./tipos";
import { CHAVE_ADMIN_WHATSAPP, executar, telefoneFormatado } from "./util";

type Opcao = { value: string; label: string; disabled?: boolean };

function Campo({ rotulo, itens, valor, onMudar, vazio, carregando }: {
  rotulo: string;
  itens: Opcao[];
  valor: string | null;
  onMudar: (v: string | null) => void;
  vazio: string;
  carregando?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label id={id}>{rotulo}</Label>
      {carregando ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{vazio}</p>
      ) : (
        <Select items={itens} value={valor} onValueChange={(v) => onMudar(v ?? null)}>
          <SelectTrigger className="w-full" aria-labelledby={id}>
            <SelectValue placeholder="Escolha" />
          </SelectTrigger>
          <SelectContent>
            {itens.map((i) => (
              <SelectItem key={i.value} value={i.value} disabled={i.disabled}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/**
 * Vincular um grupo que já existe no WhatsApp (D3: 1 projeto + 1 equipe + 1 número do mesmo projeto).
 * Ordem: Projeto → Número (só os do projeto) → Grupo lido do número → Equipe (só as que atendem o projeto).
 */
export function DialogVincularGrupo({ projetos, onFechar }: { projetos: ProjetoNumero[]; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [waGroupId, setWaGroupId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [autoEvidencia, setAutoEvidencia] = useState(true);
  const [autoOs, setAutoOs] = useState(false);

  const numeros = useQuery({
    queryKey: [...CHAVE_ADMIN_WHATSAPP, "numeros-do-projeto", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await createClient().from("wa_sessions").select("id, numero, openwa_session_id").eq("project_id", projectId!);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; numero: string; openwa_session_id: string | null }[];
    },
  });
  const equipes = useQuery({
    queryKey: [...CHAVE_ADMIN_WHATSAPP, "equipes-do-projeto", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await createClient().from("project_teams").select("teams(id, nome)").eq("project_id", projectId!);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as { teams: { id: string; nome: string } | null }[])
        .map((x) => x.teams)
        .filter((t): t is { id: string; nome: string } => !!t)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });
  const grupos = useQuery({
    queryKey: [...CHAVE_ADMIN_WHATSAPP, "grupos-do-numero", sessionId],
    enabled: !!sessionId,
    queryFn: () => executar(gruposDoNumero(sessionId)),
  });
  const grupo = grupos.data?.find((g) => g.id === waGroupId) ?? null;

  const salvar = useMutation({
    mutationFn: () =>
      executar(vincularGrupo({ projectId, sessionId, waGroupId, nome: grupo?.nome ?? "", teamId, autoEvidencia, autoOs })),
    onSuccess: () => {
      toast.success("Grupo vinculado ao projeto");
      void queryClient.invalidateQueries({ queryKey: [...CHAVE_ADMIN_WHATSAPP] });
      onFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pronto = !!projectId && !!sessionId && !!grupo && !grupo.vinculadoA && !!teamId;

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (pronto) salvar.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Vincular grupo</DialogTitle>
            <DialogDescription>
              O grupo fica preso a um projeto, uma equipe e um número do mesmo projeto. É isso que impede as mensagens de se
              misturarem.
            </DialogDescription>
          </DialogHeader>

          <Campo
            rotulo="1. Projeto"
            itens={projetos.map((p) => ({ value: p.id, label: `${p.codigo} · ${p.nome}` }))}
            valor={projectId}
            vazio="Nenhum projeto cadastrado."
            onMudar={(v) => {
              setProjectId(v);
              setSessionId(null);
              setWaGroupId(null);
              setTeamId(null);
            }}
          />
          {projectId && (
            <Campo
              rotulo="2. Número (só os do projeto)"
              itens={(numeros.data ?? []).map((n) => ({
                value: n.id,
                label: `${telefoneFormatado(n.numero)}${n.openwa_session_id ? "" : " · sem sessão"}`,
                disabled: !n.openwa_session_id,
              }))}
              valor={sessionId}
              carregando={numeros.isPending}
              vazio="Este projeto não tem número. Conecte um na seção Números."
              onMudar={(v) => {
                setSessionId(v);
                setWaGroupId(null);
              }}
            />
          )}
          {sessionId &&
            (grupos.isError ? (
              <p className="text-[13px] text-danger">{grupos.error.message}</p>
            ) : (
              <Campo
                rotulo="3. Grupo do WhatsApp (lido do número)"
                itens={(grupos.data ?? []).map((g) => ({
                  value: g.id,
                  label: g.vinculadoA ? `${g.nome} (já vinculado)` : g.nome,
                  disabled: !!g.vinculadoA,
                }))}
                valor={waGroupId}
                carregando={grupos.isPending}
                vazio="O número não está em nenhum grupo. Adicione o número ao grupo pelo celular."
                onMudar={setWaGroupId}
              />
            ))}
          {projectId && (
            <Campo
              rotulo="4. Equipe (só as que atendem o projeto)"
              itens={(equipes.data ?? []).map((t) => ({ value: t.id, label: t.nome }))}
              valor={teamId}
              carregando={equipes.isPending}
              vazio="Nenhuma equipe atende este projeto. Ligue a equipe em Cadastros › Equipes › Projetos que atende."
              onMudar={setTeamId}
            />
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-[13.5px]">
              <Checkbox checked={autoEvidencia} onCheckedChange={(v) => setAutoEvidencia(v === true)} />
              Criar evidência automática
            </label>
            <label className="flex items-center gap-2 text-[13.5px]">
              <Checkbox checked={autoOs} onCheckedChange={(v) => setAutoOs(v === true)} />
              Abrir OS automática (#OS)
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!pronto || salvar.isPending}>
              {salvar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Vincular
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
