import { lerCodigo, rotaDoObjeto } from '../dominio/identificacao';

/**
 * Para onde leva um código do sistema (links das tabelas, busca global, leitor de QR). Aceita o ID puro ou o link do
 * QR, reconhecidos por `lerCodigo()`.
 */
export function rotaDoCodigo(texto: string): string | null {
  const c = lerCodigo(texto);
  if (!c) return null;
  return rotaDoObjeto(c);
}

const NF = /^(?:NF\s*)?(\d{1,9})$/i;

/**
 * Busca global: código conhecido vai direto ao objeto; número (ou "NF 4500") abre NF e DOF filtrada; texto livre
 * pesquisa nos contratos (passa a pesquisar também os fardos quando o Estoque chegar, na Etapa 7).
 */
export function destinoBusca(texto: string): string {
  const t = texto.trim();
  const rota = rotaDoCodigo(t);
  if (rota) return rota;
  const nf = NF.exec(t);
  if (nf) return `/documentos?q=${encodeURIComponent(nf[1])}`;
  return `/contratos?q=${encodeURIComponent(t)}`;
}
