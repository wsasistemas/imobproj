"use client";

import { useQuery } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";
import { ROTULO_PAPEL, type Membro, type PapelMembro } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/client";
import { iniciais } from "../formatos";
import { Bloco, ErroBloco, EsqueletoLinhas, Vazio } from "./bloco";

const ORDEM_PAPEIS: PapelMembro[] = ["diretor", "gerente", "usuario_chave", "analista", "prestador"];

/** Cor de fundo do avatar, estável por pessoa (cores de sistema do tema). */
const CORES = ["var(--sys-blue)", "var(--sys-purple)", "var(--sys-teal)", "var(--sys-orange)", "var(--sys-indigo)", "var(--sys-pink)", "var(--sys-green)"];
const corDe = (id: string) => CORES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % CORES.length];

export function Avatar({ id, nome, tamanho = 32 }: { id: string; nome: string | null | undefined; tamanho?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.38), backgroundColor: corDe(id) }}
    >
      {iniciais(nome)}
    </span>
  );
}

/** Pessoas do projeto agrupadas por papel (project_members + profiles). */
export function PessoasProjeto({ projetoId }: { projetoId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["projeto", projetoId, "visao-geral", "pessoas"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("project_members")
        .select("id, project_id, user_id, role, ativo, profiles(id, nome, email, avatar_url)")
        .eq("project_id", projetoId)
        .eq("ativo", true);
      if (error) throw error;
      return (data ?? []) as unknown as Membro[];
    },
  });

  const grupos = ORDEM_PAPEIS.map((papel) => ({
    papel,
    membros: (data ?? [])
      .filter((m) => m.role === papel)
      .sort((a, b) => (a.profiles?.nome ?? "").localeCompare(b.profiles?.nome ?? "", "pt-BR")),
  })).filter((g) => g.membros.length > 0);

  return (
    <Bloco titulo="Pessoas envolvidas" icone={UsersRound} cor="var(--sys-green)">
      {isLoading ? (
        <EsqueletoLinhas linhas={4} />
      ) : isError ? (
        <ErroBloco tentar={() => refetch()} />
      ) : grupos.length === 0 ? (
        <Vazio>Ninguém na equipe ainda. O super admin inclui as pessoas em Administração → Equipe.</Vazio>
      ) : (
        <div className="space-y-3.5">
          {grupos.map((g) => (
            <div key={g.papel}>
              <h3 className="rotulo-secao mb-1.5">
                {ROTULO_PAPEL[g.papel]} <span className="font-medium">({g.membros.length})</span>
              </h3>
              <ul className="space-y-1.5">
                {g.membros.map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <Avatar id={m.user_id} nome={m.profiles?.nome} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{m.profiles?.nome || "Sem nome"}</p>
                      {m.profiles?.email && <p className="truncate text-[12px] text-muted-foreground">{m.profiles.email}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Bloco>
  );
}
