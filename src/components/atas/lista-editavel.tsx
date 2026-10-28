"use client";

import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { salvarListaAta } from "@/app/(app)/projetos/[id]/atas/acoes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RotuloSecao } from "./campos";
import type { AtaDetalhe } from "./dados";
import { useAcaoAta } from "./use-acao";

type Props = {
  projetoId: string;
  ata: AtaDetalhe;
  campo: "pauta" | "decisoes";
  titulo: string;
  podeEditar: boolean;
  vazio: string;
};

/**
 * Lista numerada editável (pauta / decisões em meetings.<campo> jsonb). Cada alteração grava a lista inteira
 * (salvarListaAta: gerente e ata em rascunho). Sem permissão, ou fora do rascunho, vira leitura.
 */
export function ListaEditavel({ projetoId, ata, campo, titulo, podeEditar, vazio }: Props) {
  const itens = ata[campo];
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const mut = useAcaoAta(projetoId, salvarListaAta, null);
  const idTitulo = `${campo}-${ata.id}`;

  const salvar = (lista: string[], aoSalvar?: () => void) =>
    mut.mutate({ projectId: projetoId, meetingId: ata.id, campo, itens: lista }, { onSuccess: aoSalvar });

  const adicionar = () => {
    const t = novo.trim();
    if (!t) return;
    salvar([...itens, t], () => setNovo(""));
  };
  const confirmarEdicao = (i: number) => {
    const t = texto.trim();
    if (!t) return;
    if (t === itens[i]) return setEditando(null);
    salvar(
      itens.map((x, j) => (j === i ? t : x)),
      () => setEditando(null),
    );
  };
  const mover = (i: number, d: -1 | 1) => {
    const lista = [...itens];
    [lista[i], lista[i + d]] = [lista[i + d], lista[i]];
    salvar(lista);
  };
  const remover = (i: number) => salvar(itens.filter((_, j) => j !== i));

  const rotuloItem = campo === "pauta" ? "item da pauta" : "decisão";

  return (
    <Card className="gap-0 py-0" aria-labelledby={idTitulo}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <RotuloSecao id={idTitulo}>{titulo}</RotuloSecao>
        <span className="text-[12.5px] text-muted-foreground">{itens.length}</span>
      </div>

      {itens.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted-foreground">{vazio}</p>
      ) : (
        <ol className="grid" aria-busy={mut.isPending || undefined}>
          {itens.map((item, i) => (
            <li key={`${i}-${item}`} className="flex items-start gap-3 border-b border-border px-5 py-2 last:border-0">
              <span className="mt-2 w-5 shrink-0 text-right text-[12.5px] font-semibold text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              {editando === i ? (
                <form
                  className="flex flex-1 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    confirmarEdicao(i);
                  }}
                >
                  <Input
                    autoFocus
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setEditando(null)}
                    aria-label={`Editar ${rotuloItem} ${i + 1}`}
                    maxLength={1000}
                  />
                  <Button type="submit" size="icon" variant="ghost" aria-label="Salvar" disabled={mut.isPending || !texto.trim()}>
                    <Check aria-hidden="true" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Cancelar edição" onClick={() => setEditando(null)}>
                    <X aria-hidden="true" />
                  </Button>
                </form>
              ) : (
                <>
                  <p className="flex-1 py-1.5 text-[14px] break-words whitespace-pre-wrap">{item}</p>
                  {podeEditar && (
                    <div className="flex shrink-0 items-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Mover ${rotuloItem} ${i + 1} para cima`}
                        disabled={i === 0 || mut.isPending}
                        onClick={() => mover(i, -1)}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Mover ${rotuloItem} ${i + 1} para baixo`}
                        disabled={i === itens.length - 1 || mut.isPending}
                        onClick={() => mover(i, 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Editar ${rotuloItem} ${i + 1}`}
                        disabled={mut.isPending}
                        onClick={() => {
                          setEditando(i);
                          setTexto(item);
                        }}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remover ${rotuloItem} ${i + 1}`}
                        disabled={mut.isPending}
                        onClick={() => remover(i)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {podeEditar && (
        <form
          className="flex items-center gap-2 border-t border-border px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            adicionar();
          }}
        >
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder={campo === "pauta" ? "Novo item da pauta" : "Nova decisão"}
            aria-label={campo === "pauta" ? "Novo item da pauta" : "Nova decisão"}
            maxLength={1000}
          />
          <Button type="submit" variant="outline" disabled={!novo.trim() || mut.isPending}>
            <Plus aria-hidden="true" />
            Adicionar
          </Button>
        </form>
      )}
      {!podeEditar && ata.status !== "rascunho" && itens.length > 0 && (
        <p className="border-t border-border px-5 py-2 text-[12px] text-muted-foreground">
          Conteúdo congelado: a ata está {ata.status === "publicada" ? "publicada" : "aprovada"}.
        </p>
      )}
    </Card>
  );
}
