import { Link } from 'react-router-dom';
import { Icone } from './Icone';
import { useToast } from './Toast';

/**
 * ID do sistema (dormente, fardo, contrato, RME, local): fonte mono, link quando há página e botão de copiar.
 * `CodigoLink` usa este componente com a rota de `rotaDoCodigo()`.
 */
export function IdCodigo({ id, para, tamanho = 'normal', copiar = true }: { id: string; para?: string; tamanho?: 'normal' | 'grande'; copiar?: boolean }) {
  const notificar = useToast();
  async function copiarId() {
    try {
      await navigator.clipboard.writeText(id);
      notificar('sucesso', `${id} copiado.`);
    } catch {
      notificar('erro', 'Não foi possível copiar. Selecione o código e copie à mão.');
    }
  }
  return (
    <span className={`id-codigo${tamanho === 'grande' ? ' id-grande' : ''}`}>
      {para ? <Link className="codigo" to={para}>{id}</Link> : <span className="codigo">{id}</span>}
      {copiar && (
        <button type="button" className="id-copiar" onClick={copiarId} aria-label={`Copiar ${id}`} title="Copiar">
          <Icone nome="copiar" tamanho={tamanho === 'grande' ? 18 : 14} />
        </button>
      )}
    </span>
  );
}
