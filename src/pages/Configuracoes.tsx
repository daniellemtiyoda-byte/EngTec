import { useState } from 'react';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { Aviso } from '../components/Estados';
import { ConfirmModal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { env } from '../config/env';
import { servicos } from '../services';
import { mensagemSegura } from '../services/erros';

/**
 * Configurações (só administrador). Por enquanto só a seção "Dados de demonstração"; os parâmetros editáveis entram
 * na Etapa 11. No Supabase, reiniciar recria os dados no banco (função reiniciar_demonstracao) sem apagar as contas
 * nem os perfis; no modo simulado, recria os dados guardados neste navegador.
 */
export default function Configuracoes() {
  const notificar = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const supabase = env.FONTE_DADOS === 'supabase';

  async function reiniciar() {
    setEnviando(true);
    setErro(undefined);
    try {
      await servicos.parametros.reiniciarDemonstracao();
      setConfirmar(false);
      notificar('sucesso', 'Dados de demonstração reiniciados.');
    } catch (e) {
      setErro(mensagemSegura(e));
      setConfirmar(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="painel">
      <CabecalhoPagina titulo="Configurações" subtitulo="Os parâmetros editáveis entram na etapa 11 do plano." />
      <h2>Dados de demonstração</h2>
      <p>
        {supabase
          ? 'Recria no banco a história de demonstração, com as datas contadas a partir de hoje. As contas e os perfis dos usuários continuam; tudo o mais que foi lançado é apagado, para todos os usuários.'
          : 'Recria a história de demonstração neste navegador, com as datas contadas a partir de hoje. O que foi lançado neste aparelho é apagado.'}
      </p>
      {erro && <Aviso tom="critico">{erro}</Aviso>}
      <button className="btn btn-perigo" onClick={() => setConfirmar(true)}>Reiniciar dados de demonstração</button>
      <ConfirmModal
        aberto={confirmar} perigo carregando={enviando} titulo="Reiniciar dados de demonstração"
        mensagem={supabase ? 'Os dados lançados no banco serão apagados e a demonstração será recriada para todos os usuários. Continuar?' : 'Os dados lançados neste navegador serão apagados e a demonstração será recriada. Continuar?'}
        rotuloConfirmar="Reiniciar" aoConfirmar={reiniciar} aoCancelar={() => setConfirmar(false)}
      />
    </section>
  );
}
