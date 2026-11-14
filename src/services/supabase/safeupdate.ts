/**
 * Só para testes: acha UPDATE e DELETE sem WHERE no código de uma função do banco.
 *
 * No Supabase, o PostgREST carrega o pg_safeupdate, que recusa UPDATE e DELETE sem WHERE em qualquer comando da
 * requisição, inclusive dentro de funções security definer, gatilhos e SQL dinâmico (`execute`), com o erro
 * 21000 "UPDATE requires a WHERE clause". O PGlite não tem essa extensão (e não dá para carregá-la), então a
 * conferência é estática: `safeupdate.test.ts` passa aqui o código final de cada função (`pg_proc.prosrc`, depois
 * de todas as migrações). TRUNCATE não é barrado pelo pg_safeupdate.
 */

type Token = { tipo: 'palavra' | 'texto' | 'abre' | 'fecha' | 'fim' | 'outro'; valor: string };

function tokens(sql: string): Token[] {
  const saida: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const resto = sql.slice(i);
    if (/\s/.test(c)) { i++; continue; }
    if (resto.startsWith('--')) { const n = sql.indexOf('\n', i); i = n < 0 ? sql.length : n + 1; continue; }
    if (resto.startsWith('/*')) { const n = sql.indexOf('*/', i + 2); i = n < 0 ? sql.length : n + 2; continue; }
    if (c === "'" || ((c === 'E' || c === 'e') && sql[i + 1] === "'")) {
      let j = c === "'" ? i + 1 : i + 2;
      let valor = '';
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { valor += "'"; j += 2; continue; }
        if (sql[j] === "'") break;
        valor += sql[j++];
      }
      saida.push({ tipo: 'texto', valor });
      i = j + 1;
      continue;
    }
    const dolar = /^\$([A-Za-z_]*)\$/.exec(resto);
    if (dolar) {
      const fim = sql.indexOf(dolar[0], i + dolar[0].length);
      const ate = fim < 0 ? sql.length : fim;
      saida.push({ tipo: 'texto', valor: sql.slice(i + dolar[0].length, ate) });
      i = fim < 0 ? sql.length : fim + dolar[0].length;
      continue;
    }
    if (c === '"') {
      const n = sql.indexOf('"', i + 1);
      saida.push({ tipo: 'palavra', valor: sql.slice(i + 1, n < 0 ? sql.length : n).toLowerCase() });
      i = n < 0 ? sql.length : n + 1;
      continue;
    }
    // Palavras incluem os marcadores de format() (%I, %s) e os parâmetros ($1).
    const palavra = /^[A-Za-z_%$][A-Za-z0-9_$%]*/.exec(resto);
    if (palavra) { saida.push({ tipo: 'palavra', valor: palavra[0].toLowerCase() }); i += palavra[0].length; continue; }
    if (c === '(') saida.push({ tipo: 'abre', valor: c });
    else if (c === ')') saida.push({ tipo: 'fecha', valor: c });
    else if (c === ';') saida.push({ tipo: 'fim', valor: c });
    else saida.push({ tipo: 'outro', valor: c });
    i++;
  }
  return saida;
}

/** Depois de `inicio`, um nome de tabela (com esquema opcional): devolve a posição seguinte, ou -1. */
function depoisDoNome(t: Token[], inicio: number): number {
  let i = inicio;
  if (t[i]?.valor === 'only') i++;
  if (t[i]?.tipo !== 'palavra') return -1;
  i++;
  while (t[i]?.valor === '.' && t[i + 1]?.tipo === 'palavra') i += 2;
  return i;
}

// Palavras que, antes de UPDATE, indicam que não é um comando: FOR UPDATE, ON CONFLICT DO UPDATE, gatilhos.
const NAO_E_COMANDO = new Set(['for', 'do', 'or', 'before', 'after', 'on', 'of', 'key', 'instead']);

/**
 * Os comandos UPDATE e DELETE sem WHERE no SQL (corpo de função PL/pgSQL ou SQL), incluindo os que estão em textos
 * executados dinamicamente. Cada item é o começo do comando, para a mensagem do teste.
 */
export function comandosSemWhere(sql: string, dentroDeTexto = false): string[] {
  const t = tokens(sql);
  const achados: string[] = [];
  const trecho = (de: number, ate: number) => t.slice(de, ate).map((x) => (x.tipo === 'texto' ? `'${x.valor}'` : x.valor)).join(' ').slice(0, 120);

  for (let i = 0; i < t.length; i++) {
    const tk = t[i];
    if (tk.tipo === 'texto') { achados.push(...comandosSemWhere(tk.valor, true)); continue; }
    if (tk.tipo !== 'palavra' || (tk.valor !== 'update' && tk.valor !== 'delete')) continue;
    const anterior = t[i - 1];
    let alvo: number;
    if (tk.valor === 'update') {
      if (anterior?.tipo === 'palavra' && NAO_E_COMANDO.has(anterior.valor)) continue;
      alvo = depoisDoNome(t, i + 1);
      if (alvo < 0) continue;
      if (t[alvo]?.valor === 'as') alvo++;
      if (t[alvo]?.valor !== 'set') alvo++;            // apelido
      if (t[alvo]?.valor !== 'set') continue;
    } else {
      if (anterior?.valor === 'on' || t[i + 1]?.valor !== 'from') continue;
      alvo = depoisDoNome(t, i + 2);
      if (alvo < 0) continue;
    }
    // O WHERE do comando: no mesmo nível de parênteses, antes do fim do comando (";" ou o parêntese que o fecha).
    let nivel = 0;
    let temWhere = false;
    let j = alvo;
    for (; j < t.length; j++) {
      const x = t[j];
      if (x.tipo === 'abre') nivel++;
      else if (x.tipo === 'fecha') { if (nivel === 0) break; nivel--; }
      else if (x.tipo === 'fim' && nivel === 0) break;
      else if (nivel === 0 && x.valor === 'where') { temWhere = true; break; }
    }
    if (!temWhere) achados.push(trecho(i, Math.min(j, i + 30)));
  }
  // Texto dinâmico montado por concatenação ('update ' || ...): sem WHERE no próprio texto, é suspeito.
  if (dentroDeTexto && achados.length === 0 && /^\s*(update|delete\s+from)\s/i.test(sql) && !/\bwhere\b/i.test(sql)) {
    achados.push(sql.trim().slice(0, 120));
  }
  return achados;
}
