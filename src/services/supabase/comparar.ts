// Só para os testes.

/** Caminhos em que dois valores JSON diferem (para a falha mostrar só o que mudou). */
export function diferencas(a: unknown, b: unknown, caminho = '', saida: string[] = []): string[] {
  if (saida.length > 30) return saida;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of chaves) diferencas((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${caminho}.${k}`, saida);
  } else if (a !== b) saida.push(`${caminho}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  return saida;
}
