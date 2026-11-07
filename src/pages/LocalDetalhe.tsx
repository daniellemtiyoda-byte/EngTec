import { Link, useParams } from 'react-router-dom';
import { BadgeDe } from '../components/Badge';
import { CabecalhoObjeto, FatoChave } from '../components/Cabecalhos';
import { Carregando, Erro, Vazio } from '../components/Estados';
import { IdCodigo } from '../components/IdCodigo';
import { ListPage, type Coluna } from '../components/ListPage';
import { DisponivelFardo, SituacaoFardo } from '../components/SituacaoFardo';
import { idLocal } from '../dominio/identificacao';
import { SITUACAO_CADASTRO, TIPO_LOCAL } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { ApiError } from '../services/http';
import type { Fardo } from '../types/models';
import { dias, numero } from '../utils/format';

/**
 * Página do local (seção 9.15 do plano), destino do QR do local (`LOC-<código>`, link `/#/locais/<código>`):
 * tipo, capacidade, ocupação e os fardos que estão nele; imprimir o QR do local e ver os fardos no Estoque.
 */
export default function LocalDetalhe() {
  const { codigo: bruto = '' } = useParams();
  const codigo = decodeURIComponent(bruto).trim().toUpperCase();
  const r = useAsync(() => servicos.locais.obterPorCodigo(codigo), [codigo]);

  if (r.carregando && !r.dados) return <section className="painel"><Carregando /></section>;
  if (r.erro instanceof ApiError && r.erro.status === 404) return <section className="painel"><Vazio mensagem={`Local ${codigo} não encontrado.`} dica="Confira o código na etiqueta do local." /></section>;
  if (r.erro || !r.dados) return <section className="painel"><Erro erro={r.erro} aoTentar={r.recarregar} /></section>;
  const l = r.dados;

  const colunas: Coluna<Fardo>[] = [
    { chave: 'id', titulo: 'Fardo', ordenavel: true, render: (f) => <IdCodigo id={f.id} para={`/f/${f.id}`} /> },
    { chave: 'itemContratoId', titulo: 'Situação', render: (f) => <SituacaoFardo fardo={f} /> },
    { chave: 'disponivel', titulo: 'Disponível', alinhar: 'right', render: (f) => <DisponivelFardo fardo={f} /> },
    { chave: 'saldo', titulo: 'Saldo', alinhar: 'right', ordenavel: true, render: (f) => `${numero(f.saldo)}/${numero(f.quantidadeInicial)}` },
    { chave: 'idadeDias', titulo: 'Idade', alinhar: 'right', ordenavel: true, render: (f) => (f.idadeDias !== undefined ? dias(f.idadeDias) : '—') },
  ];

  return (
    <section className="painel">
      <CabecalhoObjeto
        tipo="Local" id={idLocal(l.codigo)} situacao={<BadgeDe mapa={SITUACAO_CADASTRO} valor={l.ativo ? 'ativo' : 'inativo'} />}
        migalhas={[{ rotulo: 'Locais', para: '/locais' }, { rotulo: `Local ${l.codigo}` }]}
        acoes={<>
          {(l.tipo === 'armazenagem' || l.tipo === 'expedicao') && <Link className="btn btn-acao" to={`/estoque?visao=fardo&localId=${l.id}`}>Ver no estoque</Link>}
          <Link className="btn btn-sec" to={`/locais/etiquetas?local=${encodeURIComponent(l.codigo)}`}>Imprimir QR do local</Link>
        </>}
        fatos={<>
          <FatoChave rotulo="Código" valor={<span className="mono">{l.codigo}</span>} />
          <FatoChave rotulo="Tipo" valor={<BadgeDe mapa={TIPO_LOCAL} valor={l.tipo} />} />
          <FatoChave rotulo="Descrição" valor={l.descricao} />
          <FatoChave rotulo="Ocupação" valor={`${numero(l.ocupacao)} de ${numero(l.capacidade)} dormentes`} />
          <FatoChave rotulo="Fardos" valor={numero(l.fardos)} />
        </>}
      />
      <ListPage<Fardo>
        secao titulo="Fardos neste local" colunas={colunas}
        listar={(q) => servicos.fardos.listar({ ...q, filters: { ...q.filters, noLocal: l.id } })}
      />
    </section>
  );
}
