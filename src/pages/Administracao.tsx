import { useState } from 'react';
import { Badge } from '../components/Badge';
import { Aviso, PageHeader } from '../components/Estados';
import { ListPage, type Coluna } from '../components/ListPage';
import { servicos } from '../services';
import type { RegistroAuditoria, Usuario } from '../types/models';
import { dataHora } from '../utils/format';

export default function Administracao() {
  const [aba, setAba] = useState<'usuarios' | 'auditoria'>('usuarios');
  const usuarios: Coluna<Usuario>[] = [
    { chave: 'nome', titulo: 'Nome', ordenavel: true },
    { chave: 'email', titulo: 'E-mail' },
    { chave: 'perfil', titulo: 'Perfil', ordenavel: true },
    { chave: 'permissoes', titulo: 'Permissões', render: (u) => u.permissoes.length ? u.permissoes.join(', ') : '—' },
    { chave: 'ativo', titulo: 'Situação', render: (u) => u.ativo ? <Badge tom="verde">Ativo</Badge> : <Badge tom="cinza">Inativo</Badge> },
    { chave: 'ultimoAcesso', titulo: 'Último acesso', render: (u) => dataHora(u.ultimoAcesso) },
  ];
  const auditoria: Coluna<RegistroAuditoria>[] = [
    { chave: 'dataHora', titulo: 'Data/hora', ordenavel: true, render: (a) => dataHora(a.dataHora) },
    { chave: 'usuario', titulo: 'Usuário', ordenavel: true },
    { chave: 'acao', titulo: 'Ação', ordenavel: true },
    { chave: 'entidade', titulo: 'Entidade' },
    { chave: 'detalhe', titulo: 'Detalhe' },
  ];
  return (
    <>
      <PageHeader titulo="Usuários, permissões e auditoria" />
      <Aviso>Consulta somente leitura. Criação de usuários e alteração de permissões dependem de contrato de API ainda não definido e devem ser validadas pelo servidor.</Aviso>
      <div className="abas" role="tablist" aria-label="Administração">
        {(['usuarios', 'auditoria'] as const).map((a) => (
          <button key={a} role="tab" className="aba" aria-selected={aba === a} onClick={() => setAba(a)}>{a === 'usuarios' ? 'Usuários' : 'Auditoria'}</button>
        ))}
      </div>
      <div role="tabpanel">
        {aba === 'usuarios'
          ? <ListPage<Usuario> secao titulo="Usuários e permissões" listar={(q) => servicos.usuarios.listar(q)} colunas={usuarios} />
          : <ListPage<RegistroAuditoria> secao titulo="Histórico de operações" listar={(q) => servicos.auditoria.listar(q)} colunas={auditoria} />}
      </div>
    </>
  );
}
