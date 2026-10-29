import { useSearchParams } from 'react-router-dom';
import { DocumentosLista } from '../components/DocumentosLista';
import { PageHeader } from '../components/Estados';
import Especies from './Especies';
import Fornecedores from './Fornecedores';
import Tamanhos from './Tamanhos';

const ABAS = { especies: 'Espécies', tamanhos: 'Tamanhos', fornecedores: 'Fornecedores', documentos: 'Documentos' } as const;
type Aba = keyof typeof ABAS;

/** Cadastros numa tela só (PRD), um por aba. A aba fica no endereço (?aba=tamanhos) para voltar, recarregar e compartilhar. */
export default function Cadastros() {
  const [params, setParams] = useSearchParams();
  const pedida = params.get('aba');
  const aba: Aba = pedida && pedida in ABAS ? (pedida as Aba) : 'especies';
  return (
    <>
      <PageHeader titulo="Cadastros" descricao="Espécies, tamanhos, fornecedores e seus documentos: a base usada na entrada, no estoque e nos relatórios do IBAMA." />
      <div className="abas" role="tablist" aria-label="Cadastros">
        {(Object.keys(ABAS) as Aba[]).map((a) => (
          <button key={a} role="tab" className="aba" aria-selected={aba === a} onClick={() => setParams({ aba: a }, { replace: true })}>{ABAS[a]}</button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'especies' && <Especies />}
        {aba === 'tamanhos' && <Tamanhos />}
        {aba === 'fornecedores' && <Fornecedores />}
        {aba === 'documentos' && <DocumentosLista />}
      </div>
    </>
  );
}
