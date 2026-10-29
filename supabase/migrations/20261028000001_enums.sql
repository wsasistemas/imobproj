-- =============================================================================
-- IMOBPROJ · 001 · Extensões e tipos enumerados
-- Migration aditiva e idempotente: cada enum é criado dentro de um bloco
-- que ignora duplicate_object, então pode ser reaplicada sem erro.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  -- Organizações ---------------------------------------------------------------
  begin
    create type imobproj.org_tipo as enum ('executora', 'cliente', 'prestador');
  exception when duplicate_object then null;
  end;

  -- Projetos -------------------------------------------------------------------
  begin
    create type imobproj.project_status as enum ('planejamento', 'execucao', 'homologacao', 'encerrado', 'suspenso');
  exception when duplicate_object then null;
  end;

  -- Papel do membro no projeto (super_admin NÃO está aqui: é flag global em profiles)
  begin
    create type imobproj.member_role as enum ('diretor', 'gerente', 'usuario_chave', 'analista', 'prestador');
  exception when duplicate_object then null;
  end;

  -- Documentos -----------------------------------------------------------------
  begin
    create type imobproj.document_tipo as enum (
      'termo_abertura', 'escopo', 'processo_asis', 'processo_tobe',
      'raci', 'plano_comunicacao', 'requisitos', 'outro'
    );
  exception when duplicate_object then null;
  end;

  begin
    create type imobproj.document_status as enum ('rascunho', 'revisao', 'aprovado', 'vivo');
  exception when duplicate_object then null;
  end;

  -- EAP / cronograma -----------------------------------------------------------
  begin
    -- FS = término-início, SS = início-início, FF = término-término, SF = início-término
    create type imobproj.dependency_tipo as enum ('FS', 'SS', 'FF', 'SF');
  exception when duplicate_object then null;
  end;

  begin
    create type imobproj.event_tipo as enum ('atividade', 'reuniao', 'os', 'marco');
  exception when duplicate_object then null;
  end;

  -- Atas -----------------------------------------------------------------------
  begin
    create type imobproj.meeting_status as enum ('rascunho', 'publicada', 'aprovada');
  exception when duplicate_object then null;
  end;

  begin
    create type imobproj.presenca_tipo as enum ('presente', 'ausente');
  exception when duplicate_object then null;
  end;

  begin
    create type imobproj.action_status as enum ('aberta', 'em_andamento', 'concluida', 'cancelada');
  exception when duplicate_object then null;
  end;

  -- Ordens de Serviço ----------------------------------------------------------
  begin
    create type imobproj.os_status as enum (
      'rascunho', 'agendada', 'em_execucao', 'aguardando_aceite', 'aprovada', 'recusada'
    );
  exception when duplicate_object then null;
  end;

  begin
    create type imobproj.os_origem as enum ('portal', 'app', 'whatsapp');
  exception when duplicate_object then null;
  end;

  begin
    create type imobproj.evidence_tipo as enum ('foto', 'arquivo', 'print', 'assinatura');
  exception when duplicate_object then null;
  end;

  begin
    create type imobproj.scope_status as enum ('pendente', 'aprovada', 'recusada');
  exception when duplicate_object then null;
  end;

  -- WhatsApp / OpenWA ----------------------------------------------------------
  begin
    create type imobproj.wa_session_status as enum ('conectado', 'desconectado', 'erro');
  exception when duplicate_object then null;
  end;

  begin
    create type imobproj.wa_direction as enum ('in', 'out');
  exception when duplicate_object then null;
  end;

  begin
    create type imobproj.wa_message_status as enum ('recebida', 'pendente', 'enviada', 'falhou');
  exception when duplicate_object then null;
  end;

  -- Auditoria ------------------------------------------------------------------
  begin
    create type imobproj.audit_acao as enum ('INSERT', 'UPDATE', 'DELETE');
  exception when duplicate_object then null;
  end;
end
$$;
