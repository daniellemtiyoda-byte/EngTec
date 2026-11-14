import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { criarDados } from '../services/mock/data';
import { tamanhoView } from '../services/mock/consultas';
import { xmlDaNf } from '../services/mock/simulador';
import { lerQuantidadeNfe, tamanhoDoItemNfe } from './nfeXml';

const e = criarDados(new Date('2026-11-06T12:00:00-03:00'));
const tamanhos = e.tamanhos.map((t) => tamanhoView(t));
const idDe = (codigo: string) => tamanhos.find((t) => t.codigo === codigo)!.id;
const qComs = (xml: string) => [...xml.matchAll(/<qCom>(.*?)<\/qCom>/g)].map((m) => m[1]);

describe('lerQuantidadeNfe: ponto é sempre decimal', () => {
  it('inteiro com casas zeradas', () => {
    expect(lerQuantidadeNfe('21.0000')).toBe(21);
    expect(lerQuantidadeNfe('21.000')).toBe(21);
    expect(lerQuantidadeNfe('1050.0000')).toBe(1050);
    expect(lerQuantidadeNfe('21')).toBe(21);
  });
  it('com casas decimais', () => {
    expect(lerQuantidadeNfe('10.5000')).toBe(10.5);
    expect(lerQuantidadeNfe(' 0.2500 ')).toBe(0.25);
  });
  it('recusa vírgula, milhar, expoente e vazio em vez de virar outro número', () => {
    for (const ruim of ['21,0000', '1.050,00', '1.050.000', '1e3', '', 'abc', '-5']) expect(() => lerQuantidadeNfe(ruim)).toThrow('Quantidade inválida');
  });
});

describe('XML de exemplo e do Simulador', () => {
  it('docs/exemplos/nfe-exemplo.xml: qCom com ponto, lido como 98 e 28', () => {
    const xml = readFileSync('docs/exemplos/nfe-exemplo.xml', 'utf-8');
    expect(qComs(xml)).toEqual(['98.0000', '28.0000']);
    expect(qComs(xml).map(lerQuantidadeNfe)).toEqual([98, 28]);
  });
  it('XML do Simulador: qCom sempre com ponto e quatro casas, nunca vírgula, e igual à quantidade da NF', () => {
    for (const em of e.emissoes) {
      const xml = xmlDaNf(e, em.id);
      const q = qComs(xml);
      expect(q.length).toBe(em.nf.itens.length);
      q.forEach((t, i) => {
        expect(t).toMatch(/^\d+\.\d{4}$/);
        expect(t).not.toContain(',');
        expect(lerQuantidadeNfe(t)).toBe(em.nf.itens[i].quantidade);
      });
    }
  });
});

describe('tamanhoDoItemNfe: liga o item da NF ao tamanho do contrato', () => {
  it('"24X17X280 CM" casa com 006234 (2,80 m)', () => {
    expect(tamanhoDoItemNfe({ codigo: 'DRM-280', descricao: 'DORMENTE DE MADEIRA 24X17X280 CM' }, tamanhos)).toBe(idDe('006234'));
  });
  it('"24X17X400 CM" casa com 006224 (4,00 m)', () => {
    expect(tamanhoDoItemNfe({ codigo: 'DRM-400', descricao: 'DORMENTE DE MADEIRA PARA AMV 24X17X400 CM' }, tamanhos)).toBe(idDe('006224'));
  });
  it('descrição do Simulador (mm e código de material) casa com o tamanho de cada emissão', () => {
    for (const em of e.emissoes) {
      const xml = xmlDaNf(e, em.id);
      const itens = [...xml.matchAll(/<cProd>(.*?)<\/cProd>\s*<xProd>(.*?)<\/xProd>/g)];
      itens.forEach((m, i) => {
        const esperado = e.contratos.flatMap((c) => c.itens).find((it) => it.id === em.nf.itens[i].itemContratoId)!.tamanhoId;
        expect(tamanhoDoItemNfe({ codigo: m[1], descricao: m[2] }, tamanhos)).toBe(esperado);
        expect(tamanhoDoItemNfe({ codigo: 'X', descricao: m[2].replace(/ - MATERIAL CPTM \d+/, '') }, tamanhos)).toBe(esperado);
      });
    }
  });
  it('ordem das medidas e vírgula decimal não atrapalham; sem medidas ou desconhecida → undefined', () => {
    expect(tamanhoDoItemNfe({ codigo: '', descricao: 'DORMENTE 280X24X17 CM' }, tamanhos)).toBe(idDe('006234'));
    expect(tamanhoDoItemNfe({ codigo: '', descricao: 'DORMENTE 2,8M' }, tamanhos)).toBeUndefined();
    expect(tamanhoDoItemNfe({ codigo: '', descricao: 'DORMENTE 24X17X999 CM' }, tamanhos)).toBeUndefined();
    expect(tamanhoDoItemNfe({ codigo: '', descricao: 'PRODUTO QUALQUER' }, tamanhos)).toBeUndefined();
  });
});
