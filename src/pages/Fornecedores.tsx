import { useState } from 'react';
import { StatusRegistroBadge } from '../components/Badge';
import { PageHeader } from '../components/Estados';
import { ListPage, type Coluna } from '../components/ListPage';
import { servicos } from '../services';
import type { Fornecedor } from '../types/models';
import { STATUS_OPCOES } from '../dominio/opcoes';
import { DocumentosLista } from '../components/DocumentosLista';

export default function Fornecedores() {
  const [aba, setAba] = useState<'fornecedores' | 'documentos'>('fornecedores');
  const colunas: Coluna<Fornecedor>[] = [
    { chave: 'razaoSocial', titulo: 'Razão social', ordenavel: true },
    { chave: 'cnpj', titulo: 'CNPJ' },
    { chave: 'cidadeUf', titulo: 'Cidade/UF', ordenavel: true },
    { chave: 'documentosVigentes', titulo: 'Documentos vigentes', alinhar: 'right', ordenavel: true },
    { chave: 'status', titulo: 'Situação', render: (f) => <StatusRegistroBadge s={f.status} /> },
  ];
  return (
    <>
      <PageHeader titulo="Fornecedores e documentos" />
      <div className="abas" role="tablist" aria-label="Fornecedores e documentos">
        {(['fornecedores', 'documentos'] as const).map((a) => (
          <button key={a} role="tab" className="aba" aria-selected={aba === a} onClick={() => setAba(a)}>{a === 'fornecedores' ? 'Fornecedores' : 'Documentos'}</button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'fornecedores' ? (
          <ListPage<Fornecedor> secao titulo="Fornecedores" listar={(q) => servicos.fornecedores.listar(q)} colunas={colunas} filtros={[{ chave: 'status', rotulo: 'Situação', opcoes: STATUS_OPCOES }]} />
        ) : <DocumentosLista />}
      </div>
    </>
  );
}
