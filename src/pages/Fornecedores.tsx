import { StatusRegistroBadge } from '../components/Badge';
import { ListPage, type Coluna } from '../components/ListPage';
import { servicos } from '../services';
import type { Fornecedor } from '../types/models';
import { STATUS_OPCOES } from '../dominio/opcoes';

/** Aba Fornecedores da tela Cadastros (os documentos dos fornecedores têm aba própria). */
export default function Fornecedores() {
  const colunas: Coluna<Fornecedor>[] = [
    { chave: 'razaoSocial', titulo: 'Razão social', ordenavel: true },
    { chave: 'cnpj', titulo: 'CNPJ' },
    { chave: 'cidadeUf', titulo: 'Cidade/UF', ordenavel: true },
    { chave: 'documentosVigentes', titulo: 'Documentos vigentes', alinhar: 'right', ordenavel: true },
    { chave: 'status', titulo: 'Situação', render: (f) => <StatusRegistroBadge s={f.status} /> },
  ];
  return <ListPage<Fornecedor> secao titulo="Fornecedores" listar={(q) => servicos.fornecedores.listar(q)} colunas={colunas} filtros={[{ chave: 'status', rotulo: 'Situação', opcoes: STATUS_OPCOES }]} />;
}
