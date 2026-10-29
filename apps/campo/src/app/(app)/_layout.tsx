import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { cor } from "../../lib/tema";

function abrirDaNotificacao(resposta: Notifications.NotificationResponse | null) {
  const osId = resposta?.notification.request.content.data?.os_id;
  if (typeof osId === "string") router.push(`/os/${osId}`);
}

export default function LayoutApp() {
  // Toque na notificação (OS atribuída, aprovada ou recusada) abre a OS.
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(abrirDaNotificacao).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(abrirDaNotificacao);
    return () => sub.remove();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: cor.cabecalho },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: cor.fundo },
        headerBackTitle: "Voltar",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="os/[id]/index" options={{ title: "Ordem de Serviço" }} />
      <Stack.Screen name="os/[id]/camera" options={{ title: "Foto da evidência", headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="os/[id]/assinatura" options={{ title: "Assinatura do cliente", presentation: "modal" }} />
      <Stack.Screen name="aceite/[id]" options={{ title: "Aceite da OS" }} />
    </Stack>
  );
}
