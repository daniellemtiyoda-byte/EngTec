/**
 * Dicionário do domínio: rótulo e cor de cada estado exibido na interface.
 * Mudar um texto ou uma cor aqui muda em todas as telas, filtros e formulários.
 * Paleta semântica (manter em todos os mapas): verde = disponível/concluído, azul = em andamento,
 * laranja = atenção, vermelho = bloqueio ou prazo vencido, cinza = encerrado/neutro.
 * Os mapas da v2 (situações do fardo, do dormente, da RME...) entram na Etapa 2.
 */
export type Tom = 'verde' | 'laranja' | 'vermelho' | 'azul' | 'cinza';
export type Rotulos<K extends string> = Record<K, [Tom, string]>;
