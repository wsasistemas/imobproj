"use client";

import { ArrowLeft, ArrowRight, Play, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExcluirBalao, useModuloAdmin, useReordenarBaloes, useSalvarBalao, useSalvarModulo } from "./hooks";
import {
  ehTelaCelular, PAPEIS, ROTA_MEUS, TELAS, telaUrl, TEXTO_RECOMENDADO,
  type Alvo, type Balao, type ModuloAdmin, type Papel, type PosicaoBalao, type SalvarModulo, type StatusModulo, type TrilhaAdmin,
} from "./tipos";

// Gerenciar tutoriais › editar um módulo (dados, trilhas e pergunta) e os balões dele (tela, contorno arrastável, texto).

const erroMsg = (e: unknown, padrao: string) => (e instanceof Error && e.message ? e.message : padrao);

const POSICOES: { valor: PosicaoBalao; rotulo: string }[] = [
  { valor: "auto", rotulo: "Automática" },
  { valor: "direita", rotulo: "À direita" },
  { valor: "esquerda", rotulo: "À esquerda" },
  { valor: "abaixo", rotulo: "Abaixo" },
  { valor: "acima", rotulo: "Acima" },
];

interface Props {
  /** null = módulo novo. */
  moduloId: number | null;
  trilhas: TrilhaAdmin[];
  onFechar: () => void;
  onCriado: (id: number) => void;
}

export function EditorModulo({ moduloId, trilhas, onFechar, onCriado }: Props) {
  const q = useModuloAdmin(moduloId ?? 0);
  if (moduloId && q.isLoading) return <div className="tr-cartao tr-editor">Carregando o módulo…</div>;
  if (moduloId && (q.isError || !q.data))
    return <div className="tr-cartao tr-editor tr-no">{erroMsg(q.error, "Não foi possível abrir o módulo.")}</div>;
  const modulo = moduloId ? (q.data ?? null) : null;
  return (
    <section className="tr-cartao tr-editor" aria-label={modulo ? `Editar ${modulo.titulo}` : "Novo módulo"}>
      <div className="tr-editor__topo">
        <div>
          <h3>{modulo ? `Editar: ${modulo.titulo}` : "Novo módulo"}</h3>
          <p className="tr-ajuda">{modulo ? "Dados do módulo e os balões de cada tela." : "Salve os dados do módulo para começar a montar os balões."}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onFechar}>
          <X aria-hidden /> Fechar
        </Button>
      </div>
      <FormModulo modulo={modulo} trilhas={trilhas} onCriado={onCriado} />
      {modulo && <EditorBaloes modulo={modulo} />}
    </section>
  );
}

function FormModulo({ modulo, trilhas, onCriado }: { modulo: ModuloAdmin | null; trilhas: TrilhaAdmin[]; onCriado: (id: number) => void }) {
  const salvar = useSalvarModulo();
  const [f, setF] = useState<SalvarModulo>(() => ({
    id: modulo?.id,
    titulo: modulo?.titulo ?? "",
    descricao: modulo?.descricao ?? "",
    papel: modulo?.papel ?? "gerencia",
    minutos: modulo?.minutos ?? 3,
    rotaDemo: modulo?.rotaDemo ?? "/",
    celular: modulo?.celular ?? false,
    pergunta: modulo?.pergunta ?? "",
    opcoes: modulo?.opcoes ?? ["", ""],
    resposta: modulo?.resposta ?? 0,
    status: modulo?.status ?? "rascunho",
    trilhas: modulo?.trilhas ?? [],
  }));
  const [erro, setErro] = useState<string | null>(null);
  const muda = <K extends keyof SalvarModulo>(k: K, v: SalvarModulo[K]) => setF((x) => ({ ...x, [k]: v }));

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const opcoes = f.opcoes.map((o) => o.trim());
    if (f.titulo.trim().length < 3) return setErro("Dê um título ao módulo (3 letras ou mais).");
    if (f.pergunta.trim().length < 5) return setErro("Escreva a pergunta final.");
    if (opcoes.length < 2 || opcoes.some((o) => !o)) return setErro("Preencha todas as opções da pergunta (de 2 a 5).");
    if (!f.rotaDemo.startsWith("/")) return setErro("A rota na demonstração começa com /.");
    if (f.status === "publicado" && f.trilhas.length === 0) return setErro("Marque ao menos uma trilha para publicar.");
    setErro(null);
    salvar.mutate(
      { ...f, opcoes },
      {
        onSuccess: (id) => {
          toast.success(modulo ? "Módulo salvo" : "Módulo criado");
          if (!modulo) onCriado(id);
        },
        onError: (er) => setErro(erroMsg(er, "Não foi possível salvar o módulo.")),
      },
    );
  };

  return (
    <form onSubmit={enviar} className="tr-form-bloco">
      <div className="tr-form">
        <label className="tr-campo tr-campo--larga">
          <span>Título</span>
          <input className="tr-input" id="tr-mod-titulo" value={f.titulo} maxLength={90} onChange={(e) => muda("titulo", e.target.value)} />
        </label>
        <label className="tr-campo tr-campo--larga">
          <span>Descrição do cartão</span>
          <input className="tr-input" id="tr-mod-descricao" value={f.descricao} maxLength={240} onChange={(e) => muda("descricao", e.target.value)} />
        </label>
        <label className="tr-campo">
          <span>Para quem</span>
          <select className="tr-input" id="tr-mod-papel" value={f.papel} onChange={(e) => muda("papel", e.target.value as Papel)}>
            {(Object.keys(PAPEIS) as Papel[]).map((p) => (
              <option key={p} value={p}>
                {PAPEIS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="tr-campo">
          <span>Duração (min)</span>
          <input
            className="tr-input"
            id="tr-mod-minutos"
            type="number"
            min={1}
            max={60}
            value={f.minutos}
            onChange={(e) => muda("minutos", Number(e.target.value) || 1)}
          />
        </label>
        <label className="tr-campo tr-campo--larga">
          <span>Rota na demonstração</span>
          <input className="tr-input" id="tr-mod-rota" value={f.rotaDemo} placeholder="/projetos" onChange={(e) => muda("rotaDemo", e.target.value)} />
          <small className="tr-ajuda">O botão &quot;Praticar na demonstração&quot; abre a demo nesta tela.</small>
        </label>
        <fieldset className="tr-campo tr-campo--larga">
          <legend>Trilhas</legend>
          <div className="tr-checks">
            {trilhas.map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={f.trilhas.includes(t.id)}
                  onChange={(e) => muda("trilhas", e.target.checked ? [...f.trilhas, t.id] : f.trilhas.filter((x) => x !== t.id))}
                />
                {t.nome}
              </label>
            ))}
            <label>
              <input type="checkbox" checked={f.celular} onChange={(e) => muda("celular", e.target.checked)} /> Mostra o celular (app de OS)
            </label>
          </div>
        </fieldset>
        <label className="tr-campo tr-campo--larga">
          <span>Pergunta final</span>
          <input className="tr-input" id="tr-mod-pergunta" value={f.pergunta} maxLength={200} onChange={(e) => muda("pergunta", e.target.value)} />
        </label>
        <fieldset className="tr-campo tr-campo--larga">
          <legend>Opções (marque a certa)</legend>
          <div className="tr-opcoes">
            {f.opcoes.map((o, k) => (
              <div key={k} className="tr-opcao">
                <input type="radio" name="tr-certa" aria-label={`Opção ${k + 1} é a certa`} checked={f.resposta === k} onChange={() => muda("resposta", k)} />
                <input
                  className="tr-input"
                  aria-label={`Opção ${k + 1}`}
                  value={o}
                  onChange={(e) =>
                    muda(
                      "opcoes",
                      f.opcoes.map((x, j) => (j === k ? e.target.value : x)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Remover opção ${k + 1}`}
                  disabled={f.opcoes.length <= 2}
                  onClick={() =>
                    setF((x) => ({
                      ...x,
                      opcoes: x.opcoes.filter((_, j) => j !== k),
                      resposta: x.resposta === k ? 0 : x.resposta > k ? x.resposta - 1 : x.resposta,
                    }))
                  }
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
            {f.opcoes.length < 5 && (
              <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => muda("opcoes", [...f.opcoes, ""])}>
                <Plus aria-hidden /> Opção
              </Button>
            )}
          </div>
        </fieldset>
      </div>
      <div className="tr-rodape-form">
        {erro && (
          <span className="tr-no tr-rodape-form__erro" role="alert">
            {erro}
          </span>
        )}
        <select className="tr-input tr-input--auto" aria-label="Status" value={f.status} onChange={(e) => muda("status", e.target.value as StatusModulo)}>
          <option value="rascunho">Rascunho</option>
          <option value="publicado">Publicado</option>
        </select>
        <Button type="submit" disabled={salvar.isPending}>
          {modulo ? "Salvar módulo" : "Criar módulo"}
        </Button>
      </div>
    </form>
  );
}

interface Rascunho {
  id?: number;
  tela: string;
  titulo: string;
  texto: string;
  alvo: Alvo;
  posicao: PosicaoBalao;
}

const doBalao = (b: Balao): Rascunho => ({ id: b.id, tela: b.tela, titulo: b.titulo, texto: b.texto, alvo: [...b.alvo] as Alvo, posicao: b.posicao });

function EditorBaloes({ modulo }: { modulo: ModuloAdmin }) {
  const { baloes } = modulo;
  const [selecionado, setSelecionado] = useState<number | null>(baloes[0]?.id ?? null);
  const atual = baloes.find((b) => b.id === selecionado) ?? null;
  const [r, setR] = useState<Rascunho | null>(atual ? doBalao(atual) : null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const salvar = useSalvarBalao();
  const excluir = useExcluirBalao();
  const reordenar = useReordenarBaloes();

  const abrir = (b: Balao) => {
    setSelecionado(b.id);
    setR(doBalao(b));
    setErro(null);
    setConfirmarExclusao(false);
  };
  const novo = () => {
    setSelecionado(null);
    setR({ tela: atual?.tela ?? baloes.at(-1)?.tela ?? TELAS[0], titulo: "", texto: "", alvo: [40, 40, 20, 10], posicao: "auto" });
    setErro(null);
    setConfirmarExclusao(false);
  };

  const gravar = () => {
    if (!r) return;
    if (r.titulo.trim().length < 2 || r.texto.trim().length < 2) return setErro("Preencha o título e a explicação do balão.");
    setErro(null);
    salvar.mutate(
      { ...r, moduloId: modulo.id },
      {
        onSuccess: (id) => {
          toast.success(r.id ? "Balão salvo" : "Balão criado");
          setSelecionado(id);
          setR({ ...r, id });
        },
        onError: (e) => setErro(erroMsg(e, "Não foi possível salvar o balão.")),
      },
    );
  };

  const apagar = () => {
    if (!r?.id) return;
    if (!confirmarExclusao) return setConfirmarExclusao(true);
    excluir.mutate(r.id, {
      onSuccess: () => {
        toast.success("Balão excluído");
        setSelecionado(null);
        setR(null);
        setConfirmarExclusao(false);
      },
      onError: (e) => setErro(erroMsg(e, "Não foi possível excluir o balão.")),
    });
  };

  const mover = (delta: number) => {
    const k = baloes.findIndex((b) => b.id === selecionado);
    const j = k + delta;
    if (k < 0 || j < 0 || j >= baloes.length) return;
    const ids = baloes.map((b) => b.id);
    [ids[k], ids[j]] = [ids[j], ids[k]];
    reordenar.mutate({ moduloId: modulo.id, ids }, { onError: (e) => setErro(erroMsg(e, "Não foi possível reordenar.")) });
  };
  const posicao = baloes.findIndex((b) => b.id === selecionado);

  return (
    <section aria-label="Balões do módulo" className="tr-form-bloco">
      <h4 className="tr-subtitulo">Balões ({baloes.length})</h4>
      <div className="tr-quadros">
        {baloes.map((b, k) => (
          <button type="button" key={b.id} className={cn("tr-mini", b.id === selecionado && "tr-mini--on")} onClick={() => abrir(b)} aria-pressed={b.id === selecionado}>
            {/* eslint-disable-next-line @next/next/no-img-element -- miniatura estática da captura */}
            <img src={telaUrl(b.tela)} alt="" loading="lazy" />
            <span>
              {k + 1}. {b.titulo}
            </span>
          </button>
        ))}
        <button type="button" className={cn("tr-mini tr-mini--novo", r && !r.id && "tr-mini--on")} onClick={novo}>
          <span>
            <Plus size={16} aria-hidden /> Balão
          </span>
        </button>
      </div>

      {!r ? (
        <p className="tr-ajuda">Escolha um balão acima ou crie um novo.</p>
      ) : (
        <div className="tr-duas">
          <div>
            <Previa rascunho={r} onAlvo={(alvo) => setR({ ...r, alvo })} />
            <p className="tr-ajuda">
              Arraste o contorno até o elemento que o balão explica; o quadradinho no canto muda o tamanho. O balão se posiciona sozinho ao lado.
            </p>
          </div>
          <div className="tr-form tr-form--uma">
            <label className="tr-campo">
              <span>Tela do sistema</span>
              <select className="tr-input" id="tr-balao-tela" value={r.tela} onChange={(e) => setR({ ...r, tela: e.target.value })}>
                {TELAS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                    {ehTelaCelular(t) ? " (celular)" : ""}
                  </option>
                ))}
              </select>
              <small className="tr-ajuda">Telas capturadas da demonstração (scripts/capturar-treinamento.mjs).</small>
            </label>
            <label className="tr-campo">
              <span>Posição do balão</span>
              <select className="tr-input" id="tr-balao-posicao" value={r.posicao} onChange={(e) => setR({ ...r, posicao: e.target.value as PosicaoBalao })}>
                {POSICOES.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="tr-campo">
              <span>Título do balão</span>
              <input className="tr-input" id="tr-balao-titulo" value={r.titulo} maxLength={60} onChange={(e) => setR({ ...r, titulo: e.target.value })} />
            </label>
            <label className="tr-campo">
              <span>Explicação</span>
              <textarea className="tr-input tr-input--area" id="tr-balao-texto" value={r.texto} maxLength={400} onChange={(e) => setR({ ...r, texto: e.target.value })} />
              <small className={r.texto.length > TEXTO_RECOMENDADO ? "tr-no" : "tr-ajuda"}>
                {r.texto.length} caracteres · até {TEXTO_RECOMENDADO} recomendados para caber no balão
              </small>
            </label>
            {erro && (
              <span className="tr-no" role="alert">
                {erro}
              </span>
            )}
            <div className="tr-rodape-form tr-rodape-form--inicio">
              <Button type="button" size="sm" onClick={gravar} disabled={salvar.isPending}>
                Salvar balão
              </Button>
              {r.id && (
                <>
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => mover(-1)} disabled={posicao <= 0 || reordenar.isPending} aria-label="Mover para antes">
                    <ArrowLeft aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => mover(1)}
                    disabled={posicao < 0 || posicao >= baloes.length - 1 || reordenar.isPending}
                    aria-label="Mover para depois"
                  >
                    <ArrowRight aria-hidden />
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={apagar} disabled={excluir.isPending}>
                    <Trash2 aria-hidden /> {confirmarExclusao ? "Confirmar exclusão" : "Excluir"}
                  </Button>
                </>
              )}
              <Link href={`${ROTA_MEUS}/${modulo.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Play aria-hidden /> Ver no tour
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** A tela com o contorno arrastável (mover) e o canto que redimensiona; valores em % da tela, com 1 casa. */
function Previa({ rascunho, onAlvo }: { rascunho: Rascunho; onAlvo: (a: Alvo) => void }) {
  const telaRef = useRef<HTMLDivElement>(null);
  const arraste = useRef<{ modo: "mover" | "redimensionar"; x: number; y: number; alvo: Alvo } | null>(null);
  const [x, y, w, h] = rascunho.alvo;
  const celular = ehTelaCelular(rascunho.tela);

  const comecar = (modo: "mover" | "redimensionar") => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    arraste.current = { modo, x: e.clientX, y: e.clientY, alvo: [...rascunho.alvo] as Alvo };
  };
  const mexer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const a = arraste.current,
      tela = telaRef.current;
    if (!a || !tela) return;
    const box = tela.getBoundingClientRect();
    const dx = ((e.clientX - a.x) / box.width) * 100;
    const dy = ((e.clientY - a.y) / box.height) * 100;
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const lim = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const [ax, ay, aw, ah] = a.alvo;
    if (a.modo === "mover") onAlvo([r1(lim(ax + dx, 0, 100 - aw)), r1(lim(ay + dy, 0, 100 - ah)), aw, ah]);
    else onAlvo([ax, ay, r1(lim(aw + dx, 1, 100 - ax)), r1(lim(ah + dy, 1, 100 - ay))]);
  };
  const soltar = () => {
    arraste.current = null;
  };

  return (
    <div className="tr-prev">
      <div className="tr-prev__tela" ref={telaRef} style={{ width: celular ? "42%" : "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- captura estática editada por cima */}
        <img src={telaUrl(rascunho.tela)} alt={`Tela ${rascunho.tela}`} draggable={false} />
        <div
          className="tr-prev__alvo"
          style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
          onPointerDown={comecar("mover")}
          onPointerMove={mexer}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          role="img"
          aria-label={`Contorno em ${x}% × ${y}%, tamanho ${w}% × ${h}%`}
        >
          <div className="tr-prev__alca" onPointerDown={comecar("redimensionar")} onPointerMove={mexer} onPointerUp={soltar} onPointerCancel={soltar} aria-hidden />
        </div>
      </div>
      <p className="tr-prev__dica">
        Contorno: x {x}% · y {y}% · {w}% × {h}%
      </p>
    </div>
  );
}
