import { Fragment, useState } from 'react';
import { BadgeDe } from '../components/Badge';
import { Aviso } from '../components/Estados';
import { FormModal, type Campo } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { Modal } from '../components/Modal';
import { NfModal } from '../components/NfModal';
import { mensagemRecebimento, RecebimentoModal } from '../components/RecebimentoModal';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAlertas } from '../contexts/AlertasContext';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_NF_OPCOES } from '../dominio/opcoes';
import { DECLARACAO_DOF, ORIGEM_NF, SITUACAO_NF } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import type { NotaFiscal } from '../types/models';
import { data, m3, paraNumero, un } from '../utils/format';

export default function NotasFiscais() {
  const { pode } = useAuth();
  const notificar = useToast();
  const alertas = useAlertas();
  const [rec, setRec] = useState(0);
  const [novaNf, setNovaNf] = useState(false);
  const [dofDe, setDofDe] = useState<NotaFiscal | null>(null);
  const [ver, setVer] = useState<NotaFiscal | null>(null);
  const [receber, setReceber] = useState<NotaFiscal | null>(null);
  const tam = useAsync(() => servicos.tamanhos.listar({ pageSize: 50 }), []);

  const recarregar = () => { setRec((x) => x + 1); alertas.recarregar(); };

  const colunas: Coluna<NotaFiscal>[] = [
    { chave: 'numero', titulo: 'NF', ordenavel: true, render: (n) => `${n.numero} / ${n.serie}` },
    { chave: 'fornecedor', titulo: 'Fornecedor', ordenavel: true },
    { chave: 'emissao', titulo: 'Emissão', ordenavel: true, render: (n) => data(n.emissao) },
    { chave: 'quantidadeTotal', titulo: 'Quantidade', alinhar: 'right', ordenavel: true, render: (n) => `${un(n.quantidadeTotal)} em ${n.itens.length} item(ns)` },
    { chave: 'origem', titulo: 'Origem', render: (n) => <BadgeDe mapa={ORIGEM_NF} valor={n.origem} /> },
    { chave: 'dof', titulo: 'DOF', render: (n) => (n.dof ? n.dof.numero : <span className="mudo">Sem DOF</span>) },
    { chave: 'situacao', titulo: 'Situação', render: (n) => <BadgeDe mapa={SITUACAO_NF} valor={n.situacao} /> },
  ];

  // Um campo de volume por espécie da NF: o DOF traz o volume por espécie, não por tamanho.
  const especiesDe = (nf: NotaFiscal) => [...new Map(nf.itens.map((i) => [i.especieId, i.especie]))];
  const volumeNf = (nf: NotaFiscal, especieId: string) => nf.itens.filter((i) => i.especieId === especieId)
    .reduce((a, i) => a + i.quantidade * (tam.dados?.items.find((t) => t.id === i.tamanhoId)?.volumeM3 ?? 0), 0);
  const camposDof = (nf: NotaFiscal): Campo[] => [
    { nome: 'numero', rotulo: 'Número do DOF', obrigatorio: true, maxLength: 20, ajuda: nf.dofSugerido ? 'Sugerido a partir das informações complementares do XML.' : undefined },
    { nome: 'codigoControle', rotulo: 'Código de controle', obrigatorio: true, maxLength: 40 },
    { nome: 'validade', rotulo: 'Validade', tipo: 'date', obrigatorio: true },
    ...especiesDe(nf).map(([id, especie]): Campo => ({
      nome: `vol_${id}`, rotulo: `Volume do DOF: ${especie} (m³)`, tipo: 'number', obrigatorio: true, min: 0.001,
      ajuda: `Volume da NF calculado pelos tamanhos: ${m3(volumeNf(nf, id))}.`,
    })),
    { nome: 'pdf', rotulo: 'PDF do DOF', tipo: 'arquivo', obrigatorio: true, extensoes: ['pdf'] },
  ];

  return (
    <>
      <ListPage<NotaFiscal>
        titulo="NF e DOF"
        descricao="Cadastro da nota fiscal (manual ou pelo XML da NF-e) e do DOF. O recebimento só avança com o DOF cadastrado."
        aviso={<Aviso>Um DOF por NF. O volume do DOF é informado por espécie, como no documento, e comparado ao volume recebido.</Aviso>}
        listar={(q) => servicos.notas.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'situacao', rotulo: 'Situação', opcoes: SITUACAO_NF_OPCOES }]}
        acoes={pode('nf:cadastrar') ? <button className="btn btn-pri" onClick={() => setNovaNf(true)}>Cadastrar NF</button> : undefined}
        acoesLinha={[
          { rotulo: 'Ver', aoClicar: setVer },
          { rotulo: 'Cadastrar DOF', aoClicar: setDofDe, visivel: (n) => !n.dof && pode('nf:cadastrar') },
          { rotulo: 'Receber', aoClicar: setReceber, visivel: (n) => n.situacao === 'aguardando_recebimento' && pode('recebimento:registrar') },
        ]}
      />
      <NfModal
        aberto={novaNf} aoFechar={() => setNovaNf(false)}
        aoSalvar={(nf) => { notificar('sucesso', `NF ${nf.numero} cadastrada; cadastre o DOF para liberar o recebimento${SUFIXO_SIMULADO}.`); recarregar(); }}
      />
      <FormModal
        titulo={dofDe ? `DOF da NF ${dofDe.numero}` : 'DOF'} aberto={!!dofDe} aoFechar={() => setDofDe(null)} rotuloEnviar="Cadastrar DOF"
        campos={dofDe ? camposDof(dofDe) : []} iniciais={dofDe?.dofSugerido ? { numero: dofDe.dofSugerido } : undefined}
        aoEnviar={async (v, arquivos) => {
          const nf = dofDe!;
          await servicos.notas.cadastrarDof(nf.id, {
            numero: v.numero.trim(), codigoControle: v.codigoControle.trim(), validade: v.validade,
            volumes: especiesDe(nf).map(([id]) => ({ especieId: id, volumeM3: paraNumero(v[`vol_${id}`]) })),
          }, arquivos.pdf[0]);
          notificar('sucesso', `DOF cadastrado; a NF ${nf.numero} está pronta para o recebimento${SUFIXO_SIMULADO}.`);
          recarregar();
        }}
      />
      <RecebimentoModal nf={receber} aoFechar={() => setReceber(null)} aoConcluir={(r) => { notificar('sucesso', mensagemRecebimento(r)); recarregar(); }} />
      <Modal titulo={ver ? `NF ${ver.numero} / ${ver.serie}` : 'NF'} aberto={!!ver} aoFechar={() => setVer(null)} largo rodape={<button className="btn btn-sec" onClick={() => setVer(null)}>Fechar</button>}>
        {ver && (
          <>
            <dl className="detalhes">
              <dt>Fornecedor</dt><dd>{ver.fornecedor}</dd><dt>Emissão</dt><dd>{data(ver.emissao)}</dd>
              <dt>Chave de acesso</dt><dd>{ver.chaveAcesso ?? '—'}</dd>
              <dt>Origem</dt><dd><BadgeDe mapa={ORIGEM_NF} valor={ver.origem} />{ver.xmlAnexado && ' · XML guardado'}</dd>
              <dt>Situação</dt><dd><BadgeDe mapa={SITUACAO_NF} valor={ver.situacao} /></dd>
            </dl>
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th>Descrição</th><th>Espécie</th><th>Tamanho</th><th className="al-right">Quantidade</th></tr></thead>
                <tbody>{ver.itens.map((i) => <tr key={i.id}><td>{i.descricao}</td><td><em>{i.especie}</em></td><td>{i.tamanho}</td><td className="al-right">{un(i.quantidade)}</td></tr>)}</tbody>
              </table>
            </div>
            {ver.dof ? (
              <>
                <h3>DOF {ver.dof.numero}</h3>
                <dl className="detalhes">
                  <dt>Código de controle</dt><dd>{ver.dof.codigoControle}</dd><dt>Validade</dt><dd>{data(ver.dof.validade)}</dd>
                  <dt>Declaração</dt><dd><BadgeDe mapa={DECLARACAO_DOF} valor={ver.dof.declaracao} /></dd><dt>PDF</dt><dd>{ver.dof.arquivoPdf}</dd>
                  {ver.dof.volumes.map((v) => <Fragment key={v.especieId}><dt>Volume: <em>{v.especie}</em></dt><dd>{m3(v.volumeM3)}</dd></Fragment>)}
                </dl>
              </>
            ) : <Aviso tom="alerta">Sem DOF: o recebimento desta NF está bloqueado.</Aviso>}
          </>
        )}
      </Modal>
    </>
  );
}
