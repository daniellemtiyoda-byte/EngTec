import { useState } from 'react';
import { BadgeDe } from '../components/Badge';
import { FormLinha } from '../components/FormLinha';
import { FormModal, type Campo } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { opcoesDe } from '../dominio/opcoes';
import { STATUS_PATIO } from '../dominio/rotulos';
import { servicos } from '../services';
import type { LocalPatio, NovoLocalPatio } from '../types/models';
import { paraNumero, un } from '../utils/format';

const CAMPOS: Campo[] = [
  { nome: 'codigo', rotulo: 'Endereço', obrigatorio: true, maxLength: 40, ajuda: 'ex.: Quadra 1 / Baia 03' },
  { nome: 'descricao', rotulo: 'Descrição', maxLength: 120 },
  { nome: 'capacidade', rotulo: 'Capacidade (dormentes)', tipo: 'number', inteiro: true, obrigatorio: true, min: 1, max: 100000 },
  { nome: 'status', rotulo: 'Situação', tipo: 'select', obrigatorio: true, opcoes: opcoesDe(STATUS_PATIO, ['liberado', 'bloqueado']) },
];

const paraLocal = (v: Record<string, string>): NovoLocalPatio => ({
  codigo: v.codigo, descricao: v.descricao, capacidade: paraNumero(v.capacidade, true), status: v.status as NovoLocalPatio['status'],
});

/** Aba Endereços da tela Cadastros: os endereços do pátio onde os fardos ficam (RF10). A ocupação vem dos fardos. */
export default function Enderecos({ aoAlterar }: { aoAlterar?: () => void }) {
  const { pode } = useAuth();
  const notificar = useToast();
  const [editar, setEditar] = useState<LocalPatio | null>(null);
  const [rec, setRec] = useState(0);
  const alterou = () => { setRec((x) => x + 1); aoAlterar?.(); };

  const colunas: Coluna<LocalPatio>[] = [
    { chave: 'codigo', titulo: 'Endereço', ordenavel: true },
    { chave: 'descricao', titulo: 'Descrição' },
    { chave: 'capacidade', titulo: 'Capacidade', alinhar: 'right', ordenavel: true, render: (l) => un(l.capacidade) },
    { chave: 'ocupacao', titulo: 'Ocupação', alinhar: 'right', ordenavel: true, render: (l) => un(l.ocupacao) },
    { chave: 'status', titulo: 'Situação', render: (l) => <BadgeDe mapa={STATUS_PATIO} valor={l.status} /> },
  ];

  return (
    <>
      <ListPage<LocalPatio>
        secao titulo="Endereços do pátio"
        inclusao={pode('cadastros:editar') && (
          <FormLinha
            campos={CAMPOS} rotuloEnviar="Adicionar endereço" iniciais={{ status: 'liberado' }}
            legenda={<>Onde os fardos ficam guardados (pátio, rua, posição). A ocupação é calculada pelos fardos. · Liberado: recebe fardos · Bloqueado: não recebe fardos novos. "Em inventário" é marcado pelo inventário.</>}
            aoEnviar={async (v) => {
              const l = await servicos.patio.cadastrar(paraLocal(v));
              notificar('sucesso', `Endereço ${l.codigo} cadastrado${SUFIXO_SIMULADO}.`);
              alterou();
            }}
          />
        )}
        listar={(q) => servicos.patio.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'status', rotulo: 'Situação', opcoes: opcoesDe(STATUS_PATIO) }]}
        acoesLinha={pode('cadastros:editar') ? [{ rotulo: 'Editar', aoClicar: setEditar, visivel: (l) => l.status !== 'em_inventario' }] : undefined}
      />
      <FormModal
        titulo={editar ? `Editar ${editar.codigo}` : 'Editar endereço'} aberto={!!editar} aoFechar={() => setEditar(null)} campos={CAMPOS}
        iniciais={editar ? { codigo: editar.codigo, descricao: editar.descricao, capacidade: String(editar.capacidade), status: editar.status } : undefined}
        validar={(v): Record<string, string> => (editar && paraNumero(v.capacidade, true) < editar.ocupacao ? { capacidade: `A ocupação atual é de ${un(editar.ocupacao)}.` } : {})}
        aoEnviar={async (v) => {
          await servicos.patio.atualizar(editar!.id, paraLocal(v));
          notificar('sucesso', `Endereço atualizado${SUFIXO_SIMULADO}.`);
          alterou();
        }}
      />
    </>
  );
}
