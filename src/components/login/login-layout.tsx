"use client";

import { CalendarRange, CircleCheckBig, Eye, EyeOff, Lock, Mail, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import Image from "next/image";
import { useState, type FormEvent, type ReactNode } from "react";
import { GanttIlustracao } from "@/components/login/gantt-ilustracao";
import { BotaoTema } from "@/components/tema/botao-tema";
import { cn } from "@/lib/utils";

// Tela de entrada no design system do Imobenviomassa (imobdisparo), que porta a entrada do ImobDesk:
// marca em duas linhas, etiqueta abóbora de cantos retos, título branco grande, faixa de 3 números,
// campos retos de 54px com ícone, olho na senha, "Lembrar meu e-mail" e botão em degradê azul → abóbora.
// A cena do cronograma (GanttIlustracao) ocupa o painel da esquerda. O formulário segue o tema claro/escuro.
// Estilos em globals.css (.mpl-*, .ent-*). Vale para /login e /redefinir-senha.

const ANO = new Date().getFullYear();
const corTile = (c: string) => ({ ["--c" as string]: c });

function Numero({ icone, valor, rotulo }: { icone: ReactNode; valor: string; rotulo: string }) {
  return (
    <li>
      <span>{icone}</span>
      <b>{valor}</b>
      <small>{rotulo}</small>
    </li>
  );
}

/** Tela de entrada: cena do cronograma à esquerda, formulário à direita. */
export function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mpl-root">
      <aside className="mpl-visual" aria-label="IMOBPROJ · WSA Sistemas">
        <GanttIlustracao className="absolute inset-0" />
        <div className="mpl-scrim" aria-hidden="true" />

        <div className="mpl-brand">
          <span className="mpl-mark">
            <Image src="/wsa-logo.png" alt="" width={44} height={44} priority />
          </span>
          <span className="mpl-brand__nome">
            IMOBPROJ
            <small>WSA Sistemas</small>
          </span>
        </div>

        <div className="mpl-pitch">
          <span className="mpl-tag">Gestão de projetos de tecnologia</span>
          <h1 className="mpl-titulo">Projeto sob controle, com o cliente junto.</h1>
          <p className="mpl-texto">
            EAP, cronograma em Gantt, atas e Ordens de Serviço com evidências e aceite — e as conversas do
            WhatsApp de cada equipe, tudo num painel só.
          </p>
        </div>

        <ul className="mpl-metrics">
          <Numero
            icone={
              <span className="hig-tile size-8 rounded-lg" style={corTile("var(--sys-blue)")}>
                <CalendarRange size={18} strokeWidth={2.2} />
              </span>
            }
            valor="4 visões"
            rotulo="Agenda e Gantt"
          />
          <Numero
            icone={
              <span className="hig-tile size-8 rounded-lg" style={corTile("var(--sys-orange)")}>
                <Users size={18} strokeWidth={2.2} />
              </span>
            }
            valor="6 perfis"
            rotulo="Acesso por papel"
          />
          <Numero
            icone={
              <span className="hig-tile size-8 rounded-lg" style={corTile("var(--sys-green)")}>
                <ShieldCheck size={18} strokeWidth={2.2} />
              </span>
            }
            valor="100%"
            rotulo="OS com evidência"
          />
        </ul>
      </aside>

      <main className="mpl-panel">
        <BotaoTema className="mpl-panel__tema" />
        <div className="mpl-panel__conteudo">{children}</div>
        <p className="mpl-legal">© {ANO} WSA Sistemas. Todos os direitos reservados.</p>
      </main>
    </div>
  );
}

/** Botão principal da entrada: degradê azul → abóbora, 56px, seta (.ent-botao). */
export const submitCls = "ent-botao";

export function LoginCard({
  titulo,
  sub,
  kicker = "Acesso do colaborador",
  onSubmit,
  children,
}: {
  titulo: string;
  sub?: string;
  kicker?: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mpl-kicker">{kicker}</p>
      <h2 className="mpl-entrar">{titulo}</h2>
      {sub && <p className="mpl-sub">{sub}</p>}
      <form onSubmit={onSubmit} noValidate className="mpl-form">
        {children}
      </form>
    </div>
  );
}

export function Campo({
  id,
  label,
  icon,
  acao,
  erro,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  /** Botão dentro do campo, à direita (ex.: olho da senha). */
  acao?: ReactNode;
  erro?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="mpl-rotulo">
        {label}
      </label>
      <div className="mpl-campo-caixa relative h-[54px]">
        <span className="mpl-campo-icone pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">{icon}</span>
        {children}
        {acao && <span className="absolute right-1 top-1/2 -translate-y-1/2">{acao}</span>}
      </div>
      {erro && (
        <span id={`${id}-erro`} className="text-[13px] font-semibold text-[var(--mpl-erro-fg)]">
          {erro}
        </span>
      )}
    </div>
  );
}

/** Ícone de linha do campo (cinza; azul quando o campo está em foco). */
export const iconeCampo = (Icone: typeof Mail) => <Icone size={16} strokeWidth={2} aria-hidden="true" />;

type PropsInput = React.ComponentProps<"input">;

export function CampoSenha({ id, label, erro, ...props }: PropsInput & { id: string; label: string; erro?: string }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <Campo
      id={id}
      label={label}
      erro={erro}
      icon={iconeCampo(Lock)}
      acao={
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-controls={id}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          className="mpl-olho grid size-11 place-items-center"
        >
          {visivel ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
    >
      <input
        id={id}
        type={visivel ? "text" : "password"}
        placeholder="••••••••"
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className="mpl-campo pr-[52px]"
        {...props}
      />
    </Campo>
  );
}

/** Aviso da entrada: erro (role=alert) ou confirmação (role=status). */
export function Aviso({ children, tom = "erro" }: { children: ReactNode; tom?: "erro" | "ok" }) {
  const ok = tom === "ok";
  const Icone = ok ? CircleCheckBig : TriangleAlert;
  return (
    <div role={ok ? "status" : "alert"} className={cn("mpl-aviso", ok ? "mpl-aviso--ok" : "mpl-aviso--erro")}>
      <Icone size={20} strokeWidth={2.2} className="mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/** Linha "Lembrar meu e-mail" + link à direita (ex.: "Esqueceu a senha?"). */
export function LinhaLembrar({
  lembrar,
  onLembrar,
  children,
}: {
  lembrar: boolean;
  onLembrar: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <label className="mpl-lembrar inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px]">
        <input type="checkbox" checked={lembrar} onChange={(e) => onLembrar(e.target.checked)} className="size-5" />
        Lembrar meu e-mail
      </label>
      {children}
    </div>
  );
}

/** Nota no pé do formulário. */
export function NotaEntrada({ children }: { children: ReactNode }) {
  return <p className="mpl-note">{children}</p>;
}
