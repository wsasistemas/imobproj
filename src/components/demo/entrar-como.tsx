"use client";

import { ArrowRight, FlaskConical, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { entrarComoDemo } from "@/app/demo/acoes";
import { MODO_DEMO, PERFIS_DEMO } from "@/lib/demo";

/** Tela de entrada da demo: aviso e um botão por perfil fictício (entra sem digitar senha). */
export function EntrarComoDemo({ destino }: { destino: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (!MODO_DEMO) return null;

  function entrar(chave: string) {
    setEscolhido(chave);
    setErro(null);
    iniciar(async () => {
      const r = await entrarComoDemo(chave);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.replace(destino);
      router.refresh();
    });
  }

  return (
    <section className="demo-entrar" aria-labelledby="demo-entrar-titulo">
      <p className="demo-entrar__selo">
        <FlaskConical className="size-3.5" aria-hidden="true" />
        Demonstração · dados fictícios
      </p>
      <h2 id="demo-entrar-titulo" className="demo-entrar__titulo">
        Entrar como
      </h2>
      <p className="demo-entrar__texto">Escolha um perfil para conhecer o sistema. Nada aqui afeta clientes reais.</p>
      {erro && (
        <p className="demo-entrar__erro" role="alert">
          {erro}
        </p>
      )}
      <ul className="demo-entrar__lista">
        {PERFIS_DEMO.map((p) => (
          <li key={p.chave}>
            <button type="button" className="demo-entrar__botao" onClick={() => entrar(p.chave)} disabled={pendente}>
              <span>
                <b>{p.rotulo}</b>
                <small>
                  {p.nome} · {p.descricao}
                </small>
              </span>
              {pendente && escolhido === p.chave ? (
                <Loader2 className="size-4 animate-spin" aria-label="Entrando" />
              ) : (
                <ArrowRight className="size-4" aria-hidden="true" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
