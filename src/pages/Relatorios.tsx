import { useState } from 'react';
import { Aviso, PageHeader } from '../components/Estados';
import { ListPage, type Coluna } from '../components/ListPage';
import { RelatorioMovimentacoes } from '../components/RelatorioMovimentacoes';
import { RelatorioDofsPendentes, RelatorioSaldoIbama } from '../components/RelatoriosIbama';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { servicos } from '../services';
import { mensagemSegura } from '../services/http';
import type { Relatorio } from '../types/models';

const FORMATOS = ['csv', 'xlsx', 'pdf'] as const;
const ABAS = { saldo: 'Saldo para o IBAMA', dofs: 'DOFs pendentes', movimentacoes: 'Movimentações do período', exportacoes: 'Exportações' } as const;
type Aba = keyof typeof ABAS;

function Exportacoes() {
  const { pode } = useAuth();
  const notificar = useToast();

  async function exportar(r: Relatorio, formato: string) {
    try {
      await servicos.relatorios.solicitarExportacao(r.id, formato);
      notificar('info', `Exportação de "${r.nome}" (${formato.toUpperCase()}) solicitada. O arquivo ficará disponível quando o servidor concluir a geração${SUFIXO_SIMULADO}.`);
    } catch (e) {
      notificar('erro', mensagemSegura(e));
    }
  }

  const colunas: Coluna<Relatorio>[] = [
    { chave: 'nome', titulo: 'Relatório', ordenavel: true },
    { chave: 'descricao', titulo: 'Descrição' },
    { chave: 'formatos', titulo: 'Formatos', render: (r) => r.formatos.map((f) => f.toUpperCase()).join(', ') },
  ];

  return (
    <ListPage<Relatorio>
      secao titulo="Exportações" descricao="Solicite a exportação no formato desejado."
      aviso={<Aviso>A solicitação não significa arquivo pronto: a geração é feita pelo servidor e o resultado depende da sua permissão.</Aviso>}
      listar={(q) => servicos.relatorios.listar(q)}
      colunas={colunas}
      acoesLinha={FORMATOS.map((f) => ({
        rotulo: `Exportar ${f.toUpperCase()}`,
        aoClicar: (r: Relatorio) => void exportar(r, f),
        visivel: (r: Relatorio) => r.formatos.includes(f) && pode('relatorios:exportar'),
      }))}
    />
  );
}

export default function Relatorios() {
  const [aba, setAba] = useState<Aba>('saldo');
  return (
    <>
      <PageHeader titulo="Relatórios" descricao="Prestação de contas ao IBAMA (saldo em m³ por espécie e dimensão, DOFs pendentes de declaração) e movimentações do período." />
      <div className="abas" role="tablist" aria-label="Relatórios">
        {(Object.keys(ABAS) as Aba[]).map((a) => (
          <button key={a} role="tab" className="aba" aria-selected={aba === a} onClick={() => setAba(a)}>{ABAS[a]}</button>
        ))}
      </div>
      <div role="tabpanel" className="stack-vertical">
        {aba === 'saldo' && <RelatorioSaldoIbama />}
        {aba === 'dofs' && <RelatorioDofsPendentes />}
        {aba === 'movimentacoes' && <RelatorioMovimentacoes />}
        {aba === 'exportacoes' && <Exportacoes />}
      </div>
    </>
  );
}
