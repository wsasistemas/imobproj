"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { adicionarFeriado, removerFeriado, salvarHorarios, salvarMensagens, salvarRegras } from "@/app/(app)/configuracoes/fila/acoes";
import { EstadoVazio, ErroBloco, RotuloSecao } from "@/components/cadastros/blocos";
import { executar } from "@/components/cadastros/util";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MSG_BANCO_DESATUALIZADO, ehBancoDesatualizado } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/client";
import { DIAS_SEMANA, ROTULO_MENSAGEM, TIPOS_MENSAGEM, VARIAVEIS_MENSAGEM, type TipoMensagem } from "./esquemas-setores";

type Horario = { dia_semana: number; aberto: boolean; abre: string; fecha: string };
type Feriado = { data: string; descricao: string };
type Regras = {
  limite_por_atendente: number;
  distribuicao_automatica: boolean;
  devolver_sem_resposta_min: number;
  encerrar_inatividade_min: number;
  pesquisa_satisfacao: boolean;
  fuso: string;
};
type Mensagem = { tipo: TipoMensagem; texto: string; ativo: boolean };
type ConfigSetor = { horarios: Horario[]; feriados: Feriado[]; regras: Regras | null; mensagens: Mensagem[] };

const REGRAS_PADRAO: Regras = {
  limite_por_atendente: 5,
  distribuicao_automatica: true,
  devolver_sem_resposta_min: 10,
  encerrar_inatividade_min: 120,
  pesquisa_satisfacao: true,
  fuso: "America/Sao_Paulo",
};

const hhmm = (t: string) => t.slice(0, 5);
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

export function FilaHorarios({ podeEditar }: { podeEditar: boolean }) {
  const setores = useQuery({
    queryKey: ["configuracoes", "setores-lista"],
    queryFn: async () => {
      const { data, error } = await createClient().from("setores").select("id, nome, ativo").order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; ativo: boolean }[];
    },
  });
  const [escolhido, setEscolhido] = useState<string | null>(null);

  if (setores.isPending) return <Skeleton className="h-96 w-full rounded-[12px]" />;
  if (setores.isError)
    return (
      <ErroBloco
        texto={ehBancoDesatualizado(setores.error) ? MSG_BANCO_DESATUALIZADO : "Não foi possível carregar os setores."}
        onTentar={() => setores.refetch()}
      />
    );
  const lista = setores.data ?? [];
  if (lista.length === 0)
    return <EstadoVazio icone="fila" titulo="Nenhum setor ainda" texto="Cadastre um setor em Configurações › Setores e números para definir o horário e as regras da fila." />;

  const setorId = escolhido ?? lista[0].id;
  const itens = lista.map((s) => ({ value: s.id, label: s.ativo ? s.nome : `${s.nome} (inativo)` }));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label id="fila-setor-rotulo" className="text-[13px]">
          Setor
        </Label>
        <Select items={itens} value={setorId} onValueChange={(v) => v && setEscolhido(v)}>
          <SelectTrigger className="w-[260px]" aria-labelledby="fila-setor-rotulo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {itens.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ConfigDoSetor key={setorId} setorId={setorId} podeEditar={podeEditar} />
    </div>
  );
}

function ConfigDoSetor({ setorId, podeEditar }: { setorId: string; podeEditar: boolean }) {
  const chave = ["configuracoes", "fila", setorId];
  const config = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<ConfigSetor> => {
      const sb = createClient();
      const [h, f, r, m] = await Promise.all([
        sb.from("setor_horarios").select("dia_semana, aberto, abre, fecha").eq("setor_id", setorId).order("dia_semana"),
        sb.from("setor_feriados").select("data, descricao").eq("setor_id", setorId).order("data"),
        sb.from("setor_regras").select("limite_por_atendente, distribuicao_automatica, devolver_sem_resposta_min, encerrar_inatividade_min, pesquisa_satisfacao, fuso").eq("setor_id", setorId).maybeSingle(),
        sb.from("setor_mensagens").select("tipo, texto, ativo").eq("setor_id", setorId),
      ]);
      const erro = h.error ?? f.error ?? r.error ?? m.error;
      if (erro) throw erro;
      return {
        horarios: (h.data ?? []) as Horario[],
        feriados: (f.data ?? []) as Feriado[],
        regras: (r.data as Regras | null) ?? null,
        mensagens: (m.data ?? []) as Mensagem[],
      };
    },
  });

  if (config.isPending)
    return (
      <div aria-busy="true" className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80 w-full rounded-[12px]" />
        <Skeleton className="h-80 w-full rounded-[12px]" />
      </div>
    );
  if (config.isError)
    return (
      <ErroBloco
        texto={ehBancoDesatualizado(config.error) ? MSG_BANCO_DESATUALIZADO : "Não foi possível carregar a configuração do setor."}
        onTentar={() => config.refetch()}
      />
    );

  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <CartaoHorario setorId={setorId} config={config.data} podeEditar={podeEditar} chave={chave} />
        <CartaoRegras setorId={setorId} regras={config.data.regras ?? REGRAS_PADRAO} podeEditar={podeEditar} chave={chave} />
      </div>
      <CartaoMensagens setorId={setorId} mensagens={config.data.mensagens} podeEditar={podeEditar} chave={chave} />
    </div>
  );
}

function Cabecalho({ titulo, extra }: { titulo: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
      <h2 className="text-[15px] font-semibold">{titulo}</h2>
      {extra}
    </div>
  );
}

function CartaoHorario({ setorId, config, podeEditar, chave }: { setorId: string; config: ConfigSetor; podeEditar: boolean; chave: string[] }) {
  const queryClient = useQueryClient();
  const inicial: Horario[] = Array.from({ length: 7 }, (_, d) => {
    const h = config.horarios.find((x) => x.dia_semana === d);
    return h ? { ...h, abre: hhmm(h.abre), fecha: hhmm(h.fecha) } : { dia_semana: d, aberto: false, abre: "08:00", fecha: "18:00" };
  });
  const [horarios, setHorarios] = useState(inicial);
  const [novaData, setNovaData] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const invalidar = () => queryClient.invalidateQueries({ queryKey: chave });

  const mSalvar = useMutation({
    mutationFn: () => executar(salvarHorarios({ setor_id: setorId, horarios })),
    onSuccess: () => toast.success("Horário salvo."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: invalidar,
  });
  const mFeriado = useMutation({
    mutationFn: () => executar(adicionarFeriado({ setor_id: setorId, data: novaData, descricao: novaDescricao })),
    onSuccess: () => {
      toast.success("Feriado incluído.");
      setNovaData("");
      setNovaDescricao("");
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: invalidar,
  });
  const mTirarFeriado = useMutation({
    mutationFn: (data: string) => executar(removerFeriado({ setor_id: setorId, data })),
    onSuccess: () => toast.success("Feriado retirado."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: invalidar,
  });

  const muda = (d: number, campo: Partial<Horario>) => setHorarios((hs) => hs.map((h) => (h.dia_semana === d ? { ...h, ...campo } : h)));
  // Segunda a domingo, como no calendário comercial.
  const ordem = [1, 2, 3, 4, 5, 6, 0];

  return (
    <Card className="min-w-0 gap-0 p-0">
      <Cabecalho titulo="Horário de atendimento" extra={<span className="text-[12.5px] text-muted-foreground">Fuso: Brasília</span>} />
      <fieldset disabled={!podeEditar || mSalvar.isPending} className="grid min-w-0 grid-cols-1 gap-2 p-4">
        {ordem.map((d) => {
          const h = horarios[d];
          return (
            <div key={d} className="grid grid-cols-[84px_1fr_1fr_auto] items-center gap-2">
              <span className="text-[13.5px] font-semibold">{DIAS_SEMANA[d]}</span>
              <Input
                type="time"
                value={h.abre}
                onChange={(e) => muda(d, { abre: e.target.value })}
                disabled={!h.aberto}
                aria-label={`${DIAS_SEMANA[d]}: abre às`}
                className="tabular-nums"
              />
              <Input
                type="time"
                value={h.fecha}
                onChange={(e) => muda(d, { fecha: e.target.value })}
                disabled={!h.aberto}
                aria-label={`${DIAS_SEMANA[d]}: fecha às`}
                className="tabular-nums"
              />
              <Switch checked={h.aberto} onCheckedChange={(v) => muda(d, { aberto: v })} aria-label={`${DIAS_SEMANA[d]}: atende`} />
            </div>
          );
        })}
        {podeEditar && (
          <div className="flex justify-end pt-1">
            <Button onClick={() => mSalvar.mutate()}>
              {mSalvar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Salvar horário
            </Button>
          </div>
        )}
      </fieldset>
      <div className="grid gap-2 border-t border-border-soft p-4">
        <RotuloSecao>Feriados</RotuloSecao>
        {config.feriados.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nenhum feriado cadastrado. Nesses dias o setor fica fechado.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {config.feriados.map((f) => (
              <li key={f.data} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[12.5px]">
                <span className="tabular-nums font-medium">{dataBr(f.data)}</span>
                {f.descricao && <span className="text-muted-foreground">{f.descricao}</span>}
                {podeEditar && (
                  <button
                    type="button"
                    className="rounded-full p-0.5 text-muted-foreground hover:text-danger focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label={`Retirar o feriado de ${dataBr(f.data)}`}
                    onClick={() => mTirarFeriado.mutate(f.data)}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {podeEditar && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (novaData) mFeriado.mutate();
            }}
          >
            <div className="grid gap-1">
              <Label htmlFor="feriado-data" className="text-[12.5px]">
                Data
              </Label>
              <Input id="feriado-data" type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className="w-[160px]" />
            </div>
            <div className="grid min-w-[160px] flex-1 gap-1">
              <Label htmlFor="feriado-descricao" className="text-[12.5px]">
                Descrição
              </Label>
              <Input id="feriado-descricao" placeholder="Ex.: Aniversário da cidade" value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} />
            </div>
            <Button type="submit" variant="outline" disabled={!novaData || mFeriado.isPending}>
              {mFeriado.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              Incluir
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

function CartaoRegras({ setorId, regras, podeEditar, chave }: { setorId: string; regras: Regras; podeEditar: boolean; chave: string[] }) {
  const queryClient = useQueryClient();
  const [r, setR] = useState(regras);
  const m = useMutation({
    mutationFn: () =>
      executar(
        salvarRegras({
          setor_id: setorId,
          limite_por_atendente: r.limite_por_atendente,
          distribuicao_automatica: r.distribuicao_automatica,
          devolver_sem_resposta_min: r.devolver_sem_resposta_min,
          encerrar_inatividade_min: r.encerrar_inatividade_min,
          pesquisa_satisfacao: r.pesquisa_satisfacao,
        }),
      ),
    onSuccess: () => toast.success("Regras da fila salvas."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chave }),
  });

  const linha = (titulo: string, ajuda: string, controle: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium">{titulo}</p>
        <p className="text-[12px] text-muted-foreground">{ajuda}</p>
      </div>
      {controle}
    </div>
  );
  const numero = (id: string, valor: number, campo: keyof Regras, sufixo: string, rotulo: string) => (
    <div className="flex shrink-0 items-center gap-1.5">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        value={valor}
        onChange={(e) => setR((x) => ({ ...x, [campo]: Number(e.target.value) }))}
        className="w-[84px] text-right tabular-nums"
        aria-label={rotulo}
      />
      {sufixo && <span className="text-[12.5px] text-muted-foreground">{sufixo}</span>}
    </div>
  );

  return (
    <Card className="min-w-0 gap-0 p-0">
      <Cabecalho titulo="Regras da fila" />
      <fieldset disabled={!podeEditar || m.isPending} className="min-w-0">
        {linha(
          "Limite de conversas por atendente",
          "Acima disso a pessoa fica “não disponível”.",
          numero("regra-limite", r.limite_por_atendente, "limite_por_atendente", "", "Limite de conversas por atendente"),
        )}
        {linha(
          "Distribuição automática",
          "Entrega para o disponível com menos conversas.",
          <Switch
            checked={r.distribuicao_automatica}
            onCheckedChange={(v) => setR((x) => ({ ...x, distribuicao_automatica: v }))}
            aria-label="Distribuição automática"
          />,
        )}
        {linha(
          "Devolver à fila sem resposta em",
          "Tempo sem o atendente responder.",
          numero("regra-devolver", r.devolver_sem_resposta_min, "devolver_sem_resposta_min", "min", "Devolver à fila sem resposta em minutos"),
        )}
        {linha(
          "Encerrar por inatividade do cliente",
          "Manda a pesquisa e fecha o ticket.",
          numero("regra-encerrar", r.encerrar_inatividade_min, "encerrar_inatividade_min", "min", "Encerrar por inatividade em minutos"),
        )}
        {linha(
          "Pesquisa de satisfação (1 a 5)",
          "Enviada quando o atendimento termina.",
          <Switch checked={r.pesquisa_satisfacao} onCheckedChange={(v) => setR((x) => ({ ...x, pesquisa_satisfacao: v }))} aria-label="Pesquisa de satisfação" />,
        )}
        {podeEditar && (
          <div className="flex justify-end p-4">
            <Button onClick={() => m.mutate()}>
              {m.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Salvar regras
            </Button>
          </div>
        )}
      </fieldset>
    </Card>
  );
}

function CartaoMensagens({ setorId, mensagens, podeEditar, chave }: { setorId: string; mensagens: Mensagem[]; podeEditar: boolean; chave: string[] }) {
  const queryClient = useQueryClient();
  const [lista, setLista] = useState<Mensagem[]>(
    TIPOS_MENSAGEM.map((tipo) => mensagens.find((x) => x.tipo === tipo) ?? { tipo, texto: "", ativo: true }),
  );
  const m = useMutation({
    mutationFn: () => executar(salvarMensagens({ setor_id: setorId, mensagens: lista })),
    onSuccess: () => toast.success("Mensagens automáticas salvas."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: chave }),
  });
  const muda = (tipo: TipoMensagem, campo: Partial<Mensagem>) => setLista((xs) => xs.map((x) => (x.tipo === tipo ? { ...x, ...campo } : x)));

  return (
    <Card className="min-w-0 gap-0 p-0">
      <Cabecalho titulo="Mensagens automáticas" />
      <fieldset disabled={!podeEditar || m.isPending} className="grid min-w-0 grid-cols-1 gap-4 p-4">
        <div className="grid gap-4 lg:grid-cols-3">
          {lista.map((msg) => (
            <div key={msg.tipo} className="grid content-start gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`msg-${msg.tipo}`}>{ROTULO_MENSAGEM[msg.tipo]}</Label>
                <Switch checked={msg.ativo} onCheckedChange={(v) => muda(msg.tipo, { ativo: v })} aria-label={`Enviar a mensagem de ${ROTULO_MENSAGEM[msg.tipo]}`} />
              </div>
              <Textarea id={`msg-${msg.tipo}`} rows={4} value={msg.texto} onChange={(e) => muda(msg.tipo, { texto: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12.5px] text-muted-foreground">Variáveis: {VARIAVEIS_MENSAGEM.join(", ")}</p>
          {podeEditar && (
            <Button onClick={() => m.mutate()}>
              {m.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Salvar mensagens
            </Button>
          )}
        </div>
      </fieldset>
    </Card>
  );
}
