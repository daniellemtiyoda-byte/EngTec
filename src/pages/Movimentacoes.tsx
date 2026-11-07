import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeDe } from '../components/Badge';
import { CodigoLink } from '../components/Codigos';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { TransferirFardo } from '../components/TransferirFardo';
import { useAuth } from '../contexts/AuthContext';
import { TIPO_MOVIMENTACAO_OPCOES } from '../dominio/opcoes';
import { TIPO_MOVIMENTACAO } from '../dominio/rotulos';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { Movimentacao } from '../types/models';
import { dataHora, numero } from '../utils/format';

const PERIODOS = [
  { valor: '7', rotulo: 'Últimos 7 dias' },
  { valor: '30', rotulo: 'Últimos 30 dias' },
  { valor: '90', rotulo: 'Últimos 90 dias' },
];

/**
 * Movimentações (seção 9.16 do plano): guarda, transferência, segregação e saída, da mais recente à mais antiga, com
 * filtros por tipo, período e local (de ou para) e a pesquisa pelo fardo ou pela referência (RME). Ação principal:
 * Transferir fardo.
 */
export default function Movimentacoes() {
  const { pode } = useAuth();
  const notificar = useToast();
  const cad = useCadastros();
  const [transferir, setTransferir] = useState(false);
  const [rec, setRec] = useState(0);
  const local = (id?: string) => { const c = cad.codigoLocal(id); return c !== '—' ? <Link className="mono" to={`/locais/${c}`}>{c}</Link> : c; };

  const colunas: Coluna<Movimentacao>[] = [
    { chave: 'quando', titulo: 'Quando', ordenavel: true, render: (m) => dataHora(m.quando) },
    { chave: 'tipo', titulo: 'Tipo', render: (m) => <BadgeDe mapa={TIPO_MOVIMENTACAO} valor={m.tipo} /> },
    { chave: 'fardoId', titulo: 'Fardo', render: (m) => <CodigoLink codigo={m.fardoId} /> },
    { chave: 'quantidade', titulo: 'Dormentes', alinhar: 'right', ordenavel: true, render: (m) => numero(m.quantidade) },
    { chave: 'deLocalId', titulo: 'De', render: (m) => local(m.deLocalId) },
    { chave: 'paraLocalId', titulo: 'Para', render: (m) => local(m.paraLocalId) },
    { chave: 'quem', titulo: 'Quem', opcional: true, quebrar: true, render: (m) => m.quem },
    { chave: 'referencia', titulo: 'Referência', opcional: true, render: (m) => (m.referencia ? <CodigoLink codigo={m.referencia} /> : '—') },
  ];

  return (
    <>
      <ListPage<Movimentacao>
        titulo="Movimentações"
        descricao="Guarda, transferência, segregação e saída dos fardos. Pesquise pelo ID do fardo ou pela RME."
        acoes={pode('estoque:movimentar') && <button className="btn btn-pri" onClick={() => setTransferir(true)}>Transferir fardo</button>}
        filtros={[
          { chave: 'tipo', rotulo: 'Tipo', opcoes: TIPO_MOVIMENTACAO_OPCOES },
          { chave: 'periodo', rotulo: 'Período', opcoes: PERIODOS },
          { chave: 'localId', rotulo: 'Local', opcoes: (cad.listas?.locais ?? []).map((l) => ({ valor: l.id, rotulo: l.codigo })) },
        ]}
        listar={(q) => servicos.movimentacoes.listar(q)}
        recarregar={rec}
        colunas={colunas}
      />
      <TransferirFardo
        aberto={transferir} cad={cad} aoFechar={() => setTransferir(false)}
        aoTransferir={(f, de, para) => { setTransferir(false); notificar('sucesso', `Fardo ${f.id} transferido de ${de} para ${para}.`); setRec((x) => x + 1); cad.recarregar(); }}
      />
    </>
  );
}
