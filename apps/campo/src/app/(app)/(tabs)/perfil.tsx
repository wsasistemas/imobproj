import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
import { Botao, Cartao, Linha, RotuloSecao } from "../../../components/ui";
import { useFila } from "../../../lib/fila";
import { dataHora } from "../../../lib/formato";
import { biometriaDisponivel, useSessao } from "../../../lib/sessao";
import { cor, espaco, texto } from "../../../lib/tema";
import { ROTULO_EVIDENCIA } from "../../../lib/tipos";

const PAPEL: Record<string, string> = {
  diretor: "Diretor",
  gerente: "Gerente",
  usuario_chave: "Usuário-chave",
  analista: "Analista",
  prestador: "Prestador",
};

export default function Perfil() {
  const { perfil, sessao, vinculos, sair, biometriaAtiva, definirBiometria } = useSessao();
  const { itens, online, sincronizando, sincronizar, descartar } = useFila();
  const [temBiometria, setTemBiometria] = useState(false);

  useEffect(() => {
    void biometriaDisponivel().then(setTemBiometria);
  }, []);

  function confirmarSaida() {
    const aviso = itens.length
      ? `Há ${itens.length} item(ns) ainda não enviados. Eles continuam guardados neste aparelho e sobem no próximo login.`
      : "Você vai precisar do e-mail e da senha para entrar de novo.";
    Alert.alert("Sair do app?", aviso, [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: () => void sair() },
    ]);
  }

  function confirmarDescarte(id: string) {
    Alert.alert("Descartar este item?", "Ele não será enviado ao servidor. Fotos e assinaturas descartadas se perdem.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Descartar", style: "destructive", onPress: () => void descartar(id) },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: espaco.lg, gap: espaco.lg }}>
      <View>
        <Text style={texto.titulo}>{perfil?.nome ?? "Perfil"}</Text>
        <Text style={texto.subtitulo}>{perfil?.email ?? sessao?.user.email}</Text>
      </View>

      <Cartao>
        <RotuloSecao>Dados</RotuloSecao>
        <Linha rotulo="E-mail" valor={perfil?.email ?? sessao?.user.email ?? "—"} />
        <Linha rotulo="WhatsApp" valor={perfil?.telefone_whatsapp ?? "—"} />
        {vinculos.map((v) => (
          <Linha key={v.project_id} rotulo={v.projeto?.codigo ?? "Projeto"} valor={PAPEL[v.role] ?? v.role} />
        ))}
      </Cartao>

      <Cartao>
        <RotuloSecao>Sincronização</RotuloSecao>
        <Text style={{ color: cor.suave, marginBottom: espaco.md }}>
          {!online
            ? "Sem conexão. O que você registrar fica guardado e sobe quando a rede voltar."
            : itens.length
              ? `${itens.length} item(ns) aguardando envio.`
              : "Tudo enviado."}
        </Text>
        {itens.map((i) => (
          <View key={i.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: cor.bordaSuave, gap: 4 }}>
            <Text style={{ fontWeight: "600", color: cor.texto }}>
              {i.tipo === "abrir_os"
                ? `OS nova · ${i.payload.titulo}`
                : i.tipo === "checkin"
                  ? "Check-in"
                  : i.tipo === "checkout"
                    ? "Check-out"
                    : ROTULO_EVIDENCIA[i.payload.tipo]}
              <Text style={{ color: cor.suave, fontWeight: "400" }}> · {dataHora(new Date(i.criado_em))}</Text>
            </Text>
            {i.erro ? (
              <>
                <Text style={{ color: cor.perigo, fontSize: 13 }}>Não enviado: {i.erro}</Text>
                <Botao titulo="Descartar" variante="secundario" onPress={() => confirmarDescarte(i.id)} />
              </>
            ) : null}
          </View>
        ))}
        {itens.length ? (
          <Botao titulo="Enviar agora" carregando={sincronizando} disabled={!online} onPress={() => void sincronizar()} style={{ marginTop: espaco.md }} />
        ) : null}
      </Cartao>

      {temBiometria ? (
        <Cartao>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "600", color: cor.texto }}>Desbloquear com biometria</Text>
              <Text style={{ color: cor.suave, fontSize: 13 }}>Digital ou Face ID ao abrir o app</Text>
            </View>
            <Switch
              value={biometriaAtiva}
              onValueChange={(v) => void definirBiometria(v)}
              trackColor={{ true: cor.primaria, false: "#D1D5DB" }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Desbloquear com biometria"
            />
          </View>
        </Cartao>
      ) : null}

      <Botao titulo="Sair" variante="secundario" onPress={confirmarSaida} />
      <Text style={{ textAlign: "center", color: "#9CA3AF", fontSize: 12 }}>IMOBPROJ Campo {Constants.expoConfig?.version}</Text>
    </ScrollView>
  );
}
