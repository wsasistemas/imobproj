// Nova OS pelo celular (decisão D2). A OS nasce com um id gerado aqui e vai para a fila offline:
// sem rede, ela já aparece em Hoje como "OS nova · aguardando envio" e aceita check-in.
// O servidor (fn_app_abrir_os) dá o número sequencial do projeto e confere quem pode abrir.

import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Banner, Botao, Campo, Cartao, RotuloSecao } from "../../../components/ui";
import { lerCache, salvarCache, useFila, type TipoOs } from "../../../lib/fila";
import { inicioDoDia, somarDias } from "../../../lib/formato";
import { PAPEIS_ABREM_OS, useSessao } from "../../../lib/sessao";
import { supabase } from "../../../lib/supabase";
import { cor, espaco, raio } from "../../../lib/tema";
import { ROTULO_TIPO_OS } from "../../../lib/tipos";

type Projeto = { id: string; codigo: string; nome: string; cliente: string | null; gerencia: boolean };
type Responsavel = { id: string; nome: string };
type Dia = "hoje" | "amanha" | "sem_data";

const TIPOS: TipoOs[] = ["corretiva", "preventiva", "implantacao", "visita"];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function noDia(base: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

export default function NovaOs() {
  const { sessao, perfil, vinculos } = useSessao();
  const { enfileirar, online } = useFila();
  const userId = sessao?.user.id ?? "";

  const [todosProjetos, setTodosProjetos] = useState<Projeto[]>([]);
  const projetos = useMemo<Projeto[]>(() => {
    const meus = vinculos
      .filter((v) => PAPEIS_ABREM_OS.includes(v.role) && v.projeto)
      .map((v) => ({
        id: v.project_id,
        codigo: v.projeto!.codigo,
        nome: v.projeto!.nome,
        cliente: v.projeto!.cliente?.nome ?? null,
        gerencia: v.role === "gerente" || v.role === "diretor" || !!perfil?.is_super_admin,
      }));
    // Super admin abre em qualquer projeto, mesmo sem ser membro.
    const extras = todosProjetos.filter((p) => !meus.some((m) => m.id === p.id));
    return [...meus, ...extras];
  }, [vinculos, todosProjetos, perfil?.is_super_admin]);

  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoOs>("corretiva");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dia, setDia] = useState<Dia>("hoje");
  const [inicio, setInicio] = useState("14:00");
  const [fim, setFim] = useState("15:30");
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [responsavelId, setResponsavelId] = useState<string>(userId);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const projeto = projetos.find((p) => p.id === projetoId) ?? null;

  useEffect(() => {
    if (!projetoId && projetos.length === 1) setProjetoId(projetos[0].id);
  }, [projetos, projetoId]);

  useEffect(() => {
    if (!perfil?.is_super_admin) return;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, codigo, nome, cliente:organizations!cliente_org_id(nome)")
        .in("status", ["planejamento", "execucao", "homologacao"])
        .order("codigo");
      if (data) {
        const lista = (data as unknown as { id: string; codigo: string; nome: string; cliente: { nome: string } | null }[]).map((p) => ({
          id: p.id,
          codigo: p.codigo,
          nome: p.nome,
          cliente: p.cliente?.nome ?? null,
          gerencia: true,
        }));
        setTodosProjetos(lista);
        await salvarCache("nova:projetos", lista);
      } else {
        const cache = await lerCache<Projeto[]>("nova:projetos");
        if (cache) setTodosProjetos(cache.valor);
      }
    })();
  }, [perfil?.is_super_admin]);

  // Quem gerencia o projeto escolhe o responsável; analista e prestador abrem só para si.
  useEffect(() => {
    setResponsavelId(userId);
    if (!projeto?.gerencia) {
      setResponsaveis([]);
      return;
    }
    const chave = `nova:responsaveis:${projeto.id}`;
    (async () => {
      const { data, error } = await supabase.rpc("fn_app_responsaveis", { p_project_id: projeto.id });
      if (!error && data) {
        setResponsaveis(data as Responsavel[]);
        await salvarCache(chave, data);
      } else {
        const cache = await lerCache<Responsavel[]>(chave);
        setResponsaveis(cache?.valor ?? []);
      }
    })();
  }, [projeto?.id, projeto?.gerencia, userId]);

  const nomeResponsavel =
    responsavelId === userId ? (perfil?.nome ?? "Você") : (responsaveis.find((r) => r.id === responsavelId)?.nome ?? "Responsável");

  async function registrar() {
    const novos: Record<string, string> = {};
    if (!projeto) novos.projeto = "Escolha o projeto.";
    if (titulo.trim().length < 3) novos.titulo = "Informe o título (ao menos 3 caracteres).";
    if (dia !== "sem_data") {
      if (!HORA.test(inicio)) novos.inicio = "Use HH:MM.";
      if (!HORA.test(fim)) novos.fim = "Use HH:MM.";
      if (HORA.test(inicio) && HORA.test(fim) && fim <= inicio) novos.fim = "O fim precisa ser depois do início.";
    }
    setErros(novos);
    if (Object.keys(novos).length || !projeto) return;

    const base = dia === "amanha" ? somarDias(inicioDoDia(), 1) : inicioDoDia();
    const id = randomUUID();
    setEnviando(true);
    try {
      await enfileirar({
        tipo: "abrir_os",
        os_id: id,
        project_id: projeto.id,
        payload: {
          tipo,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          inicio: dia === "sem_data" ? null : noDia(base, inicio).toISOString(),
          fim: dia === "sem_data" ? null : noDia(base, fim).toISOString(),
          executor_id: responsavelId,
          executor_nome: nomeResponsavel,
          projeto: { codigo: projeto.codigo, nome: projeto.nome },
        },
      });
      setTitulo("");
      setDescricao("");
      Alert.alert(
        "OS registrada",
        online ? "Ela recebe o número em instantes." : "Sem rede agora: a OS fica guardada e sobe assim que a conexão voltar.",
      );
      if (responsavelId === userId) router.push(`/os/${id}`);
    } finally {
      setEnviando(false);
    }
  }

  if (projetos.length === 0) {
    return (
      <View style={{ padding: espaco.lg }}>
        <Banner tom="info">Você ainda não está em nenhum projeto em que possa abrir OS. Peça ao gerente para incluir você na equipe.</Banner>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: espaco.lg, gap: espaco.lg }} keyboardShouldPersistTaps="handled">
        {!online ? <Banner tom="alerta">Sem conexão: a OS fica na fila e é enviada quando a rede voltar.</Banner> : null}

        <View style={{ gap: espaco.sm }}>
          <RotuloSecao>Cliente e projeto</RotuloSecao>
          {projetos.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setProjetoId(p.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: p.id === projetoId }}
              style={[estilos.opcao, p.id === projetoId && estilos.opcaoAtiva]}
            >
              <Text style={{ fontWeight: "600", color: p.id === projetoId ? cor.primaria : cor.texto }}>
                {p.cliente ? `${p.cliente} · ` : ""}
                {p.codigo}
              </Text>
              <Text style={{ color: cor.suave, fontSize: 13 }} numberOfLines={1}>
                {p.nome}
              </Text>
            </Pressable>
          ))}
          {erros.projeto ? <Text style={estilos.erro}>{erros.projeto}</Text> : null}
        </View>

        <View style={{ gap: espaco.sm }}>
          <RotuloSecao>Tipo</RotuloSecao>
          <View style={estilos.chips}>
            {TIPOS.map((t) => (
              <Chip key={t} rotulo={ROTULO_TIPO_OS[t]} ativo={tipo === t} onPress={() => setTipo(t)} />
            ))}
          </View>
        </View>

        <Cartao style={{ gap: espaco.md }}>
          <Campo rotulo="Título" value={titulo} onChangeText={setTitulo} erro={erros.titulo} placeholder="Ex.: Impressora fiscal sem comunicação" />
          <Campo rotulo="Descrição (opcional)" value={descricao} onChangeText={setDescricao} multiline placeholder="O que o cliente relatou" />
        </Cartao>

        <View style={{ gap: espaco.sm }}>
          <RotuloSecao>Data e horário</RotuloSecao>
          <View style={estilos.chips}>
            <Chip rotulo="Hoje" ativo={dia === "hoje"} onPress={() => setDia("hoje")} />
            <Chip rotulo="Amanhã" ativo={dia === "amanha"} onPress={() => setDia("amanha")} />
            <Chip rotulo="Sem data (rascunho)" ativo={dia === "sem_data"} onPress={() => setDia("sem_data")} />
          </View>
          {dia !== "sem_data" ? (
            <View style={{ flexDirection: "row", gap: espaco.md }}>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Início" value={inicio} onChangeText={setInicio} erro={erros.inicio} keyboardType="numbers-and-punctuation" maxLength={5} />
              </View>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Fim" value={fim} onChangeText={setFim} erro={erros.fim} keyboardType="numbers-and-punctuation" maxLength={5} />
              </View>
            </View>
          ) : (
            <Text style={{ color: cor.suave, fontSize: 13 }}>Sem data, a OS fica como rascunho para o gerente agendar.</Text>
          )}
        </View>

        <View style={{ gap: espaco.sm }}>
          <RotuloSecao>Responsável</RotuloSecao>
          {projeto?.gerencia && responsaveis.length > 0 ? (
            <View style={estilos.chips}>
              {responsaveis.map((r) => (
                <Chip key={r.id} rotulo={r.id === userId ? `${r.nome} (você)` : r.nome} ativo={responsavelId === r.id} onPress={() => setResponsavelId(r.id)} />
              ))}
            </View>
          ) : (
            <Text style={{ color: cor.texto }}>{perfil?.nome ?? "Você"} (você)</Text>
          )}
        </View>

        <Botao titulo="Registrar OS" carregando={enviando} onPress={() => void registrar()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Chip({ rotulo, ativo, onPress }: { rotulo: string; ativo: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: ativo }}
      style={[estilos.chip, ativo && estilos.chipAtivo]}
      hitSlop={4}
    >
      <Text style={{ fontWeight: "600", fontSize: 13.5, color: ativo ? cor.primaria : cor.texto }}>{rotulo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  opcao: { backgroundColor: cor.superficie, borderWidth: 1, borderColor: cor.borda, borderRadius: raio.cartao, padding: espaco.md, gap: 2, minHeight: 48 },
  opcaoAtiva: { borderColor: cor.primariaBorda, backgroundColor: cor.primariaSuave },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: espaco.sm },
  chip: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: raio.pilula,
    borderWidth: 1,
    borderColor: cor.borda,
    backgroundColor: cor.superficie,
  },
  chipAtivo: { borderColor: cor.primariaBorda, backgroundColor: cor.primariaSuave },
  erro: { color: cor.perigo, fontSize: 13 },
});
