import { VERSAO_ESTADO, type Estado } from './estado';

/**
 * O estado do mock fica no localStorage deste navegador, para sobreviver ao recarregar a página.
 * Cada aparelho tem os seus dados até a Etapa 9 (Supabase). Sem armazenamento disponível (aba privada,
 * testes), tudo continua funcionando em memória.
 */
const CHAVE = 'holz:demo:estado';

export type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function armazenamentoPadrao(): Armazenamento | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

const objeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Campos presentes em todos os registros de uma coleção de referência (os obrigatórios do formato atual). */
function obrigatorios(lista: unknown[]): string[] {
  const objs = lista.filter(objeto);
  if (!objs.length) return [];
  return Object.keys(objs[0]).filter((k) => objs.every((o) => k in o));
}

/**
 * Confere se o estado salvo tem o mesmo formato do estado novo: as mesmas coleções e, em cada registro, os campos que
 * todos os registros novos têm (inclusive os parâmetros). Um estado gravado por uma versão anterior do app com a mesma
 * `VERSAO_ESTADO` (a versão não foi subida a tempo, ou o código mudou no meio do desenvolvimento) não passa.
 */
export function mesmoFormato(salvo: unknown, referencia: Estado): boolean {
  if (!objeto(salvo) || salvo.versao !== referencia.versao) return false;
  // Pelo JSON, como foi salvo: campo opcional sem valor (undefined) não é gravado.
  for (const [chave, ref] of Object.entries(JSON.parse(JSON.stringify(referencia)) as Record<string, unknown>)) {
    const v = salvo[chave];
    if (Array.isArray(ref)) {
      if (!Array.isArray(v)) return false;
      const campos = obrigatorios(ref);
      if (!v.every((r) => objeto(r) && campos.every((c) => c in r))) return false;
    } else if (objeto(ref)) {
      if (!objeto(v) || !Object.keys(ref).every((c) => c in v)) return false;
    } else if (typeof v !== typeof ref) return false;
  }
  return true;
}

/**
 * Lê o estado salvo. Devolve null (e o chamador recria a demonstração) quando não há nada salvo, a versão é outra, o
 * formato não bate com a `referencia` ou a conferência (`conferir`, que monta as visões das telas) falha.
 */
export function carregar(a: Armazenamento | null, referencia?: Estado, conferir?: (e: Estado) => void): Estado | null {
  if (!a) return null;
  try {
    const bruto = a.getItem(CHAVE);
    if (!bruto) return null;
    const e = JSON.parse(bruto) as Estado;
    if (!e || e.versao !== VERSAO_ESTADO) return null;
    if (referencia && !mesmoFormato(e, referencia)) return null;
    conferir?.(e);
    return e;
  } catch { return null; }
}

export function salvar(a: Armazenamento | null, e: Estado) {
  if (!a) return;
  try { a.setItem(CHAVE, JSON.stringify(e)); } catch { /* cheio ou bloqueado: segue em memória */ }
}
