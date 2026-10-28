// Edge Function openwa-groups — cria o grupo no WhatsApp e sincroniza participantes com wa_group_members.
//
// Entrada: POST { acao: "criar" | "sincronizar", group_id }, com o JWT do usuário (verify_jwt = true).
// Permissão: super_admin ou gerente do projeto do grupo (fn_has_role(project_id, ['gerente']) com a sessão do usuário).
//
//   criar        POST /sessions/:sid/groups {name: wa_groups.nome, participants: telefones de wa_group_members}
//                → grava wa_groups.wa_group_id (e session_id, se estava vazio). Grupo que já tem wa_group_id → 409.
//   sincronizar  GET  /sessions/:sid/groups/:gid → compara participantes com wa_group_members:
//                adiciona os que faltam, remove os que sobram (nunca o próprio número da sessão nem o dono do grupo)
//                e promove a admin quem tem is_admin.
// Resposta 200: { ok: true, wa_group_id, adicionados: [...], removidos: [...], promovidos: [...] }.

import { json, preflight } from "../_shared/cors.ts";
import {
  adicionarParticipantes,
  criarGrupo,
  jidDoTelefone,
  lerGrupo,
  mesmoTelefone,
  promoverParticipantes,
  removerParticipantes,
  soDigitos,
  telefoneDoJid,
} from "../_shared/openwa.ts";
import { clienteServico, mensagemDe, usuarioDaRequisicao } from "../_shared/supabase.ts";
import { COLUNAS_SESSAO, credencialDaSessao, lerConfigOpenwa, type SessaoWa } from "../_shared/vault.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Grupo = { id: string; project_id: string; session_id: string | null; nome: string; wa_group_id: string | null };
type Membro = { telefone: string; is_admin: boolean };

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  let acao: string;
  let groupId: string;
  try {
    const corpo = (await req.json()) as { acao?: unknown; group_id?: unknown };
    acao = String(corpo.acao ?? "");
    groupId = String(corpo.group_id ?? "");
  } catch {
    return json(400, { erro: "Corpo inválido: envie { acao, group_id }." });
  }
  if (acao !== "criar" && acao !== "sincronizar") return json(400, { erro: 'acao deve ser "criar" ou "sincronizar".' });
  if (!UUID.test(groupId)) return json(400, { erro: "group_id inválido." });

  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return json(401, { erro: "Sessão inválida." });

    const admin = clienteServico();
    const { data: g } = await admin
      .from("wa_groups")
      .select("id, project_id, session_id, nome, wa_group_id")
      .eq("id", groupId)
      .maybeSingle();
    const grupo = g as Grupo | null;
    if (!grupo) return json(404, { erro: "Grupo não encontrado." });

    const { data: pode, error: erroPapel } = await usuario.cliente.rpc("fn_has_role", {
      p_project_id: grupo.project_id,
      p_roles: ["gerente"],
    });
    if (erroPapel || pode !== true) return json(403, { erro: "Só o super admin ou o gerente do projeto administra os grupos." });

    const cfg = await lerConfigOpenwa(admin);
    if (!cfg.ativo) return json(409, { erro: "O OpenWA está desligado na administração." });

    let sessao: SessaoWa | null = null;
    const consulta = admin.from("wa_sessions").select(COLUNAS_SESSAO);
    const { data: s } = grupo.session_id
      ? await consulta.eq("id", grupo.session_id).maybeSingle()
      : await consulta.eq("project_id", grupo.project_id).limit(1).maybeSingle();
    sessao = s as SessaoWa | null;
    if (!sessao?.openwa_session_id) return json(409, { erro: "Projeto sem sessão do OpenWA (ou sem o id da sessão no OpenWA)." });
    const cred = credencialDaSessao(cfg, sessao);
    if (!cred.url || !cred.apiKey) return json(409, { erro: "OpenWA sem endereço ou API key configurados." });

    const { data: m } = await admin.from("wa_group_members").select("telefone, is_admin").eq("group_id", grupo.id);
    const membros = ((m as Membro[] | null) ?? []).filter((x) => soDigitos(x.telefone).length >= 10);
    const proprio = soDigitos(sessao.numero);
    const desejados = membros.filter((x) => !mesmoTelefone(x.telefone, proprio));

    if (acao === "criar") {
      if (grupo.wa_group_id) return json(409, { erro: "Este grupo já existe no WhatsApp. Use sincronizar." });
      if (desejados.length === 0) return json(400, { erro: "Cadastre ao menos um participante com telefone antes de criar o grupo." });
      const r = await criarGrupo(cred.url, cred.apiKey, sessao.openwa_session_id, grupo.nome, desejados.map((x) => jidDoTelefone(x.telefone)));
      if (!r.ok) return json(502, { erro: r.erro });
      const waGroupId = r.dados?.id;
      if (!waGroupId) return json(502, { erro: "O OpenWA não devolveu o id do grupo." });
      const { error } = await admin
        .from("wa_groups")
        .update({ wa_group_id: waGroupId, session_id: grupo.session_id ?? sessao.id })
        .eq("id", grupo.id);
      if (error) return json(500, { erro: `Grupo criado no WhatsApp (${waGroupId}), mas não foi gravado: ${error.message}` });

      const admins = desejados.filter((x) => x.is_admin).map((x) => jidDoTelefone(x.telefone));
      if (admins.length) await promoverParticipantes(cred.url, cred.apiKey, sessao.openwa_session_id, waGroupId, admins);
      return json(200, { ok: true, wa_group_id: waGroupId, adicionados: desejados.map((x) => soDigitos(x.telefone)), removidos: [], promovidos: admins });
    }

    // sincronizar
    if (!grupo.wa_group_id) return json(409, { erro: "Este grupo ainda não existe no WhatsApp. Use criar." });
    const info = await lerGrupo(cred.url, cred.apiKey, sessao.openwa_session_id, grupo.wa_group_id);
    if (!info.ok) return json(502, { erro: info.erro });
    const atuais = (info.dados?.participants ?? []).map((p) => ({
      jid: p.id,
      telefone: soDigitos(p.number) || telefoneDoJid(p.id) || "",
      admin: p.isAdmin === true || p.isSuperAdmin === true,
      dono: p.isSuperAdmin === true,
    }));

    const adicionar = desejados.filter((d) => !atuais.some((a) => a.telefone && mesmoTelefone(a.telefone, d.telefone)));
    const remover = atuais.filter(
      (a) => !a.dono && a.telefone && !mesmoTelefone(a.telefone, proprio) && !desejados.some((d) => mesmoTelefone(d.telefone, a.telefone)),
    );
    // Admin no cadastro e ainda não admin no WhatsApp (inclui quem acabou de ser adicionado).
    const promover = desejados.filter(
      (d) => d.is_admin && !atuais.some((a) => a.admin && a.telefone && mesmoTelefone(a.telefone, d.telefone)),
    );

    const erros: string[] = [];
    if (adicionar.length) {
      const r = await adicionarParticipantes(cred.url, cred.apiKey, sessao.openwa_session_id, grupo.wa_group_id, adicionar.map((x) => jidDoTelefone(x.telefone)));
      if (!r.ok) erros.push(`adicionar: ${r.erro}`);
    }
    if (remover.length) {
      const r = await removerParticipantes(cred.url, cred.apiKey, sessao.openwa_session_id, grupo.wa_group_id, remover.map((x) => x.jid));
      if (!r.ok) erros.push(`remover: ${r.erro}`);
    }
    if (promover.length) {
      const r = await promoverParticipantes(cred.url, cred.apiKey, sessao.openwa_session_id, grupo.wa_group_id, promover.map((x) => jidDoTelefone(x.telefone)));
      if (!r.ok) erros.push(`promover: ${r.erro}`);
    }
    return json(erros.length ? 502 : 200, {
      ok: erros.length === 0,
      wa_group_id: grupo.wa_group_id,
      adicionados: adicionar.map((x) => soDigitos(x.telefone)),
      removidos: remover.map((x) => x.telefone),
      promovidos: promover.map((x) => soDigitos(x.telefone)),
      ...(erros.length ? { erro: erros.join(" · ") } : {}),
    });
  } catch (e) {
    console.error(JSON.stringify({ evento: "openwa.groups_erro", acao, group_id: groupId, erro: mensagemDe(e) }));
    return json(500, { erro: "Falha ao administrar o grupo.", detalhe: mensagemDe(e) });
  }
});
