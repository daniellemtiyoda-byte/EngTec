import { StatusRegistroBadge } from '../components/Badge';
import { Aviso } from '../components/Estados';
import { ListPage, type Coluna } from '../components/ListPage';
import { servicos } from '../services';
import type { Especie } from '../types/models';
import { STATUS_OPCOES } from '../dominio/opcoes';

export default function Especies() {
  const colunas: Coluna<Especie>[] = [
    { chave: 'nomePopular', titulo: 'Nome popular', ordenavel: true },
    { chave: 'nomeCientifico', titulo: 'Nome científico', render: (e) => <em>{e.nomeCientifico}</em> },
    { chave: 'lotesAtivos', titulo: 'Lotes ativos', alinhar: 'right', ordenavel: true },
    { chave: 'status', titulo: 'Situação', render: (e) => <StatusRegistroBadge s={e.status} /> },
  ];
  return (
    <ListPage<Especie>
      titulo="Espécies vegetais"
      descricao="Espécies cadastradas para uso em dormentes."
      aviso={<Aviso>A espécie de cada lote é a <strong>declarada em documento</strong>. O sistema não identifica espécie por imagem.</Aviso>}
      listar={(q) => servicos.especies.listar(q)}
      colunas={colunas}
      filtros={[{ chave: 'status', rotulo: 'Situação', opcoes: STATUS_OPCOES }]}
    />
  );
}
