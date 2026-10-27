import { useState } from 'react';
import { Aviso } from '../components/Estados';
import { FormModal } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { BadgeDe, StatusEstoqueBadge, StatusRegistroBadge } from '../components/Badge';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORIA_OPCOES, CLASSE_OPCOES, RESULTADO_INSPECAO_OPCOES, STATUS_OPCOES } from '../dominio/opcoes';
import { RESULTADO_INSPECAO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import type { Lote } from '../types/models';
import { data, m3, mLineares, metros, paraNumero, rotuloCategoria, rotuloClasse, un } from '../utils/format';

export default function Lotes() {
  const { pode } = useAuth();
  const notificar = useToast();
  const [aberto, setAberto] = useState(false);
  const [rec, setRec] = useState(0);
  const forn = useAsync(() => servicos.fornecedores.listar({ pageSize: 100 }), []);
  const esp = useAsync(() => servicos.especies.listar({ pageSize: 100 }), []);

  const colunas: Coluna<Lote>[] = [
    { chave: 'codigo', titulo: 'Lote', ordenavel: true },
    { chave: 'fornecedor', titulo: 'Fornecedor', ordenavel: true },
    { chave: 'especieDocumental', titulo: 'Espécie (documento)', ordenavel: true },
    { chave: 'classe', titulo: 'Classe', render: (l) => rotuloClasse(l.classe) },
    { chave: 'categoria', titulo: 'Categoria', render: (l) => rotuloCategoria(l.categoria) },
    { chave: 'inspecao', titulo: 'Inspeção', render: (l) => <BadgeDe mapa={RESULTADO_INSPECAO} valor={l.inspecao} /> },
    { chave: 'quantidade', titulo: 'Quantidade', alinhar: 'right', ordenavel: true, render: (l) => un(l.quantidade) },
    { chave: 'dimensoes', titulo: 'Dimensões (C × L × E)', render: (l) => `${metros(l.comprimentoM)} × ${metros(l.larguraM)} × ${metros(l.espessuraM)}` },
    { chave: 'metrosLineares', titulo: 'Metragem linear', alinhar: 'right', ordenavel: true, render: (l) => mLineares(l.metrosLineares) },
    { chave: 'volumeDocumentalM3', titulo: 'Volume documental', alinhar: 'right', ordenavel: true, render: (l) => m3(l.volumeDocumentalM3) },
    { chave: 'volumeCalculadoM3', titulo: 'Volume calculado', alinhar: 'right', ordenavel: true, render: (l) => m3(l.volumeCalculadoM3) },
    { chave: 'recebidoEm', titulo: 'Recebido em', ordenavel: true, render: (l) => data(l.recebidoEm) },
    { chave: 'status', titulo: 'Registro', render: (l) => <StatusRegistroBadge s={l.status} /> },
    { chave: 'estoqueStatus', titulo: 'Estoque', render: (l) => <StatusEstoqueBadge s={l.estoqueStatus} /> },
  ];

  return (
    <>
      <ListPage<Lote>
        titulo="Cadastro e consulta de lotes"
        descricao="Metragem linear, volume documental e volume calculado são exibidos separadamente."
        listar={(q) => servicos.lotes.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[
          { chave: 'status', rotulo: 'Registro', opcoes: STATUS_OPCOES },
          { chave: 'inspecao', rotulo: 'Inspeção', opcoes: RESULTADO_INSPECAO_OPCOES },
          { chave: 'classe', rotulo: 'Classe', opcoes: CLASSE_OPCOES },
          { chave: 'categoria', rotulo: 'Categoria', opcoes: CATEGORIA_OPCOES },
        ]}
        acoes={pode('lotes:cadastrar') ? <button className="btn btn-pri" onClick={() => setAberto(true)}>Cadastrar lote</button> : undefined}
        aviso={forn.erro || esp.erro ? <Aviso tom="alerta">Não foi possível carregar fornecedores/espécies para o cadastro de lotes.</Aviso> : undefined}
      />
      <FormModal
        titulo="Cadastrar lote" aberto={aberto} aoFechar={() => setAberto(false)} rotuloEnviar="Cadastrar"
        campos={[
          { nome: 'codigo', rotulo: 'Código do lote', obrigatorio: true, maxLength: 30 },
          { nome: 'fornecedorId', rotulo: 'Fornecedor', tipo: 'select', obrigatorio: true, opcoes: forn.dados?.items.filter((f) => f.status !== 'bloqueado').map((f) => ({ valor: f.id, rotulo: f.razaoSocial })) },
          { nome: 'especieId', rotulo: 'Espécie (conforme documento)', tipo: 'select', obrigatorio: true, opcoes: esp.dados?.items.map((e) => ({ valor: e.id, rotulo: `${e.nomeCientifico} · ${rotuloClasse(e.classe)}` })), ajuda: 'A espécie é a declarada no documento; não é identificada por imagem. A classe vem do cadastro da espécie; a categoria chega com a inspeção.' },
          { nome: 'quantidade', rotulo: 'Quantidade (un.)', tipo: 'number', obrigatorio: true, inteiro: true, min: 1 },
          { nome: 'comprimentoM', rotulo: 'Comprimento (m)', tipo: 'number', obrigatorio: true, min: 0.1, max: 5 },
          { nome: 'larguraM', rotulo: 'Largura (m)', tipo: 'number', obrigatorio: true, min: 0.05, max: 1 },
          { nome: 'espessuraM', rotulo: 'Espessura (m)', tipo: 'number', obrigatorio: true, min: 0.05, max: 1 },
        ]}
        aoEnviar={async (v) => {
          await servicos.lotes.cadastrar({
            codigo: v.codigo.trim(), fornecedorId: v.fornecedorId, especieId: v.especieId,
            quantidade: paraNumero(v.quantidade, true), comprimentoM: paraNumero(v.comprimentoM), larguraM: paraNumero(v.larguraM), espessuraM: paraNumero(v.espessuraM),
          });
          notificar('sucesso', `Lote cadastrado; aguarda inspeção${SUFIXO_SIMULADO}.`);
          setRec((x) => x + 1);
        }}
      />
    </>
  );
}
