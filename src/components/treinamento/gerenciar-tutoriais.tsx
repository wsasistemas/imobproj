"use client";

import { Pencil, Play, Plus, Users } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EditorModulo } from "./editor-modulo";
import { usePainelTreinamento, useProgressoPessoas, useProgressoPorPerfil, useSalvarPerfisDaTrilha } from "./hooks";
import { PAPEIS, percentual, ROTA_MEUS, type PerfilAcesso, type ProgressoPerfil, type TrilhaAdmin } from "./tipos";
import "./treinamento.css";

// Gerenciar tutoriais (só super admin): módulos de cada trilha, editor de balão, trilha de cada perfil e progresso.

const erroMsg = (e: unknown, padrao: string) => (e instanceof Error && e.message ? e.message : padrao);

export function GerenciarTutoriais() {
  const painel = usePainelTreinamento();
  // null = nenhum aberto; 0 = módulo novo.
  const [editando, setEditando] = useState<number | null>(null);

  if (painel.isLoading) return <div className="tr-cartao tr-cartao--estado">Carregando…</div>;
  if (painel.isError || !painel.data) {
    return (
      <div className="tr-cartao tr-cartao--estado" role="alert">
        <b>Não foi possível carregar os tutoriais</b>
        <span>{erroMsg(painel.error, "Tente de novo em instantes.")}</span>
      </div>
    );
  }
  const { trilhas, modulos, perfis } = painel.data;
  const trilhasDo = (id: number) => trilhas.filter((t) => t.modulos.includes(id));

  return (
    <>
      <h2 className="tr-secao">
        Módulos
        <Button type="button" size="sm" onClick={() => setEditando(0)}>
          <Plus aria-hidden /> Novo módulo
        </Button>
      </h2>
      <div className="tr-cartao tr-tabela-wrap">
        <table className="tr-tabela">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Trilhas</th>
              <th>Para quem</th>
              <th>Balões</th>
              <th>Duração</th>
              <th>Concluíram</th>
              <th>Status</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {modulos.map((m) => (
              <tr key={m.id}>
                <td>
                  <b>{m.titulo}</b>
                </td>
                <td>
                  <div className="tr-mod__meta">
                    {trilhasDo(m.id).map((t) => (
                      <span key={t.id} className="tr-chip">
                        {t.nome}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className="tr-chip tr-chip--info">{PAPEIS[m.papel]}</span>
                </td>
                <td>{m.passos}</td>
                <td>{m.minutos} min</td>
                <td>
                  {m.concluiram} de {m.publico}
                </td>
                <td>
                  <span className={cn("tr-chip", m.status === "publicado" ? "tr-chip--ok" : "tr-chip--warn")}>
                    {m.status === "publicado" ? "Publicado" : "Rascunho"}
                  </span>
                </td>
                <td>
                  <div className="tr-tabela__acoes">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditando(m.id)}>
                      <Pencil aria-hidden /> Editar
                    </Button>
                    <Link
                      href={`${ROTA_MEUS}/${m.id}`}
                      className={buttonVariants({ variant: "outline", size: "icon-sm" })}
                      aria-label={`Ver o tour de ${m.titulo}`}
                      title="Ver no tour"
                    >
                      <Play aria-hidden />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando != null && (
        <EditorModulo key={editando} moduloId={editando || null} trilhas={trilhas} onFechar={() => setEditando(null)} onCriado={(id) => setEditando(id)} />
      )}

      <PerfisDasTrilhas trilhas={trilhas} perfis={perfis} />
      <ProgressoPorPerfil />
    </>
  );
}

/** Cada perfil segue uma trilha; perfil sem trilha vê a trilha padrão (Usuário-chave). */
function PerfisDasTrilhas({ trilhas, perfis }: { trilhas: TrilhaAdmin[]; perfis: PerfilAcesso[] }) {
  const salvar = useSalvarPerfisDaTrilha();
  const trilhaDoPerfil = (perfil: string) => trilhas.find((t) => t.perfis.includes(perfil))?.id ?? null;
  const padrao = trilhas.find((t) => t.padrao);

  const mudar = (perfil: string, trilhaId: number | null) => {
    const atual = trilhaDoPerfil(perfil);
    // Voltar para a padrão = tirar o perfil da trilha em que estava.
    const alvo = trilhaId ?? atual;
    if (alvo == null) return;
    const t = trilhas.find((x) => x.id === alvo)!;
    const lista = t.perfis.filter((p) => p !== perfil);
    if (trilhaId != null) lista.push(perfil);
    salvar.mutate(
      { trilhaId: alvo, perfis: lista },
      { onSuccess: () => toast.success("Trilha do perfil salva"), onError: (e) => toast.error(erroMsg(e, "Não foi possível salvar.")) },
    );
  };

  return (
    <>
      <h2 className="tr-secao">Trilha de cada perfil</h2>
      <div className="tr-cartao tr-tabela-wrap">
        <table className="tr-tabela">
          <thead>
            <tr>
              <th>Perfil de acesso</th>
              <th>Trilha</th>
            </tr>
          </thead>
          <tbody>
            {perfis.map((p) => (
              <tr key={p.chave}>
                <td>{p.nome}</td>
                <td>
                  <select
                    className="tr-select"
                    aria-label={`Trilha do perfil ${p.nome}`}
                    value={trilhaDoPerfil(p.chave) ?? ""}
                    disabled={salvar.isPending}
                    onChange={(e) => mudar(p.chave, e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{padrao ? `${padrao.nome} (padrão)` : "Padrão"}</option>
                    {trilhas
                      .filter((t) => !t.padrao)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome}
                        </option>
                      ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProgressoPorPerfil() {
  const q = useProgressoPorPerfil();
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <>
      <h2 className="tr-secao">Progresso por perfil</h2>
      <div className="tr-cartao tr-tabela-wrap">
        {q.isLoading ? (
          <p className="tr-cartao__texto">Carregando…</p>
        ) : q.isError ? (
          <p className="tr-cartao__texto tr-no">{erroMsg(q.error, "Não foi possível carregar o progresso.")}</p>
        ) : (
          <table className="tr-tabela">
            <thead>
              <tr>
                <th>Perfil</th>
                <th>Pessoas</th>
                <th>Trilha</th>
                <th>Concluíram tudo</th>
                <th>Em andamento</th>
                <th>Não começaram</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((s) => {
                const chave = String(s.perfil);
                return (
                  <Fragment key={chave}>
                    <tr>
                      <td>{s.nome}</td>
                      <td>{s.pessoas}</td>
                      <td>{s.trilha}</td>
                      <td>{s.concluiram}</td>
                      <td>{s.andamento}</td>
                      <td>{s.naoComecaram}</td>
                      <td>
                        <Button type="button" variant="outline" size="sm" aria-expanded={aberto === chave} onClick={() => setAberto(aberto === chave ? null : chave)}>
                          <Users aria-hidden /> {aberto === chave ? "Ocultar" : "Ver pessoas"}
                        </Button>
                      </td>
                    </tr>
                    {aberto === chave && (
                      <tr className="tr-tabela__sub">
                        <td colSpan={7}>
                          <Pessoas grupo={s} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Pessoas({ grupo }: { grupo: ProgressoPerfil }) {
  const q = useProgressoPessoas(grupo.perfil, true);
  if (q.isLoading) return <span>Carregando…</span>;
  if (q.isError) return <span className="tr-no">{erroMsg(q.error, "Não foi possível carregar as pessoas.")}</span>;
  if (!q.data?.length) return <span>Ninguém com este perfil.</span>;
  return (
    <div className="tr-pessoas">
      {q.data.map((p) => (
        <div key={p.usuarioId} className="tr-pessoa">
          <b>{p.nome}</b>
          <div className="tr-pessoa__mods">
            {p.modulos.map((m) => {
              const pct = percentual(m);
              return (
                <span key={m.id} className={cn("tr-chip", m.concluidoEm ? "tr-chip--ok" : pct > 0 && "tr-chip--warn")} title={m.titulo}>
                  {m.concluidoEm ? "✓ " : ""}
                  {m.titulo.length > 28 ? `${m.titulo.slice(0, 27)}…` : m.titulo}
                  {!m.concluidoEm && pct > 0 ? ` · ${pct}%` : ""}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
