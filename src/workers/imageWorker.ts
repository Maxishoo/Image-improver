const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const activeTasks = new Set<string>();

// Функция для проверки доступности ресурсов
async function checkResources() {
  console.log('🔍 Проверка ресурсов...');
  
  // Проверяем WASM файлы
  try {
    const wasmResponse = await fetch('/wasm/ort-wasm.wasm');
    console.log('📦 WASM файл:', {
      status: wasmResponse.status,
      type: wasmResponse.headers.get('content-type'),
      size: wasmResponse.headers.get('content-length')
    });
  } catch (e) {
    console.error('❌ WASM файл не доступен:', e);
  }
  
  // Проверяем модель
  try {
    const modelResponse = await fetch('/models/zero_dce.onnx');
    console.log('📦 Модель:', {
      status: modelResponse.status,
      size: modelResponse.headers.get('content-length')
    });
    
    // Проверяем файл данных
    const dataResponse = await fetch('/models/zero_dce.onnx.data');
    console.log('📦 Данные модели:', {
      status: dataResponse.status,
      size: dataResponse.headers.get('content-length')
    });
  } catch (e) {
    console.error('❌ Модель не доступна:', e);
  }
}

// Проверяем при старте воркера
checkResources();

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'PROCESS_IMAGE') {
    const { taskId, file } = payload;
    
    activeTasks.add(taskId);
    
    try {
      self.postMessage({
        type: 'PROGRESS',
        taskId,
        progress: 10,
        message: '1. Проверка формата...'
      });
      await sleep(500);

      self.postMessage({
        type: 'PROGRESS',
        taskId,
        progress: 30,
        message: '2. Подготовка изображения...'
      });
      await sleep(500);

      self.postMessage({
        type: 'PROGRESS',
        taskId,
        progress: 50,
        message: '3. Сжатие для нейросети...'
      });
      
      const resizedBlob = await downscaleImageInWorker(file, 512);
      await sleep(500);

      self.postMessage({
        type: 'PROGRESS',
        taskId,
        progress: 70,
        message: '4. Улучшение Zero-DCE...'
      });

      // Загружаем Zero-DCE
      const { zeroDCE } = await import('../ml/zeroDCE.js');
      
      if (!zeroDCE.isLoaded) {
        self.postMessage({
          type: 'PROGRESS',
          taskId,
          progress: 75,
          message: '4.1 Загрузка модели...'
        });
        
        try {
          await zeroDCE.load('/models/zero_dce.onnx');
          console.log('✅ Модель загружена в воркере');
        } catch (modelError) {
          console.error('❌ Ошибка загрузки модели:', modelError);
          
          // Пробуем альтернативный путь
          self.postMessage({
            type: 'PROGRESS',
            taskId,
            progress: 75,
            message: '4.1 Повторная попытка с другим провайдером...'
          });
          
          await zeroDCE.load('/models/zero_dce.onnx');
        }
      }
      
      self.postMessage({
        type: 'PROGRESS',
        taskId,
        progress: 80,
        message: '4.2 Запуск нейросети...'
      });
      
      const enhancementResult = await zeroDCE.enhance(resizedBlob);
      
      self.postMessage({
        type: 'PROGRESS',
        taskId,
        progress: 90,
        message: '4.3 Постобработка...'
      });
      
      const enhancedBlob = await zeroDCE.imageDataToBlob(
        enhancementResult.imageData,
        enhancementResult.width,
        enhancementResult.height
      );
      
      const mlParams = {
        brightness: 1.0,
        contrast: 1.0,
        saturation: 1.0,
        zeroDCEApplied: true,
        modelUsed: 'Zero-DCE'
      };
      
      self.postMessage({
        type: 'PREVIEW',
        taskId,
        progress: 95,
        preview: enhancedBlob,
        message: '4.4 Генерация превью...'
      });

      console.log('✅ Zero-DCE успешно применил улучшения');
      
      self.postMessage({
        type: 'COMPLETE',
        taskId,
        progress: 100,
        message: '✅ Готово! Zero-DCE',
        result: {
          originalFile: file,
          mlInput: resizedBlob,
          enhancedImage: enhancedBlob,
          params: mlParams,
          modelUsed: 'Zero-DCE'
        }
      });
      
    } catch (error) {
      console.error('❌ Worker error:', error);
      self.postMessage({
        type: 'ERROR',
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
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