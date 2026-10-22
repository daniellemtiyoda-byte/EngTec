import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Error Boundary: se uma tela quebrar ao renderizar (ex.: dado inesperado da API), mostra um aviso
 * no lugar dela em vez de deixar o app inteiro em branco. O menu continua funcionando.
 * O Layout o recria a cada troca de rota (key), então sair da tela com erro já limpa o estado.
 */
export class ErroTela extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false };

  static getDerivedStateFromError() {
    return { erro: true };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // Só no console do navegador; nenhum detalhe técnico é mostrado ao usuário.
    console.error('Erro ao renderizar a tela:', erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="estado estado-centro estado-erro" role="alert">
        <strong>Esta tela encontrou um erro e não pôde ser exibida.</strong>
        <span>Tente novamente ou escolha outra opção no menu.</span>
        <button className="btn btn-sec" onClick={() => this.setState({ erro: false })}>Tentar novamente</button>
      </div>
    );
  }
}
