import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { horario } from "../lib/formato";
import { cor, espaco, raio } from "../lib/tema";
import type { Os } from "../lib/tipos";
import { Selo } from "./ui";

export function CartaoOs({ os, rodape, destino = "os" }: { os: Os; rodape?: ReactNode; destino?: "os" | "aceite" }) {
  return (
    <View style={estilos.cartao}>
      <Pressable
        onPress={() => router.push(destino === "os" ? `/os/${os.id}` : `/aceite/${os.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`OS ${os.numero}: ${os.titulo}`}
        style={({ pressed }) => [estilos.corpo, pressed && { backgroundColor: cor.bordaSuave }]}
      >
        <View style={estilos.topo}>
          <Text style={estilos.numero}>
            OS {os.numero} · {os.projeto?.codigo ?? ""}
          </Text>
          <Selo status={os.status} />
        </View>
        <Text style={estilos.titulo} numberOfLines={2}>
          {os.titulo}
        </Text>
        <View style={estilos.meta}>
          <Text style={estilos.metaTexto}>🕒 {horario(os.agendada_inicio, os.agendada_fim)}</Text>
          <Text style={estilos.metaTexto} numberOfLines={1}>
            📍 {os.local ?? "Local não informado"}
          </Text>
        </View>
      </Pressable>
      {rodape ? <View style={estilos.rodape}>{rodape}</View> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cor.superficie, borderRadius: raio.cartao, borderWidth: 1, borderColor: cor.borda, overflow: "hidden" },
  corpo: { padding: espaco.lg, gap: 6 },
  topo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  numero: { fontSize: 13, fontWeight: "600", color: cor.suave },
  titulo: { fontSize: 16.5, fontWeight: "600", color: cor.texto },
  meta: { gap: 2, marginTop: 2 },
  metaTexto: { fontSize: 14, color: cor.suave },
  rodape: { paddingHorizontal: espaco.lg, paddingBottom: espaco.lg },
});
