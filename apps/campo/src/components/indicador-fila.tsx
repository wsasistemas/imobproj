import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFila } from "../lib/fila";
import { cor } from "../lib/tema";

/** Selo no cabeçalho: offline, sincronizando ou "N pendentes" (toque abre o Perfil, que lista a fila). */
export function IndicadorFila() {
  const { itens, online, sincronizando } = useFila();
  const comErro = itens.some((i) => i.erro);
  if (online && itens.length === 0 && !sincronizando) {
    return (
      <View style={estilos.selo} accessibilityLabel="Tudo sincronizado">
        <View style={[estilos.ponto, { backgroundColor: "#22C55E" }]} />
        <Text style={estilos.texto}>Sincronizado</Text>
      </View>
    );
  }
  const rotulo = !online
    ? `Offline${itens.length ? ` · ${itens.length}` : ""}`
    : sincronizando
      ? "Enviando…"
      : `${itens.length} pendente${itens.length === 1 ? "" : "s"}`;
  return (
    <Pressable
      onPress={() => router.push("/perfil")}
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}. Abrir pendências`}
      style={[estilos.selo, comErro && { backgroundColor: "#7F1D1D" }]}
      hitSlop={8}
    >
      {sincronizando ? (
        <ActivityIndicator size="small" color="#FFF" />
      ) : (
        <View style={[estilos.ponto, { backgroundColor: !online ? "#9CA3AF" : comErro ? "#F87171" : "#FBBF24" }]} />
      )}
      <Text style={estilos.texto}>{rotulo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  selo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: cor.cabecalhoHover,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 12,
  },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  texto: { color: cor.cabecalhoTexto, fontSize: 12.5, fontWeight: "600" },
});
