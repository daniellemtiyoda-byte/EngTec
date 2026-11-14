import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../erros';
import { erroDoBanco } from './index';

describe('erroDoBanco', () => {
  it('erro de regra (P0xxx): status, mensagem e campos da função', () => {
    const e = erroDoBanco({ code: 'P0422', message: 'Confira a separação.', details: '{"status": 422, "campos": {"separacao": "Nada separado."}}' });
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(422);
    expect(e.message).toBe('Confira a separação.');
    expect(e.detalhes).toEqual({ separacao: 'Nada separado.' });
  });

  it('outro erro: mensagem genérica com o código, sem a mensagem técnica', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const e = erroDoBanco({ code: '21000', message: 'UPDATE requires a WHERE clause' });
    expect(e.status).toBe(500);
    expect(e.message).toBe('Não foi possível concluir a operação (código 21000). Tente novamente.');
    expect(e.message).not.toContain('WHERE');
    expect(erroDoBanco({ code: 'PGRST202', message: 'x' }).message).toContain('(código PGRST202)');
    // Sem código (falha de rede) ou com um código estranho: só a genérica.
    expect(erroDoBanco({ message: 'Failed to fetch' }).message).toBe('Não foi possível concluir a operação. Tente novamente.');
    expect(erroDoBanco({ code: '<script>', message: 'x' }).message).toBe('Não foi possível concluir a operação. Tente novamente.');
  });
});
