import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FilaProvider } from "../lib/fila";
import { SessaoProvider, useSessao } from "../lib/sessao";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Rotas() {
  const { carregando, sessao, bloqueado } = useSessao();

  useEffect(() => {
    if (!carregando) SplashScreen.hideAsync().catch(() => {});
  }, [carregando]);
  if (carregando) return null;

  const liberado = !!sessao && !bloqueado;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={liberado}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!liberado}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function Raiz() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SessaoProvider>
        <FilaProvider>
          <Rotas />
        </FilaProvider>
      </SessaoProvider>
    </SafeAreaProvider>
  );
}
