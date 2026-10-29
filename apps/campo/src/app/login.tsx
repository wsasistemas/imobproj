import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, Botao, CaixaMarcacao, Campo } from "../components/ui";
import { biometriaDisponivel, useSessao } from "../lib/sessao";
import { supabase } from "../lib/supabase";
import { cor, espaco, raio } from "../lib/tema";

export default function Login() {
  const { entrar, bloqueado, desbloquear, sair, biometriaAtiva, definirBiometria, ultimoEmail } = useSessao();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState(ultimoEmail);
  const [senha, setSenha] = useState("");
  const [manter, setManter] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => setEmail((atual) => atual || ultimoEmail), [ultimoEmail]);

  // Sessão salva + biometria ligada: pede a digital/Face ID assim que a tela abre.
  useEffect(() => {
    if (bloqueado) void desbloquear();
  }, [bloqueado, desbloquear]);

  async function aoEntrar() {
    setErro(null);
    if (!email.trim() || !senha) {
      setErro("Informe e-mail e senha.");
      return;
    }
    setEnviando(true);
    const falha = await entrar(email, senha, manter);
    setEnviando(false);
    if (falha) {
      setErro(falha);
      return;
    }
    // Depois do primeiro login, oferece a biometria (só faz sentido com "Manter conectado").
    if (manter && !biometriaAtiva && (await biometriaDisponivel())) {
      Alert.alert("Entrar com biometria?", "Nas próximas vezes, desbloqueie o app com a digital ou o Face ID.", [
        { text: "Agora não", style: "cancel" },
        { text: "Ativar", onPress: () => void definirBiometria(true) },
      ]);
    }
  }

  async function esqueciSenha() {
    if (!email.trim()) {
      setErro("Digite seu e-mail para receber o link de redefinição.");
      return;
    }
    const portal = process.env.EXPO_PUBLIC_PORTAL_URL;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: portal ? `${portal.replace(/\/$/, "")}/auth/callback?next=/redefinir-senha` : undefined,
    });
    if (error) {
      setErro(/network|fetch/i.test(error.message) ? "Sem conexão. Tente de novo com internet." : error.message);
      return;
    }
    Alert.alert("Verifique seu e-mail", `Se ${email.trim()} tiver acesso, você vai receber um link para criar uma nova senha.`);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: cor.cabecalho }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={estilos.marca}>
          <View style={estilos.logo}>
            <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 18 }}>IP</Text>
          </View>
          <Text style={estilos.nome}>IMOBPROJ</Text>
          <Text style={estilos.sub}>App de campo</Text>
        </View>

        <View style={estilos.cartao}>
          {bloqueado ? (
            <View style={{ gap: espaco.md }}>
              <Text style={estilos.titulo}>App bloqueado</Text>
              <Text style={{ color: cor.suave }}>Use a biometria do aparelho para continuar como {ultimoEmail}.</Text>
              <Botao titulo="Desbloquear com biometria" onPress={() => void desbloquear()} />
              <Botao titulo="Entrar com senha" variante="secundario" onPress={() => void sair()} />
            </View>
          ) : (
            <View style={{ gap: espaco.lg }}>
              <Text style={estilos.titulo}>Entrar</Text>
              {erro ? <Banner tom="perigo">{erro}</Banner> : null}
              <Campo
                rotulo="E-mail"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                placeholder="voce@suaempresa.com.br"
              />
              <Campo
                rotulo="Senha"
                value={senha}
                onChangeText={setSenha}
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                onSubmitEditing={() => void aoEntrar()}
                returnKeyType="go"
              />
              <CaixaMarcacao marcado={manter} aoMudar={setManter} rotulo="Manter conectado" />
              <Botao titulo="Entrar" carregando={enviando} onPress={() => void aoEntrar()} />
              <Botao titulo="Esqueci a senha" variante="fantasma" onPress={() => void esqueciSenha()} />
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { flexGrow: 1, paddingHorizontal: espaco.lg, gap: espaco.xl },
  marca: { alignItems: "center", gap: 6 },
  logo: { width: 56, height: 56, borderRadius: 28, backgroundColor: cor.primaria, alignItems: "center", justifyContent: "center" },
  nome: { color: "#FFF", fontSize: 20, fontWeight: "700", letterSpacing: 1.5 },
  sub: { color: cor.cabecalhoRotulo, fontSize: 14 },
  cartao: { backgroundColor: cor.superficie, borderRadius: raio.cartao, padding: espaco.xl },
  titulo: { fontSize: 22, fontWeight: "700", color: cor.texto },
});
