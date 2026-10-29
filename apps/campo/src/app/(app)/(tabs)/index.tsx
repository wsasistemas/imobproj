import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { CartaoOs } from "../../../components/cartao-os";
import { Banner, Botao, Vazio } from "../../../components/ui";
import { useApontamento } from "../../../lib/apontamento";
import { dataHora, dataPorExtenso, inicioDoDia, somarDias } from "../../../lib/formato";
import { buscarMinhasOs, useOsCarregadas } from "../../../lib/os";
import { useSessao } from "../../../lib/sessao";
import { cor, espaco, texto } from "../../../lib/tema";

export default function Hoje() {
  const { sessao, perfil } = useSessao();
  const userId = sessao?.user.id ?? null;
  const hoje = useMemo(() => inicioDoDia(), []);
  const buscar = useCallback(() => buscarMinhasOs(userId!, hoje, somarDias(hoje, 1), true), [userId, hoje]);
  const { lista, cacheDe, erro, carregando, recarregar } = useOsCarregadas(userId ? `hoje:${userId}:${hoje.toISOString()}` : null, buscar);
  const { checkin, ocupado } = useApontamento();

  return (
    <FlatList
      data={lista ?? []}
      keyExtractor={(os) => os.id}
      contentContainerStyle={{ padding: espaco.lg, gap: espaco.md }}
      refreshControl={<RefreshControl refreshing={carregando && !!lista} onRefresh={() => void recarregar()} tintColor={cor.primaria} />}
      ListHeaderComponent={
        <View style={{ gap: espaco.md, marginBottom: espaco.sm }}>
          <View>
            <Text style={texto.titulo}>Olá, {perfil?.nome?.split(" ")[0] ?? ""}</Text>
            <Text style={texto.subtitulo}>{dataPorExtenso(new Date())}</Text>
          </View>
          {cacheDe ? <Banner tom="alerta">Sem conexão: mostrando os dados de {dataHora(new Date(cacheDe))}.</Banner> : null}
          {erro ? <Banner tom="perigo">{erro}</Banner> : null}
        </View>
      }
      ListEmptyComponent={
        carregando ? undefined : <Vazio titulo="Nenhuma OS para hoje" texto="As OS atribuídas a você aparecem aqui no dia agendado." />
      }
      renderItem={({ item: os }) => (
        <CartaoOs
          os={os}
          rodape={
            os.status === "agendada" ? (
              <Botao
                titulo="Fazer check-in"
                carregando={ocupado === os.id}
                onPress={async () => {
                  if (await checkin(os)) router.push(`/os/${os.id}`);
                }}
              />
            ) : os.status === "em_execucao" ? (
              <Botao titulo="Registrar evidências" variante="secundario" onPress={() => router.push(`/os/${os.id}`)} />
            ) : null
          }
        />
      )}
    />
  );
}
