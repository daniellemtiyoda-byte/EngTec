import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { AtaModal } from '../components/AtaModal';
import { BadgeDe } from '../components/Badge';
import { CabecalhoObjeto, FatoChave } from '../components/Cabecalhos';
import { Aviso, Carregando, Erro, Vazio } from '../components/Estados';
import { IdCodigo } from '../components/IdCodigo';
import { BarraProgresso } from '../components/Indicadores';
import { LinhaTempo, linhaDoEvento } from '../components/LinhaTempo';
import { Relacionados } from '../components/Relacionados';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_ATA, SITUACAO_CONTRATO, USO_TAMANHO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { data, numero } from '../utils/format';
import { VigenciaAta, totaisDaAta } from './Atas';

type AbaAta = 'itens' | 'regras' | 'contratos' | 'historico';

/** Página da ata: itens registrados com o saldo, regras de fornecimento, contratos da ata e histórico. */
export default function AtaDetalhe() {
  const { numero: num = '' } = useParams();
  const { pode } = useAuth();
  const notificar = useToast();
  const cad = useCadastros();
  const r = useAsync(() => servicos.atas.obter(num), [num]);
  const contratos = useAsync(() => servicos.contratos.listar({ pageSize: 200, filters: { ataId: r.dados?.id ?? '-' } }), [r.dados?.id]);
  const historico = useAsync(() => servicos.eventos.listar({ pageSize: 200, filters: { entidade: 'ata', entidadeId: r.dados?.id ?? '-' } }), [r.dados?.id]);
  const [aba, setAba] = useAbaNoEndereco<AbaAta>(['itens', 'regras', 'contratos', 'historico']);
  const [editar, setEditar] = useState(false);

  if (r.carregando && !r.dados) return <section className="painel"><Carregando /></section>;
  if (r.erro || !r.dados) return <section className="painel"><Erro erro={r.erro} aoTentar={r.recarregar} /></section>;
  const a = r.dados;
  const t = totaisDaAta(a);
  const listaContratos = contratos.dados?.items ?? [];
  const podeEditar = pode('contratos:editar') && a.editavel;
  const parcelas = a.regras.prazosParcelas.slice(0, a.regras.maxParcelas);

  const abas: Aba<AbaAta>[] = [
    { valor: 'itens', rotulo: 'Itens', total: a.itens.length },
    { valor: 'regras', rotulo: 'Regras' },
    { valor: 'contratos', rotulo: 'Contratos', total: a.contratos },
    { valor: 'historico', rotulo: 'Histórico' },
  ];

  return (
    <section className="painel">
      <CabecalhoObjeto
        tipo="Ata" id={a.numero} situacao={<BadgeDe mapa={SITUACAO_ATA} valor={a.situacao} />}
        migalhas={[{ rotulo: 'Atas', para: '/atas' }, { rotulo: `Ata ${a.numero}` }]}
        acoes={podeEditar && <button className="btn btn-pri" onClick={() => setEditar(true)}>Editar</button>}
        fatos={<>
          <FatoChave rotulo="Fornecedor" valor={cad.nomeFornecedor(a.fornecedorId)} para={`/fornecedores/${a.fornecedorId}`} />
          <FatoChave rotulo="Vigência" valor={<VigenciaAta ata={a} />} />
          <FatoChave rotulo="Registrado" valor={numero(t.registrado)} />
          <FatoChave rotulo="Contratado" valor={numero(t.contratado)} />
          <FatoChave rotulo="Saldo" valor={numero(t.saldo)} />
          <FatoChave rotulo="Contratos" valor={numero(a.contratos)} para={`/atas/${a.numero}?aba=contratos`} />
        </>}
      />
      {a.editavel
        ? <Aviso tom="info">Ata sem contrato: regras, vigência e itens ainda podem ser corrigidos. O primeiro contrato valida as regras e trava a ata.</Aviso>
        : <Aviso tom="info">A ata já tem contrato: regras, vigência e itens não mudam mais, para não alterar os contratos assinados.</Aviso>}
      {a.situacao === 'vencida' && <Aviso tom="alerta">Ata vencida em {data(a.vigenciaFim)}: não aceita novos contratos. Os já assinados continuam valendo.</Aviso>}

      <div className="objeto-grade">
        <AbasSecao abas={abas} ativa={aba} aoEscolher={setAba} rotulo="Seções da ata">
          {aba === 'itens' && (
            <ul className="itens-cartoes">
              {a.itens.map((i) => {
                const tam = cad.tamanhos.get(i.tamanhoId);
                return (
                  <li key={i.tamanhoId} className="item-cartao">
                    <strong>{cad.descreverTamanho(i.tamanhoId)}</strong>
                    {tam && <span><BadgeDe mapa={USO_TAMANHO} valor={tam.uso} /></span>}
                    <dl>
                      <div><dt>Registrado</dt><dd>{numero(i.quantidade)}</dd></div>
                      <div><dt>Contratado</dt><dd>{numero(i.contratado)}</dd></div>
                      <div><dt>Saldo</dt><dd>{numero(i.saldo)}</dd></div>
                    </dl>
                    <BarraProgresso total={i.quantidade} recebido={i.contratado} unidade="contratados" />
                  </li>
                );
              })}
            </ul>
          )}
          {aba === 'regras' && (
            <>
              <dl className="lista-regras">
                <div><dt>Pedido mínimo por contrato</dt><dd>{numero(a.regras.pedidoMinimo)} dormentes</dd></div>
                <div><dt>Parcelas por contrato</dt><dd>até {a.regras.maxParcelas}</dd></div>
                <div><dt>Quantidade por parcela</dt><dd>de {numero(a.regras.parcelaMinima)} a {numero(a.regras.parcelaMaxima)} dormentes, somando os tamanhos</dd></div>
              </dl>
              <div className="tabela-wrap">
                <table className="tabela tabela-cartoes">
                  <caption className="sr-only">Janelas de entrega das parcelas, em dias da assinatura do contrato</caption>
                  <thead><tr><th scope="col">Parcela</th><th scope="col" className="al-right">Do dia</th><th scope="col" className="al-right">Até o dia</th></tr></thead>
                  <tbody>
                    {parcelas.map(([de, ate], n) => (
                      <tr key={n}>
                        <td>{n + 1}ª parcela</td>
                        <td className="al-right" data-rotulo="Do dia">{numero(de)}</td>
                        <td className="al-right" data-rotulo="Até o dia">{numero(ate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ajuda">Os dias contam da assinatura de cada contrato. As regras valem para todos os contratos desta ata.</p>
            </>
          )}
          {aba === 'contratos' && (contratos.carregando && !contratos.dados ? <Carregando /> : listaContratos.length === 0 ? (
            <Vazio mensagem="Nenhum contrato nesta ata." dica={a.vigente ? 'O novo contrato é cadastrado em Contratos e segue as regras desta ata.' : undefined} />
          ) : (
            <div className="tabela-wrap">
              <table className="tabela tabela-cartoes">
                <thead><tr><th scope="col">Contrato</th><th scope="col">Assinatura</th><th scope="col" className="al-right">Dormentes</th><th scope="col">Parcelas</th><th scope="col">Situação</th></tr></thead>
                <tbody>
                  {listaContratos.map((c) => (
                    <tr key={c.id}>
                      <td><IdCodigo id={c.numero} para={`/contratos/${c.numero}`} /></td>
                      <td data-rotulo="Assinatura">{data(c.dataAssinatura)}</td>
                      <td className="al-right" data-rotulo="Dormentes">{numero(c.itens.reduce((s, i) => s + i.quantidade, 0))}</td>
                      <td data-rotulo="Parcelas">{c.parcelas.length}{c.parcelasAtrasadas > 0 && <span className="texto-critico"> · {c.parcelasAtrasadas} atrasada(s)</span>}</td>
                      <td data-rotulo="Situação"><BadgeDe mapa={SITUACAO_CONTRATO} valor={c.situacao} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {aba === 'historico' && <LinhaTempo eventos={(historico.dados?.items ?? []).map(linhaDoEvento)} />}
        </AbasSecao>
        <Relacionados itens={[
          { icone: 'fabrica', tipo: 'Fornecedor', valor: cad.nomeFornecedor(a.fornecedorId), para: `/fornecedores/${a.fornecedorId}` },
        ]} />
      </div>

      <AtaModal
        aberto={editar} ata={a} cad={cad} aoFechar={() => setEditar(false)}
        aoSalvar={(salva) => { setEditar(false); notificar('sucesso', `Ata ${salva.numero} alterada.`); cad.recarregar(); r.recarregar(); historico.recarregar(); }}
      />
    </section>
  );
}
