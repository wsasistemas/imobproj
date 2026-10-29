// Foto da evidência com marca d'água (OS, data/hora e GPS) gravada na própria imagem.
// A foto é composta numa View (imagem + faixa de texto) e capturada com react-native-view-shot.

import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { Image, PixelRatio, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";
import { Botao } from "../../../../components/ui";
import { useEvidencias } from "../../../../lib/evidencias";
import { coordenadas, dataHora } from "../../../../lib/formato";
import { posicaoAtual, type Ponto } from "../../../../lib/gps";
import { buscarOs, useOsCarregadas } from "../../../../lib/os";
import { cor, espaco } from "../../../../lib/tema";

const LARGURA_FINAL = 1600; // px da imagem gravada

type Foto = { uri: string; largura: number; altura: number; em: Date };

export default function Camera() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const buscar = useCallback(async () => {
    const os = await buscarOs(id);
    return os ? [os] : [];
  }, [id]);
  const os = useOsCarregadas(`os:${id}`, buscar).lista?.[0] ?? null;
  const { registrar } = useEvidencias(os);
  const insets = useSafeAreaInsets();

  const [permissao, pedirPermissao] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const composicao = useRef<ComponentRef<typeof View>>(null);
  const [pronta, setPronta] = useState(false);
  const [foto, setFoto] = useState<Foto | null>(null);
  const [imagemCarregada, setImagemCarregada] = useState(false);
  const [ponto, setPonto] = useState<Ponto | null | undefined>(undefined);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // GPS em paralelo desde que a câmera abre.
  useEffect(() => {
    posicaoAtual()
      .then(setPonto)
      .catch(() => setPonto(null));
  }, []);

  async function fotografar() {
    if (!camera.current || !pronta) return;
    setErro(null);
    try {
      const r = await camera.current.takePictureAsync({ quality: 0.8 });
      if (r) {
        setImagemCarregada(false);
        setFoto({ uri: r.uri, largura: r.width, altura: r.height, em: new Date() });
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível tirar a foto.");
    }
  }

  async function usarFoto() {
    if (!foto || !composicao.current || !os) return;
    setSalvando(true);
    try {
      const escala = LARGURA_FINAL / foto.largura;
      const uri = await captureRef(composicao, {
        format: "jpg",
        quality: 0.85,
        result: "tmpfile",
        width: LARGURA_FINAL / PixelRatio.get(),
        height: (foto.altura * escala) / PixelRatio.get(),
      });
      await registrar({ uri, tipo: "foto", mime: "image/jpeg", nome: "foto.jpg", capturadoEm: foto.em, ponto: ponto ?? null });
      router.back();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a foto.");
      setSalvando(false);
    }
  }

  if (!permissao) return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  if (!permissao.granted) {
    return (
      <View style={[estilos.centro, { paddingTop: insets.top }]}>
        <Text style={estilos.aviso}>Permita o uso da câmera para fotografar as evidências.</Text>
        <Botao titulo="Permitir câmera" onPress={() => void pedirPermissao()} />
        <Botao titulo="Voltar" variante="secundario" onPress={() => router.back()} />
      </View>
    );
  }

  const marca = os
    ? `OS ${os.numero} · ${os.projeto?.codigo ?? ""}\n${dataHora(foto?.em ?? new Date())} · ${ponto === undefined ? "obtendo GPS…" : coordenadas(ponto?.lat, ponto?.lng)}`
    : "";

  if (foto) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top, paddingBottom: insets.bottom + espaco.md }}>
        <View style={estilos.previa}>
          <View ref={composicao} collapsable={false} style={{ width: "100%", aspectRatio: foto.largura / foto.altura }}>
            <Image source={{ uri: foto.uri }} style={StyleSheet.absoluteFill} onLoad={() => setImagemCarregada(true)} resizeMode="cover" />
            <View style={estilos.faixa}>
              <Text style={estilos.marcaTexto}>{marca}</Text>
            </View>
          </View>
        </View>
        {erro ? <Text style={[estilos.aviso, { color: "#FCA5A5" }]}>{erro}</Text> : null}
        <View style={estilos.botoes}>
          <Botao titulo="Refazer" variante="secundario" style={{ flex: 1 }} onPress={() => setFoto(null)} disabled={salvando} />
          <Botao
            titulo={ponto === undefined ? "Aguardando GPS…" : "Usar foto"}
            style={{ flex: 1 }}
            carregando={salvando}
            disabled={!imagemCarregada || ponto === undefined || !os}
            onPress={() => void usarFoto()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setPronta(true)} />
      <View style={[estilos.topo, { paddingTop: insets.top + espaco.sm }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Fechar câmera" style={estilos.fechar} hitSlop={8}>
          <Text style={{ color: "#FFF", fontSize: 22 }}>✕</Text>
        </Pressable>
        <Text style={[estilos.marcaTexto, { flex: 1, textAlign: "right" }]}>{marca}</Text>
      </View>
      {erro ? <Text style={[estilos.aviso, { position: "absolute", bottom: 160, alignSelf: "center", color: "#FCA5A5" }]}>{erro}</Text> : null}
      <View style={[estilos.disparoArea, { paddingBottom: insets.bottom + 28 }]}>
        <Pressable
          onPress={() => void fotografar()}
          disabled={!pronta}
          accessibilityRole="button"
          accessibilityLabel="Tirar foto"
          style={({ pressed }) => [estilos.disparo, pressed && { transform: [{ scale: 0.94 }] }, !pronta && { opacity: 0.5 }]}
        >
          <View style={estilos.disparoMiolo} />
        </Pressable>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, backgroundColor: cor.cabecalho, padding: espaco.xl, justifyContent: "center", gap: espaco.md },
  aviso: { color: "#FFF", fontSize: 15, textAlign: "center", marginBottom: espaco.sm },
  previa: { flex: 1, justifyContent: "center" },
  faixa: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 8 },
  marcaTexto: { color: "#FFF", fontSize: 13, fontWeight: "600", lineHeight: 18 },
  botoes: { flexDirection: "row", gap: espaco.md, paddingHorizontal: espaco.lg, paddingTop: espaco.md },
  topo: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: espaco.lg, paddingBottom: espaco.sm, backgroundColor: "rgba(0,0,0,0.35)" },
  fechar: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  disparoArea: { position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center" },
  disparo: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: "#FFF", alignItems: "center", justifyContent: "center" },
  disparoMiolo: { width: 60, height: 60, borderRadius: 30, backgroundColor: cor.primaria },
});
