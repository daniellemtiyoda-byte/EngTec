import { HashRouter, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { RotaProtegida } from './components/Layout';
import Login from './pages/Login';
import { ROTAS } from './rotas';

// HashRouter: funciona em qualquer hospedagem estática sem configuração de rewrite. Rotas protegidas são só UX.
export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RotaProtegida />}>
              {ROTAS.map(({ caminho, tela: Tela }) => <Route key={caminho} path={caminho} element={<Tela />} />)}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}
