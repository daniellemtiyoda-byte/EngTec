/**
 * Leitura do XML da NF-e no navegador, só para preencher o formulário de cadastro.
 * O servidor recebe o arquivo original e deve validar tudo de novo.
 * DOMParser em modo XML não executa scripts nem carrega recursos externos.
 */

export interface ItemNfe {
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
    return { descricao: texto1(prod, 'xProd'), quantidade: Number(texto1(prod, 'qCom')), unidade: texto1(prod, 'uCom') };
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
