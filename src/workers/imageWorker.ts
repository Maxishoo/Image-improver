// Функция для создания паузы (в миллисекундах)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const activeTasks = new Set<string>();

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'PROCESS_IMAGE') {
    const { taskId, file } = payload;
    
    // Добавляем задачу в активные
    activeTasks.add(taskId);
    
    try {
      // --- ЭТАП 1: Проверка формата ---
      self.postMessage({
        type: 'PROGRESS',
        taskId,
        progress: 10,
        message: '1. Проверка формата...'
      });
      await sleep(2000); // ⏸️ ПАУЗА 2 секунды

      // --- ЭТАП 2: Конвертация HEIC (если нужно) ---
      self.postMessage({
        type: 'PROGRESS',
        taskId,
        progress: 30,
        message: '2. Конвертация HEIC...'
      });
      await sleep(2000); // ⏸️ ПАУЗА 2 секунды

      // --- ЭТАП 3: Сжатие для ML ---
      self.postMessage({
        type: 'PROGRESS',
        taskId,
        progress: 50,
        message: '3. Подготовка для ML (сжатие)...'
      });
      
      // Реальное сжатие (быстрое, но добавим задержку для наглядности)
      const resizedBlob = await downscaleImageInWorker(file, 512);
      await sleep(2000); // ⏸️ ПАУЗА 2 секунды

      // --- ЭТАП 4: Имитация ML анализа ---
      self.postMessage({
        type: 'PROGRESS',
        taskId,
        progress: 80,
        message: '4. Анализ нейросетью...'
      });
      await sleep(2000); // ⏸️ ПАУЗА 2 секунды

      // --- ЭТАП 5: Завершение ---
      self.postMessage({
        type: 'PROGRESS',
        taskId,
        progress: 90,
        message: '5. Формирование ответа...'
      });
      await sleep(1000); // ⏸️ ПАУЗА 1 секунда

      // Результат (заглушка параметров)
      const mlParams = {
        brightness: 1.1,
        contrast: 1.05,
        saturation: 1.0
      };

      self.postMessage({
        type: 'COMPLETE',
        taskId,
        progress: 100,
        message: 'Готово!',
        result: {
          originalFile: file,
          mlInput: resizedBlob,
          params: mlParams
        }
      });

    } catch (error) {
      self.postMessage({
        type: 'ERROR',
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      activeTasks.delete(taskId);
    }
  }

  if (type === 'CANCEL') {
    const { taskId } = payload;
    activeTasks.delete(taskId);
    self.postMessage({
      type: 'CANCELLED',
      taskId
    });
  }
};

// Функция для сжатия изображения в воркере
async function downscaleImageInWorker(file: File, maxSize: number): Promise<Blob> {
  const imageBitmap = await createImageBitmap(file);
  
  let width = imageBitmap.width;
  let height = imageBitmap.height;
  
  if (width > height) {
    if (width > maxSize) {
      height = Math.round((height * maxSize) / width);
      width = maxSize;
    }
  } else {
    if (height > maxSize) {
      width = Math.round((width * maxSize) / height);
      height = maxSize;
    }
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Cannot get canvas context');
  }

  ctx.drawImage(imageBitmap, 0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  
  imageBitmap.close();
  return blob;
}

export {};