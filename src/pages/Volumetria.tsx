import { BadgeDe } from '../components/Badge';
import { Aviso } from '../components/Estados';
import { ListPage, type Coluna } from '../components/ListPage';
import { SITUACAO_VOLUMETRIA_OPCOES } from '../dominio/opcoes';
import { SITUACAO_VOLUMETRIA } from '../dominio/rotulos';
import { servicos } from '../services';
import type { VolumetriaLote } from '../types/models';
import { m3, pct } from '../utils/format';

export default function Volumetria() {
  const colunas: Coluna<VolumetriaLote>[] = [
    { chave: 'loteCodigo', titulo: 'Lote', ordenavel: true },
    { chave: 'volumeDocumentalM3', titulo: 'Volume documental', alinhar: 'right', ordenavel: true, render: (v) => m3(v.volumeDocumentalM3) },
    { chave: 'volumeCalculadoM3', titulo: 'Volume calculado', alinhar: 'right', ordenavel: true, render: (v) => m3(v.volumeCalculadoM3) },
    { chave: 'diferencaM3', titulo: 'Diferença', alinhar: 'right', ordenavel: true, render: (v) => <span className={v.situacao === 'divergente' ? 'val-erro' : undefined}>{v.diferencaM3 > 0 ? '+' : ''}{m3(v.diferencaM3)}</span> },
    { chave: 'diferencaPct', titulo: 'Diferença (%)', alinhar: 'right', ordenavel: true, render: (v) => <span className={v.situacao === 'divergente' ? 'val-erro' : undefined}>{v.diferencaPct > 0 ? '+' : ''}{pct(v.diferencaPct)}</span> },
    { chave: 'situacao', titulo: 'Situação', render: (v) => <BadgeDe mapa={SITUACAO_VOLUMETRIA} valor={v.situacao} /> },
  ];
  return (
    <ListPage<VolumetriaLote>
      titulo="Controle volumétrico"
      descricao="Volume declarado em documento versus volume calculado a partir das dimensões."
      aviso={<Aviso>A situação (conforme/divergente) e a tolerância são definidas pelo sistema responsável; a interface apenas exibe o resultado.</Aviso>}
      listar={(q) => servicos.volumetria.listar(q)}
      colunas={colunas}
      filtros={[{ chave: 'situacao', rotulo: 'Situação', opcoes: SITUACAO_VOLUMETRIA_OPCOES }]}
    />
  );
}
