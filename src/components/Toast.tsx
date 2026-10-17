import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tipo = 'sucesso' | 'erro' | 'alerta' | 'info';
interface Toast { id: number; tipo: Tipo; mensagem: string }
const Ctx = createContext<(tipo: Tipo, mensagem: string) => void>(() => {});
let n = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<Toast[]>([]);
  const fechar = (id: number) => setItens((l) => l.filter((t) => t.id !== id));
  const notificar = useCallback((tipo: Tipo, mensagem: string) => {
    const id = ++n;
    setItens((l) => [...l, { id, tipo, mensagem }]);
    setTimeout(() => fechar(id), tipo === 'erro' ? 8000 : 5000);
  }, []);
  return (
    <Ctx.Provider value={notificar}>
      {children}
      <div className="toasts" aria-live="polite" role="status">
        {itens.map((t) => (
          <div key={t.id} className={`toast toast-${t.tipo}`}>
            <span>{t.mensagem}</span>
            <button className="toast-fechar" onClick={() => fechar(t.id)} aria-label="Fechar notificação">×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
