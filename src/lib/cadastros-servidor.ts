import "server-only";
import { falha, type ResultadoAcao } from "@/lib/acoes";
import { exigirSuperAdmin } from "@/lib/projeto/servidor";

/** Cadastros: só o super admin altera. Devolve a falha pronta, ou null quando pode seguir. */
export async function garantirSuperAdmin(): Promise<ResultadoAcao<never> | null> {
  try {
    await exigirSuperAdmin();
    return null;
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Sem permissão.");
  }
}
