"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, GraduationCap, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconeColorido } from "@/components/shell/icone-colorido";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMeusTreinamentos, usePainelTreinamento } from "./hooks";
import { TourPlayer } from "./tour-player";
import { ehTelaCelular, PAPEIS, percentual, ROTA_MEUS, telaUrl, type ModuloResumo, type Papel } from "./tipos";
import "./treinamento.css";

// Meus treinamentos: só a trilha do perfil da pessoa (D3), módulos agrupados por papel. O tour abre por cima, na rota
// /treinamento/meus/<módulo>, para o link poder ser compartilhado e o "voltar" do navegador fechar o tour.

const PAPEL_CHIP: Record<Papel, string> = { gerencia: "tr-chip--violet", campo: "tr-chip--brand", atende: "tr-chip--info", cliente: "tr-chip--ok" };

export function MeusTreinamentos({ superAdmin, nome, moduloId }: { superAdmin: boolean; nome: string; moduloId: number | null }) {
  const [verComo, setVerComo] = useState<string | null>(null);
  const q = useMeusTreinamentos(superAdmin ? verComo : null);
  const painel = usePainelTreinamento(superAdmin);
  const router = useRouter();
  const qc = useQueryClient();
  const fechar = () => {
    router.push(ROTA_MEUS, { scroll: false });
    // O passo atual é gravado sem recarregar a lista; ao fechar, a barra de progresso dos cartões se atualiza.
    void qc.invalidateQueries({ queryKey: ["treinamento", "meus"] });
  };

  const tour = moduloId && moduloId > 0 ? <TourPlayer key={moduloId} moduloId={moduloId} onFechar={fechar} /> : null;

  if (q.isLoading) return <div className="tr-cartao tr-cartao--estado">Carregando seus treinamentos…</div>;
  if (q.isError || !q.data) {
    return (
      <div className="tr-cartao tr-cartao--estado" role="alert">
        <GraduationCap size={36} aria-hidden />
        <b>Não foi possível carregar os treinamentos</b>
        <span>{q.error instanceof Error ? q.error.message : "Tente de novo em instantes."}</span>
      </div>
    );
  }

  const { trilha, perfil, semPerfil, modulos } = q.data;
  const feitos = modulos.filter((m) => m.concluidoEm).length;
  const minutos = modulos.reduce((t, m) => t + m.minutos, 0);
  const primeiroNome = nome.split(" ")[0];

  return (
    <>
      {superAdmin && (
        <div className="tr-barra-admin">
          <label htmlFor="tr-ver-como">Ver como (Admin):</label>
          <select id="tr-ver-como" value={verComo ?? ""} onChange={(e) => setVerComo(e.target.value || null)}>
            <option value="">Eu ({perfil && verComo == null ? perfil.nome : "Super admin"})</option>
            {painel.data?.perfis
              .filter((p) => p.chave !== "super_admin")
              .map((p) => (
                <option key={p.chave} value={p.chave}>
                  Perfil {p.nome}
                </option>
              ))}
          </select>
          {verComo != null && <span>Mostra a trilha como as pessoas desse perfil veem.</span>}
        </div>
      )}

      {semPerfil && verComo == null && (
        <div className="tr-aviso" role="note">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            Você ainda não tem um perfil de acesso, então mostramos a trilha <b>{trilha?.nome}</b>. Peça ao administrador para definir o seu
            perfil em Cadastros › Usuários.
          </span>
        </div>
      )}

      <section className="tr-hero" aria-labelledby="tr-hero-titulo">
        <span className="tr-hero__icone">
          <IconeColorido nome="treinamento" tamanho={52} />
        </span>
        <div>
          <h2 id="tr-hero-titulo">
            {verComo == null && primeiroNome ? `Olá, ${primeiroNome}. ` : ""}
            {trilha ? `Sua trilha: ${trilha.nome}` : "Nenhuma trilha"}
          </h2>
          <p>
            {perfil ? `Perfil ${perfil.nome}. ` : ""}
            {trilha?.descricao}
          </p>
        </div>
        <div className="tr-hero__stats">
          <div>
            <b>{feitos}</b>
            <span>de {modulos.length} concluídos</span>
          </div>
          <div>
            <b>{minutos}</b>
            <span>minutos</span>
          </div>
        </div>
      </section>

      {modulos.length === 0 ? (
        <div className="tr-cartao tr-cartao--estado">
          <GraduationCap size={36} aria-hidden />
          <b>Nenhum treinamento publicado para você ainda</b>
          <span>Os tutoriais do seu perfil aparecem aqui assim que forem publicados.</span>
        </div>
      ) : (
        (Object.keys(PAPEIS) as Papel[]).map((papel) => {
          const lista = modulos.filter((m) => m.papel === papel);
          if (lista.length === 0) return null;
          return (
            <section key={papel} aria-label={PAPEIS[papel]}>
              <p className="tr-papel">{PAPEIS[papel]}</p>
              <div className="tr-grade">
                {lista.map((m) => (
                  <Cartao key={m.id} modulo={m} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {tour}
    </>
  );
}

function Cartao({ modulo: m }: { modulo: ModuloResumo }) {
  const pct = percentual(m);
  const feito = m.concluidoEm != null;
  const acao = feito ? "Rever" : m.iniciado ? "Continuar" : "Começar";
  const destino = `${ROTA_MEUS}/${m.id}`;
  const celular = m.capa != null && ehTelaCelular(m.capa);

  return (
    <article className="tr-mod">
      <Link href={destino} scroll={false} className={cn("tr-mod__capa", celular && "tr-mod__capa--celular")} aria-label={`${acao}: ${m.titulo}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura estática da captura do tour */}
        {m.capa && <img src={telaUrl(m.capa)} alt="" loading="lazy" />}
        <span className="tr-mod__play" aria-hidden="true">
          <span>
            <Play size={22} fill="currentColor" />
          </span>
        </span>
        <span className="tr-mod__dur">
          {m.passos} passos · {m.minutos} min
        </span>
      </Link>
      <div className="tr-mod__corpo">
        <h3>{m.titulo}</h3>
        <p>{m.descricao}</p>
        <div className="tr-mod__meta">
          <span className={`tr-chip ${PAPEL_CHIP[m.papel]}`}>{PAPEIS[m.papel]}</span>
          {m.celular && <span className="tr-chip">Celular</span>}
        </div>
        <div
          className={cn("tr-barra", feito && "tr-barra--ok")}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progresso de ${m.titulo}`}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="tr-mod__rodape">
          {feito ? <span className="tr-chip tr-chip--ok">✓ Concluído</span> : <span>{m.iniciado ? `Passo ${Math.min(m.passoAtual + 1, m.passos)} de ${m.passos}` : "Não iniciado"}</span>}
          <Link href={destino} scroll={false} className={buttonVariants({ size: "sm", variant: feito ? "outline" : "default" })}>
            {acao}
          </Link>
        </div>
      </div>
    </article>
  );
}
