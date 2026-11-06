import type { Usuario } from '../../types/models';

// DADOS FICTÍCIOS para desenvolvimento. Nenhum valor aqui representa estoque, fornecedores ou documentos reais.
// Gerados dentro de uma função para o build com API real poder descartar este módulo inteiro.
// A história de demonstração da v2 (seção 15 do docs/PLANO-V2.md) entra na Etapa 2, gerada pelas regras do mock.
export function criarDados() {
  const usuarioDemo: Usuario = {
    id: 'u1', nome: 'Usuário de Demonstração', email: 'demo@exemplo.invalid', perfil: 'Administrador (simulado)',
    permissoes: ['admin'], ativo: true,
  };

  return { usuarioDemo };
}

export type DadosSimulados = ReturnType<typeof criarDados>;
