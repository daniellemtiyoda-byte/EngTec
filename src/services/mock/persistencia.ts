import { VERSAO_ESTADO, type Estado } from './estado';

/**
 * O estado do mock fica no localStorage deste navegador, para sobreviver ao recarregar a página.
 * Cada aparelho tem os seus dados até a Etapa 10 (Supabase). Sem armazenamento disponível (aba privada,
 * testes), tudo continua funcionando em memória.
 */
const CHAVE = 'holz:demo:estado';

export type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function armazenamentoPadrao(): Armazenamento | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function carregar(a: Armazenamento | null): Estado | null {
  if (!a) return null;
  try {
    const bruto = a.getItem(CHAVE);
    if (!bruto) return null;
    const e = JSON.parse(bruto) as Estado;
    return e && e.versao === VERSAO_ESTADO ? e : null;
  } catch { return null; }
}

export function salvar(a: Armazenamento | null, e: Estado) {
  if (!a) return;
  try { a.setItem(CHAVE, JSON.stringify(e)); } catch { /* cheio ou bloqueado: segue em memória */ }
}
