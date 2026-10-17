import { HashRouter, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { RotaProtegida } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Documentos from './pages/Documentos';
import Recebimento from './pages/Recebimento';
import Lotes from './pages/Lotes';
import Estoque from './pages/Estoque';
import VisaoComputacional from './pages/VisaoComputacional';
import Inventario from './pages/Inventario';
import Patio from './pages/Patio';
import Movimentacoes from './pages/Movimentacoes';
import Fornecedores from './pages/Fornecedores';
import Especies from './pages/Especies';
import Volumetria from './pages/Volumetria';
import Relatorios from './pages/Relatorios';
import Administracao from './pages/Administracao';
import Configuracoes from './pages/Configuracoes';

// HashRouter: funciona em qualquer hospedagem estática sem configuração de rewrite. Rotas protegidas são só UX.
export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RotaProtegida />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/documentos" element={<Documentos />} />
              <Route path="/recebimento" element={<Recebimento />} />
              <Route path="/lotes" element={<Lotes />} />
              <Route path="/estoque" element={<Estoque />} />
              <Route path="/visao-computacional" element={<VisaoComputacional />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/patio" element={<Patio />} />
              <Route path="/movimentacoes" element={<Movimentacoes />} />
              <Route path="/fornecedores" element={<Fornecedores />} />
              <Route path="/especies" element={<Especies />} />
              <Route path="/volumetria" element={<Volumetria />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/administracao" element={<Administracao />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}
