import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AtaModal } from '../components/AtaModal';
import { Badge, BadgeDe } from '../components/Badge';
import { IdCodigo } from '../components/IdCodigo';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_ATA_OPCOES } from '../dominio/opcoes';
import { SITUACAO_ATA } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { Ata } from '../types/models';
import { data, numero } from '../utils/format';

/** Totais de cada aba (situação da vigência) para os contadores. */
const contar = () => Promise.all(SITUACAO_ATA_OPCOES.map((o) => servicos.atas.listar({ pageSize: 1, filters: { situacao: o.valor } }).then((r) => r.total)));

/** Atas que vencem em até 60 dias aparecem com o aviso na lista e na página. */
export const DIAS_AVISO_ATA = 60;

/** Registrado, contratado e saldo da ata, somando os tamanhos. */
export const totaisDaAta = (a: Ata) => a.itens.reduce((t, i) => ({ registrado: t.registrado + i.quantidade, contratado: t.contratado + i.contratado, saldo: t.saldo + i.saldo }), { registrado: 0, contratado: 0, saldo: 0 });

/** Vigência com o aviso de vencimento próximo. */
export function VigenciaAta({ ata }: { ata: Ata }) {
  return (
    <>
      {data(ata.vigenciaInicio)} a {data(ata.vigenciaFim)}
      {ata.situacao === 'vigente' && ata.diasParaVencer <= DIAS_AVISO_ATA && <> <Badge tom="laranja">vence em {numero(ata.diasParaVencer)} dia(s)</Badge></>}
    </>
  );
}

/** Atas de registro de preços: cada uma com vigência, regras e itens próprios, base dos contratos. */
export default function Atas() {
  const { pode } = useAuth();
  const notificar = useToast();
  const nav = useNavigate();
  const cad = useCadastros();
  const totais = useAsync(contar, []);
  const [nova, setNova] = useState(false);

  const colunas: Coluna<Ata>[] = [
    { chave: 'numero', titulo: 'Ata', ordenavel: true, render: (a) => <IdCodigo id={a.numero} para={`/atas/${a.numero}`} /> },
    { chave: 'fornecedorId', titulo: 'Fornecedor', quebrar: true, render: (a) => <Link to={`/fornecedores/${a.fornecedorId}`}>{cad.nomeFornecedor(a.fornecedorId)}</Link> },
    { chave: 'vigenciaFim', titulo: 'Vigência', ordenavel: true, render: (a) => <VigenciaAta ata={a} /> },
    { chave: 'itens', titulo: 'Itens', alinhar: 'right', render: (a) => { const t = totaisDaAta(a); return `${a.itens.length} tamanho(s) · saldo ${numero(t.saldo)} de ${numero(t.registrado)}`; } },
    { chave: 'contratos', titulo: 'Contratos', alinhar: 'right', render: (a) => numero(a.contratos) },
    { chave: 'situacao', titulo: 'Situação', render: (a) => <BadgeDe mapa={SITUACAO_ATA} valor={a.situacao} /> },
    { chave: 'editavel', titulo: 'Edição', opcional: true, render: (a) => (a.editavel ? 'Editável' : 'Travada pelo contrato') },
  ];

  return (
    <>
      <ListPage<Ata>
        titulo="Atas"
        acoes={pode('contratos:editar') && <button className="btn btn-pri" onClick={() => setNova(true)}>Nova ata</button>}
        abasSituacao={{ chave: 'situacao', rotulo: 'Vigência da ata', abas: SITUACAO_ATA_OPCOES.map((o, i) => ({ valor: o.valor, rotulo: o.rotulo, total: totais.dados?.[i] })) }}
        listar={(q) => servicos.atas.listar(q)}
        colunas={colunas}
        filtros={[{ chave: 'fornecedorId', rotulo: 'Fornecedor', opcoes: (cad.listas?.fornecedores ?? []).map((f) => ({ valor: f.id, rotulo: f.razaoSocial })) }]}
        acoesLinha={[{ rotulo: 'Abrir', principal: true, aoClicar: (a) => nav(`/atas/${a.numero}`) }]}
      />
      <AtaModal
        aberto={nova} cad={cad} aoFechar={() => setNova(false)}
        aoSalvar={(a) => { setNova(false); notificar('sucesso', `Ata ${a.numero} cadastrada.`); cad.recarregar(); totais.recarregar(); nav(`/atas/${a.numero}`); }}
      />
    </>
  );
}
