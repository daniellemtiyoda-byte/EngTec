import { Badge, StatusRegistroBadge, type Tom } from '../components/Badge';
import { PageHeader } from '../components/Estados';
import { ListPage, type Coluna } from '../components/ListPage';
import { servicos } from '../services';
import type { LocalPatio, Transferencia } from '../types/models';
import { dataHora, un } from '../utils/format';

const STATUS: Record<LocalPatio['status'], [Tom, string]> = { liberado: ['verde', 'Liberado'], bloqueado: ['vermelho', 'Bloqueado'], em_inventario: ['azul', 'Em inventário'] };

export default function Patio() {
  const locais: Coluna<LocalPatio>[] = [
    { chave: 'codigo', titulo: 'Localização', ordenavel: true },
    { chave: 'descricao', titulo: 'Descrição' },
    { chave: 'capacidade', titulo: 'Capacidade', alinhar: 'right', ordenavel: true, render: (l) => un(l.capacidade) },
    { chave: 'ocupacao', titulo: 'Ocupação', ordenavel: true, render: (l) => (
      <div style={{ minWidth: 150 }}>
        <div className="barra" role="img" aria-label={`Ocupação ${Math.round((l.ocupacao / l.capacidade) * 100)}%`}><div style={{ width: `${Math.min(100, (l.ocupacao / l.capacidade) * 100)}%` }} /></div>
        <span className="mudo">{un(l.ocupacao)} ({Math.round((l.ocupacao / l.capacidade) * 100)}%)</span>
      </div>
    ) },
    { chave: 'status', titulo: 'Situação', render: (l) => <Badge tom={STATUS[l.status][0]}>{STATUS[l.status][1]}</Badge> },
  ];
  const transf: Coluna<Transferencia>[] = [
    { chave: 'dataHora', titulo: 'Data/hora', ordenavel: true, render: (t) => dataHora(t.dataHora) },
    { chave: 'loteCodigo', titulo: 'Lote', ordenavel: true },
    { chave: 'quantidade', titulo: 'Quantidade', alinhar: 'right', render: (t) => un(t.quantidade) },
    { chave: 'de', titulo: 'De' }, { chave: 'para', titulo: 'Para' },
    { chave: 'status', titulo: 'Situação', render: (t) => <StatusRegistroBadge s={t.status} /> },
  ];

  return (
    <>
      <PageHeader titulo="Pátio de armazenamento" descricao="Localizações e transferências. Alterações de localização são feitas pelas movimentações." />
      <ListPage<LocalPatio> secao titulo="Localizações" listar={(q) => servicos.patio.listar(q)} colunas={locais} filtros={[{ chave: 'status', rotulo: 'Situação', opcoes: Object.entries(STATUS).map(([valor, [, rotulo]]) => ({ valor, rotulo })) }]} />
      <ListPage<Transferencia> secao titulo="Transferências" listar={(q) => servicos.patio.transferencias.listar(q)} colunas={transf} />
    </>
  );
}
