import { useState } from 'react';
import { Aviso } from '../components/Estados';
import { BadgeDe, StatusEstoqueBadge } from '../components/Badge';
import { FardosModal } from '../components/FardosModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { CATEGORIA_OPCOES, CLASSE_OPCOES, IDADE_LOTE_OPCOES, RESULTADO_INSPECAO_OPCOES } from '../dominio/opcoes';
import { RESULTADO_INSPECAO } from '../dominio/rotulos';
import { servicos } from '../services';
import type { Lote } from '../types/models';
import { data, dias, m3, metros, rotuloCategoria, rotuloClasse, un } from '../utils/format';

export default function Lotes() {
  const [fardosDe, setFardosDe] = useState<Lote | null>(null);

  const colunas: Coluna<Lote>[] = [
    { chave: 'codigo', titulo: 'Lote', ordenavel: true },
    { chave: 'nfNumero', titulo: 'NF', ordenavel: true },
    { chave: 'fornecedor', titulo: 'Fornecedor', ordenavel: true },
    { chave: 'especieDocumental', titulo: 'Espécie (documento)', ordenavel: true, render: (l) => <em>{l.especieDocumental}</em> },
    { chave: 'classe', titulo: 'Classe', render: (l) => rotuloClasse(l.classe) },
    { chave: 'categoria', titulo: 'Categoria', render: (l) => rotuloCategoria(l.categoria) },
    { chave: 'inspecao', titulo: 'Inspeção', render: (l) => <BadgeDe mapa={RESULTADO_INSPECAO} valor={l.inspecao} /> },
    { chave: 'tamanho', titulo: 'Tamanho', ordenavel: true },
    { chave: 'quantidade', titulo: 'Recebido', alinhar: 'right', ordenavel: true, render: (l) => un(l.quantidade) },
    { chave: 'saldo', titulo: 'Saldo', alinhar: 'right', ordenavel: true, render: (l) => un(l.saldo) },
    { chave: 'fardos', titulo: 'Fardos', alinhar: 'right', ordenavel: true },
    { chave: 'dimensoes', titulo: 'Dimensões (C × L × A)', render: (l) => `${metros(l.comprimentoM)} × ${metros(l.larguraM)} × ${metros(l.alturaM)}` },
    { chave: 'volumeDocumentalM3', titulo: 'Volume documental', alinhar: 'right', ordenavel: true, render: (l) => m3(l.volumeDocumentalM3) },
    { chave: 'volumeCalculadoM3', titulo: 'Volume calculado', alinhar: 'right', ordenavel: true, render: (l) => m3(l.volumeCalculadoM3) },
    { chave: 'recebidoEm', titulo: 'Recebido em', ordenavel: true, render: (l) => data(l.recebidoEm) },
    { chave: 'idadeDias', titulo: 'Idade', alinhar: 'right', ordenavel: true, render: (l) => (l.acimaLimiteIdade ? <span className="val-erro" title="Acima do limite de dias definido em Configurações">{dias(l.idadeDias)}</span> : dias(l.idadeDias)) },
    { chave: 'estoqueStatus', titulo: 'Estoque', render: (l) => <StatusEstoqueBadge s={l.estoqueStatus} /> },
  ];

  return (
    <>
      <ListPage<Lote>
        titulo="Lotes"
        descricao="Um lote por NF, espécie e tamanho, criado pelo sistema ao confirmar o recebimento. Volume documental (parte do DOF da espécie) e volume calculado aparecem separados."
        aviso={<Aviso>Lotes não são cadastrados à mão: nascem do recebimento, com os fardos. Material aguardando inspeção, em quarentena, reprovado ou com divergência não fica disponível para separação.</Aviso>}
        listar={(q) => servicos.lotes.listar(q)}
        colunas={colunas}
        filtros={[
          { chave: 'acimaLimiteIdade', rotulo: 'Idade', opcoes: IDADE_LOTE_OPCOES },
          { chave: 'inspecao', rotulo: 'Inspeção', opcoes: RESULTADO_INSPECAO_OPCOES },
          { chave: 'classe', rotulo: 'Classe', opcoes: CLASSE_OPCOES },
          { chave: 'categoria', rotulo: 'Categoria', opcoes: CATEGORIA_OPCOES },
        ]}
        acoesLinha={[{ rotulo: 'Fardos e etiquetas', aoClicar: setFardosDe }]}
      />
      <FardosModal lote={fardosDe} aoFechar={() => setFardosDe(null)} />
    </>
  );
}
