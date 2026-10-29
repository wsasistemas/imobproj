// Assinatura do cliente na tela: traços em SVG capturados como PNG.

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState, type ComponentRef } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { Banner, Botao, Campo } from "../../../../components/ui";
import { useEvidencias } from "../../../../lib/evidencias";
import { dataHora } from "../../../../lib/formato";
import { buscarOs, useOsCarregadas } from "../../../../lib/os";
import { cor, espaco, raio } from "../../../../lib/tema";

export default function Assinatura() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const buscar = useCallback(async () => {
    const os = await buscarOs(id);
    return os ? [os] : [];
  }, [id]);
  const os = useOsCarregadas(`os:${id}`, buscar).lista?.[0] ?? null;
  const { registrar } = useEvidencias(os);
  const insets = useSafeAreaInsets();

  const quadro = useRef<ComponentRef<typeof View>>(null);
  const [tracos, setTracos] = useState<string[]>([]);
  const atual = useRef<string>("");
  const [, redesenhar] = useState(0);
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gestos = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          atual.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
          redesenhar((n) => n + 1);
        },
        onPanResponderMove: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          atual.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
          redesenhar((n) => n + 1);
        },
        onPanResponderRelease: () => {
          const traco = atual.current;
          atual.current = "";
          if (traco) setTracos((t) => [...t, traco]);
        },
      }),
    [],
  );

  async function salvar() {
    if (tracos.length === 0) {
      setErro("Peça para o cliente assinar no quadro.");
      return;
    }
    if (nome.trim().length < 3) {
      setErro("Informe o nome de quem assinou.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const uri = await captureRef(quadro, { format: "png", result: "tmpfile" });
      await registrar({ uri, tipo: "assinatura", mime: "image/png", nome: "assinatura.png", descricao: `Assinado por ${nome.trim()}` });
      router.back();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a assinatura.");
      setSalvando(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: espaco.lg, paddingBottom: insets.bottom + espaco.lg, gap: espaco.md }}>
      {erro ? <Banner tom="perigo">{erro}</Banner> : null}
      <Campo rotulo="Nome de quem assina" value={nome} onChangeText={setNome} autoCapitalize="words" placeholder="Nome completo" />
      <View ref={quadro} collapsable={false} style={estilos.quadro} {...gestos.panHandlers}>
        <Svg style={StyleSheet.absoluteFill}>
          {[...tracos, atual.current].filter(Boolean).map((d, i) => (
            <Path key={i} d={d} stroke="#111827" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
        </Svg>
        <View pointerEvents="none" style={estilos.linhaBase}>
          <Text style={estilos.legenda}>
            {os ? `OS ${os.numero} · ${os.projeto?.codigo ?? ""} · ${dataHora(new Date())}` : ""}
          </Text>
        </View>
        {tracos.length === 0 && !atual.current ? (
          <Text pointerEvents="none" style={estilos.dica}>
            Assine aqui
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: espaco.md }}>
        <Botao titulo="Limpar" variante="secundario" style={{ flex: 1 }} onPress={() => setTracos([])} disabled={salvando} />
        <Botao titulo="Salvar assinatura" style={{ flex: 1 }} carregando={salvando} disabled={!os} onPress={() => void salvar()} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  quadro: { flex: 1, minHeight: 240, backgroundColor: "#FFFFFF", borderRadius: raio.cartao, borderWidth: 1, borderColor: cor.borda, overflow: "hidden" },
  linhaBase: { position: "absolute", left: 16, right: 16, bottom: 28, borderTopWidth: 1, borderTopColor: "#9CA3AF", paddingTop: 4 },
  legenda: { fontSize: 11, color: cor.suave },
  dica: { position: "absolute", alignSelf: "center", top: "40%", color: "#D1D5DB", fontSize: 22, fontWeight: "600" },
});
