import './style.css'
import { submitTask, getTask } from './core/api'

// Элементы
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;
const originalCanvas = document.getElementById('originalCanvas') as HTMLCanvasElement;
const enhancedCanvas = document.getElementById('enhancedCanvas') as HTMLCanvasElement;
const downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;
const sliderRange = document.getElementById('sliderRange') as HTMLInputElement;
const originalContainer = document.getElementById('originalContainer') as HTMLDivElement;
const enhancedContainer = document.getElementById('enhancedContainer') as HTMLDivElement;
const comparisonContainer = document.getElementById('comparisonContainer') as HTMLDivElement;
const comparisonSlider = document.getElementById('comparisonSlider') as HTMLDivElement;

const originalCtx = originalCanvas.getContext('2d');
const enhancedCtx = enhancedCanvas.getContext('2d');

let currentTaskId: string | null = null;
let enhancedBlob: Blob | null = null;
let originalImageWidth = 0;
let originalImageHeight = 0;

// Функция для обновления соотношения сторон контейнера
function updateAspectRatio(width: number, height: number) {
  const wrapper = document.querySelector('.image-wrapper') as HTMLElement;
  if (wrapper) {
    wrapper.style.aspectRatio = `${width} / ${height}`;
  }
}

// Функция для обновления сравнения
function updateComparison(value: number) {
  if (!originalContainer || !enhancedContainer) return;
  
  // Оригинал слева, улучшенное справа
  originalContainer.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  enhancedContainer.style.clipPath = `inset(0 0 0 ${value}%)`;
  
  // Обновляем цвет слайдера
  if (sliderRange) {
    sliderRange.style.background = `linear-gradient(90deg, #646cff 0%, #646cff ${value}%, #fff ${value}%, #fff 100%)`;
  }
}

// Обработка слайдера
if (sliderRange) {
  sliderRange.addEventListener('input', (e) => {
    const value = (e.target as HTMLInputElement).value;
    updateComparison(Number(value));
  });
}

// Скачивание улучшенного изображения
if (downloadBtn) {
  downloadBtn.addEventListener('click', () => {
    if (!enhancedBlob) return;
    
    const url = URL.createObjectURL(enhancedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enhanced_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// Обработка загрузки файла
fileInput.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  // Сброс состояния
  enhancedBlob = null;
  downloadBtn.classList.remove('visible');
  
  statusDiv.textContent = 'Статус: Начинаем обработку... ⏳';
  statusDiv.style.color = 'blue';
  
  // Загружаем оригинал
  const originalImg = new Image();
  originalImg.onload = () => {
    originalImageWidth = originalImg.width;
    originalImageHeight = originalImg.height;
    
    // Устанавливаем размеры canvas
    originalCanvas.width = originalImg.width;
    originalCanvas.height = originalImg.height;
    enhancedCanvas.width = originalImg.width;
    enhancedCanvas.height = originalImg.height;
    
    // Рисуем оригинал
    originalCtx?.drawImage(originalImg, 0, 0);
    
    // Очищаем улучшенное (пока пусто)
    enhancedCtx?.clearRect(0, 0, enhancedCanvas.width, enhancedCanvas.height);
    
    // Обновляем соотношение сторон контейнера
    updateAspectRatio(originalImg.width, originalImg.height);
    
    // Показываем контейнер сравнения
    comparisonContainer.classList.add('visible');
    comparisonSlider.classList.add('visible');
    
    // Сбрасываем слайдер
    sliderRange.value = '50';
    updateComparison(50);
    
    console.log('Оригинал загружен:', originalImg.width, 'x', originalImg.height);
  };
  originalImg.src = URL.createObjectURL(file);

  try {
    currentTaskId = await submitTask(file, (progress) => {
      statusDiv.textContent = `Статус: Обработка... ${progress}% ⏳`;
    });

    const task = getTask(currentTaskId);
    if (task?.status === 'completed') {
      statusDiv.textContent = 'Статус: Обработка завершена! ✅';
      statusDiv.style.color = 'green';
      
      if (task.result?.enhancedImage) {
        enhancedBlob = task.result.enhancedImage;
        
        console.log('🎨 Загружаем улучшенное изображение');
        
        const enhancedUrl = URL.createObjectURL(enhancedBlob);
        
        const enhancedImg = new Image();
        enhancedImg.onload = () => {
          // Если размеры отличаются, обновляем canvas
          if (enhancedImg.width !== originalImageWidth || 
              enhancedImg.height !== originalImageHeight) {
            enhancedCanvas.width = enhancedImg.width;
            enhancedCanvas.height = enhancedImg.height;
            updateAspectRatio(enhancedImg.width, enhancedImg.height);
          }
          
          // Рисуем улучшенное изображение
          enhancedCtx?.drawImage(enhancedImg, 0, 0);
          
          // Показываем кнопку загрузки
          downloadBtn.classList.add('visible');
          
          URL.revokeObjectURL(enhancedUrl);
          
          console.log('Улучшенное изображение загружено');
        };
        enhancedImg.src = enhancedUrl;
      }
      
      console.log('📊 Параметры:', task.result?.params);
      console.log('🤖 Использована модель:', task.result?.modelUsed);
    }
  } catch (error) {
    statusDiv.textContent = `Статус: Ошибка! ❌ ${error}`;
    statusDiv.style.color = 'red';
    console.error('Processing error:', error);
  }
});