import { useCallback, useMemo } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { CartaoOs } from "../../../components/cartao-os";
import { Banner, Vazio } from "../../../components/ui";
import { dataHora, formatarHoras } from "../../../lib/formato";
import { buscarAguardandoAceite, useOsCarregadas } from "../../../lib/os";
import { useSessao } from "../../../lib/sessao";
import { cor, espaco, texto } from "../../../lib/tema";

/** OS aguardando aceite nos projetos em que a pessoa é usuário-chave ou diretor. */
export default function Aceites() {
  const { sessao, vinculos, perfil } = useSessao();
  const projetos = useMemo(
    () =>
      perfil?.is_super_admin
        ? vinculos.map((v) => v.project_id)
        : vinculos.filter((v) => v.role === "usuario_chave" || v.role === "diretor").map((v) => v.project_id),
    [vinculos, perfil],
  );
  const buscar = useCallback(() => buscarAguardandoAceite(projetos), [projetos]);
  const chave = sessao ? `aceites:${sessao.user.id}:${projetos.join(",")}` : null;
  const { lista, cacheDe, erro, carregando, recarregar } = useOsCarregadas(chave, buscar);

  return (
    <FlatList
      data={lista ?? []}
      keyExtractor={(os) => os.id}
      contentContainerStyle={{ padding: espaco.lg, gap: espaco.md }}
      refreshControl={<RefreshControl refreshing={carregando && !!lista} onRefresh={() => void recarregar()} tintColor={cor.primaria} />}
      ListHeaderComponent={
        <View style={{ gap: espaco.md, marginBottom: espaco.sm }}>
          <View>
            <Text style={texto.titulo}>Aceites</Text>
            <Text style={texto.subtitulo}>OS executadas aguardando sua aprovação</Text>
          </View>
          {cacheDe ? <Banner tom="alerta">Sem conexão: lista de {dataHora(new Date(cacheDe))}. Aprovar e recusar precisam de internet.</Banner> : null}
          {erro ? <Banner tom="perigo">{erro}</Banner> : null}
        </View>
      }
      ListEmptyComponent={carregando ? undefined : <Vazio titulo="Nada para aprovar" texto="Quando um executor enviar uma OS para aceite, ela aparece aqui." />}
      renderItem={({ item: os }) => (
        <CartaoOs
          os={os}
          destino="aceite"
          rodape={
            <Text style={{ color: cor.suave }}>
              {os.executor?.nome ?? "Executor"} · {formatarHoras(os.horas)}
              {os.fora_escopo ? " · fora do escopo" : ""}
            </Text>
          }
        />
      )}
    />
  );
}
