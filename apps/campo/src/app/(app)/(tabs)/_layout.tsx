import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { IndicadorFila } from "../../../components/indicador-fila";
import { useSessao } from "../../../lib/sessao";
import { cor } from "../../../lib/tema";

const icone = (simbolo: string) =>
  function Icone({ color }: { color: ColorValue }) {
    return <Text style={{ fontSize: 20, color }}>{simbolo}</Text>;
  };

export default function LayoutAbas() {
  const { aprovador, abreOs } = useSessao();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: cor.cabecalho },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "600" },
        headerRight: () => <IndicadorFila />,
        tabBarActiveTintColor: cor.primaria,
        tabBarInactiveTintColor: cor.suave,
        tabBarStyle: { minHeight: 60, paddingTop: 4 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        sceneStyle: { backgroundColor: cor.fundo },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Hoje", tabBarIcon: icone("☀︎") }} />
      {/* Abrir OS direto pelo celular (D2): gerente, diretor, analista, prestador ou super admin. */}
      <Tabs.Screen name="nova" options={{ title: "+ Nova", headerTitle: "Nova OS", tabBarIcon: icone("＋"), href: abreOs ? undefined : null }} />
      <Tabs.Screen name="agenda" options={{ title: "Agenda", tabBarIcon: icone("▦") }} />
      {/* Só diretor/usuário-chave (ou super admin) aprova OS. */}
      <Tabs.Screen name="aceites" options={{ title: "Aceites", tabBarIcon: icone("✓"), href: aprovador ? undefined : null }} />
      <Tabs.Screen name="perfil" options={{ title: "Perfil", tabBarIcon: icone("◉") }} />
    </Tabs>
  );
}
