import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useFila } from "./fila";
import { posicaoAtual, type Ponto } from "./gps";
import type { Os } from "./tipos";

/** Pergunta se segue sem GPS (permissão negada ou sem sinal). */
function confirmarSemGps(acao: string) {
  return new Promise<boolean>((resolver) =>
    Alert.alert(
      "Localização indisponível",
      `Não foi possível obter o GPS. O ${acao} fica registrado sem localização. Para gravar o GPS, permita a localização nas configurações e tente ao ar livre.`,
      [
        { text: "Cancelar", style: "cancel", onPress: () => resolver(false) },
        { text: `Fazer ${acao} sem GPS`, onPress: () => resolver(true) },
      ],
      { cancelable: true, onDismiss: () => resolver(false) },
    ),
  );
}

async function gpsOuConfirmacao(acao: string): Promise<Ponto | null | false> {
  const ponto = await posicaoAtual();
  if (ponto) return ponto;
  return (await confirmarSemGps(acao)) ? null : false;
}

/** Check-in e check-out vão para a fila offline com a hora do aparelho e o GPS; o servidor grava a hora de recebimento. */
export function useApontamento() {
  const { enfileirar } = useFila();
  const [ocupado, setOcupado] = useState<string | null>(null);

  const checkin = useCallback(
    async (os: Os) => {
      setOcupado(os.id);
      try {
        const ponto = await gpsOuConfirmacao("check-in");
        if (ponto === false) return false;
        await enfileirar({
          tipo: "checkin",
          os_id: os.id,
          project_id: os.project_id,
          payload: { em: new Date().toISOString(), lat: ponto?.lat ?? null, lng: ponto?.lng ?? null },
        });
        return true;
      } finally {
        setOcupado(null);
      }
    },
    [enfileirar],
  );

  const checkout = useCallback(
    async (os: Os, relato: string, foraEscopo: boolean) => {
      setOcupado(os.id);
      try {
        const ponto = await gpsOuConfirmacao("check-out");
        if (ponto === false) return false;
        await enfileirar({
          tipo: "checkout",
          os_id: os.id,
          project_id: os.project_id,
          payload: {
            em: new Date().toISOString(),
            lat: ponto?.lat ?? null,
            lng: ponto?.lng ?? null,
            relato: relato.trim(),
            fora_escopo: foraEscopo,
          },
        });
        return true;
      } finally {
        setOcupado(null);
      }
    },
    [enfileirar],
  );

  return { checkin, checkout, ocupado };
}
