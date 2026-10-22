import { BadgeDe, StatusRegistroBadge } from '../components/Badge';
import { PageHeader } from '../components/Estados';
import { ListPage, type Coluna } from '../components/ListPage';
import { opcoesDe } from '../dominio/opcoes';
import { STATUS_PATIO } from '../dominio/rotulos';
import { servicos } from '../services';
import type { LocalPatio, Transferencia } from '../types/models';
import { dataHora, un } from '../utils/format';

/** Percentual de ocupação; capacidade 0 ou ausente não gera NaN/Infinity. */
const ocupacaoPct = (l: LocalPatio) => (l.capacidade > 0 ? Math.round((l.ocupacao / l.capacidade) * 100) : 0);

export default function Patio() {
  const locais: Coluna<LocalPatio>[] = [
    { chave: 'codigo', titulo: 'Localização', ordenavel: true },
    { chave: 'descricao', titulo: 'Descrição' },
    { chave: 'capacidade', titulo: 'Capacidade', alinhar: 'right', ordenavel: true, render: (l) => un(l.capacidade) },
    { chave: 'ocupacao', titulo: 'Ocupação', ordenavel: true, render: (l) => (
      <div style={{ minWidth: 150 }}>
        <div className="barra" role="img" aria-label={`Ocupação ${ocupacaoPct(l)}%`}><div style={{ width: `${Math.min(100, ocupacaoPct(l))}%` }} /></div>
        <span className="mudo">{un(l.ocupacao)} ({ocupacaoPct(l)}%)</span>
      </div>
    ) },
    { chave: 'status', titulo: 'Situação', render: (l) => <BadgeDe mapa={STATUS_PATIO} valor={l.status} /> },
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
      <ListPage<LocalPatio> secao titulo="Localizações" listar={(q) => servicos.patio.listar(q)} colunas={locais} filtros={[{ chave: 'status', rotulo: 'Situação', opcoes: opcoesDe(STATUS_PATIO) }]} />
      <ListPage<Transferencia> secao titulo="Transferências" listar={(q) => servicos.patio.transferencias.listar(q)} colunas={transf} />
    </>
  );
}
