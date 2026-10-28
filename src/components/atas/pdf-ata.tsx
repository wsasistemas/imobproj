import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { ROTULO_PAPEL, SITUACAO_ATA, type PapelMembro } from "@/lib/projeto/tipos";
import {
  formatarData,
  formatarDataHora,
  formatarHorario,
  numeroAta,
  SITUACAO_ENCAMINHAMENTO,
  type AtaDetalhe,
} from "./dados";

// Documento A4 da ata (react-pdf). Carregado só sob demanda (import dinâmico em botao-pdf.tsx).
// Cores fixas aqui são intencionais: o PDF é impresso/arquivado e não segue o tema da tela.

const COR = { texto: "#1F2937", muted: "#6B7280", borda: "#E5E7EB", cabecalho: "#F3F4F6", destaque: "#1D4ED8" };

const s = StyleSheet.create({
  pagina: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, fontSize: 10, fontFamily: "Helvetica", color: COR.texto },
  topo: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: COR.destaque, paddingBottom: 8, marginBottom: 14 },
  marca: { fontSize: 9, color: COR.muted, letterSpacing: 1 },
  projeto: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  titulo: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitulo: { fontSize: 10, color: COR.muted, marginBottom: 2 },
  secao: { marginTop: 16 },
  rotulo: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: COR.muted, letterSpacing: 0.8, marginBottom: 6 },
  linhaLista: { flexDirection: "row", marginBottom: 3 },
  numero: { width: 18, color: COR.muted },
  tabela: { borderWidth: 1, borderColor: COR.borda, borderRadius: 3 },
  thead: { flexDirection: "row", backgroundColor: COR.cabecalho, borderBottomWidth: 1, borderBottomColor: COR.borda },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COR.borda },
  th: { padding: 5, fontSize: 8, fontFamily: "Helvetica-Bold", color: COR.muted },
  td: { padding: 5 },
  vazio: { color: COR.muted, fontStyle: "italic" },
  rodape: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: COR.muted },
});

export type DadosPdfAta = {
  projeto: { codigo: string; nome: string };
  ata: AtaDetalhe;
  papeis: Record<string, PapelMembro>;
  geradoEm: Date;
};

function Lista({ itens, vazio }: { itens: string[]; vazio: string }) {
  if (itens.length === 0) return <Text style={s.vazio}>{vazio}</Text>;
  return (
    <View>
      {itens.map((t, i) => (
        <View key={i} style={s.linhaLista} wrap={false}>
          <Text style={s.numero}>{i + 1}.</Text>
          <Text style={{ flex: 1 }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export function PdfAta({ projeto, ata, papeis, geradoEm }: DadosPdfAta) {
  const horario = formatarHorario(ata.inicio, ata.fim);
  const colsP = [{ w: "34%" }, { w: "22%" }, { w: "14%" }, { w: "30%" }];
  const colsE = [{ w: "37%" }, { w: "20%" }, { w: "14%" }, { w: "17%" }, { w: "12%" }];

  return (
    <Document title={`${numeroAta(ata.numero)} - ${ata.titulo}`} author="IMOBPROJ" subject={`${projeto.codigo} · ${projeto.nome}`} language="pt-BR">
      <Page size="A4" style={s.pagina}>
        <View style={s.topo} fixed>
          <View>
            <Text style={s.marca}>IMOBPROJ · ATA DE REUNIÃO</Text>
            <Text style={s.projeto}>
              {projeto.codigo} · {projeto.nome}
            </Text>
          </View>
          <Text style={{ fontSize: 9, color: COR.muted }}>{SITUACAO_ATA[ata.status].label}</Text>
        </View>

        <Text style={s.titulo}>
          {numeroAta(ata.numero)} — {ata.titulo}
        </Text>
        <Text style={s.subtitulo}>
          {formatarData(ata.data, "EEEE, dd 'de' MMMM 'de' yyyy")}
          {horario ? ` · ${horario}` : ""}
          {ata.local ? ` · ${ata.local}` : ""}
        </Text>
        <Text style={s.subtitulo}>Redator: {ata.redator ?? "—"}</Text>

        <View style={s.secao}>
          <Text style={s.rotulo}>PARTICIPANTES</Text>
          {ata.participantes.length === 0 ? (
            <Text style={s.vazio}>Nenhum participante registrado.</Text>
          ) : (
            <View style={s.tabela}>
              <View style={s.thead}>
                {["NOME", "PAPEL", "PRESENÇA", "CIÊNCIA"].map((h, i) => (
                  <Text key={h} style={[s.th, { width: colsP[i].w }]}>
                    {h}
                  </Text>
                ))}
              </View>
              {ata.participantes.map((p, i) => {
                const papel = papeis[p.user_id];
                const daCiencia = papel === "diretor" || papel === "usuario_chave";
                return (
                  <View key={p.id} style={[s.tr, i === ata.participantes.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
                    <Text style={[s.td, { width: colsP[0].w }]}>{p.nome}</Text>
                    <Text style={[s.td, { width: colsP[1].w }]}>{papel ? ROTULO_PAPEL[papel] : "—"}</Text>
                    <Text style={[s.td, { width: colsP[2].w }]}>{p.presenca === "presente" ? "Presente" : "Ausente"}</Text>
                    <Text style={[s.td, { width: colsP[3].w }]}>
                      {p.ciente_em ? formatarDataHora(p.ciente_em) : daCiencia ? "Pendente" : "Não se aplica"}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={s.secao}>
          <Text style={s.rotulo}>PAUTA</Text>
          <Lista itens={ata.pauta} vazio="Sem itens de pauta." />
        </View>

        <View style={s.secao}>
          <Text style={s.rotulo}>DECISÕES</Text>
          <Lista itens={ata.decisoes} vazio="Nenhuma decisão registrada." />
        </View>

        <View style={s.secao}>
          <Text style={s.rotulo}>ENCAMINHAMENTOS</Text>
          {ata.encaminhamentos.length === 0 ? (
            <Text style={s.vazio}>Nenhum encaminhamento.</Text>
          ) : (
            <View style={s.tabela}>
              <View style={s.thead}>
                {["AÇÃO", "RESPONSÁVEL", "PRAZO", "SITUAÇÃO", "NA EAP"].map((h, i) => (
                  <Text key={h} style={[s.th, { width: colsE[i].w }]}>
                    {h}
                  </Text>
                ))}
              </View>
              {ata.encaminhamentos.map((e, i) => (
                <View key={e.id} style={[s.tr, i === ata.encaminhamentos.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
                  <Text style={[s.td, { width: colsE[0].w }]}>{e.acao}</Text>
                  <Text style={[s.td, { width: colsE[1].w }]}>{e.responsavel ?? "A definir"}</Text>
                  <Text style={[s.td, { width: colsE[2].w }]}>{formatarData(e.prazo)}</Text>
                  <Text style={[s.td, { width: colsE[3].w }]}>{SITUACAO_ENCAMINHAMENTO[e.status].label}</Text>
                  <Text style={[s.td, { width: colsE[4].w }]}>
                    {e.vincular_cronograma ? (e.item ? e.item.codigo : "Sim") : "Não"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={s.rodape} fixed>
          <Text>Gerado em {formatarDataHora(geradoEm.toISOString())} · IMOBPROJ</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
