import { useAbaNoEndereco } from '../components/Abas';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { PainelAbas } from '../components/PainelAbas';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import EmpresasInspetoras from './EmpresasInspetoras';
import Especies from './Especies';
import Fornecedores from './Fornecedores';
import LocaisCadastro from './LocaisCadastro';
import Tamanhos from './Tamanhos';
import Tratamentos from './Tratamentos';

const ABAS = { especies: 'Espécies', tamanhos: 'Tamanhos', tratamentos: 'Tratamentos', fornecedores: 'Fornecedores', empresas: 'Empresas inspetoras', locais: 'Locais' } as const;
type Aba = keyof typeof ABAS;
const CHAVES = Object.keys(ABAS) as Aba[];

/** Só o total de cada cadastro, para as abas laterais. */
const contar = () => Promise.all([
  servicos.especies.listar({ pageSize: 1 }), servicos.tamanhos.listar({ pageSize: 1 }), servicos.tratamentos.listar({ pageSize: 1 }),
  servicos.fornecedores.listar({ pageSize: 1 }), servicos.empresasInspetoras.listar({ pageSize: 1 }), servicos.locais.listar({ pageSize: 1 }),
]).then(([especies, tamanhos, tratamentos, fornecedores, empresas, locais]): Record<Aba, number> => ({
  especies: especies.total, tamanhos: tamanhos.total, tratamentos: tratamentos.total, fornecedores: fornecedores.total, empresas: empresas.total, locais: locais.total,
}));

/**
 * Cadastros (seção 9.18 do plano): um cartão com as abas na lateral e o total de cada uma; a aba fica no endereço
 * (`/cadastros?aba=fornecedores`). Inclusão em linha, edição em modal e nada é apagado (só inativado).
 */
export default function Cadastros() {
  const [aba, setAba] = useAbaNoEndereco(CHAVES);
  const totais = useAsync(contar, []);
  const alterou = totais.recarregar;
  return (
    <>
      <CabecalhoPagina titulo="Cadastros" subtitulo="Espécies, tamanhos, tratamentos, fornecedores, empresas inspetoras e locais: a base dos contratos, da entrada e do estoque." />
      <PainelAbas rotulo="Cadastros" ativa={aba} aoEscolher={setAba} abas={CHAVES.map((a) => ({ chave: a, rotulo: ABAS[a], total: totais.dados?.[a] }))}>
        {aba === 'especies' && <Especies aoAlterar={alterou} />}
        {aba === 'tamanhos' && <Tamanhos aoAlterar={alterou} />}
        {aba === 'tratamentos' && <Tratamentos aoAlterar={alterou} />}
        {aba === 'fornecedores' && <Fornecedores aoAlterar={alterou} />}
        {aba === 'empresas' && <EmpresasInspetoras aoAlterar={alterou} />}
        {aba === 'locais' && <LocaisCadastro aoAlterar={alterou} />}
      </PainelAbas>
    </>
  );
}
