// Variáveis públicas do Supabase (.env.local). Sem elas o app abre só a tela de entrada, com aviso.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// O banco Supabase é compartilhado pelos sistemas IMOBSYSTEMS: as tabelas do IMOBPROJ ficam no schema "imobproj".
export const SUPABASE_SCHEMA = "imobproj";
