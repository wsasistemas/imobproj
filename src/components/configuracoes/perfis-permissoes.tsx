"use client";

import { Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { criarPerfil, excluirPerfil, salvarPermissoesPerfil } from "@/app/(app)/configuracoes/perfis/acoes";
import { IconeMenu } from "@/components/shell/icone-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ACOES, MENU, type Acao, type GrupoMenu, type ItemMenu } from "@/config/menu";
import { cn } from "@/lib/utils";

// Matriz de Perfis e permissões, no comportamento da tela do imobdesk (PerfisPermissoes.tsx):
// rascunho local com "Alterações não salvas", Liberar todos por grupo, filtro de menus, Super admin
// travado com tudo liberado, ação só vale com o "ver" do item (e o submenu só com o "ver" do pai) e
// confirmação ao trocar de perfil com alterações pendentes.

export type Perfil = { chave: string; nome: string; descricao: string | null; ordem: number; fixo: boolean; usuarios: number };
export type RegraPerfil = { perfil: string; menu: string } & Record<Acao, boolean>;

const ROTULO_ACAO: Record<Acao, string> = { ver: "Ver", criar: "Criar", editar: "Editar", excluir: "Excluir", aprovar: "Aprovar" };
const ACOES_PADRAO: readonly Acao[] = ["ver", "criar", "editar", "excluir"];

type Linha = { item: ItemMenu; pai?: ItemMenu };
const linhasDoGrupo = (g: GrupoMenu): Linha[] =>
  g.itens.flatMap((item) => [{ item }, ...(item.filhos ?? []).map((f) => ({ item: f, pai: item }))]);

const chaveCelula = (menu: string, acao: Acao) => `${menu}:${acao}`;
const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function PerfisPermissoes({ perfis, regras }: { perfis: Perfil[]; regras: RegraPerfil[] }) {
  const router = useRouter();
  const [atualizando, iniciar] = useTransition();
  const [selecionadoChave, setSelecionadoChave] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState("");
  const [trocarPara, setTrocarPara] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [aExcluir, setAExcluir] = useState<Perfil | null>(null);

  // Perfil exibido: o escolhido, se ainda existir; senão, o primeiro editável.
  const perfil = perfis.find((p) => p.chave === selecionadoChave) ?? perfis.find((p) => !p.fixo) ?? perfis[0];
  const travado = perfil?.fixo ?? true;

  const salvo = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const r of regras.filter((x) => x.perfil === perfil?.chave)) for (const a of ACOES) m[chaveCelula(r.menu, a)] = r[a];
    return m;
  }, [regras, perfil?.chave]);

  const valorEm = (estado: Record<string, boolean>, item: ItemMenu, acao: Acao): boolean => {
    if (travado) return true;
    if (item.soSuperAdmin) return false;
    if (item.sempreVisivel && acao === "ver") return true;
    return estado[chaveCelula(item.id, acao)] ?? salvo[chaveCelula(item.id, acao)] ?? false;
  };
  const bloqueioEm = (estado: Record<string, boolean>, { item, pai }: Linha, acao: Acao): string | null => {
    if (travado) return "Super admin tem acesso total, não editável";
    if (item.soSuperAdmin) return "Somente super admin";
    if (item.sempreVisivel && acao === "ver") return "Todo usuário vê";
    if (pai && !valorEm(estado, pai, "ver")) return `Libere antes "Ver" em ${pai.label}`;
    if (acao !== "ver" && !valorEm(estado, item, "ver")) return `Libere antes "Ver" em ${item.label}`;
    return null;
  };
  const marcar = (estado: Record<string, boolean>, menu: string, acao: Acao, valor: boolean) => {
    const k = chaveCelula(menu, acao);
    // Voltou ao valor salvo: deixa de ser alteração.
    if (valor === (salvo[k] ?? false)) delete estado[k];
    else estado[k] = valor;
  };

  const mudancas = Object.keys(rascunho).length;

  const alternar = (linha: Linha, acao: Acao, valor: boolean) =>
    setRascunho((atual) => {
      const novo = { ...atual };
      marcar(novo, linha.item.id, acao, valor);
      return novo;
    });

  const liberarTodos = (g: GrupoMenu) =>
    setRascunho((atual) => {
      const novo = { ...atual };
      // Pai vem antes dos filhos e "ver" antes das ações: o encadeamento libera tudo num passo só.
      for (const linha of linhasDoGrupo(g))
        for (const acao of linha.item.acoes ?? ACOES_PADRAO)
          if (!bloqueioEm(novo, linha, acao) && !valorEm(novo, linha.item, acao)) marcar(novo, linha.item.id, acao, true);
      return novo;
    });

  const selecionar = (chave: string) => {
    if (chave === perfil?.chave) return;
    if (mudancas > 0) setTrocarPara(chave);
    else setSelecionadoChave(chave);
  };

  async function salvar() {
    if (!perfil) return;
    // Grava a linha inteira de cada menu alterado (o valor efetivo de todas as ações).
    const menus = [...new Set(Object.keys(rascunho).map((k) => k.split(":")[0]))];
    const itens = MENU.flatMap(linhasDoGrupo).map((l) => l.item);
    const linhas = menus.map((menu) => {
      const item = itens.find((i) => i.id === menu)!;
      return { menu, ...(Object.fromEntries(ACOES.map((a) => [a, valorEm(rascunho, item, a) && (a === "ver" || valorEm(rascunho, item, "ver"))])) as Record<Acao, boolean>) };
    });
    setSalvando(true);
    const r = await salvarPermissoesPerfil({ perfil: perfil.chave, linhas });
    setSalvando(false);
    if (!r.ok) return void toast.error(r.erro);
    toast.success(`Permissões do perfil ${perfil.nome} salvas`);
    setRascunho({});
    iniciar(() => router.refresh());
  }

  const termo = normalizar(filtro.trim());
  const grupos = MENU.map((g) => ({
    grupo: g,
    linhas: linhasDoGrupo(g).filter(({ item }) => !termo || normalizar(item.label).includes(termo) || item.id.includes(termo)),
  })).filter((g) => g.linhas.length > 0);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.5fr)_minmax(0,1.5fr)]">
      <Card className="min-w-0 gap-0 p-0" aria-label="Perfis de acesso">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <h2 className="text-[15px] font-semibold">Perfis</h2>
          <Button size="sm" variant="outline" onClick={() => setNovoAberto(true)}>
            <Plus aria-hidden="true" /> Novo perfil
          </Button>
        </div>
        <ul>
          {perfis.map((p) => {
            const ativo = p.chave === perfil?.chave;
            return (
              <li key={p.chave} className="border-b border-border-soft last:border-b-0">
                <button
                  type="button"
                  onClick={() => selecionar(p.chave)}
                  aria-pressed={ativo}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                    ativo && "bg-primary-soft",
                  )}
                >
                  <span className="min-w-0">
                    <span className={cn("block truncate font-semibold", ativo && "text-primary")}>{p.nome}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {p.fixo ? "Acesso total, não editável" : `${p.usuarios} ${p.usuarios === 1 ? "usuário" : "usuários"}`}
                    </span>
                  </span>
                  {p.fixo ? (
                    <Lock size={15} className="shrink-0 text-muted-foreground" aria-label="Não editável" />
                  ) : ativo && mudancas > 0 ? (
                    <Badge variant="outline" className="shrink-0 border-warning/40 bg-warning-bg text-warning">
                      Alterações não salvas
                    </Badge>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="min-w-0 gap-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">{perfil?.nome}</h2>
            {perfil?.descricao && <p className="text-[12.5px] text-muted-foreground">{perfil.descricao}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar menus"
              aria-label="Filtrar menus"
              className="h-9 w-48"
            />
            {!travado && (
              <Button variant="outline" size="sm" onClick={() => perfil && setAExcluir(perfil)} aria-label={`Excluir o perfil ${perfil?.nome}`}>
                <Trash2 aria-hidden="true" />
              </Button>
            )}
            {mudancas > 0 && (
              <Button variant="outline" size="sm" onClick={() => setRascunho({})} disabled={salvando}>
                Descartar
              </Button>
            )}
            <Button size="sm" onClick={salvar} disabled={travado || mudancas === 0 || salvando || atualizando}>
              {(salvando || atualizando) && <Loader2 className="animate-spin" aria-hidden="true" />}
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
        {travado && (
          <p className="border-b border-border-soft bg-info-bg px-4 py-2.5 text-[13px] text-info">
            Super admin tem acesso total a todos os menus. Este perfil não é editável.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-table-head text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Menu</th>
                {ACOES.map((a) => (
                  <th key={a} className="px-3 py-2.5 text-center font-semibold">
                    {ROTULO_ACAO[a]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.length === 0 && (
                <tr>
                  <td colSpan={ACOES.length + 1} className="px-4 py-6 text-center text-muted-foreground">
                    Nenhum menu corresponde ao filtro.
                  </td>
                </tr>
              )}
              {grupos.map(({ grupo, linhas }) => (
                <GrupoLinhas
                  key={grupo.id}
                  grupo={grupo}
                  linhas={linhas}
                  travado={travado}
                  onLiberarTodos={() => liberarTodos(grupo)}
                  valor={(item, acao) => valorEm(rascunho, item, acao)}
                  bloqueio={(linha, acao) => bloqueioEm(rascunho, linha, acao)}
                  onAlternar={alternar}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border-soft px-4 py-2.5 text-[12px] text-muted-foreground">
          O perfil vale para todos os projetos. O papel dentro de cada projeto (gerente, analista, usuário-chave) continua em
          Usuários › Acesso por projeto.
        </p>
      </Card>

      <AlertDialog open={trocarPara !== null} onOpenChange={(v) => !v && setTrocarPara(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Há {mudancas} {mudancas === 1 ? "permissão alterada" : "permissões alteradas"} em {perfil?.nome} que ainda não
              foram salvas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setRascunho({});
                setSelecionadoChave(trocarPara);
                setTrocarPara(null);
              }}
            >
              Descartar e trocar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DialogNovoPerfil
        aberto={novoAberto}
        onFechar={() => setNovoAberto(false)}
        onCriado={(chave) => {
          setNovoAberto(false);
          setRascunho({});
          setSelecionadoChave(chave);
          iniciar(() => router.refresh());
        }}
      />

      <AlertDialog open={!!aExcluir} onOpenChange={(v) => !v && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o perfil {aExcluir?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              {aExcluir?.usuarios
                ? `${aExcluir.usuarios} ${aExcluir.usuarios === 1 ? "pessoa fica" : "pessoas ficam"} sem perfil e passam a ver só a Página Inicial até receberem outro perfil.`
                : "Ninguém usa este perfil hoje."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!aExcluir) return;
                const r = await excluirPerfil({ chave: aExcluir.chave });
                if (!r.ok) return void toast.error(r.erro);
                toast.success(`Perfil ${aExcluir.nome} excluído`);
                setAExcluir(null);
                setRascunho({});
                setSelecionadoChave(null);
                iniciar(() => router.refresh());
              }}
            >
              Excluir perfil
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GrupoLinhas({
  grupo,
  linhas,
  travado,
  onLiberarTodos,
  valor,
  bloqueio,
  onAlternar,
}: {
  grupo: GrupoMenu;
  linhas: Linha[];
  travado: boolean;
  onLiberarTodos: () => void;
  valor: (item: ItemMenu, acao: Acao) => boolean;
  bloqueio: (linha: Linha, acao: Acao) => string | null;
  onAlternar: (linha: Linha, acao: Acao, valor: boolean) => void;
}) {
  return (
    <>
      <tr className="bg-table-head">
        <td colSpan={ACOES.length + 1} className="px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">{grupo.label}</span>
            {!travado && (
              <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={onLiberarTodos}>
                Liberar todos
              </Button>
            )}
          </div>
        </td>
      </tr>
      {linhas.map((linha) => {
        const { item, pai } = linha;
        const acoes = item.acoes ?? ACOES_PADRAO;
        return (
          <tr key={item.id} className="border-b border-border-soft last:border-b-0">
            <td className={cn("px-4 py-2", pai && "pl-10")}>
              <span className="inline-flex items-center gap-2">
                <IconeMenu icon={item.icon} cor={item.cor} colorido={item.colorido} tamanho={18} />
                <span className="font-medium">{item.label}</span>
                {item.soSuperAdmin && <span className="text-[11.5px] text-muted-foreground">· somente super admin</span>}
              </span>
            </td>
            {ACOES.map((acao) => {
              if (!acoes.includes(acao))
                return (
                  <td key={acao} className="px-3 py-2 text-center text-muted-foreground" aria-label="Não se aplica">
                    —
                  </td>
                );
              const motivo = bloqueio(linha, acao);
              return (
                <td key={acao} className="px-3 py-2 text-center" title={motivo ?? undefined}>
                  <Switch
                    checked={valor(item, acao)}
                    disabled={motivo !== null}
                    onCheckedChange={(v) => onAlternar(linha, acao, v)}
                    aria-label={`${ROTULO_ACAO[acao]} em ${item.label}`}
                  />
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function DialogNovoPerfil({ aberto, onFechar, onCriado }: { aberto: boolean; onFechar: () => void; onCriado: (chave: string) => void }) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !enviando && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo perfil</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setEnviando(true);
            setErro(null);
            const r = await criarPerfil({ nome, descricao });
            setEnviando(false);
            if (!r.ok) return setErro(r.erro);
            toast.success(`Perfil ${nome.trim()} criado. Agora marque o que ele pode fazer.`);
            setNome("");
            setDescricao("");
            onCriado(r.dados);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="perfil-nome">Nome do perfil</Label>
            <Input id="perfil-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Coordenador de campo" autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="perfil-descricao">Descrição (opcional)</Label>
            <Input id="perfil-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Para que serve este perfil" />
          </div>
          {erro && (
            <p role="alert" className="text-[13px] text-destructive">
              {erro}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando && <Loader2 className="animate-spin" aria-hidden="true" />}
              Criar perfil
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
