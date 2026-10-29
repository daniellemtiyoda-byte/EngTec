import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ComoFunciona } from '../components/Estados';
import { BadgeDe, StatusEstoqueBadge } from '../components/Badge';
import { CodigoLink } from '../components/Codigos';
import { FardosModal } from '../components/FardosModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { CATEGORIA_OPCOES, CLASSE_OPCOES, IDADE_LOTE_OPCOES, SITUACAO_LOTE_OPCOES } from '../dominio/opcoes';
import { ETAPA_INSPECAO, SITUACAO_LOTE } from '../dominio/rotulos';
import { servicos } from '../services';
import type { Lote } from '../types/models';
import { classeCategoria, data, dias, m3, metros, un } from '../utils/format';

export default function Lotes() {
  const nav = useNavigate();
  const [fardosDe, setFardosDe] = useState<Lote | null>(null);

  const colunas: Coluna<Lote>[] = [
    { chave: 'codigo', titulo: 'Lote', ordenavel: true, render: (l) => <CodigoLink codigo={l.codigo} /> },
    {
      chave: 'especieDocumental', titulo: 'Espécie', ordenavel: true,
      render: (l) => <><em>{l.especieDocumental}</em>{classeCategoria(l.classe, l.categoria) && <div className="mudo">{classeCategoria(l.classe, l.categoria)}</div>}</>,
    },
    { chave: 'tamanho', titulo: 'Tamanho', ordenavel: true },
    { chave: 'saldo', titulo: 'Saldo', alinhar: 'right', ordenavel: true, render: (l) => <>{un(l.saldo)}{l.saldo !== l.quantidade && <div className="mudo">de {un(l.quantidade)}</div>}</> },
    { chave: 'situacao', titulo: 'Situação', ordenavel: true, render: (l) => <BadgeDe mapa={SITUACAO_LOTE} valor={l.situacao} /> },
    { chave: 'idadeDias', titulo: 'Idade', alinhar: 'right', ordenavel: true, render: (l) => (l.acimaLimiteIdade ? <span className="val-erro" title="Acima do limite de dias definido em Configurações">{dias(l.idadeDias)}</span> : dias(l.idadeDias)) },
    { chave: 'local', titulo: 'Local', ordenavel: true },
    // Extras, ligados em "Colunas"
    { chave: 'nfNumero', titulo: 'NF', ordenavel: true, opcional: true, render: (l) => <CodigoLink codigo={`NF ${l.nfNumero}`} /> },
    { chave: 'fornecedor', titulo: 'Fornecedor', ordenavel: true, opcional: true },
    { chave: 'fardos', titulo: 'Fardos', alinhar: 'right', ordenavel: true, opcional: true },
    { chave: 'recebidoEm', titulo: 'Recebido em', ordenavel: true, opcional: true, render: (l) => data(l.recebidoEm) },
    { chave: 'etapaInspecao', titulo: 'Inspeção', opcional: true, render: (l) => <BadgeDe mapa={ETAPA_INSPECAO} valor={l.etapaInspecao} /> },
    { chave: 'estoqueStatus', titulo: 'Estoque', opcional: true, render: (l) => <StatusEstoqueBadge s={l.estoqueStatus} /> },
    { chave: 'dimensoes', titulo: 'Dimensões (C × L × A)', opcional: true, render: (l) => `${metros(l.comprimentoM)} × ${metros(l.larguraM)} × ${metros(l.alturaM)}` },
    { chave: 'volumeDocumentalM3', titulo: 'Volume documental', alinhar: 'right', ordenavel: true, opcional: true, render: (l) => m3(l.volumeDocumentalM3) },
    { chave: 'volumeCalculadoM3', titulo: 'Volume calculado', alinhar: 'right', ordenavel: true, opcional: true, render: (l) => m3(l.volumeCalculadoM3) },
  ];

  return (
    <>
      <ListPage<Lote>
        titulo="Lotes"
        descricao="Um lote por NF, espécie e tamanho: origem, documentos e volume. O estoque do dia a dia, por fardo, fica em Estoque."
        aviso={
          <ComoFunciona>
            Lotes não são cadastrados à mão: nascem do recebimento, em unidades. Os fardos são formados depois da inspeção, um por resultado
            e categoria. Material aguardando inspeção, em quarentena, reprovado ou com divergência não fica disponível para separação. Volume documental (parte do DOF da espécie) e volume calculado aparecem
            separados, em "Colunas".
          </ComoFunciona>
        }
        listar={(q) => servicos.lotes.listar(q)}
        colunas={colunas}
        filtros={[
          { chave: 'situacao', rotulo: 'Situação', opcoes: SITUACAO_LOTE_OPCOES },
          { chave: 'acimaLimiteIdade', rotulo: 'Idade', opcoes: IDADE_LOTE_OPCOES },
          { chave: 'classe', rotulo: 'Classe', opcoes: CLASSE_OPCOES },
          { chave: 'categoria', rotulo: 'Categoria', opcoes: CATEGORIA_OPCOES },
        ]}
        acoesLinha={[
          { rotulo: 'Abrir', aoClicar: (l) => nav(`/lotes/${encodeURIComponent(l.codigo)}`) },
          { rotulo: 'Fardos e etiquetas', aoClicar: setFardosDe, visivel: (l) => l.fardos > 0 },
        ]}
      />
      <FardosModal lote={fardosDe} aoFechar={() => setFardosDe(null)} />
    </>
  );
}
