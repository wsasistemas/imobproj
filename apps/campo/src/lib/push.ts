// Notificações push (Expo). O servidor enfileira em push_outbox quando uma OS é atribuída, aprovada
// ou recusada (trigger fn_push_os_notificar) e a Edge Function push-send entrega pelo Expo Push.

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export const CANAL_OS = "os";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Pede permissão, obtém o token do aparelho e grava em push_tokens. Silencioso quando não dá. */
export async function registrarPush() {
  try {
    if (!Device.isDevice) return; // simulador não tem token
    if (Platform.OS === "android") {
      // No Android 13+ a permissão só aparece depois que existe um canal.
      await Notifications.setNotificationChannelAsync(CANAL_OS, {
        name: "Ordens de Serviço",
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: "#D52B36",
      });
    }
    let permissao = await Notifications.getPermissionsAsync();
    if (permissao.status !== "granted") permissao = await Notifications.requestPermissionsAsync();
    if (permissao.status !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn("Push: rode `npx eas-cli@latest init` para gravar o projectId do EAS no app.json.");
      return;
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.rpc("fn_push_registrar_token", { p_token: token, p_plataforma: Platform.OS === "ios" ? "ios" : "android" });
  } catch (e) {
    console.warn("Push: não foi possível registrar o aparelho.", e); // ex.: offline — tenta no próximo login
  }
}
