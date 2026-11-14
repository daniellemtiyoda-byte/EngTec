import { SituacaoFardo } from '../components/SituacaoFardo';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { BadgeDe } from '../components/Badge';
import { CabecalhoObjeto, FatoChave } from '../components/Cabecalhos';
import { ContratoModal } from '../components/ContratoModal';
import { Aviso, Carregando, Erro, Vazio } from '../components/Estados';
import { FormModal } from '../components/FormModal';
import { IdCodigo } from '../components/IdCodigo';
import { BarraProgresso } from '../components/Indicadores';
import { LinhaTempo, linhaDoEvento, type EventoLinhaTempo } from '../components/LinhaTempo';
import { ListPage, type Coluna } from '../components/ListPage';
import { MenuAcoes } from '../components/MenuAcoes';
import { Relacionados } from '../components/Relacionados';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_FARDO_OPCOES } from '../dominio/opcoes';
import { NIVEL_PRAZO, SITUACAO_CONTRATO, SITUACAO_ENTREGA, SITUACAO_PARCELA, USO_TAMANHO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { Contrato, Entrega, Fardo } from '../types/models';
import { data, numero } from '../utils/format';
import { totaisDoContrato } from './Contratos';

type AbaContrato = 'itens' | 'parcelas' | 'fardos' | 'entregas' | 'historico';

/** Página do contrato (seção 9.4 do plano): itens (tamanhos), cronograma por parcela, fardos, entregas (NF e DOF) e histórico. */
export default function ContratoDetalhe() {
  const { numero: num = '' } = useParams();
  const { pode } = useAuth();
  const notificar = useToast();
  const cad = useCadastros();
  const r = useAsync(() => servicos.contratos.obter(num), [num]);
  const entregas = useAsync(() => servicos.documentos.listarEntregas({ pageSize: 200, filters: { contratoId: r.dados?.id ?? '-' } }), [r.dados?.id]);
  const parametros = useAsync(() => servicos.parametros.obter(), []);
  const historico = useAsync(() => servicos.eventos.listar({ pageSize: 500, filters: { entidade: 'contrato', entidadeId: r.dados?.id ?? '-' } }), [r.dados?.id]);
  const [aba, setAba] = useAbaNoEndereco<AbaContrato>(['itens', 'parcelas', 'fardos', 'entregas', 'historico']);
  const [editar, setEditar] = useState(false);
  const [cancelar, setCancelar] = useState(false);

  if (r.carregando && !r.dados) return <section className="painel"><Carregando /></section>;
  if (r.erro || !r.dados) return <section className="painel"><Erro erro={r.erro} aoTentar={r.recarregar} /></section>;
  const c = r.dados;
  const t = totaisDoContrato(c);
  const ata = cad.atas.get(c.ataId);
  const lista = entregas.dados?.items ?? [];
  const podeEditar = pode('contratos:editar') && c.situacao !== 'cancelado';
  const podeSimular = pode('simulador:usar') && c.situacao === 'vigente' && !!parametros.dados?.modoDemonstracao;
  const itemDe = new Map(c.itens.map((i) => [i.id, i]));

  const abas: Aba<AbaContrato>[] = [
    { valor: 'itens', rotulo: 'Itens', total: c.itens.length },
    { valor: 'parcelas', rotulo: 'Parcelas', total: c.parcelas.length },
    { valor: 'fardos', rotulo: 'Fardos' },
    { valor: 'entregas', rotulo: 'Entregas', total: lista.length },
    { valor: 'historico', rotulo: 'Histórico' },
  ];

  const colunasFardo: Coluna<Fardo>[] = [
    { chave: 'id', titulo: 'Fardo', ordenavel: true, render: (f) => <IdCodigo id={f.id} /> },
    { chave: 'itemContratoId', titulo: 'Item', render: (f) => { const i = itemDe.get(f.itemContratoId); return i ? `${cad.descreverItem({ tamanhoId: i.tamanhoId, classe: f.classe })} · ${cad.nomeEspecie(f.especieId)}` : '—'; } },
    { chave: 'situacao', titulo: 'Situação', render: (f) => <SituacaoFardo fardo={f} /> },
    { chave: 'saldo', titulo: 'Saldo', alinhar: 'right', ordenavel: true, render: (f) => `${numero(f.saldo)}/${numero(f.quantidadeInicial)}` },
    { chave: 'localId', titulo: 'Local', render: (f) => cad.codigoLocal(f.localId) },
    { chave: 'recebidoEm', titulo: 'Recebido em', ordenavel: true, render: (f) => data(f.recebidoEm) },
  ];

  // Histórico do contrato: os eventos registrados (criação, edição, emissões, entregas, laudos, cancelamento).
  const eventos: EventoLinhaTempo[] = (historico.dados?.items ?? []).map(linhaDoEvento);

  return (
    <section className="painel">
      <CabecalhoObjeto
        tipo="Contrato" id={c.numero} situacao={<BadgeDe mapa={SITUACAO_CONTRATO} valor={c.situacao} />}
        migalhas={[{ rotulo: 'Contratos', para: '/contratos' }, { rotulo: `Contrato ${c.numero}` }]}
        acoes={<>
          {podeSimular && <Link className="btn btn-sec" to={`/simulador?contrato=${c.numero}`}>Gerar entrega no simulador</Link>}
          {podeEditar && <button className="btn btn-pri" onClick={() => setEditar(true)}>Editar</button>}
          {podeEditar && <MenuAcoes itens={[{ rotulo: 'Cancelar contrato', aoClicar: () => setCancelar(true) }]} />}
        </>}
        fatos={<>
          <FatoChave rotulo="Fornecedor" valor={cad.nomeFornecedor(c.fornecedorId)} para={`/fornecedores/${c.fornecedorId}`} />
          <FatoChave rotulo="Ata" valor={<span className="mono">{ata?.numero ?? '—'}</span>} para={ata ? `/atas/${ata.numero}` : undefined} />
          <FatoChave rotulo="Assinatura" valor={data(c.dataAssinatura)} />
          <FatoChave rotulo="Gestor" valor={c.gestor} />
          <FatoChave rotulo="Contratado" valor={numero(t.contratado)} />
          <FatoChave rotulo="Recebido" valor={numero(t.recebidos)} />
          <FatoChave rotulo="Aprovado" valor={numero(t.aprovados)} />
          <FatoChave rotulo="Reprovado" valor={numero(t.reprovados)} />
          {c.parcelasAtrasadas > 0 && <FatoChave rotulo="Parcelas atrasadas" valor={<span className="texto-critico">{c.parcelasAtrasadas}</span>} para={`/contratos/${c.numero}?aba=parcelas`} />}
          {c.recebimentoDefinitivoEm && <FatoChave rotulo="Recebimento definitivo" valor={data(c.recebimentoDefinitivoEm)} />}
        </>}
      />
      {c.situacao === 'cancelado' && <Aviso tom="critico">Contrato cancelado: {c.motivoCancelamento}</Aviso>}

      <div className="objeto-grade">
        <AbasSecao abas={abas} ativa={aba} aoEscolher={setAba} rotulo="Seções do contrato">
          {aba === 'itens' && (
            <ul className="itens-cartoes">
              {c.itens.filter((i) => i.quantidade > 0 || i.emitidos > 0).map((i) => (
                <li key={i.id} className="item-cartao">
                  <strong>{cad.descreverTamanho(i.tamanhoId)}</strong>
                  {cad.tamanhos.get(i.tamanhoId) && <span><BadgeDe mapa={USO_TAMANHO} valor={cad.tamanhos.get(i.tamanhoId)!.uso} /></span>}
                  <dl>
                    <div><dt>Contratado</dt><dd>{numero(i.quantidade)}</dd></div>
                    <div><dt>Emitidos</dt><dd>{numero(i.emitidos)}</dd></div>
                    <div><dt>Reprovados</dt><dd>{numero(i.reprovados)}</dd></div>
                    <div><dt>Saldo a emitir</dt><dd>{numero(i.saldoAEmitir)}</dd></div>
                  </dl>
                  <BarraProgresso total={i.quantidade} recebido={i.recebidos} aprovado={i.aprovados} />
                </li>
              ))}
            </ul>
          )}
          {aba === 'parcelas' && (
            <div className="tabela-wrap">
              <table className="tabela tabela-cartoes">
                <caption className="sr-only">Cronograma do contrato por parcela</caption>
                <thead><tr><th scope="col">Parcela</th><th scope="col">Itens</th><th scope="col">Janela de entrega</th><th scope="col" className="al-right">Recebidos</th><th scope="col">Situação</th></tr></thead>
                <tbody>
                  {c.parcelas.map((p) => (
                    <tr key={p.numero}>
                      <td>{p.numero}ª parcela</td>
                      <td data-rotulo="Itens">{p.itens.map((i) => `${cad.descreverTamanho(i.tamanhoId)}: ${numero(i.quantidade)}`).join('; ')}</td>
                      <td data-rotulo="Janela de entrega">{data(p.inicio)} a {data(p.fim)}</td>
                      <td className="al-right" data-rotulo="Recebidos">{numero(p.recebidos)} de {numero(p.quantidade)}</td>
                      <td data-rotulo="Situação">
                        <BadgeDe mapa={SITUACAO_PARCELA} valor={p.situacao} />
                        {p.diasAtraso > 0 && <span className="mudo"> {numero(p.diasAtraso)} dia(s) {p.entregueEm ? 'de atraso' : 'em atraso'}</span>}
                        {p.entregueEm && <span className="mudo"> · entregue em {data(p.entregueEm)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {aba === 'fardos' && (
            <ListPage<Fardo>
              secao titulo="Fardos do contrato" colunas={colunasFardo}
              listar={(q) => servicos.fardos.listar({ ...q, filters: { ...q.filters, contratoId: c.id } })}
              filtros={[{ chave: 'situacao', rotulo: 'Situação', opcoes: SITUACAO_FARDO_OPCOES }]}
            />
          )}
          {aba === 'entregas' && (entregas.carregando && !entregas.dados ? <Carregando /> : lista.length === 0 ? <Vazio mensagem="Nenhuma entrega deste contrato." dica="As entregas nascem no cadastro de NF e DOF." /> : (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th scope="col">NF</th><th scope="col">Parcela</th><th scope="col">Situação</th><th scope="col" className="al-right">Fardos</th><th scope="col" className="al-right">Dormentes</th><th scope="col">Prazo da DOF</th><th scope="col">Laudo</th></tr></thead>
                <tbody>
                  {lista.map((en: Entrega) => (
                    <tr key={en.id}>
                      <td><Link to={`/documentos?q=${en.nfNumero}`}>NF {en.nfNumero}</Link></td>
                      <td>{en.parcela}ª{en.reentrega && ' · reentrega'}</td>
                      <td><BadgeDe mapa={SITUACAO_ENTREGA} valor={en.situacao} /></td>
                      <td className="al-right">{en.fardosRecebidos.length} de {en.fardosIds.length} recebidos</td>
                      <td className="al-right">{numero(en.dormentes)}</td>
                      <td>{data(en.prazoDeclaracao)} {en.nivelPrazo !== 'ok' && <BadgeDe mapa={NIVEL_PRAZO} valor={en.nivelPrazo} />}</td>
                      <td>{en.laudo ? <span className="mono">{en.laudo.numero}</span> : en.prazoLaudo ? <>até {data(en.prazoLaudo)} {en.nivelPrazoLaudo && en.nivelPrazoLaudo !== 'ok' && <BadgeDe mapa={NIVEL_PRAZO} valor={en.nivelPrazoLaudo} />}</> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {aba === 'historico' && <LinhaTempo eventos={eventos} />}
        </AbasSecao>
        <Relacionados itens={[
          { icone: 'fabrica', tipo: 'Fornecedor', valor: cad.nomeFornecedor(c.fornecedorId), para: `/fornecedores/${c.fornecedorId}` },
          { icone: 'contrato', tipo: 'Ata de registro de preços', valor: <span className="mono">{ata?.numero ?? '—'}</span>, detalhe: ata ? `Vigência ${data(ata.vigenciaInicio)} a ${data(ata.vigenciaFim)}` : undefined },
          { icone: 'file', tipo: 'Entregas (NF e DOF)', valor: `${lista.length} entrega(s)`, para: `/documentos?q=${c.numero}` },
          { icone: 'users', tipo: 'Gestor do contrato', valor: c.gestor },
        ]} />
      </div>

      <ContratoModal
        aberto={editar} contrato={c} cad={cad} aoFechar={() => setEditar(false)}
        aoSalvar={() => { setEditar(false); notificar('sucesso', `Contrato ${c.numero} atualizado.`); r.recarregar(); }}
      />
      <FormModal
        titulo={`Cancelar contrato ${c.numero}`} aberto={cancelar} aoFechar={() => setCancelar(false)} rotuloEnviar="Cancelar contrato"
        campos={[{ nome: 'motivo', rotulo: 'Motivo do cancelamento', tipo: 'textarea', obrigatorio: true }]}
        confirmacao={() => `Cancelar o contrato ${c.numero}? Fardos ainda não recebidos deixam de ser esperados. Esta ação não pode ser desfeita.`}
        aoEnviar={async (v) => { await servicos.contratos.cancelar(c.numero, v.motivo); notificar('sucesso', `Contrato ${c.numero} cancelado.`); r.recarregar(); }}
      />
    </section>
  );
}
