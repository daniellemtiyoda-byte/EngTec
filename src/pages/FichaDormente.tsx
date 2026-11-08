import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BadgeDe } from '../components/Badge';
import { Aviso, Carregando, Erro } from '../components/Estados';
import { IdCodigo } from '../components/IdCodigo';
import { LeitorQr } from '../components/LeitorQr';
import { LinhaTempo, type EventoLinhaTempo } from '../components/LinhaTempo';
import { RodapeAcoes } from '../components/RodapeAcoes';
import { useAuth } from '../contexts/AuthContext';
import { RE_DORMENTE } from '../dominio/identificacao';
import { RESULTADO_INSPECAO, rotuloCategoria, rotuloClasse, SITUACAO_DORMENTE, TIPO_LOCAL, USO_TAMANHO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { ApiError } from '../services/erros';
import { MARCA_EVENTO, MOTIVO_PERDA } from '../dominio/rotulos';
import type { FichaDormente as Ficha } from '../types/models';
import { cm, data, dataHora, mesAno, metros, urlSegura } from '../utils/format';

/** "ID não encontrado": mostra o código lido e oferece digitar de novo ou ler outro QR. */
function NaoEncontrado({ id }: { id: string }) {
  const nav = useNavigate();
  const [lendo, setLendo] = useState(false);
  const [texto, setTexto] = useState(id);
  const formatoValido = RE_DORMENTE.test(id);
  return (
    <section className="painel ficha-nao-encontrado">
      <h1 className="titulo">ID não encontrado</h1>
      <p>O código lido foi <span className="mono">{id}</span>.</p>
      <p className="mudo">{formatoValido ? 'O formato está certo, mas este dormente não está cadastrado no sistema. Confira a plaquinha ou leia outro QR.' : 'Este código não tem o formato de um ID de dormente (contrato + sequência de 6 dígitos, ex. AR00224-01-000357).'}</p>
      <form className="leitor-digitar" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) nav(`/d/${encodeURIComponent(texto.trim().toUpperCase())}`); }}>
        <label htmlFor="ficha-redigitar">Digitar de novo</label>
        <div className="leitor-digitar-linha">
          <input id="ficha-redigitar" className="mono" value={texto} onChange={(e) => setTexto(e.target.value)} autoCapitalize="characters" spellCheck={false} maxLength={40} />
          <button type="submit" className="btn btn-acao">Abrir</button>
        </div>
      </form>
      <RodapeAcoes><button type="button" className="btn btn-pri" onClick={() => setLendo(true)}>Ler outro QR</button></RodapeAcoes>
      <LeitorQr aberto={lendo} aoFechar={() => setLendo(false)} />
    </section>
  );
}

/** Um cartão da ficha: título e pares rótulo/valor. */
function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <section className="ficha-cartao" aria-label={titulo}><h2>{titulo}</h2>{children}</section>;
}
function Par({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div className="ficha-par"><dt>{rotulo}</dt><dd>{children}</dd></div>;
}

/**
 * Ficha do dormente (seção 9.13 do plano): a tela que abre quando alguém aponta a câmera para a plaquinha.
 * Celular primeiro: uma coluna, cartões empilhados, texto grande e ações no rodapé. Só leitura.
 */
export default function FichaDormente() {
  const { id: bruto = '' } = useParams();
  const id = decodeURIComponent(bruto).trim().toUpperCase();
  const { pode } = useAuth();
  const cad = useCadastros();
  const r = useAsync(() => servicos.dormentes.obter(id), [id]);

  if (r.carregando && !r.dados) return <section className="painel"><Carregando linhas={6} /></section>;
  if (r.erro instanceof ApiError && r.erro.status === 404) return <NaoEncontrado id={id} />;
  if (r.erro || !r.dados) return <section className="painel"><Erro erro={r.erro} aoTentar={r.recarregar} /></section>;

  const f: Ficha = r.dados;
  const d = f.dormente;
  // Data da entrega: o evento de baixa do dormente (a RME entregue que o levou).
  const entregueEm = [...f.eventos].reverse().find((h) => h.tipo === 'baixado')?.quando;
  const { especie, tamanho, tratamento } = f.item;
  const relatorio = urlSegura(f.inspecao?.relatorioUrl);
  const eventos: EventoLinhaTempo[] = [...f.eventos].reverse().map((ev) => ({
    quando: ev.quando, quem: ev.quem, titulo: ev.descricao, referencia: ev.referencia, marca: MARCA_EVENTO[ev.tipo], tipo: ev.tipo === 'baixado' ? 'saida' : ev.tipo,
  }));
  const operacao = pode('operacao:consultar');

  return (
    <article className="ficha">
      <header className="ficha-topo">
        <span className="objeto-tipo">Dormente</span>
        <h1 className="sr-only">Dormente {d.id}</h1>
        <IdCodigo id={d.id} tamanho="grande" />
        <div className="ficha-situacao"><BadgeDe mapa={SITUACAO_DORMENTE} valor={d.situacao} /></div>
        <p className="ficha-especie"><span className="nome-cientifico">{especie.nomeCientifico}</span> · {especie.nomePopular}</p>
        <p className="ficha-resumo">{rotuloClasse(f.item.classe)} · Item {tamanho.codigo} ({metros(tamanho.comprimentoCm / 100)}, {USO_TAMANHO[tamanho.uso][1]}) · {tratamento.preservativo} · usina {f.item.usinaTratamento} · {mesAno(f.item.dataTratamento)}</p>
      </header>

      {d.situacao === 'perdido' && f.perda && (
        <Aviso tom="critico">
          Perdido ({MOTIVO_PERDA[f.perda.motivo][1].toLowerCase()}){f.perda.descricao ? `: ${f.perda.descricao}` : ''}. Registrado em {data(f.perda.quando)} por {f.perda.quem};{' '}
          {f.perda.comunicadoEm ? `comunicado ao IBAMA em ${data(f.perda.comunicadoEm)}.` : 'ainda não comunicado ao IBAMA.'}
        </Aviso>
      )}

      {d.situacao === 'nao_localizado' && (
        <Aviso tom="critico">Não lido na inspeção do fardo: {f.fardo.conclusaoInspecao?.justificativa ?? 'sem justificativa registrada'}. Se ele foi encontrado, inspecione agora.</Aviso>
      )}

      <Cartao titulo="Onde está">
        <dl>
          <Par rotulo="Fardo">{operacao ? <IdCodigo id={f.fardo.id} para={`/f/${f.fardo.id}`} /> : <span className="mono">{f.fardo.id}</span>}</Par>
          {f.local ? (
            <Par rotulo="Local">
              {operacao ? <Link to={`/locais/${f.local.codigo}`}>{f.local.codigo}</Link> : f.local.codigo} · <BadgeDe mapa={TIPO_LOCAL} valor={f.local.tipo} />
            </Par>
          ) : <Par rotulo="Local">{d.situacao === 'emitido' ? 'Em trânsito (ainda não chegou)' : d.situacao === 'baixado' ? 'Saiu do estoque' : d.situacao === 'perdido' ? 'Perdido (fora do saldo)' : '—'}</Par>}
          {f.localDesde && <Par rotulo="Desde">{dataHora(f.localDesde)}</Par>}
          {f.rme && (
            <Par rotulo={d.situacao === 'baixado' ? 'Saída' : 'Reservado para'}>
              <IdCodigo id={f.rme.numero} para={`/saidas/${f.rme.numero}`} /> · {f.rme.destino}
              {d.situacao === 'baixado' && entregueEm && <> · entregue em {dataHora(entregueEm)}</>}
            </Par>
          )}
        </dl>
      </Cartao>

      <Cartao titulo="Inspeção">
        {f.inspecao ? (
          <dl>
            <Par rotulo="Resultado"><BadgeDe mapa={RESULTADO_INSPECAO} valor={f.inspecao.resultado} />{f.inspecao.categoria && <> · {rotuloCategoria(f.inspecao.categoria)}</>}</Par>
            {f.inspecao.medidas && <Par rotulo="Medidas">{cm(f.inspecao.medidas.comprimentoCm)} × {cm(f.inspecao.medidas.larguraCm)} × {cm(f.inspecao.medidas.alturaCm)}</Par>}
            <Par rotulo="Inspetor">{f.inspecao.inspetor}{f.inspecao.origem === 'manual' && ' (lançado à mão)'}</Par>
            <Par rotulo="Data">{dataHora(f.inspecao.inspecionadoEm)}</Par>
            {relatorio && <Par rotulo="Relatório"><a href={relatorio} target="_blank" rel="noopener noreferrer">Abrir relatório da inspeção</a></Par>}
          </dl>
        ) : <p className="mudo">{d.situacao === 'emitido' ? 'Ainda não chegou ao armazém.' : 'Ainda não inspecionado.'}</p>}
      </Cartao>

      <Cartao titulo="Origem">
        <dl>
          <Par rotulo="Contrato">{operacao ? <IdCodigo id={f.contrato.numero} para={`/contratos/${f.contrato.numero}`} /> : <span className="mono">{f.contrato.numero}</span>}</Par>
          <Par rotulo="Ata"><span className="mono">{f.ata.numero}</span></Par>
          <Par rotulo="Fornecedor">{operacao ? <Link to={`/fornecedores/${f.fornecedor.id}`}>{f.fornecedor.razaoSocial}</Link> : f.fornecedor.razaoSocial}</Par>
          <Par rotulo="Empresa inspetora">{f.empresaInspetora?.nome ?? '—'}</Par>
          {f.nf && <Par rotulo="NF">{f.nf.numero} · emitida em {data(f.nf.emissao)}</Par>}
          {f.dof && <Par rotulo="DOF">{f.dof.numero}{f.dof.declarado ? ` · declarado em ${data(f.dof.declarado.quando)}` : ' · ainda não declarado'}</Par>}
          {f.recebimento && <Par rotulo="Recebido em">{dataHora(f.recebimento.recebidoEm)} · {f.recebimento.recebidoPor}</Par>}
          <Par rotulo="Marcação">Usina {f.item.usinaTratamento} · impregnação {mesAno(f.item.dataTratamento)}</Par>
          {f.garantiaAte && <Par rotulo="Garantia até">{data(f.garantiaAte)} (5 anos da entrega)</Par>}
        </dl>
      </Cartao>

      <Cartao titulo="Linha do tempo"><LinhaTempo eventos={eventos} /></Cartao>

      <RodapeAcoes>
        {operacao && <Link className="btn btn-sec" to={`/f/${f.fardo.id}`}>Ver fardo</Link>}
        {(d.situacao === 'nao_localizado' || d.situacao === 'aguardando_inspecao') && pode('inspecao:operar') && <Link className="btn btn-pri" to={`/inspecao/${d.fardoId}?dormente=${d.id}`}>Inspecionar agora</Link>}
      </RodapeAcoes>
    </article>
  );
}
