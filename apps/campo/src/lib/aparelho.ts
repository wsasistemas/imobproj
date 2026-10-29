// Registro do aparelho no portal (App de OS → Aparelhos conectados): modelo, sistema, versão do app,
// último acesso e quantos itens estão parados na fila offline. Silencioso: sem rede, tenta na próxima vez.

import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";

const CHAVE_ID = "campo.aparelho_id";

async function idDoAparelho() {
  let id = await SecureStore.getItemAsync(CHAVE_ID);
  if (!id) {
    id = randomUUID();
    await SecureStore.setItemAsync(CHAVE_ID, id);
  }
  return id;
}

export async function registrarAparelho(pendencias: number) {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.rpc("fn_app_registrar_aparelho", {
      p_id: await idDoAparelho(),
      p_modelo: Device.modelName ?? null,
      p_sistema: Device.osName ? `${Device.osName} ${Device.osVersion ?? ""}`.trim() : null,
      p_versao: Constants.expoConfig?.version ?? null,
      p_pendencias: pendencias,
    });
  } catch {
    // sem rede ou servidor sem a Fase 5: não atrapalha o uso do app
  }
}
