import * as Location from "expo-location";

export type Ponto = { lat: number; lng: number; precisao: number | null };

/**
 * Posição atual para check-in/evidência. Sem permissão devolve null (quem chama avisa).
 * Em local fechado o GPS pode demorar: depois de 12 s usa a última posição conhecida.
 */
export async function posicaoAtual(): Promise<Ponto | null> {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) return null;
  const limite = new Promise<null>((resolver) => setTimeout(() => resolver(null), 12_000));
  const atual = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  const pos = (await Promise.race([atual, limite])) ?? (await Location.getLastKnownPositionAsync().catch(() => null));
  if (!pos) return null;
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, precisao: pos.coords.accuracy ?? null };
}
