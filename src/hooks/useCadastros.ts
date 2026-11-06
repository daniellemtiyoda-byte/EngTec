import { useMemo } from 'react';
import { servicos } from '../services';
import type { Ata, Especie, Fornecedor, Id, Local, Tamanho, Tratamento } from '../types/models';
import { useAsync } from './useAsync';

const TODOS = { pageSize: 1000 };

/**
 * Cadastros de apoio carregados uma vez por tela, para mostrar nomes no lugar de ids (espécie, tamanho, tratamento,
 * fornecedor, ata, local). Só leitura: quem edita é a tela Cadastros.
 */
export function useCadastros() {
  const r = useAsync(async () => {
    const [especies, tamanhos, tratamentos, fornecedores, atas, locais] = await Promise.all([
      servicos.especies.listar(TODOS), servicos.tamanhos.listar(TODOS), servicos.tratamentos.listar(TODOS),
      servicos.fornecedores.listar(TODOS), servicos.atas.listar(TODOS), servicos.locais.listar(TODOS),
    ]);
    return { especies: especies.items, tamanhos: tamanhos.items, tratamentos: tratamentos.items, fornecedores: fornecedores.items, atas: atas.items, locais: locais.items };
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
    const nomeEspecie = (id: Id) => especies.get(id)?.nomePopular ?? '—';
    const codigoTamanho = (id: Id) => tamanhos.get(id)?.codigo ?? '—';
    const nomeTratamento = (id: Id) => { const t = tratamentos.get(id); return t ? `${t.preservativo} / ${t.empresa}` : '—'; };
    return {
      ...r, listas: d,
      especies, tamanhos, tratamentos, fornecedores, atas, locais,
      nomeEspecie, codigoTamanho, nomeTratamento,
      nomeFornecedor: (id: Id) => fornecedores.get(id)?.razaoSocial ?? '—',
      numeroAta: (id: Id) => atas.get(id)?.numero ?? '—',
      codigoLocal: (id?: Id) => (id ? locais.get(id)?.codigo ?? '—' : '—'),
      /** "Jataipeba · T280" (espécie e tamanho de um item). */
      descreverItem: (i: { especieId: Id; tamanhoId: Id }) => `${nomeEspecie(i.especieId)} · ${codigoTamanho(i.tamanhoId)}`,
    };
  }, [r.dados, r.carregando, r.erro]); // eslint-disable-line react-hooks/exhaustive-deps
}

export type Cadastros = ReturnType<typeof useCadastros>;
