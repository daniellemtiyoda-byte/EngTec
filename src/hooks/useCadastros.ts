import { useMemo } from 'react';
import { servicos } from '../services';
import type { Ata, EmpresaInspetora, Especie, Fornecedor, Id, Local, Tamanho, Tratamento } from '../types/models';
import { useAsync } from './useAsync';
import { ordinalClasse } from '../dominio/rotulos';
import { metros } from '../utils/format';

const TODOS = { pageSize: 1000 };

/**
 * Cadastros de apoio carregados uma vez por tela, para mostrar nomes no lugar de ids (espécie, tamanho, tratamento,
 * fornecedor, ata, local, empresa inspetora). Só leitura: quem edita é a tela Cadastros.
 */
export function useCadastros() {
  const r = useAsync(async () => {
    const [especies, tamanhos, tratamentos, fornecedores, atas, locais, empresas] = await Promise.all([
      servicos.especies.listar(TODOS), servicos.tamanhos.listar(TODOS), servicos.tratamentos.listar(TODOS),
      servicos.fornecedores.listar(TODOS), servicos.atas.listar(TODOS), servicos.locais.listar(TODOS), servicos.empresasInspetoras.listar(TODOS),
    ]);
    return { especies: especies.items, tamanhos: tamanhos.items, tratamentos: tratamentos.items, fornecedores: fornecedores.items, atas: atas.items, locais: locais.items, empresas: empresas.items };
  }, []);

  return useMemo(() => {
    const d = r.dados;
    const mapa = <T extends { id: Id }>(lista?: T[]) => new Map((lista ?? []).map((x) => [x.id, x]));
    const especies = mapa<Especie>(d?.especies);
    const tamanhos = mapa<Tamanho>(d?.tamanhos);
    const tratamentos = mapa<Tratamento>(d?.tratamentos);
    const fornecedores = mapa<Fornecedor>(d?.fornecedores);
    const atas = mapa<Ata>(d?.atas);
    const locais = mapa<Local>(d?.locais);
    const empresas = mapa<EmpresaInspetora>(d?.empresas);
    const nomeEspecie = (id: Id) => especies.get(id)?.nomePopular ?? '—';
    const codigoTamanho = (id: Id) => tamanhos.get(id)?.codigo ?? '—';
    const descreverTamanho = (id: Id) => { const t = tamanhos.get(id); return t ? `${t.codigo} · ${metros(t.comprimentoCm / 100)}` : '—'; };
    const nomeTratamento = (id: Id) => { const t = tratamentos.get(id); return t ? `${t.preservativo} / ${t.empresa}` : '—'; };
    return {
      ...r, listas: d,
      especies, tamanhos, tratamentos, fornecedores, atas, locais, empresas,
      nomeEspecie, codigoTamanho, nomeTratamento,
      nomeFornecedor: (id: Id) => fornecedores.get(id)?.razaoSocial ?? '—',
      numeroAta: (id: Id) => atas.get(id)?.numero ?? '—',
      nomeEmpresa: (id: Id) => empresas.get(id)?.nome ?? '—',
      codigoLocal: (id?: Id) => (id ? locais.get(id)?.codigo ?? '—' : '—'),
      /** "006234 · 2,80 m" (o item de compra). */
      descreverTamanho,
      /** "006234 · 2,80 m · 1ª classe" (item de contrato, de estoque ou de RME). */
      descreverItem: (i: { tamanhoId: Id; classe?: number }) => `${descreverTamanho(i.tamanhoId)}${i.classe ? ` · ${ordinalClasse(i.classe)} classe` : ''}`,
      /** Item de RME: tamanho e classe, e a categoria mínima e a espécie quando pedidas. */
      descreverItemRme: (i: { tamanhoId: Id; classe: number; categoriaMinima?: number; especieId?: Id }) =>
        `${descreverTamanho(i.tamanhoId)} · ${ordinalClasse(i.classe)} classe${i.categoriaMinima ? ` · categoria até ${i.categoriaMinima}` : ''}${i.especieId ? ` · ${nomeEspecie(i.especieId)}` : ''}`,
    };
  }, [r.dados, r.carregando, r.erro]); // eslint-disable-line react-hooks/exhaustive-deps
}

export type Cadastros = ReturnType<typeof useCadastros>;
