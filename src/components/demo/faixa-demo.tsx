"use client";

import { FlaskConical, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { restaurarDemo, verComoDemo } from "@/app/demo/acoes";
import { MODO_DEMO, PERFIS_DEMO, perfilDemoPorEmail } from "@/lib/demo";

/** Faixa abóbora no topo da área logada da demo: aviso, "Ver como" e "Restaurar dados da demo". */
export function FaixaDemo({ email, superAdmin }: { email: string; superAdmin: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  if (!MODO_DEMO) return null;
  const atual = perfilDemoPorEmail(email)?.chave ?? "";

  function verComo(chave: string) {
    iniciar(async () => {
      const r = await verComoDemo(chave);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(`Agora você vê como ${PERFIS_DEMO.find((p) => p.chave === chave)?.rotulo}.`);
      router.push("/");
      router.refresh();
    });
  }

  function restaurar() {
    setConfirmando(false);
    iniciar(async () => {
      const r = await restaurarDemo();
      if (!r.ok) return void toast.error(r.erro);
      toast.success("Dados da demonstração restaurados.");
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="demo-faixa" role="region" aria-label="Versão de demonstração">
      <span className="demo-faixa__selo">
        <FlaskConical className="size-3.5" aria-hidden="true" />
        Demonstração
      </span>
      <span className="demo-faixa__texto">Dados fictícios: nada aqui afeta clientes reais.</span>
      <div className="demo-faixa__acoes">
        <label htmlFor="demo-ver-como" className="demo-faixa__rotulo">
          Ver como
        </label>
        <select
          id="demo-ver-como"
          className="demo-faixa__select"
          value={atual}
          disabled={pendente}
          onChange={(e) => verComo(e.target.value)}
        >
          {!atual && <option value="">Escolha um perfil</option>}
          {PERFIS_DEMO.map((p) => (
            <option key={p.chave} value={p.chave}>
              {p.rotulo} · {p.nome}
            </option>
          ))}
        </select>
        {superAdmin &&
          (confirmando ? (
            <>
              <button type="button" className="demo-faixa__botao demo-faixa__botao--perigo" onClick={restaurar} disabled={pendente}>
                Confirmar: apagar e recriar
              </button>
              <button type="button" className="demo-faixa__botao" onClick={() => setConfirmando(false)} disabled={pendente}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className="demo-faixa__botao" onClick={() => setConfirmando(true)} disabled={pendente}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Restaurar dados da demo
            </button>
          ))}
        {pendente && <Loader2 className="size-4 animate-spin" aria-label="Aguarde" />}
      </div>
    </div>
  );
}
