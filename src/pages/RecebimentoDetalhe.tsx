import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { Badge, BadgeDe } from '../components/Badge';
import { CabecalhoObjeto, FatoChave } from '../components/Cabecalhos';
import { Aviso, Carregando, Erro, Vazio } from '../components/Estados';
import { IdCodigo } from '../components/IdCodigo';
import { LinhaTempo, type EventoLinhaTempo } from '../components/LinhaTempo';
import { ConfirmModal } from '../components/Modal';
import { PrazoDof } from '../components/PrazoDof';
import { Relacionados } from '../components/Relacionados';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_FARDO, TIPO_OCORRENCIA } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { mensagemSegura } from '../services/http';
import { data, dataHora, m3, numero, pct } from '../utils/format';

type AbaRec = 'fardos' | 'documentos' | 'ocorrencias' | 'historico';

/** Página do recebimento (seção 9.8 do plano): fardos lidos, documentos com o volume conferido, ocorrências e a declaração da DOF. */
export default function RecebimentoDetalhe() {
  const { id = '' } = useParams();
  const { pode } = useAuth();
  const notificar = useToast();
  const cad = useCadastros();
  const r = useAsync(async () => {
    const rec = await servicos.recebimentos.obter(id);
    const [entrega, nf, dof, fardos, contratos] = await Promise.all([
      servicos.documentos.listarEntregas({ pageSize: 1, filters: { id: rec.entregaId } }).then((x) => x.items[0]),
      servicos.documentos.listarNfs({ pageSize: 1, filters: { id: rec.nfId } }).then((x) => x.items[0]),
      servicos.documentos.listarDofs({ pageSize: 1, filters: { id: rec.dofId } }).then((x) => x.items[0]),
      servicos.fardos.listar({ pageSize: 200, filters: { entregaId: rec.entregaId } }).then((x) => x.items),
      servicos.contratos.listar({ pageSize: 500 }).then((x) => x.items),
    ]);
    return { rec, entrega, nf, dof, fardos, contrato: contratos.find((c) => c.id === entrega?.contratoId) };
  }, [id]);
  const [aba, setAba] = useAbaNoEndereco<AbaRec>(['fardos', 'documentos', 'ocorrencias', 'historico']);
  const [declarar, setDeclarar] = useState(false);
  const [declarando, setDeclarando] = useState(false);

  if (r.carregando && !r.dados) return <section className="painel"><Carregando /></section>;
  if (r.erro || !r.dados) return <section className="painel"><Erro erro={r.erro} aoTentar={r.recarregar} /></section>;
  const { rec, entrega, nf, dof, fardos, contrato } = r.dados;
  const lidosAqui = fardos.filter((f) => rec.fardosLidos.includes(f.id));

  async function confirmarDeclaracao() {
    if (!dof) return;
    setDeclarando(true);
    try {
      await servicos.documentos.declararDof(dof.id);
      notificar('sucesso', `DOF ${dof.numero} marcada como declarada no Sinaflor.`);
      r.recarregar();
    } catch (e) { notificar('erro', mensagemSegura(e)); }
    finally { setDeclarando(false); setDeclarar(false); }
  }

  const abas: Aba<AbaRec>[] = [
    { valor: 'fardos', rotulo: 'Fardos', total: lidosAqui.length },
    { valor: 'documentos', rotulo: 'Documentos' },
    { valor: 'ocorrencias', rotulo: 'Ocorrências', total: rec.ocorrencias.length },
    { valor: 'historico', rotulo: 'Histórico' },
  ];
  const eventos: EventoLinhaTempo[] = [
    ...(dof?.declarado ? [{ quando: dof.declarado.quando, quem: dof.declarado.quem, titulo: `DOF ${dof.numero} declarada no Sinaflor`, marca: 'DOF' }] : []),
    { quando: rec.recebidoEm, quem: rec.recebidoPor, titulo: `Recebidos ${rec.fardosLidos.length} fardo(s) em ${cad.codigoLocal(rec.localEsperaId)}`, detalhe: rec.conforme ? 'Conforme' : `${rec.ocorrencias.length} ocorrência(s)`, marca: 'REC', tipo: 'recebimento' },
    ...(nf ? [{ quando: nf.criadoEm, quem: nf.criadoPor, titulo: `NF ${nf.numero} e DOF cadastradas`, marca: 'NF' }] : []),
  ];

  return (
    <section className="painel">
      <CabecalhoObjeto
        tipo="Recebimento" titulo={`NF ${nf?.numero ?? '—'}`}
        situacao={rec.conforme ? <Badge tom="verde">Conforme</Badge> : <Badge tom="laranja">Com ocorrência</Badge>}
        migalhas={[{ rotulo: 'Recebimentos', para: '/recebimentos' }, { rotulo: `Recebimento da NF ${nf?.numero ?? ''}` }]}
        acoes={dof?.podeDeclarar && pode('dof:declarar') && <button className="btn btn-pri" onClick={() => setDeclarar(true)}>Marcar DOF como declarada no Sinaflor</button>}
        fatos={<>
          <FatoChave rotulo="NF" valor={nf ? `${nf.numero} · série ${nf.serie}` : '—'} />
          <FatoChave rotulo="DOF" valor={dof ? <>{dof.numero} · {dof.declarado ? 'declarada' : <PrazoDof prazo={dof.prazoDeclaracao} nivel={dof.nivelPrazo} />}</> : '—'} />
          <FatoChave rotulo="Contrato" valor={<span className="mono">{contrato?.numero ?? '—'}</span>} para={contrato ? `/contratos/${contrato.numero}` : undefined} />
          <FatoChave rotulo="Fardos" valor={`${rec.fardosLidos.length} lidos de ${rec.fardosEsperados.length} esperados`} />
          <FatoChave rotulo="Recebido em" valor={dataHora(rec.recebidoEm)} />
          <FatoChave rotulo="Por" valor={rec.recebidoPor} />
        </>}
      />
      {entrega?.situacao === 'recebida_parcial' && <Aviso tom="alerta">Entrega recebida em parte: {entrega.fardosIds.filter((x) => !entrega.fardosRecebidos.includes(x)).join(', ')} ainda em trânsito.</Aviso>}

      <div className="objeto-grade">
        <AbasSecao abas={abas} ativa={aba} aoEscolher={setAba} rotulo="Seções do recebimento">
          {aba === 'fardos' && (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th scope="col">Fardo</th><th scope="col">Situação</th><th scope="col" className="al-right">Dormentes</th><th scope="col">Local</th></tr></thead>
                <tbody>
                  {lidosAqui.map((f) => (
                    <tr key={f.id}>
                      <td><IdCodigo id={f.id} para={`/f/${f.id}`} /></td>
                      <td><BadgeDe mapa={SITUACAO_FARDO} valor={f.situacao} /></td>
                      <td className="al-right">{numero(f.quantidadeInicial)}</td>
                      <td>{cad.codigoLocal(f.localId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {aba === 'documentos' && (
            <div className="assistente-passo">
              <dl className="detalhes">
                <dt>NF</dt><dd>{nf ? `${nf.numero} · série ${nf.serie} · emitida em ${data(nf.emissao)}` : '—'}</dd>
                <dt>Chave</dt><dd className="mono quebra-palavra">{nf?.chaveAcesso}</dd>
                <dt>XML</dt><dd>{nf?.xml?.nome ?? 'Digitada (sem XML)'}</dd>
                <dt>DOF</dt><dd>{dof ? `${dof.numero} · validade ${data(dof.validade)}` : '—'}</dd>
                <dt>Prazo de declaração</dt><dd>{dof ? <PrazoDof prazo={dof.prazoDeclaracao} nivel={dof.nivelPrazo} declarado={!!dof.declarado} /> : '—'}</dd>
                <dt>Declaração</dt><dd>{dof?.declarado ? `${dataHora(dof.declarado.quando)} · ${dof.declarado.quem}` : 'Ainda não declarada'}</dd>
                <dt>PDF da DOF</dt><dd>{dof?.pdf?.nome ?? '—'}</dd>
              </dl>
              <div className="tabela-wrap">
                <table className="tabela">
                  <caption className="sr-only">Volume documental e calculado por espécie</caption>
                  <thead><tr><th scope="col">Espécie</th><th scope="col" className="al-right">DOF</th><th scope="col" className="al-right">Calculado</th><th scope="col" className="al-right">Diferença</th></tr></thead>
                  <tbody>
                    {(entrega?.divergenciaVolume ?? rec.divergenciaVolume).map((d) => (
                      <tr key={d.especieId}>
                        <td>{cad.nomeEspecie(d.especieId)}</td>
                        <td className="al-right">{m3(d.documentalM3)}</td>
                        <td className="al-right">{m3(d.calculadoM3)}</td>
                        <td className="al-right">{Number.isFinite(d.percentual) ? pct(d.percentual) : 'sem DOF'} {d.acimaTolerancia && <Badge tom="vermelho">acima de 10%</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mudo">Divergência acumulada da entrega (DOF × tudo o que já chegou), recalculada a cada recebimento.</p>
              {rec.justificativaDivergencia && <p><strong>Justificativa:</strong> {rec.justificativaDivergencia} {rec.justificativaAutomatica && <Badge tom="azul">preenchida pelo sistema</Badge>}</p>}
            </div>
          )}
          {aba === 'ocorrencias' && (rec.ocorrencias.length === 0 ? <Vazio mensagem="Recebimento conforme, sem ocorrências." /> : (
            <ul className="lista-ocorrencias">
              {rec.ocorrencias.map((o, n) => (
                <li key={n}>
                  <BadgeDe mapa={TIPO_OCORRENCIA} valor={o.tipo} /> {o.fardoId && <span className="mono">{o.fardoId}</span>} {o.automatica && <Badge tom="cinza">registrada pelo sistema</Badge>}
                  <p>{o.descricao}</p>
                  {o.fotos.length > 0 && <p className="mudo">Fotos: {o.fotos.map((f) => f.nome).join(', ')}</p>}
                </li>
              ))}
            </ul>
          ))}
          {aba === 'historico' && <LinhaTempo eventos={eventos} />}
        </AbasSecao>
        <Relacionados itens={[
          ...(contrato ? [{ icone: 'contrato' as const, tipo: 'Contrato', valor: <span className="mono">{contrato.numero}</span>, para: `/contratos/${contrato.numero}` }] : []),
          ...(contrato ? [{ icone: 'fabrica' as const, tipo: 'Fornecedor', valor: cad.nomeFornecedor(contrato.fornecedorId), para: `/fornecedores/${contrato.fornecedorId}` }] : []),
          { icone: 'file', tipo: 'NF e DOF', valor: <Link to={`/documentos?q=${nf?.numero ?? ''}`}>NF {nf?.numero}</Link> },
          { icone: 'local', tipo: 'Local de espera', valor: cad.codigoLocal(rec.localEsperaId), para: `/locais/${cad.codigoLocal(rec.localEsperaId)}` },
        ]} />
      </div>
      <ConfirmModal
        titulo="Declarar a DOF no Sinaflor" aberto={declarar} carregando={declarando} rotuloConfirmar="Marcar como declarada"
        mensagem={dof ? `Confirma que a DOF ${dof.numero} foi declarada no Sinaflor? Fica registrado quem marcou e quando.` : ''}
        aoCancelar={() => setDeclarar(false)} aoConfirmar={() => void confirmarDeclaracao()}
      />
    </section>
  );
}
