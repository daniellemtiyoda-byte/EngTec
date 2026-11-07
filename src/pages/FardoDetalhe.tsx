import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { BadgeDe } from '../components/Badge';
import { CabecalhoObjeto, FatoChave } from '../components/Cabecalhos';
import { Carregando, Erro, Vazio } from '../components/Estados';
import { IdCodigo } from '../components/IdCodigo';
import { LinhaTempo } from '../components/LinhaTempo';
import { Relacionados } from '../components/Relacionados';
import { RodapeAcoes } from '../components/RodapeAcoes';
import { DisponivelFardo, SituacaoFardo } from '../components/SituacaoFardo';
import { useToast } from '../components/Toast';
import { TransferirFardo } from '../components/TransferirFardo';
import { RE_FARDO } from '../dominio/identificacao';
import { ordinalClasse, rotuloCategoria, rotuloClasse, SITUACAO_DORMENTE, SITUACAO_FARDO, TIPO_MOVIMENTACAO } from '../dominio/rotulos';
import { useAuth } from '../contexts/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { useTelaPequena } from '../hooks/useTelaPequena';
import { servicos } from '../services';
import { ApiError } from '../services/http';
import { cm, data, dataHora, dias, numero } from '../utils/format';

type AbaFardo = 'dormentes' | 'origem' | 'movimentacoes' | 'historico';

/**
 * Página do fardo (seção 9.12 do plano), destino do QR do fardo: saldo físico e disponível, local, idade, os
 * dormentes, a origem e o histórico. Ações por situação: Inspecionar, Transferir (leitura do QR do local) e a etiqueta.
 */
export default function FardoDetalhe() {
  const { id: bruto = '' } = useParams();
  const { pode } = useAuth();
  const notificar = useToast();
  const pequena = useTelaPequena();
  const [transferir, setTransferir] = useState(false);
  const id = decodeURIComponent(bruto).trim().toUpperCase();
  const cad = useCadastros();
  const r = useAsync(() => servicos.fardos.obter(id), [id]);
  const [aba, setAba] = useAbaNoEndereco<AbaFardo>(['dormentes', 'origem', 'movimentacoes', 'historico']);

  if (r.carregando && !r.dados) return <section className="painel"><Carregando /></section>;
  if (r.erro instanceof ApiError && r.erro.status === 404) {
    return <section className="painel"><Vazio mensagem={`Fardo ${id} não encontrado.`} dica={RE_FARDO.test(id) ? 'Confira o código na etiqueta do fardo.' : 'O código não tem o formato de um fardo (contrato + F + 3 dígitos, ex. AR00224-01-F012).'} /></section>;
  }
  if (r.erro || !r.dados) return <section className="painel"><Erro erro={r.erro} aoTentar={r.recarregar} /></section>;

  const { fardo: f, contrato, item, local, dormentes, nf, dof, recebimento, movimentacoes, entrega } = r.dados;
  const abas: Aba<AbaFardo>[] = [
    { valor: 'dormentes', rotulo: 'Dormentes', total: dormentes.length },
    { valor: 'origem', rotulo: 'Origem' },
    { valor: 'movimentacoes', rotulo: 'Movimentações', total: movimentacoes.length },
    { valor: 'historico', rotulo: 'Histórico' },
  ];

  // Ações por situação (seção 9.12): no celular, no rodapé fixo (seção 11.1).
  const inspecionar = (f.situacao === 'aguardando_inspecao' || f.situacao === 'em_inspecao') && pode('inspecao:operar');
  const podeTransferir = f.situacao === 'em_estoque' && pode('estoque:movimentar');
  const acoes = (inspecionar || podeTransferir || f.emissaoId) ? <>
    {inspecionar && <Link className="btn btn-acao" to={`/inspecao/${f.id}`}>Inspecionar</Link>}
    {podeTransferir && <button type="button" className="btn btn-acao" onClick={() => setTransferir(true)}>Transferir</button>}
    {f.emissaoId && <Link className="btn btn-sec" to={`/simulador/etiquetas/${f.emissaoId}?fardo=${f.id}`}>{pequena ? 'Etiqueta' : 'Imprimir etiqueta do fardo'}</Link>}
  </> : null;

  return (
    <section className="painel">
      <CabecalhoObjeto
        tipo="Fardo" id={f.id} situacao={<SituacaoFardo fardo={f} />}
        migalhas={[{ rotulo: 'Contratos', para: '/contratos' }, { rotulo: `Contrato ${contrato.numero}`, para: `/contratos/${contrato.numero}?aba=fardos` }, { rotulo: `Fardo ${f.id}` }]}
        acoes={!pequena && acoes}
        fatos={<>
          <FatoChave rotulo="Saldo" valor={`${numero(f.saldo)} de ${numero(f.quantidadeInicial)}`} />
          <FatoChave rotulo="Disponível" valor={<DisponivelFardo fardo={f} />} />
          <FatoChave rotulo="Local" valor={local ? local.codigo : '—'} para={local ? `/locais/${local.codigo}` : undefined} />
          <FatoChave rotulo="Idade" valor={f.idadeDias !== undefined ? <>{dias(f.idadeDias)}{f.acimaLimiteDias && <span className="texto-critico"> · acima do limite</span>}</> : '—'} />
          <FatoChave rotulo="Contrato" valor={<span className="mono">{contrato.numero}</span>} para={`/contratos/${contrato.numero}`} />
          {f.recebidoEm && <FatoChave rotulo="Recebido em" valor={data(f.recebidoEm)} />}
          <FatoChave rotulo="Item" valor={`${item.tamanho.codigo} · ${ordinalClasse(item.classe)} classe · ${item.especie.nomePopular}`} />
          {f.faltaDeclarada ? <FatoChave rotulo="Falta no recebimento" valor={`${numero(f.faltaDeclarada)} dormente(s)`} /> : null}
          {f.progressoInspecao && <FatoChave rotulo="Inspeção" valor={`${numero(f.progressoInspecao.inspecionados)} de ${numero(f.progressoInspecao.total)}`} para={`/inspecao/${f.id}`} />}
        </>}
      />
      <div className="objeto-grade">
        <AbasSecao abas={abas} ativa={aba} aoEscolher={setAba} rotulo="Seções do fardo">
          {aba === 'dormentes' && (
            <div className="tabela-wrap">
              <table className="tabela tabela-cartoes">
                <thead><tr><th scope="col">Dormente</th><th scope="col">Situação</th><th scope="col">Categoria</th><th scope="col" className="al-right">Comprimento</th></tr></thead>
                <tbody>
                  {dormentes.map((d) => (
                    <tr key={d.id}>
                      <td><IdCodigo id={d.id} para={`/d/${d.id}`} /></td>
                      <td data-rotulo="Situação"><BadgeDe mapa={SITUACAO_DORMENTE} valor={d.situacao} /></td>
                      <td data-rotulo="Categoria">{d.categoria ? rotuloCategoria(d.categoria) : '—'}</td>
                      <td className="al-right" data-rotulo="Comprimento">{d.medidas ? cm(d.medidas.comprimentoCm) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {aba === 'origem' && (
            <dl className="detalhes">
              <dt>Contrato</dt><dd><IdCodigo id={contrato.numero} para={`/contratos/${contrato.numero}`} /></dd>
              <dt>Fornecedor</dt><dd><Link to={`/fornecedores/${contrato.fornecedorId}`}>{cad.nomeFornecedor(contrato.fornecedorId)}</Link></dd>
              <dt>Empresa inspetora</dt><dd>{entrega?.boletim ? `${cad.nomeEmpresa(entrega.boletim.empresaInspetoraId)} · Boletim ${entrega.boletim.numero}` : '—'}</dd>
              <dt>Item</dt><dd>{cad.descreverTamanho(item.tamanho.id)} · {rotuloClasse(item.classe)}</dd>
              <dt>Madeira</dt><dd>{item.especie.nomeCientifico} ({item.especie.nomePopular}) · {item.tratamento.preservativo} / {item.tratamento.empresa}</dd>
              <dt>NF</dt><dd>{nf ? `${nf.numero} · emitida em ${data(nf.emissao)}` : '—'}</dd>
              <dt>DOF</dt><dd>{dof ? `${dof.numero} · validade ${data(dof.validade)}${dof.declarado ? ` · declarado em ${data(dof.declarado.quando)}` : ''}` : '—'}</dd>
              <dt>Recebimento</dt><dd>{recebimento ? `${dataHora(recebimento.recebidoEm)} · ${recebimento.recebidoPor}` : 'Ainda não recebido'}</dd>
              <dt>Inspeção</dt><dd>{f.conclusaoInspecao ? `Concluída em ${dataHora(f.conclusaoInspecao.quando)} · ${f.conclusaoInspecao.quem}` : 'Não concluída'}</dd>
            </dl>
          )}
          {aba === 'movimentacoes' && (movimentacoes.length === 0 ? <Vazio mensagem="Nenhuma movimentação deste fardo." /> : (
            <div className="tabela-wrap">
              <table className="tabela tabela-cartoes">
                <thead><tr><th scope="col">Quando</th><th scope="col">Tipo</th><th scope="col" className="al-right">Dormentes</th><th scope="col">De</th><th scope="col">Para</th><th scope="col">Quem</th></tr></thead>
                <tbody>
                  {[...movimentacoes].reverse().map((m) => (
                    <tr key={m.id}>
                      <td>{dataHora(m.quando)}</td>
                      <td data-rotulo="Tipo"><BadgeDe mapa={TIPO_MOVIMENTACAO} valor={m.tipo} /></td>
                      <td className="al-right" data-rotulo="Dormentes">{numero(m.quantidade)}</td>
                      <td data-rotulo="De">{cad.codigoLocal(m.deLocalId)}</td>
                      <td data-rotulo="Para">{m.tipo === 'saida' ? (m.referencia ?? '—') : cad.codigoLocal(m.paraLocalId)}</td>
                      <td data-rotulo="Quem">{m.quem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {aba === 'historico' && <LinhaTempo eventos={[...f.historico].reverse().map((e) => ({ quando: e.quando, quem: e.quem, titulo: e.descricao, referencia: e.referencia }))} />}
        </AbasSecao>
        <Relacionados itens={[
          { icone: 'contrato', tipo: 'Contrato', valor: <span className="mono">{contrato.numero}</span>, para: `/contratos/${contrato.numero}` },
          { icone: 'fabrica', tipo: 'Fornecedor', valor: cad.nomeFornecedor(contrato.fornecedorId), para: `/fornecedores/${contrato.fornecedorId}` },
          ...(nf ? [{ icone: 'file' as const, tipo: 'NF e DOF', valor: `NF ${nf.numero}`, detalhe: dof ? `DOF ${dof.numero}` : undefined }] : []),
          ...(local ? [{ icone: 'local' as const, tipo: 'Local', valor: local.codigo, para: `/locais/${local.codigo}` }] : []),
        ]} />
      </div>
      {pequena && acoes && <RodapeAcoes>{acoes}</RodapeAcoes>}
      <TransferirFardo
        aberto={transferir} cad={cad} fardoId={f.id} aoFechar={() => setTransferir(false)}
        aoTransferir={(_, de, para) => { setTransferir(false); notificar('sucesso', `Fardo ${f.id} transferido de ${de} para ${para}.`); r.recarregar(); cad.recarregar(); }}
      />
    </section>
  );
}
