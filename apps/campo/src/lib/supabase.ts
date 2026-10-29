// Cliente Supabase do app (mesmo projeto do portal). Segue o tutorial oficial do Supabase para Expo:
// a sessão é grande demais para o SecureStore (limite de ~2 KB), então ela vai criptografada (AES-256)
// para o AsyncStorage e só a chave fica no SecureStore.

import "react-native-get-random-values";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as aesjs from "aes-js";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";

class LargeSecureStore {
  private async criptografar(chave: string, valor: string) {
    const bytesChave = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cifra = new aesjs.ModeOfOperation.ctr(bytesChave, new aesjs.Counter(1));
    const cifrado = cifra.encrypt(aesjs.utils.utf8.toBytes(valor));
    await SecureStore.setItemAsync(chave, aesjs.utils.hex.fromBytes(bytesChave));
    return aesjs.utils.hex.fromBytes(cifrado);
  }

  private async decifrar(chave: string, valor: string) {
    const hexChave = await SecureStore.getItemAsync(chave);
    if (!hexChave) return null;
    const cifra = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(hexChave), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cifra.decrypt(aesjs.utils.hex.toBytes(valor)));
  }

  async getItem(chave: string) {
    const cifrado = await AsyncStorage.getItem(chave);
    return cifrado ? this.decifrar(chave, cifrado) : null;
  }

  async removeItem(chave: string) {
    await AsyncStorage.removeItem(chave);
    await SecureStore.deleteItemAsync(chave);
  }

  async setItem(chave: string, valor: string) {
    await AsyncStorage.setItem(chave, await this.criptografar(chave, valor));
  }
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const chaveAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !chaveAnon) {
  throw new Error("Configure EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no .env (veja .env.example).");
}

// Banco compartilhado pelos sistemas IMOBSYSTEMS: as tabelas do IMOBPROJ ficam no schema "imobproj".
export const supabase = createClient(url, chaveAnon, {
  db: { schema: "imobproj" },
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Renova o token só com o app em primeiro plano.
AppState.addEventListener("change", (estado) => {
  if (estado === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export const BUCKET_EVIDENCIAS = "imobproj-evidencias";
