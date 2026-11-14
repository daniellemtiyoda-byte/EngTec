/** Tamanho máximo (px) do lado maior da imagem após redução. */
const MAX_LADO = 1600;
/** Qualidade JPEG usada na conversão. */
const QUALIDADE = 0.85;

/** MIME types e extensões aceitos nos campos de foto do app. */
export const MIME_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const EXT_IMAGEM = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

/**
 * Reduz uma imagem para JPEG com no máximo 1600 px no lado maior, qualidade 0,85, antes do envio.
 *
 * Fallback: se o navegador não conseguir decodificar (ex.: HEIC no Chrome/Windows):
 *   - devolve o original quando estiver dentro do `maxMB` e for de tipo aceito;
 *   - rejeita com mensagem clara se não for possível enviar.
 */
export async function reduzirParaJpeg(arquivo: File, maxMB: number): Promise<File> {
  const ext = arquivo.name.split('.').pop()?.toLowerCase() ?? '';
  const tipoOk = MIME_IMAGEM.includes(arquivo.type) || EXT_IMAGEM.includes(ext);
  if (!tipoOk) {
    throw new Error(`Formato não permitido em ${arquivo.name}. Use JPG, PNG, WEBP ou HEIC.`);
  }

  try {
    const bitmap = await createImageBitmap(arquivo);
    const { width, height } = bitmap;

    let novaLargura = width;
    let novaAltura = height;
    if (width > MAX_LADO || height > MAX_LADO) {
      if (width >= height) {
        novaLargura = MAX_LADO;
        novaAltura = Math.round((height * MAX_LADO) / width);
      } else {
        novaAltura = MAX_LADO;
        novaLargura = Math.round((width * MAX_LADO) / height);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = novaLargura;
    canvas.height = novaAltura;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas não disponível.');
    ctx.drawImage(bitmap, 0, 0, novaLargura, novaAltura);
    bitmap.close();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => { if (b) resolve(b); else reject(new Error('Não foi possível converter a imagem.')); },
        'image/jpeg',
        QUALIDADE,
      );
    });

    const nomeSemExt = arquivo.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${nomeSemExt}.jpg`, { type: 'image/jpeg' });
  } catch {
    // Fallback: original quando o navegador não consegue decodificar (ex.: HEIC no Chrome/Windows).
    if (arquivo.size > maxMB * 1024 * 1024) {
      throw new Error(
        `Não foi possível converter ${arquivo.name} e o arquivo excede ${maxMB} MB. Use JPG, PNG ou WEBP.`,
      );
    }
    return arquivo;
  }
}
