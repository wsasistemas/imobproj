import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { CartaoOs } from "../../../components/cartao-os";
import { Banner, Vazio } from "../../../components/ui";
import { data, dataHora, diaCurto, inicioDaSemana, mesmoDia, somarDias } from "../../../lib/formato";
import { buscarMinhasOs, useOsCarregadas } from "../../../lib/os";
import { useSessao } from "../../../lib/sessao";
import { cor, espaco, texto } from "../../../lib/tema";

/** Semana do usuário (domingo a sábado), com navegação entre semanas e as OS agrupadas por dia. */
export default function Agenda() {
  const { sessao } = useSessao();
  const userId = sessao?.user.id ?? null;
  const [inicio, setInicio] = useState(() => inicioDaSemana());
  const fim = useMemo(() => somarDias(inicio, 7), [inicio]);
  const buscar = useCallback(() => buscarMinhasOs(userId!, inicio, fim, false), [userId, inicio, fim]);
  const { lista, cacheDe, erro, carregando, recarregar } = useOsCarregadas(userId ? `agenda:${userId}:${inicio.toISOString()}` : null, buscar);
  const hoje = new Date();
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));

  return (
    <ScrollView
      contentContainerStyle={{ padding: espaco.lg, gap: espaco.lg }}
      refreshControl={<RefreshControl refreshing={carregando && !!lista} onRefresh={() => void recarregar()} tintColor={cor.primaria} />}
    >
      <View style={estilos.navegacao}>
        <Pressable accessibilityRole="button" accessibilityLabel="Semana anterior" onPress={() => setInicio((d) => somarDias(d, -7))} style={estilos.seta}>
          <Text style={estilos.setaTexto}>‹</Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={[texto.titulo, { fontSize: 18 }]}>
            {data(inicio).slice(0, 5)} a {data(somarDias(inicio, 6)).slice(0, 5)}
          </Text>
          <Pressable onPress={() => setInicio(inicioDaSemana())} accessibilityRole="button">
            <Text style={{ color: cor.primaria, fontWeight: "600", paddingVertical: 4 }}>Esta semana</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Próxima semana" onPress={() => setInicio((d) => somarDias(d, 7))} style={estilos.seta}>
          <Text style={estilos.setaTexto}>›</Text>
        </Pressable>
      </View>

      {cacheDe ? <Banner tom="alerta">Sem conexão: mostrando os dados de {dataHora(new Date(cacheDe))}.</Banner> : null}
      {erro ? <Banner tom="perigo">{erro}</Banner> : null}

      {dias.map((dia) => {
        const doDia = (lista ?? []).filter((os) => os.agendada_inicio && mesmoDia(new Date(os.agendada_inicio), dia));
        const ehHoje = mesmoDia(dia, hoje);
        return (
          <View key={dia.toISOString()} style={{ gap: espaco.sm }}>
            <View style={estilos.cabecalhoDia}>
              <View style={[estilos.numeroDia, ehHoje && { backgroundColor: cor.primaria }]}>
                <Text style={[estilos.numeroTexto, ehHoje && { color: "#FFF" }]}>{dia.getDate()}</Text>
              </View>
              <Text style={[estilos.nomeDia, ehHoje && { color: cor.primaria }]}>{diaCurto(dia)}</Text>
              <Text style={{ color: cor.suave, marginLeft: "auto" }}>
                {doDia.length ? `${doDia.length} OS` : ""}
              </Text>
            </View>
            {doDia.length === 0 ? (
              <Text style={{ color: "#9CA3AF", paddingLeft: 44 }}>Sem OS</Text>
            ) : (
              doDia.map((os) => <CartaoOs key={os.id} os={os} />)
            )}
          </View>
        );
      })}
      {!carregando && lista && lista.length === 0 ? <Vazio titulo="Semana livre" texto="Nenhuma OS agendada para você nesta semana." /> : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  navegacao: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seta: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: cor.superficie, borderWidth: 1, borderColor: cor.borda },
  setaTexto: { fontSize: 26, color: cor.texto, marginTop: -2 },
  cabecalhoDia: { flexDirection: "row", alignItems: "center", gap: 10 },
  numeroDia: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  numeroTexto: { fontSize: 16, fontWeight: "700", color: cor.texto },
  nomeDia: { fontSize: 14, fontWeight: "700", color: cor.suave, textTransform: "uppercase" },
});
