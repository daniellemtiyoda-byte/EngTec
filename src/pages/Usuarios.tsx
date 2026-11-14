import { useState } from 'react';
import { Badge } from '../components/Badge';
import { Aviso } from '../components/Estados';
import { FormModal, type Campo } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { env } from '../config/env';
import { PERFIS, PERFIS_LISTA } from '../dominio/permissoes';
import { servicos } from '../services';
import type { Usuario } from '../types/models';

const PERFIL_OPCOES = PERFIS_LISTA.map((p) => ({ valor: p, rotulo: PERFIS[p].rotulo }));
const SITUACAO_OPCOES = [{ valor: 'true', rotulo: 'Ativo' }, { valor: 'false', rotulo: 'Inativo' }];
const CAMPOS: Campo[] = [
  { nome: 'perfil', rotulo: 'Perfil', tipo: 'select', obrigatorio: true, opcoes: PERFIL_OPCOES },
  { nome: 'ativo', rotulo: 'Situação', tipo: 'select', obrigatorio: true, opcoes: SITUACAO_OPCOES, ajuda: 'Usuário inativo não consegue entrar no sistema.' },
];

/**
 * Usuários (seção 9.19 do plano, só administrador): lista com nome, e-mail, perfil e situação, e edição só do perfil e da
 * situação. As contas são criadas no painel do Supabase. O administrador não edita a própria conta: a trava é só desta
 * tela (para não ficar sem administrador); a trava no banco fica como próximo passo (ver CHANGELOG).
 */
export default function Usuarios() {
  const { usuario: eu } = useAuth();
  const notificar = useToast();
  const [alvo, setAlvo] = useState<Usuario | null>(null);
  const [rec, setRec] = useState(0);
  const supabase = env.FONTE_DADOS === 'supabase';

  const colunas: Coluna<Usuario>[] = [
    { chave: 'nome', titulo: 'Nome', ordenavel: true, quebrar: true, render: (u) => <>{u.nome}{u.id === eu?.id && <> <Badge tom="azul">você</Badge></>}</> },
    { chave: 'email', titulo: 'E-mail', ordenavel: true, quebrar: true, render: (u) => u.email },
    { chave: 'perfil', titulo: 'Perfil', ordenavel: true, render: (u) => PERFIS[u.perfil]?.rotulo ?? u.perfil },
    { chave: 'ativo', titulo: 'Situação', render: (u) => (u.ativo ? <Badge tom="verde">Ativo</Badge> : <Badge tom="cinza">Inativo</Badge>) },
  ];

  async function salvar(v: Record<string, string>) {
    if (!alvo) return;
    await servicos.usuarios.atualizar(alvo.id, { perfil: v.perfil as Usuario['perfil'], ativo: v.ativo === 'true' });
    notificar('sucesso', `Usuário ${alvo.nome} atualizado.`);
    setRec((x) => x + 1);
  }

  return (
    <>
      <ListPage<Usuario>
        titulo="Usuários"
        descricao="Edite o perfil (o que cada pessoa pode fazer) e a situação. Nada é apagado: o usuário é desativado."
        aviso={(
          <Aviso tom="info">
            {supabase
              ? <>Contas novas são criadas no painel do Supabase: <strong>Authentication › Users › Add user</strong>, com e-mail e senha. A conta aparece aqui na hora, com o perfil <strong>Requisitante</strong>; depois ajuste o perfil nesta tela. Quem sair do sistema fica inativo, não é apagado.</>
              : <>No modo simulado há só os quatro usuários de demonstração, um por perfil. Com o Supabase, as contas novas são criadas no painel dele (Authentication › Users › Add user) e aparecem aqui como Requisitante.</>}
          </Aviso>
        )}
        recarregar={rec}
        filtros={[{ chave: 'perfil', rotulo: 'Perfil', opcoes: PERFIL_OPCOES }, { chave: 'ativo', rotulo: 'Situação', opcoes: SITUACAO_OPCOES }]}
        listar={(q) => servicos.usuarios.listar(q)}
        colunas={colunas}
        acoesLinha={[{
          rotulo: 'Editar', principal: true, aoClicar: (u) => setAlvo(u),
          desabilitada: (u) => (u.id === eu?.id ? 'Você não edita a própria conta (para não ficar sem administrador). Peça a outro administrador.' : undefined),
        }]}
      />
      <FormModal
        titulo={alvo ? `Editar ${alvo.nome}` : 'Editar usuário'} campos={CAMPOS} aberto={!!alvo} aoFechar={() => setAlvo(null)} aoEnviar={salvar}
        iniciais={alvo ? { perfil: alvo.perfil, ativo: String(alvo.ativo) } : undefined}
        confirmacao={(v) => (alvo && v.ativo === 'false' && alvo.ativo ? `Desativar ${alvo.nome}? A pessoa deixa de conseguir entrar no sistema.` : undefined)}
      />
    </>
  );
}
