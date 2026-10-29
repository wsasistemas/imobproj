// Componentes do design system mobile (PARTE B adaptada): botões vermelhos ≥ 48 px, cartões brancos
// com raio 14, selos em pílula e campos com rótulo.

import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { ALTURA_MINIMA_BOTAO, cor, espaco, raio, texto } from "../lib/tema";
import { SITUACAO, type OsStatus } from "../lib/tipos";

type VarianteBotao = "primario" | "secundario" | "perigo" | "fantasma";

export function Botao({
  titulo,
  variante = "primario",
  carregando,
  disabled,
  icone,
  style,
  ...resto
}: PressableProps & { titulo: string; variante?: VarianteBotao; carregando?: boolean; icone?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const inativo = disabled || carregando;
  const corTexto = variante === "primario" || variante === "perigo" ? "#FFFFFF" : variante === "fantasma" ? cor.primaria : cor.texto;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inativo, busy: !!carregando }}
      disabled={inativo}
      style={({ pressed }) => [
        estilos.botao,
        variante === "primario" && { backgroundColor: pressed ? cor.primariaPressionada : cor.primaria },
        variante === "perigo" && { backgroundColor: pressed ? "#991B1B" : cor.perigo },
        variante === "secundario" && { backgroundColor: pressed ? cor.bordaSuave : cor.superficie, borderWidth: 1, borderColor: cor.borda },
        variante === "fantasma" && { backgroundColor: pressed ? cor.primariaSuave : "transparent" },
        inativo && { opacity: 0.55 },
        style,
      ]}
      {...resto}
    >
      {carregando ? <ActivityIndicator color={corTexto} /> : icone}
      <Text style={[estilos.botaoTexto, { color: corTexto }]}>{titulo}</Text>
    </Pressable>
  );
}

export function Cartao({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[estilos.cartao, style]}>{children}</View>;
}

export function Selo({ status }: { status: OsStatus }) {
  const s = SITUACAO[status];
  return (
    <View style={[estilos.selo, { backgroundColor: s.fundo }]}>
      <Text style={[estilos.seloTexto, { color: s.texto }]}>{s.rotulo}</Text>
    </View>
  );
}

export function RotuloSecao({ children }: { children: ReactNode }) {
  return <Text style={[texto.rotuloSecao, { marginBottom: espaco.sm }]}>{children}</Text>;
}

export function Campo({ rotulo, erro, style, ...resto }: TextInputProps & { rotulo: string; erro?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        placeholderTextColor="#9CA3AF"
        style={[estilos.campo, !!erro && { borderColor: cor.perigo }, resto.multiline && { minHeight: 96, textAlignVertical: "top", paddingTop: 12 }, style]}
        accessibilityLabel={rotulo}
        {...resto}
      />
      {erro ? <Text style={{ color: cor.perigo, fontSize: 13 }}>{erro}</Text> : null}
    </View>
  );
}

export function CaixaMarcacao({ marcado, aoMudar, rotulo }: { marcado: boolean; aoMudar: (v: boolean) => void; rotulo: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcado }}
      onPress={() => aoMudar(!marcado)}
      style={estilos.caixaLinha}
      hitSlop={6}
    >
      <View style={[estilos.caixa, marcado && { backgroundColor: cor.primaria, borderColor: cor.primaria }]}>
        {marcado ? <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>✓</Text> : null}
      </View>
      <Text style={[texto.corpo, { flex: 1 }]}>{rotulo}</Text>
    </Pressable>
  );
}

export function Banner({ children, tom = "info" }: { children: ReactNode; tom?: "info" | "alerta" | "perigo" }) {
  const t = {
    info: { fundo: cor.bannerInfoFundo, borda: cor.bannerInfoBorda, texto: cor.info },
    alerta: { fundo: cor.alertaFundo, borda: "#FCD34D", texto: cor.alerta },
    perigo: { fundo: cor.perigoFundo, borda: cor.primariaBorda, texto: cor.perigo },
  }[tom];
  return (
    <View style={[estilos.banner, { backgroundColor: t.fundo, borderColor: t.borda }]}>
      <Text style={{ color: t.texto, fontSize: 13.5, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}

export function Vazio({ titulo, texto: descricao }: { titulo: string; texto?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 24, gap: 6 }}>
      <Text style={{ fontSize: 16, fontWeight: "600", color: cor.texto, textAlign: "center" }}>{titulo}</Text>
      {descricao ? <Text style={{ color: cor.suave, textAlign: "center" }}>{descricao}</Text> : null}
    </View>
  );
}

export function Linha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <View style={estilos.linha}>
      <Text style={{ color: cor.suave, fontSize: 13.5 }}>{rotulo}</Text>
      <Text style={{ color: cor.texto, fontSize: 14.5, fontWeight: "500", flexShrink: 1, textAlign: "right" }}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  botao: {
    minHeight: ALTURA_MINIMA_BOTAO,
    borderRadius: raio.botao,
    paddingHorizontal: espaco.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espaco.sm,
  },
  botaoTexto: { fontSize: 16, fontWeight: "600" },
  cartao: {
    backgroundColor: cor.superficie,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: cor.borda,
    padding: espaco.lg,
  },
  selo: { alignSelf: "flex-start", borderRadius: raio.pilula, paddingHorizontal: 10, paddingVertical: 3 },
  seloTexto: { fontSize: 12.5, fontWeight: "600" },
  rotulo: { fontSize: 14, fontWeight: "600", color: cor.texto },
  campo: {
    minHeight: ALTURA_MINIMA_BOTAO,
    borderWidth: 1,
    borderColor: cor.borda,
    borderRadius: raio.botao,
    paddingHorizontal: 14,
    fontSize: 16,
    color: cor.texto,
    backgroundColor: cor.superficie,
  },
  caixaLinha: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: ALTURA_MINIMA_BOTAO },
  caixa: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: cor.superficie,
  },
  banner: { borderWidth: 1, borderRadius: 10, padding: 12 },
  linha: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6 },
});
