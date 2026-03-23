const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const activeTasks = new Set<string>();

const MODEL_SIZE = 256;

async function checkResources() {
  try {
    const modelResponse = await fetch('/models/zero_dce.onnx');
    console.log('Модель:', {
      status: modelResponse.status,
      size: modelResponse.headers.get('content-length')
    });
  } catch (e) {
    console.warn('Модель не доступна:', e);
  }
}
checkResources();

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'PROCESS_IMAGE') {
    const { taskId, file } = payload;
    activeTasks.add(taskId);

    try {
      self.postMessage({ type: 'PROGRESS', taskId, progress: 10, message: 'Проверка...' });
      await sleep(200);

      self.postMessage({ type: 'PROGRESS', taskId, progress: 20, message: 'Подготовка...' });
      await sleep(200);

      self.postMessage({ type: 'PROGRESS', taskId, progress: 30, message: 'Сжатие до 256×256...' });

      const resizedBlob = await downscaleImageInWorker(file);

      self.postMessage({ type: 'PROGRESS', taskId, progress: 50, message: 'Импорт модели Zero-DCE...' });

      const { zeroDCE } = await import('../ml/zeroDCE.js');

      if (!zeroDCE.isLoaded) {
        self.postMessage({ type: 'PROGRESS', taskId, progress: 65, message: 'Загрузка модели Zero-DCE...' });
        await zeroDCE.load('/models/zero_dce.onnx');
      }

      self.postMessage({ type: 'PROGRESS', taskId, progress: 70, message: 'Генерация кривых...' });

      const curves = await zeroDCE.enhance(resizedBlob);

      self.postMessage({ type: 'PROGRESS', taskId, progress: 80, message: 'Применение улучшений к оригиналу...' });

      const enhancedFullResult = await zeroDCE.applyCurvesToOriginal(
        file,
        curves
      );
      self.postMessage({ type: 'PROGRESS', taskId, progress: 90, message: 'Постобработка результата...' });

      enhancedFullResult.imageData = await zeroDCE.autoWhiteBalance(enhancedFullResult.imageData);
      enhancedFullResult.imageData = await zeroDCE.autoContrast(enhancedFullResult.imageData);

      const enhancedFullBlob = await zeroDCE.imageDataToBlob(
        enhancedFullResult.imageData,
        enhancedFullResult.width,
        enhancedFullResult.height
      );

      self.postMessage({
        type: 'COMPLETE',
        taskId,
        progress: 100,
        message: 'Готово!',
        result: {
          originalFile: file,
          enhancedImage: enhancedFullBlob,
          enhancedSize: `${enhancedFullResult.width}×${enhancedFullResult.height}`,
          params: { modelUsed: 'Zero-DCE' },
        },
      });

    } catch (error) {
      console.error('Worker error:', error);

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