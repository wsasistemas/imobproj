"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Base = {
  /** O que aparece fora da edição. */
  exibicao: ReactNode;
  /** Valor inicial do campo de edição (string). */
  valor: string;
  /** Rótulo acessível, ex.: "Título de 2.3". */
  rotulo: string;
  editavel: boolean;
  /** Recebe o texto digitado; devolva false para manter o campo aberto (ex.: valor inválido). */
  aoSalvar: (valor: string) => boolean | void;
  className?: string;
};

type Props =
  | (Base & { tipo: "texto" | "numero" | "data" })
  | (Base & { tipo: "opcoes"; opcoes: { valor: string; rotulo: string }[] });

/**
 * Célula editável inline: clique (ou Enter no foco) vira campo; Enter salva, Esc cancela, sair do campo salva.
 */
export function CelulaEditavel(props: Props) {
  const { exibicao, valor, rotulo, editavel, aoSalvar, className } = props;
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);
  const encerrado = useRef(false);
  const campo = useRef<HTMLInputElement & HTMLSelectElement>(null);

  useEffect(() => {
    if (editando) {
      campo.current?.focus();
      if (props.tipo === "texto" || props.tipo === "numero") campo.current?.select();
    }
  }, [editando, props.tipo]);

  if (!editavel) return <div className={cn("min-h-8 py-1", className)}>{exibicao}</div>;

  function abrir() {
    encerrado.current = false;
    setRascunho(valor);
    setEditando(true);
  }

  function confirmar(v = rascunho) {
    if (encerrado.current) return;
    if (v === valor) {
      encerrado.current = true;
      setEditando(false);
      return;
    }
    const resultado = aoSalvar(v);
    if (resultado === false) return; // mantém aberto para corrigir
    encerrado.current = true;
    setEditando(false);
  }

  function cancelar() {
    encerrado.current = true;
    setEditando(false);
  }

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmar();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelar();
    }
  };

  const estiloCampo =
    "h-8 w-full min-w-0 rounded-[6px] border border-ring bg-card px-2 text-[13px] text-foreground outline-none ring-3 ring-ring/30 dark:bg-input/30";

  if (editando) {
    if (props.tipo === "opcoes") {
      return (
        <select
          ref={campo}
          aria-label={rotulo}
          value={rascunho}
          className={cn(estiloCampo, className)}
          onChange={(e) => {
            setRascunho(e.target.value);
            confirmar(e.target.value);
          }}
          onKeyDown={teclas}
          onBlur={() => cancelar()}
        >
          {props.opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        ref={campo}
        aria-label={rotulo}
        type={props.tipo === "data" ? "date" : "text"}
        inputMode={props.tipo === "numero" ? "decimal" : undefined}
        value={rascunho}
        className={cn(estiloCampo, className)}
        onChange={(e) => setRascunho(e.target.value)}
        onKeyDown={teclas}
        onBlur={() => confirmar()}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={abrir}
      title="Clique para editar"
      className={cn(
        "-mx-1 flex min-h-8 w-full items-center rounded-[6px] px-1 py-1 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <span className="sr-only">Editar {rotulo}: </span>
      {exibicao}
    </button>
  );
}
