import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Banner, Botao, Campo, Cartao, Linha, RotuloSecao, Selo } from "../../../components/ui";
import { useFila } from "../../../lib/fila";
import { coordenadas, dataHora, formatarHoras, horario } from "../../../lib/formato";
import { buscarEvidencias, buscarOs, decidirAceite, useOsCarregadas, type EvidenciaComUrl } from "../../../lib/os";
import { cor, espaco } from "../../../lib/tema";
import { ROTULO_EVIDENCIA } from "../../../lib/tipos";

/** Aprovar ou recusar uma OS (usuário-chave/diretor). Recusa exige comentário (também validado no banco). */
export default function Aceite() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const buscar = useCallback(async () => {
    const os = await buscarOs(id);
    return os ? [os] : [];
  }, [id]);
  const { lista, carregando, erro: erroCarga } = useOsCarregadas(`os:${id}`, buscar);
  const os = lista?.[0] ?? null;
  const { online } = useFila();
  const [evidencias, setEvidencias] = useState<EvidenciaComUrl[]>([]);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"aprovada" | "recusada" | null>(null);

  useEffect(() => {
    if (online) buscarEvidencias(id).then(setEvidencias).catch(() => {});
  }, [id, online]);

  async function decidir(decisao: "aprovada" | "recusada") {
    if (decisao === "recusada" && comentario.trim().length < 5) {
      setErro("Para recusar, explique o motivo no comentário (ao menos 5 caracteres).");
      return;
    }
    setErro(null);
    setEnviando(decisao);
    try {
      await decidirAceite(id, decisao, comentario);
      Alert.alert(decisao === "aprovada" ? "OS aprovada" : "OS recusada", "O executor foi avisado.");
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Não foi possível registrar.";
      setErro(/network|fetch/i.test(msg) ? "Sem conexão. Aprovar e recusar precisam de internet." : msg);
    } finally {
      setEnviando(null);
    }
  }

  if (!os) {
    return (
      <View style={{ padding: espaco.lg }}>
        {carregando ? <Text style={{ color: cor.suave }}>Carregando…</Text> : <Banner tom="perigo">{erroCarga ?? "OS não encontrada."}</Banner>}
      </View>
    );
  }

  const podeDecidir = os.status === "aguardando_aceite";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: espaco.lg, gap: espaco.lg }} keyboardShouldPersistTaps="handled">
        <Cartao style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: cor.suave, fontWeight: "600" }}>
              OS {os.numero} · {os.projeto?.codigo}
            </Text>
            <Selo status={os.status} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: cor.texto }}>{os.titulo}</Text>
          <Linha rotulo="Executor" valor={os.executor?.nome ?? "—"} />
          <Linha rotulo="Agendada" valor={horario(os.agendada_inicio, os.agendada_fim)} />
          {os.checkin_at ? <Linha rotulo="Check-in" valor={dataHora(new Date(os.checkin_at))} /> : null}
          {os.checkout_at ? <Linha rotulo="Check-out" valor={dataHora(new Date(os.checkout_at))} /> : null}
          <Linha rotulo="Horas" valor={formatarHoras(os.horas)} />
          {os.fora_escopo ? <Text style={{ color: cor.alerta, fontWeight: "600" }}>Marcada como fora do escopo</Text> : null}
        </Cartao>

        {os.relato ? (
          <Cartao>
            <RotuloSecao>Descrição do executor</RotuloSecao>
            <Text style={{ color: cor.texto }}>{os.relato}</Text>
          </Cartao>
        ) : null}

        <View>
          <RotuloSecao>Evidências ({evidencias.length})</RotuloSecao>
          {!online ? <Text style={{ color: cor.suave }}>Conecte-se para ver as evidências.</Text> : null}
          <View style={{ gap: espaco.sm }}>
            {evidencias.map((e) => (
              <Cartao key={e.id} style={{ padding: espaco.sm, gap: 6 }}>
                {e.url && /\.(jpe?g|png|webp)$/i.test(e.storage_path) ? (
                  <Image source={{ uri: e.url }} style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 10 }} contentFit="contain" />
                ) : null}
                <Text style={{ fontWeight: "600", color: cor.texto }}>
                  {ROTULO_EVIDENCIA[e.tipo]}
                  {e.descricao ? ` · ${e.descricao}` : ""}
                </Text>
                <Text style={{ color: cor.suave, fontSize: 13 }}>
                  {dataHora(new Date(e.captured_at))} · {coordenadas(e.lat, e.lng)}
                </Text>
              </Cartao>
            ))}
          </View>
        </View>

        {podeDecidir ? (
          <Cartao style={{ gap: espaco.md }}>
            {erro ? <Banner tom="perigo">{erro}</Banner> : null}
            <Campo rotulo="Comentário (obrigatório para recusar)" value={comentario} onChangeText={setComentario} multiline placeholder="Ex.: faltou a foto do painel após a configuração." />
            <Botao titulo="Aprovar OS" carregando={enviando === "aprovada"} disabled={!!enviando} onPress={() => void decidir("aprovada")} />
            <Botao titulo="Recusar OS" variante="secundario" carregando={enviando === "recusada"} disabled={!!enviando} onPress={() => void decidir("recusada")} />
          </Cartao>
        ) : (
          <Banner>Esta OS não está mais aguardando aceite.</Banner>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
