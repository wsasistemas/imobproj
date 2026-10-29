import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useCallback } from "react";
import { Alert } from "react-native";
import { useFila } from "./fila";
import { posicaoAtual, type Ponto } from "./gps";
import type { EvidenceTipo, Os } from "./tipos";

export type ArquivoEvidencia = {
  uri: string;
  tipo: EvidenceTipo;
  mime: string;
  nome: string;
  capturadoEm?: Date;
  /** GPS já obtido (câmera); undefined = buscar agora. */
  ponto?: Ponto | null;
  descricao?: string | null;
};

function extensao(nome: string, mime: string) {
  const doNome = /\.([a-z0-9]{1,5})$/i.exec(nome)?.[1];
  if (doNome) return doNome.toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "bin";
}

/** Evidência entra na fila com hora e GPS do aparelho; o servidor grava a hora de recebimento. */
export function useEvidencias(os: Os | null) {
  const { enfileirar } = useFila();

  const registrar = useCallback(
    async (arquivo: ArquivoEvidencia) => {
      if (!os) return;
      const ponto = arquivo.ponto !== undefined ? arquivo.ponto : await posicaoAtual().catch(() => null);
      await enfileirar({
        tipo: "evidencia",
        os_id: os.id,
        project_id: os.project_id,
        arquivo: arquivo.uri,
        extensao: extensao(arquivo.nome, arquivo.mime),
        payload: {
          tipo: arquivo.tipo,
          content_type: arquivo.mime,
          nome: arquivo.nome,
          capturado_em: (arquivo.capturadoEm ?? new Date()).toISOString(),
          lat: ponto?.lat ?? null,
          lng: ponto?.lng ?? null,
          precisao: ponto?.precisao ?? null,
          descricao: arquivo.descricao?.trim() || null,
        },
      });
    },
    [os, enfileirar],
  );

  const escolherArquivo = useCallback(async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 50 * 1024 * 1024) {
      Alert.alert("Arquivo muito grande", "O limite é de 50 MB por arquivo.");
      return;
    }
    await registrar({ uri: a.uri, tipo: "arquivo", mime: a.mimeType ?? "application/octet-stream", nome: a.name });
  }, [registrar]);

  const escolherPrint = useCallback(async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    await registrar({ uri: a.uri, tipo: "print", mime: a.mimeType ?? "image/jpeg", nome: a.fileName ?? "print.jpg" });
  }, [registrar]);

  return { registrar, escolherArquivo, escolherPrint };
}
