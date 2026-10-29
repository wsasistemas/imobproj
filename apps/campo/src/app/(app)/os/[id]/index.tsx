import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Banner, Botao, CaixaMarcacao, Campo, Cartao, Linha, RotuloSecao, Selo } from "../../../../components/ui";
import { useApontamento } from "../../../../lib/apontamento";
import { useEvidencias } from "../../../../lib/evidencias";
import { useFila } from "../../../../lib/fila";
import { coordenadas, dataHora, formatarHoras, horario, horasEntre } from "../../../../lib/formato";
import { buscarEvidencias, buscarOs, useOsCarregadas, type EvidenciaComUrl } from "../../../../lib/os";
import { cor, espaco, raio } from "../../../../lib/tema";
import { ROTULO_EVIDENCIA, type EvidenceTipo } from "../../../../lib/tipos";

type Miniatura = { chave: string; tipo: EvidenceTipo; uri: string | null; quando: string; lat: number | null; lng: number | null; pendente: boolean; erro?: string | null; nome?: string };

export default function DetalheOs() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const buscar = useCallback(async () => {
    const os = await buscarOs(id);
    return os ? [os] : [];
  }, [id]);
  const { lista, cacheDe, erro, carregando } = useOsCarregadas(`os:${id}`, buscar);
  const os = lista?.[0] ?? null;

  const { itens, online, versao } = useFila();
  const { checkin, checkout, ocupado } = useApontamento();
  const { escolherArquivo, escolherPrint } = useEvidencias(os);
  const [enviadas, setEnviadas] = useState<EvidenciaComUrl[]>([]);
  const [relato, setRelato] = useState("");
  const [foraEscopo, setForaEscopo] = useState(false);
  const [erroRelato, setErroRelato] = useState<string | null>(null);

  useEffect(() => {
    if (!online) return;
    buscarEvidencias(id).then(setEnviadas).catch(() => {});
  }, [id, online, versao]);

  useEffect(() => {
    if (os?.relato) setRelato((atual) => atual || os.relato || "");
  }, [os?.relato]);

  if (!os) {
    return (
      <View style={{ padding: espaco.lg, gap: espaco.md }}>
        {carregando ? <Text style={{ color: cor.suave }}>Carregando…</Text> : null}
        {erro ? <Banner tom="perigo">{erro}</Banner> : null}
        {!carregando && !erro ? <Banner tom="alerta">OS não encontrada (ou ainda não disponível offline neste aparelho).</Banner> : null}
      </View>
    );
  }

  const pendentes: Miniatura[] = itens
    .filter((i) => i.os_id === os.id && i.tipo === "evidencia")
    .map((i) => {
      const p = i.tipo === "evidencia" ? i.payload : null;
      return {
        chave: i.id,
        tipo: p!.tipo,
        uri: p!.content_type.startsWith("image/") ? i.arquivo : null,
        quando: p!.capturado_em,
        lat: p!.lat,
        lng: p!.lng,
        pendente: true,
        erro: i.erro,
        nome: p!.nome,
      };
    });
  const miniaturas: Miniatura[] = [
    ...enviadas.map((e) => ({
      chave: e.id,
      tipo: e.tipo,
      uri: /\.(jpe?g|png|webp|heic)$/i.test(e.storage_path) ? e.url : null,
      quando: e.captured_at,
      lat: e.lat,
      lng: e.lng,
      pendente: false,
      nome: e.storage_path.split("/").pop(),
    })),
    ...pendentes,
  ];

  const emExecucao = os.status === "em_execucao";
  const horasAteAgora = os.checkin_at ? horasEntre(os.checkin_at, new Date()) : 0;

  async function aoFazerCheckout() {
    if (!os) return;
    if (relato.trim().length < 5) {
      setErroRelato("Descreva o que foi feito (ao menos 5 caracteres).");
      return;
    }
    setErroRelato(null);
    const continuar = await new Promise<boolean>((resolver) =>
      Alert.alert(
        "Check-out e enviar para aceite?",
        `${formatarHoras(horasAteAgora)} desde o check-in${miniaturas.length === 0 ? ". Nenhuma evidência foi registrada." : ` · ${miniaturas.length} evidência(s).`}`,
        [
          { text: "Voltar", style: "cancel", onPress: () => resolver(false) },
          { text: "Enviar", onPress: () => resolver(true) },
        ],
        { cancelable: true, onDismiss: () => resolver(false) },
      ),
    );
    if (!continuar) return;
    if (await checkout(os, relato, foraEscopo)) {
      Alert.alert("Enviada para aceite", online ? "O usuário-chave foi avisado." : "Sem rede agora: o envio acontece assim que a conexão voltar.");
      router.back();
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: `OS ${os.numero}` }} />
      <ScrollView contentContainerStyle={{ padding: espaco.lg, gap: espaco.lg }} keyboardShouldPersistTaps="handled">
        {cacheDe ? <Banner tom="alerta">Sem conexão: dados de {dataHora(new Date(cacheDe))}.</Banner> : null}

        <Cartao style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: cor.suave, fontWeight: "600" }}>
              OS {os.numero} · {os.projeto?.codigo}
            </Text>
            <Selo status={os.status} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: cor.texto }}>{os.titulo}</Text>
          {os.descricao ? <Text style={{ color: cor.suave }}>{os.descricao}</Text> : null}
          <Linha rotulo="Horário" valor={horario(os.agendada_inicio, os.agendada_fim)} />
          <Linha rotulo="Local" valor={os.local ?? "Não informado"} />
          {os.checkin_at ? <Linha rotulo="Check-in" valor={dataHora(new Date(os.checkin_at))} /> : null}
          {os.checkout_at ? <Linha rotulo="Check-out" valor={dataHora(new Date(os.checkout_at))} /> : null}
          {os.checkout_at || emExecucao ? <Linha rotulo={emExecucao ? "Horas até agora" : "Horas"} valor={formatarHoras(emExecucao ? horasAteAgora : os.horas)} /> : null}
        </Cartao>

        {os.status === "agendada" ? (
          <Botao titulo="Fazer check-in" carregando={ocupado === os.id} onPress={() => void checkin(os)} />
        ) : null}

        {os.status === "recusada" && os.aceite_comentario ? (
          <Banner tom="perigo">Recusada: {os.aceite_comentario}</Banner>
        ) : null}

        <View>
          <RotuloSecao>Evidências ({miniaturas.length})</RotuloSecao>
          {emExecucao ? (
            <View style={estilos.grade}>
              <AcaoEvidencia rotulo="Foto" simbolo="📷" onPress={() => router.push(`/os/${os.id}/camera`)} />
              <AcaoEvidencia rotulo="Arquivo" simbolo="📎" onPress={() => void escolherArquivo()} />
              <AcaoEvidencia rotulo="Print" simbolo="🖼️" onPress={() => void escolherPrint()} />
              <AcaoEvidencia rotulo="Assinatura" simbolo="✍️" onPress={() => router.push(`/os/${os.id}/assinatura`)} />
            </View>
          ) : null}
          <View style={{ gap: espaco.sm, marginTop: emExecucao ? espaco.md : 0 }}>
            {miniaturas.length === 0 ? <Text style={{ color: cor.suave }}>Nenhuma evidência ainda.</Text> : null}
            {miniaturas.map((m) => (
              <View key={m.chave} style={estilos.evidencia}>
                {m.uri ? (
                  <Image source={{ uri: m.uri }} style={estilos.miniatura} contentFit="cover" />
                ) : (
                  <View style={[estilos.miniatura, { alignItems: "center", justifyContent: "center" }]}>
                    <Text style={{ fontSize: 22 }}>{m.tipo === "assinatura" ? "✍️" : "📄"}</Text>
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: "600", color: cor.texto }} numberOfLines={1}>
                    {ROTULO_EVIDENCIA[m.tipo]}
                    {m.tipo === "arquivo" && m.nome ? ` · ${m.nome}` : ""}
                  </Text>
                  <Text style={{ color: cor.suave, fontSize: 13 }}>
                    {dataHora(new Date(m.quando))} · {coordenadas(m.lat, m.lng)}
                  </Text>
                  <Text style={{ fontSize: 12.5, fontWeight: "600", color: m.erro ? cor.perigo : m.pendente ? cor.alerta : cor.sucesso }}>
                    {m.erro ? `Erro: ${m.erro}` : m.pendente ? "Aguardando envio" : "Enviada"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {emExecucao ? (
          <Cartao style={{ gap: espaco.md }}>
            <Campo
              rotulo="Descrição do que foi feito"
              value={relato}
              onChangeText={setRelato}
              multiline
              erro={erroRelato}
              placeholder="Ex.: configurado o backup diário e testada a restauração."
            />
            <CaixaMarcacao marcado={foraEscopo} aoMudar={setForaEscopo} rotulo="Fora do escopo" />
            {foraEscopo ? <Banner tom="alerta">O gerente vai avaliar e abrir a proposta de escopo.</Banner> : null}
            <Botao titulo="Check-out e enviar para aceite" carregando={ocupado === os.id} onPress={() => void aoFazerCheckout()} />
          </Cartao>
        ) : os.relato ? (
          <Cartao>
            <RotuloSecao>Descrição</RotuloSecao>
            <Text style={{ color: cor.texto }}>{os.relato}</Text>
            {os.fora_escopo ? <Text style={{ color: cor.alerta, marginTop: 6, fontWeight: "600" }}>Marcada como fora do escopo</Text> : null}
          </Cartao>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AcaoEvidencia({ rotulo, simbolo, onPress }: { rotulo: string; simbolo: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Adicionar ${rotulo.toLowerCase()}`}
      style={({ pressed }) => [estilos.acao, pressed && { backgroundColor: cor.primariaSuave, borderColor: cor.primariaBorda }]}
    >
      <Text style={{ fontSize: 24 }}>{simbolo}</Text>
      <Text style={{ fontWeight: "600", color: cor.texto }}>{rotulo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  grade: { flexDirection: "row", flexWrap: "wrap", gap: espaco.sm },
  acao: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 76,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: cor.borda,
    backgroundColor: cor.superficie,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  evidencia: {
    flexDirection: "row",
    gap: espaco.md,
    alignItems: "center",
    backgroundColor: cor.superficie,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: cor.borda,
    padding: espaco.sm,
  },
  miniatura: { width: 64, height: 64, borderRadius: 10, backgroundColor: cor.bordaSuave },
});
