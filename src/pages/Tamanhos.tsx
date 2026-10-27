import { useState } from 'react';
import { BadgeDe } from '../components/Badge';
import { Aviso } from '../components/Estados';
import { FormModal, type Campo } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_MEDIDAS_OPCOES } from '../dominio/opcoes';
import { SITUACAO_MEDIDAS } from '../dominio/rotulos';
import { servicos } from '../services';
import type { NovoTamanho, SituacaoMedidas, Tamanho } from '../types/models';
import { cm, m3, paraNumero } from '../utils/format';

const CAMPOS: Campo[] = [
  { nome: 'codigo', rotulo: 'Código', obrigatorio: true, maxLength: 10, ajuda: 'Ex.: T1' },
  { nome: 'larguraCm', rotulo: 'Largura (cm)', tipo: 'number', obrigatorio: true, min: 1, max: 100 },
  { nome: 'alturaCm', rotulo: 'Altura (cm)', tipo: 'number', obrigatorio: true, min: 1, max: 100 },
  { nome: 'comprimentoCm', rotulo: 'Comprimento (cm)', tipo: 'number', obrigatorio: true, min: 50, max: 1000, ajuda: 'O volume em m³ é calculado pelo sistema a partir das três dimensões.' },
  { nome: 'medidas', rotulo: 'Medidas', tipo: 'select', obrigatorio: true, opcoes: SITUACAO_MEDIDAS_OPCOES, ajuda: 'Marque "Confirmado" só depois da confirmação da CPTM.' },
];

const paraTamanho = (v: Record<string, string>): NovoTamanho => ({
  codigo: v.codigo.trim().toUpperCase(), larguraCm: paraNumero(v.larguraCm), alturaCm: paraNumero(v.alturaCm), comprimentoCm: paraNumero(v.comprimentoCm),
  medidas: v.medidas as SituacaoMedidas,
});

const paraTexto = (n: number) => String(n).replace('.', ',');

export default function Tamanhos() {
  const { pode } = useAuth();
  const notificar = useToast();
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<Tamanho | null>(null);
  const [rec, setRec] = useState(0);

  const colunas: Coluna<Tamanho>[] = [
    { chave: 'codigo', titulo: 'Código', ordenavel: true },
    { chave: 'larguraCm', titulo: 'Largura', alinhar: 'right', ordenavel: true, render: (t) => cm(t.larguraCm) },
    { chave: 'alturaCm', titulo: 'Altura', alinhar: 'right', ordenavel: true, render: (t) => cm(t.alturaCm) },
    { chave: 'comprimentoCm', titulo: 'Comprimento', alinhar: 'right', ordenavel: true, render: (t) => cm(t.comprimentoCm) },
    { chave: 'volumeM3', titulo: 'Volume por dormente', alinhar: 'right', ordenavel: true, render: (t) => m3(t.volumeM3) },
    { chave: 'medidas', titulo: 'Medidas', render: (t) => <BadgeDe mapa={SITUACAO_MEDIDAS} valor={t.medidas} /> },
  ];

  return (
    <>
      <ListPage<Tamanho>
        titulo="Tamanhos"
        descricao="Dimensões de cada tamanho de dormente. O volume em m³ é calculado pelo sistema e usado na conferência com o DOF e nos relatórios do IBAMA."
        aviso={<Aviso tom="alerta">Medidas <strong>provisórias</strong> aguardam confirmação da CPTM (só o comprimento de 2,80 m foi visto na plaqueta). Volumes calculados com elas também são provisórios.</Aviso>}
        listar={(q) => servicos.tamanhos.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'medidas', rotulo: 'Medidas', opcoes: SITUACAO_MEDIDAS_OPCOES }]}
        semBusca
        acoes={pode('cadastros:editar') ? <button className="btn btn-pri" onClick={() => setNovo(true)}>Cadastrar tamanho</button> : undefined}
        acoesLinha={pode('cadastros:editar') ? [{ rotulo: 'Editar', aoClicar: setEditar }] : undefined}
      />
      <FormModal
        titulo="Cadastrar tamanho" aberto={novo} aoFechar={() => setNovo(false)} rotuloEnviar="Cadastrar" campos={CAMPOS}
        iniciais={{ medidas: 'provisorio' }}
        aoEnviar={async (v) => {
          const t = await servicos.tamanhos.cadastrar(paraTamanho(v));
          notificar('sucesso', `Tamanho ${t.codigo} cadastrado: ${m3(t.volumeM3)} por dormente${SUFIXO_SIMULADO}.`);
          setRec((x) => x + 1);
        }}
      />
      <FormModal
        titulo={editar ? `Editar tamanho ${editar.codigo}` : 'Editar tamanho'} aberto={!!editar} aoFechar={() => setEditar(null)} campos={CAMPOS}
        iniciais={editar ? {
          codigo: editar.codigo, larguraCm: paraTexto(editar.larguraCm), alturaCm: paraTexto(editar.alturaCm), comprimentoCm: paraTexto(editar.comprimentoCm), medidas: editar.medidas,
        } : undefined}
        aoEnviar={async (v) => {
          const t = await servicos.tamanhos.atualizar(editar!.id, paraTamanho(v));
          notificar('sucesso', `Tamanho ${t.codigo} atualizado: ${m3(t.volumeM3)} por dormente${SUFIXO_SIMULADO}.`);
          setRec((x) => x + 1);
        }}
      />
    </>
  );
}
