"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, Clock, Copy, Info, ShieldCheck } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";
import { alterarAutomacao } from "@/app/(app)/projetos/[id]/conversas/acoes";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { pode } from "@/lib/projeto/permissoes";
import { ROTULO_PAPEL, type Papel, type PapelMembro } from "@/lib/projeto/tipos";
import {
  buscarParticipantes,
  chavesConversas,
  formatarTelefone,
  MAX_TENTATIVAS,
  mesmoTelefone,
  type GrupoWa,
  type PessoaProjeto,
  type ResumoConversa,
} from "./dados";
import { AvatarGrupo } from "./lista-grupos";

const ORDEM_PAPEIS: PapelMembro[] = ["diretor", "gerente", "usuario_chave", "analista", "prestador"];

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 border-b border-border px-4 py-4 last:border-0">
      <h3 className="rotulo-secao">{titulo}</h3>
      {children}
    </section>
  );
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function PainelGrupo({
  projetoId,
  papel,
  grupo,
  resumo,
  pessoas,
}: {
  projetoId: string;
  papel: Papel;
  grupo: GrupoWa;
  resumo: ResumoConversa | undefined;
  pessoas: PessoaProjeto[];
}) {
  const ids = useId();
  const queryClient = useQueryClient();
  const podeGerir = pode(papel, "whatsapp_grupos_gerir");
  const participantes = useQuery({
    queryKey: chavesConversas.participantes(projetoId, grupo.id),
    queryFn: () => buscarParticipantes(grupo.id),
  });

  const automacao = useMutation({
    mutationFn: async (v: { campo: "auto_evidencia" | "auto_os"; valor: boolean }) => {
      const r = await alterarAutomacao({ projectId: projetoId, groupId: grupo.id, ...v });
      if (!r.ok) throw new Error(r.erro);
    },
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: chavesConversas.grupos(projetoId) });
      const antes = queryClient.getQueryData<GrupoWa[]>(chavesConversas.grupos(projetoId));
      queryClient.setQueryData<GrupoWa[]>(chavesConversas.grupos(projetoId), (gs) =>
        gs?.map((g) => (g.id === grupo.id ? { ...g, [v.campo]: v.valor } : g)),
      );
      return { antes };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) queryClient.setQueryData(chavesConversas.grupos(projetoId), ctx.antes);
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar a automação.");
    },
    onSuccess: (_d, v) =>
      toast.success(
        v.campo === "auto_evidencia"
          ? v.valor
            ? "Mídias que citam uma OS aberta viram evidência."
            : "Mídias não viram mais evidência automaticamente."
          : v.valor
            ? "Mensagens iniciadas com #OS criam OS em rascunho."
            : "#OS não cria mais OS automaticamente.",
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chavesConversas.grupos(projetoId) }),
  });

  // Participantes por papel no projeto; quem não é membro (ou não tem cadastro) vai para "Outros".
  const grupos = new Map<string, { nome: string; telefone: string; admin: boolean }[]>();
  for (const p of participantes.data ?? []) {
    const pessoa =
      (p.user_id ? pessoas.find((x) => x.userId === p.user_id) : undefined) ?? pessoas.find((x) => mesmoTelefone(x.telefone, p.telefone));
    const chave = pessoa?.papel ?? "outros";
    const lista = grupos.get(chave) ?? [];
    lista.push({ nome: pessoa?.nome ?? formatarTelefone(p.telefone), telefone: p.telefone, admin: p.is_admin });
    grupos.set(chave, lista);
  }
  const ordem = [...ORDEM_PAPEIS, "outros"].filter((k) => grupos.has(k));
  const fila = resumo?.fila ?? 0;

  async function copiarId() {
    if (!grupo.wa_group_id) return;
    try {
      await navigator.clipboard.writeText(grupo.wa_group_id);
      toast.success("Id do grupo copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div className="grid content-start">
      <div className="flex flex-col items-center gap-2 border-b border-border px-4 py-5 text-center">
        <AvatarGrupo grupo={grupo} tamanho={64} />
        <h2 className="text-[16px] leading-tight font-semibold">{grupo.nome}</h2>
        <div className="flex flex-wrap justify-center gap-1.5">
          <Badge variant="neutral">Equipe {grupo.equipe}</Badge>
          {!grupo.ativo && (
            <Badge variant="warning">
              <Archive aria-hidden="true" /> Arquivado
            </Badge>
          )}
        </div>
        <div className="flex max-w-full items-center gap-1 text-[12px] text-muted-foreground">
          <span className="truncate font-mono" title={grupo.wa_group_id ?? undefined}>
            {grupo.wa_group_id ?? "Grupo ainda não criado no WhatsApp"}
          </span>
          {grupo.wa_group_id && (
            <button
              type="button"
              onClick={copiarId}
              aria-label="Copiar id do grupo no WhatsApp"
              className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              <Copy size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {fila > 0 && (
        <div className="border-b border-border px-4 py-3">
          <div role="note" className="flex gap-2.5 rounded-lg border border-banner-info-border bg-banner-info-bg p-3 text-[12.5px] leading-relaxed">
            <Clock size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
            <p>
              <b>
                {fila} mensage{fila > 1 ? "ns" : "m"} na fila de reenvio
              </b>{" "}
              (pendente ou com falha). Reenviamos a cada <b>2 minutos</b>, até <b>{MAX_TENTATIVAS} tentativas</b>; depois disso
              o super admin é avisado.
            </p>
          </div>
        </div>
      )}

      <Secao titulo="Automação">
        <div className="grid gap-3">
          <div className="flex items-start justify-between gap-3">
            <label htmlFor={`${ids}-ev`} className="grid gap-0.5">
              <span className="text-[13.5px] font-medium">Mídia vira evidência</span>
              <span className="text-[12px] text-muted-foreground">Foto ou arquivo que cita uma OS aberta (#231 ou “OS 231”).</span>
            </label>
            <Switch
              id={`${ids}-ev`}
              checked={grupo.auto_evidencia}
              disabled={!podeGerir || automacao.isPending}
              onCheckedChange={(valor) => automacao.mutate({ campo: "auto_evidencia", valor })}
              className="mt-1"
            />
          </div>
          <div className="flex items-start justify-between gap-3">
            <label htmlFor={`${ids}-os`} className="grid gap-0.5">
              <span className="text-[13.5px] font-medium">#OS cria Ordem de Serviço</span>
              <span className="text-[12px] text-muted-foreground">Mensagem iniciada com #OS vira OS em rascunho.</span>
            </label>
            <Switch
              id={`${ids}-os`}
              checked={grupo.auto_os}
              disabled={!podeGerir || automacao.isPending}
              onCheckedChange={(valor) => automacao.mutate({ campo: "auto_os", valor })}
              className="mt-1"
            />
          </div>
          {!podeGerir && (
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Info size={13} aria-hidden="true" /> Só o gerente do projeto altera a automação.
            </p>
          )}
        </div>
      </Secao>

      <Secao titulo={`Participantes${participantes.data ? ` · ${participantes.data.length}` : ""}`}>
        {participantes.isPending ? (
          <div className="grid gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : participantes.isError ? (
          <p className="flex items-center gap-1.5 text-[12.5px] text-danger">
            <AlertTriangle size={14} aria-hidden="true" /> Não foi possível carregar os participantes.
          </p>
        ) : ordem.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            Nenhum participante cadastrado. O super admin inclui as pessoas em Administração › WhatsApp OpenWA.
          </p>
        ) : (
          <div className="grid gap-3">
            {ordem.map((k) => (
              <div key={k} className="grid gap-1">
                <p className="text-[12px] font-semibold text-muted-foreground">
                  {k === "outros" ? "Fora da equipe do projeto" : ROTULO_PAPEL[k as PapelMembro]}
                </p>
                <ul className="grid gap-1">
                  {grupos.get(k)!.map((p) => (
                    <li key={p.telefone} className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[11.5px] font-semibold text-muted-foreground"
                      >
                        {k === "outros" ? "#" : iniciais(p.nome)}
                      </span>
                      <span className="grid min-w-0 leading-tight">
                        <span className="truncate text-[13px] font-medium">{p.nome}</span>
                        <span className="truncate text-[11.5px] text-muted-foreground tabular-nums">{formatarTelefone(p.telefone)}</span>
                      </span>
                      {p.admin && (
                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-success" title="Administrador do grupo">
                          <ShieldCheck size={13} aria-hidden="true" /> Admin
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Secao>
    </div>
  );
}
