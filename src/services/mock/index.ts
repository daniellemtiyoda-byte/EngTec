import type { Servicos } from '../contracts';
import type { Usuario } from '../../types/models';
import { ApiError } from '../http';
import { criarDados } from './data';
import { atraso } from './util';

let sessao: Usuario | null = null; // apenas em memória: nada de credenciais no armazenamento do navegador

/**
 * Serviços simulados. Por enquanto só a autenticação: os serviços da v2, as regras por módulo
 * (simulador, recebimento, inspeção, estoque, rme) e a persistência no localStorage entram na Etapa 2.
 */
export function criarServicosSimulados(): Servicos {
  const D = criarDados();

  return {
    auth: {
      entrar: async ({ usuario, senha }) => {
        await atraso(500);
        if (!usuario.trim() || !senha) throw new ApiError(401, 'Usuário ou senha inválidos.');
        sessao = D.usuarioDemo;
        return sessao;
      },
      usuarioAtual: async () => { await atraso(150); return sessao; },
      sair: async () => { await atraso(150); sessao = null; },
    },
  };
}
