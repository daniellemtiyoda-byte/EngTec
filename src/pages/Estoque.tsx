import { Aviso } from '../components/Estados';
import { Badge } from '../components/Badge';
import { CodigoLink } from '../components/Codigos';
import { StatCard } from '../components/Graficos';
import { ListPage, type Coluna } from '../components/ListPage';
import { CATEGORIA_OPCOES, CLASSE_OPCOES, IDADE_LOTE_OPCOES } from '../dominio/opcoes';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import type { SaldoEstoque } from '../types/models';
import { dias, m3, mLineares, rotuloCategoria, rotuloClasse, un } from '../utils/format';

const nz = (v: number, tom: 'verde' | 'azul' | 'cinza' | 'vermelho') => (v > 0 ? <Badge tom={tom}>{un(v)}</Badge> : <span className="mudo">—</span>);

export default function Estoque() {
  const ind = useAsync(() => servicos.dashboard.indicadores(), []);
  const d = ind.dados;

  const colunas: Coluna<SaldoEstoque>[] = [
    { chave: 'loteCodigo', titulo: 'Lote', ordenavel: true, render: (s) => <CodigoLink codigo={s.loteCodigo} /> },
    {
      chave: 'especieDocumental', titulo: 'Espécie', ordenavel: true,
      render: (s) => <><em>{s.especieDocumental}</em><div className="mudo">{rotuloClasse(s.classe)} · {rotuloCategoria(s.categoria)}</div></>,
    },
    { chave: 'disponivel', titulo: 'Disponível', alinhar: 'right', ordenavel: true, render: (s) => nz(s.disponivel, 'verde') },
    { chave: 'emAnalise', titulo: 'Em análise', alinhar: 'right', ordenavel: true, render: (s) => nz(s.emAnalise, 'azul') },
    { chave: 'bloqueado', titulo: 'Bloqueado', alinhar: 'right', ordenavel: true, render: (s) => nz(s.bloqueado, 'vermelho') },
    { chave: 'divergente', titulo: 'Com divergência', alinhar: 'right', ordenavel: true, render: (s) => nz(s.divergente, 'vermelho') },
    { chave: 'local', titulo: 'Local', ordenavel: true },
    { chave: 'metrosLineares', titulo: 'Metragem linear', alinhar: 'right', ordenavel: true, opcional: true, render: (s) => mLineares(s.metrosLineares) },
    { chave: 'volumeM3', titulo: 'Volume calculado', alinhar: 'right', ordenavel: true, opcional: true, render: (s) => m3(s.volumeM3) },
    { chave: 'idadeDias', titulo: 'Idade', alinhar: 'right', ordenavel: true, render: (s) => (s.acimaLimiteIdade ? <span className="val-erro" title="Acima do limite de dias definido em Configurações">{dias(s.idadeDias)}</span> : dias(s.idadeDias)) },
  ];

  return (
    <>
      {ind.erro && <Aviso tom="alerta">Não foi possível carregar os totais do estoque. A lista abaixo continua disponível.</Aviso>}
      {d && (
        <div className="grade-cards">
          <StatCard rotulo="Disponível" valor={un(d.disponivel)} tom="verde" />
          <StatCard rotulo="Em análise" valor={un(d.emAnalise)} tom="azul" />
          <StatCard rotulo="Bloqueado" valor={un(d.bloqueado)} tom="cinza" />
          <StatCard rotulo="Com divergência" valor={un(d.divergente)} tom="vermelho" />
        </div>
      )}
      <ListPage<SaldoEstoque>
        titulo="Estoque de dormentes"
        descricao="Somente o saldo disponível pode ser considerado utilizável; pendentes, bloqueados e divergentes são exibidos à parte."
        aviso={<Aviso>O saldo oficial é o informado pelo sistema responsável. Contagens estimadas por imagem não alteram este saldo.</Aviso>}
        listar={(q) => servicos.estoque.listar(q)}
        colunas={colunas}
        filtros={[{ chave: 'acimaLimiteIdade', rotulo: 'Idade', opcoes: IDADE_LOTE_OPCOES }, { chave: 'classe', rotulo: 'Classe', opcoes: CLASSE_OPCOES }, { chave: 'categoria', rotulo: 'Categoria', opcoes: CATEGORIA_OPCOES }]}
      />
    </>
  );
}
