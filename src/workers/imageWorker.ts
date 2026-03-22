const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const activeTasks = new Set<string>();

const MODEL_SIZE = 256;

async function checkResources() {
  try {
    const modelResponse = await fetch('/models/zero_dce.onnx');
    console.log('📦 Модель:', {
      status: modelResponse.status,
      size: modelResponse.headers.get('content-length')
    });
  } catch (e) {
    console.warn('⚠️ Модель пока не доступна:', e);
  }
}
checkResources();

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'PROCESS_IMAGE') {
    const { taskId, file } = payload;
    activeTasks.add(taskId);

    try {
      self.postMessage({ type: 'PROGRESS', taskId, progress: 10, message: '1. Проверка...' });
      await sleep(200);

      self.postMessage({ type: 'PROGRESS', taskId, progress: 30, message: '2. Подготовка...' });
      await sleep(200);

      self.postMessage({ type: 'PROGRESS', taskId, progress: 50, message: '3. Сжатие до 256×256...' });

      const resizedBlob = await downscaleImageInWorker(file);

      self.postMessage({ type: 'PROGRESS', taskId, progress: 70, message: '4. Zero-DCE...' });

      const { zeroDCE } = await import('../ml/zeroDCE.js');

      if (!zeroDCE.isLoaded) {
        self.postMessage({ type: 'PROGRESS', taskId, progress: 75, message: '4.1 Загрузка модели...' });
        await zeroDCE.load('/models/zero_dce.onnx');
      }

      self.postMessage({ type: 'PROGRESS', taskId, progress: 80, message: '4.2 Генерация curves...' });

      const curves = await zeroDCE.enhance(resizedBlob);

      self.postMessage({ type: 'PROGRESS', taskId, progress: 90, message: '4.3 Применение к оригиналу...' });

      const enhancedFullResult = await zeroDCE.applyCurvesToOriginal(
        file,
        curves
      );

      const enhancedFullBlob = await zeroDCE.imageDataToBlob(
        enhancedFullResult.imageData,
        enhancedFullResult.width,
        enhancedFullResult.height
      );

      self.postMessage({
        type: 'COMPLETE',
        taskId,
        progress: 100,
        message: '✅ Готово!',
        result: {
          originalFile: file,
          enhancedImage: enhancedFullBlob,
          enhancedSize: `${enhancedFullResult.width}×${enhancedFullResult.height}`,
          params: { modelUsed: 'Zero-DCE (256 → curves → original)' },
        },
      });

    } catch (error) {
      console.error('❌ Worker error:', error);

      self.postMessage({
        type: 'ERROR',
        taskId,
        error: error instanceof Error ? error.message : 'Unknown',
        details: error instanceof Error ? error.stack : undefined
      });

    } finally {
      activeTasks.delete(taskId);
    }
  }

  if (type === 'CANCEL') {
    activeTasks.delete(payload.taskId);
    self.postMessage({ type: 'CANCELLED', taskId: payload.taskId });
  }
};

async function downscaleImageInWorker(file: File): Promise<Blob> {
  const imageBitmap = await createImageBitmap(file);

  const canvas = new OffscreenCanvas(MODEL_SIZE, MODEL_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get context');

  ctx.drawImage(imageBitmap, 0, 0, MODEL_SIZE, MODEL_SIZE);

  const blob = await canvas.convertToBlob({ type: 'image/png' });

  imageBitmap.close();
  return blob;
}

export {};