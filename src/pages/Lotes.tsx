import { Navigate, useSearchParams } from 'react-router-dom';

/** A lista de lotes é a visão "Por lote" do Estoque: /lotes (de links antigos e alertas do servidor) leva para lá com a busca e os filtros. */
export default function Lotes() {
  const [params] = useSearchParams();
  params.set('visao', 'lote');
  return <Navigate to={`/estoque?${params}`} replace />;
}
