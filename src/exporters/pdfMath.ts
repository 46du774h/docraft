
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { toPng } from 'html-to-image';

export interface RenderedMath {
  dataUrl: string;
  width: number;
  height: number;
}

export async function renderMathToPng(
  tex: string,
  displayMode: boolean,
  fontSize = 12,
  color = '#000000',
  background = '#ffffff',
): Promise<RenderedMath> {
  const host = document.createElement('div');

  Object.assign(host.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    display: displayMode ? 'block' : 'inline-block',
    width: 'max-content',
    maxWidth: 'none',
    padding: '2px',
    margin: '0',
    backgroundColor: background,
    color,
    fontSize: `${fontSize}px`,
    lineHeight: '1',
    whiteSpace: 'nowrap',
    zIndex: '2147483647',
    pointerEvents: 'none',
  });

  if (displayMode) host.style.textAlign = 'center';

  document.body.appendChild(host);

  try {
    katex.render(tex, host, {
      displayMode,
      throwOnError: true,
      strict: 'ignore',
      output: 'html',
      trust: false,
    });

    if (document.fonts) await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );

    const bounds = host.getBoundingClientRect();

    if (bounds.width <= 0 || bounds.height <= 0) {
      throw new Error('Formula has invalid dimensions.');
    }

    const dataUrl = await toPng(host, {
      pixelRatio: 3,
      backgroundColor: background,
      cacheBust: true,
    });

    return {
      dataUrl,
      // pdfmake uses points while the browser reports CSS pixels.
      width: Math.ceil(bounds.width * 0.75),
      height: Math.ceil(bounds.height * 0.75),
    };
  } finally {
    host.remove();
  }
}