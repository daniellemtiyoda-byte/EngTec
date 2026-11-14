/**
 * Leitura do XML da NF-e no navegador, só para preencher o formulário de cadastro.
 * O servidor recebe o arquivo original e deve validar tudo de novo.
 * DOMParser em modo XML não executa scripts nem carrega recursos externos.
 */

export interface ItemNfe {
  /** cProd do XML (código do produto no fornecedor; às vezes o material CPTM). */
  codigo: string;
  descricao: string;
  quantidade: number;
  unidade: string;
}

export interface DadosNfe {
  numero: string;
  serie: string;
  chaveAcesso?: string;
  /** AAAA-MM-DD */
  emissao: string;
  cnpjEmitente: string;
  nomeEmitente: string;
  itens: ItemNfe[];
  /** Número do DOF encontrado nas informações complementares, se houver (RF29). */
  dofSugerido?: string;
}

const soDigitos = (s?: string) => (s ?? '').replace(/\D/g, '');

/**
 * Quantidade do XML da NF-e (qCom): o ponto é sempre o separador decimal ("21.0000" = 21, "1050.0000" = 1050) e não há
 * separador de milhar. Qualquer outra forma (vírgula, "1.050.000", "1e3", vazio) é recusada em vez de virar outro número.
 */
export function lerQuantidadeNfe(texto: string): number {
  const t = texto.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`Quantidade inválida no XML: "${texto.trim()}". Esperado número com ponto decimal (ex. 21.0000).`);
  return Number(t);
}

/** Medidas (cm) de um tamanho do contrato, para casar com a descrição do item da NF. */
export interface MedidasTamanho { id: string; codigo: string; comprimentoCm: number; larguraCm: number; alturaCm: number }

const MEDIDAS = /(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(CM|MM|M)?(?![A-Za-z0-9])/i;

/**
 * Liga o item da NF a um tamanho do contrato: primeiro pelo código de material (6 dígitos em cProd ou na descrição, ex.
 * "MATERIAL CPTM 006234"); senão pelas medidas "24X17X280 CM" (ou "240X170X2800 MM"), em qualquer ordem. Só devolve
 * quando há exatamente um tamanho que combina; na dúvida, devolve undefined e a pessoa escolhe.
 */
export function tamanhoDoItemNfe(item: Pick<ItemNfe, 'codigo' | 'descricao'>, tamanhos: MedidasTamanho[]): string | undefined {
  const codigos = new Set(`${item.codigo} ${item.descricao}`.match(/(?<!\d)\d{6}(?!\d)/g) ?? []);
  const porCodigo = tamanhos.filter((t) => codigos.has(t.codigo));
  if (porCodigo.length === 1) return porCodigo[0].id;
  if (porCodigo.length > 1) return undefined;
  const m = MEDIDAS.exec(item.descricao);
  if (!m) return undefined;
  const fator = m[4]?.toUpperCase() === 'MM' ? 0.1 : m[4]?.toUpperCase() === 'M' ? 100 : m[4] ? 1 : Number(m[3].replace(',', '.')) >= 1000 ? 0.1 : 1;
  const dim = [m[1], m[2], m[3]].map((v) => Math.round(Number(v.replace(',', '.')) * fator * 10) / 10).sort((a, b) => b - a);
  const iguais = tamanhos.filter((t) => {
    const d = [t.comprimentoCm, t.larguraCm, t.alturaCm].sort((a, b) => b - a);
    return d.every((v, i) => Math.abs(v - dim[i]) < 0.5);
  });
  return iguais.length === 1 ? iguais[0].id : undefined;
}

/** Dígito verificador da chave de acesso: módulo 11 sobre os 43 primeiros dígitos (pesos 2 a 9 da direita para a esquerda). */
function digitoChave(base43: string): number {
  let soma = 0;
  for (let i = base43.length - 1, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) soma += Number(base43[i]) * peso;
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export const chaveAcessoValida = (chave: string) => /^\d{44}$/.test(chave) && digitoChave(chave.slice(0, 43)) === Number(chave[43]);

/** Completa 43 dígitos com o dígito verificador (usado para gerar chaves fictícias no modo simulado). */
export const chaveComDigito = (base43: string) => base43 + digitoChave(base43);

export const mesmoCnpj = (a?: string, b?: string) => !!soDigitos(a) && soDigitos(a) === soDigitos(b);

export function lerXmlNfe(texto: string): DadosNfe {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('O arquivo não é um XML válido.');
  // Ignora o namespace do portal fiscal: busca pelo nome local da tag.
  const todos = (raiz: Document | Element, tag: string) => Array.from(raiz.getElementsByTagNameNS('*', tag));
  const um = (raiz: Document | Element, tag: string) => todos(raiz, tag)[0];
  const texto1 = (raiz: Document | Element | undefined, tag: string) => (raiz ? um(raiz, tag)?.textContent?.trim() ?? '' : '');

  const inf = um(doc, 'infNFe');
  if (!inf) throw new Error('XML sem os dados da NF-e (infNFe). Confira se o arquivo é o XML da nota.');
  const ide = um(inf, 'ide');
  const emit = um(inf, 'emit');

  const chave = soDigitos(inf.getAttribute('Id') ?? '') || soDigitos(texto1(doc, 'chNFe'));
  const itens = todos(inf, 'det').map((det) => {
    const prod = um(det, 'prod');
    return { codigo: texto1(prod, 'cProd'), descricao: texto1(prod, 'xProd'), quantidade: lerQuantidadeNfe(texto1(prod, 'qCom')), unidade: texto1(prod, 'uCom') };
  });
  const infCpl = texto1(um(inf, 'infAdic'), 'infCpl');
  const dof = /\bDOF\b\s*(?:n[º°o.]*)?\s*[:\-]?\s*(\d{6,})/i.exec(infCpl)?.[1];

  const dados: DadosNfe = {
    numero: texto1(ide, 'nNF'), serie: texto1(ide, 'serie'), chaveAcesso: chave || undefined,
    emissao: (texto1(ide, 'dhEmi') || texto1(ide, 'dEmi')).slice(0, 10),
    cnpjEmitente: soDigitos(texto1(emit, 'CNPJ')), nomeEmitente: texto1(emit, 'xNome'), itens, dofSugerido: dof,
  };
  if (!dados.numero || !itens.length) throw new Error('XML sem número da nota ou sem itens.');
  return dados;
}
