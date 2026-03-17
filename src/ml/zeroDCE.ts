import * as ort from 'onnxruntime-web';

export interface EnhancementResult {
  imageData: ImageData;
  width: number;
  height: number;
}

export class ZeroDCEModel {
  private session: ort.InferenceSession | null = null;
  private isLoaded = false;
  private isLoading = false;

  /**
   * Загружает модель Zero-DCE
   */
  async load(modelPath: string = '/models/zero_dce.onnx'): Promise<void> {
    if (this.isLoaded || this.isLoading) return;
  
    try {
      this.isLoading = true;
      console.log('🔄 Загрузка Zero-DCE модели из:', modelPath);
      
      // Получаем базовый URL (работает и в Worker, и в main потоке)
      const baseUrl = typeof location !== 'undefined' 
        ? location.origin 
        : self.location?.origin || '';
      
      console.log('📍 Базовый URL:', baseUrl);
      
      // Проверяем наличие файла данных
      const dataPath = modelPath + '.data';
      console.log('🔍 Проверка файла данных:', dataPath);
      
      try {
        const dataResponse = await fetch(dataPath);
        if (dataResponse.ok) {
          const size = dataResponse.headers.get('content-length');
          console.log('✅ Файл данных найден, размер:', size, 'bytes');
        } else {
          console.warn('⚠️ Файл данных не найден, статус:', dataResponse.status);
        }
      } catch (e) {
        console.warn('⚠️ Не удалось проверить файл данных:', e);
      }
      
      // Настраиваем пути к WASM (используем относительные пути)
      const wasmPaths = {
        'ort-wasm.wasm': '/wasm/ort-wasm.wasm',
        'ort-wasm-simd.wasm': '/wasm/ort-wasm-simd.wasm',
        'ort-wasm-threaded.wasm': '/wasm/ort-wasm-threaded.wasm',
        'ort-wasm-simd-threaded.wasm': '/wasm/ort-wasm-simd-threaded.wasm'
      };
      
      // Проверяем WASM файлы
      for (const [name, path] of Object.entries(wasmPaths)) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            console.log(`✅ ${name} доступен`);
          } else {
            console.warn(`⚠️ ${name} не найден: ${response.status}`);
          }
        } catch (e) {
          console.warn(`⚠️ ${name} ошибка:`, e);
        }
      }
      
      // Пробуем разные провайдеры с правильной конфигурацией для Worker
      const providers = [
        {
          name: 'wasm',
          options: {
            executionProviders: ['wasm'],
            enableMemPattern: true,
            graphOptimizationLevel: 'all',
            extra: {
              wasm: {
                wasmPaths,
                numThreads: 1, // Воркер использует 1 поток
                allowExternalData: true
              }
            }
          }
        },
        {
          name: 'webgl',
          options: {
            executionProviders: ['webgl'],
            enableMemPattern: true,
            graphOptimizationLevel: 'all'
          }
        },
        {
          name: 'cpu',
          options: {
            executionProviders: ['cpu'],
            enableMemPattern: true
          }
        }
      ];
      
      let lastError = null;
      let success = false;
      
      for (const provider of providers) {
        try {
          console.log(`🔄 Попытка загрузки с ${provider.name}...`);
          
          // Для WebGL в воркере нужны особые настройки
          if (provider.name === 'webgl') {
            // Проверяем, поддерживается ли WebGL в воркере
            if (typeof OffscreenCanvas === 'undefined') {
              console.warn('⚠️ OffscreenCanvas не поддерживается, пропускаем WebGL');
              continue;
            }
          }
          
          this.session = await ort.InferenceSession.create(
            modelPath, 
            provider.options
          );
          
          console.log(`✅ Модель загружена с ${provider.name}`);
          success = true;
          break;
          
        } catch (e) {
          console.warn(`❌ ${provider.name} не сработал:`, e);
          lastError = e;
        }
      }
      
      if (!success) {
        throw new Error(`Не удалось загрузить модель ни с одним провайдером. Последняя ошибка: ${lastError}`);
      }
      
      this.isLoaded = true;
      console.log('📊 Входы:', this.session.inputNames);
      console.log('📊 Выходы:', this.session.outputNames);
      
    } catch (error) {
      console.error('❌ Ошибка загрузки модели:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Проверяет, загружена ли модель
   */
  checkLoaded(): void {
    if (!this.isLoaded || !this.session) {
      throw new Error('Zero-DCE model not loaded. Call load() first.');
    }
  }

  /**
   * Применяет улучшение к изображению
   */
  async enhance(imageBlob: Blob): Promise<EnhancementResult> {
    this.checkLoaded();

    // Создаем ImageBitmap из blob
    const imageBitmap = await createImageBitmap(imageBlob);
    
    try {
      // Готовим тензор
      const inputTensor = await this.prepareInput(imageBitmap);
      
      // Запускаем инференс
      // Запуск инференса
      const feeds: Record<string, ort.Tensor> = { [this.session!.inputNames[0]]: inputTensor };
      const results = await this.session!.run(feeds);

      console.log('📊 Выходы модели:', this.session!.outputNames);

      // Выбираем правильный выход (enhanced_image)
      const outputName = this.session!.outputNames.find(name => 
        name === 'enhanced_image' || name.includes('enhanced')
      ) || this.session!.outputNames[0];

      console.log('🎯 Используем выход:', outputName);
      const outputTensor = results[outputName]; // Берем именованный выход
      
      // Конвертируем результат в ImageData
      const enhancedData = this.convertOutputToImageData(outputTensor, imageBitmap.width, imageBitmap.height);
      
      // Очищаем память
      inputTensor.dispose();
      outputTensor.dispose();
      
      return {
        imageData: enhancedData,
        width: imageBitmap.width,
        height: imageBitmap.height
      };
    } finally {
      imageBitmap.close();
    }
  }

  /**
   * Подготавливает входной тензор
   */
  private async prepareInput(bitmap: ImageBitmap): Promise<ort.Tensor> {
    const { width, height } = bitmap;

    // Создаем canvas для получения пикселей
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Cannot get 2D context from OffscreenCanvas');
    }

    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Конвертируем в Float32Array и нормализуем [0, 255] -> [0, 1]
    // Формат: [N, C, H, W] -> [1, 3, H, W]
    const floatData = new Float32Array(3 * height * width);
    
    // Разделяем RGB каналы (CHW формат)
    for (let i = 0; i < height * width; i++) {
      const pixelIndex = i * 4;
      floatData[i] = data[pixelIndex] / 255.0;           // R
      floatData[height * width + i] = data[pixelIndex + 1] / 255.0;     // G
      floatData[2 * height * width + i] = data[pixelIndex + 2] / 255.0; // B
    }

    return new ort.Tensor('float32', floatData, [1, 3, height, width]);
  }

  /**
   * Конвертирует выходной тензор в ImageData
   */
  private convertOutputToImageData(tensor: ort.Tensor, width: number, height: number): ImageData {
    const outputData = tensor.data as Float32Array;
    const imageData = new ImageData(width, height);
    
    // Конвертируем из CHW в HWC и денормализуем [0, 1] -> [0, 255]
    const channelSize = height * width;
    
    for (let i = 0; i < height * width; i++) {
      const pixelIndex = i * 4;
      
      // Читаем из CHW формата
      const r = outputData[i];
      const g = outputData[channelSize + i];
      const b = outputData[2 * channelSize + i];
      
      // Денормализуем и ограничиваем [0, 255]
      imageData.data[pixelIndex] = Math.min(255, Math.max(0, r * 255));     // R
      imageData.data[pixelIndex + 1] = Math.min(255, Math.max(0, g * 255)); // G
      imageData.data[pixelIndex + 2] = Math.min(255, Math.max(0, b * 255)); // B
      imageData.data[pixelIndex + 3] = 255;                                   // A
    }

    return imageData;
  }

  /**
   * Сохраняет ImageData в Blob
   */
  async imageDataToBlob(imageData: ImageData, width: number, height: number): Promise<Blob> {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Cannot get context');
    }
    
    ctx.putImageData(imageData, 0, 0);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  }

  /**
   * Очищает ресурсы
   */
  dispose(): void {
    if (this.session) {
      this.session.release();
      this.session = null;
    }
    this.isLoaded = false;
  }
}

// Экспортируем singleton
export const zeroDCE = new ZeroDCEModel();