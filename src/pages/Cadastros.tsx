import { useSearchParams } from 'react-router-dom';
import { DocumentosLista } from '../components/DocumentosLista';
import { PageHeader } from '../components/Estados';
import { PainelAbas } from '../components/PainelAbas';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import Enderecos from './Enderecos';
import Especies from './Especies';
import Fornecedores from './Fornecedores';
import Tamanhos from './Tamanhos';

const ABAS = { especies: 'Espécies', tamanhos: 'Tamanhos', fornecedores: 'Fornecedores', enderecos: 'Endereços', documentos: 'Documentos' } as const;
type Aba = keyof typeof ABAS;

/** Só o total de cada cadastro, para o menu lateral. */
const contar = () => Promise.all([
  servicos.especies.listar({ pageSize: 1 }), servicos.tamanhos.listar({ pageSize: 1 }), servicos.fornecedores.listar({ pageSize: 1 }),
  servicos.patio.listar({ pageSize: 1 }), servicos.documentos.listar({ pageSize: 1 }),
]).then(([especies, tamanhos, fornecedores, enderecos, documentos]): Record<Aba, number> => ({
  especies: especies.total, tamanhos: tamanhos.total, fornecedores: fornecedores.total, enderecos: enderecos.total, documentos: documentos.total,
}));

/**
 * Cadastros numa tela só (PRD, RF27): um cartão com as abas na lateral e o total de cada uma.
 * A aba fica no endereço (?aba=tamanhos) para voltar, recarregar e compartilhar.
 */
export default function Cadastros() {
  const [params, setParams] = useSearchParams();
  const pedida = params.get('aba');
  const aba: Aba = pedida && pedida in ABAS ? (pedida as Aba) : 'especies';
  const totais = useAsync(contar, []);
  const alterou = totais.recarregar;
  return (
    <>
      <PageHeader titulo="Cadastros" descricao="Espécies, tamanhos, fornecedores, endereços do pátio e documentos: a base usada na entrada, no estoque e nos relatórios do IBAMA." />
      <PainelAbas
        rotulo="Cadastros" ativa={aba} aoEscolher={(a) => setParams({ aba: a }, { replace: true })}
        abas={(Object.keys(ABAS) as Aba[]).map((a) => ({ chave: a, rotulo: ABAS[a], total: totais.dados?.[a] }))}
      >
        {aba === 'especies' && <Especies aoAlterar={alterou} />}
        {aba === 'tamanhos' && <Tamanhos aoAlterar={alterou} />}
        {aba === 'fornecedores' && <Fornecedores aoAlterar={alterou} />}
        {aba === 'enderecos' && <Enderecos aoAlterar={alterou} />}
        {aba === 'documentos' && <DocumentosLista />}
      </PainelAbas>
    </>
  );
}
