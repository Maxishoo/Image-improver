import './style.css'
import { submitTask, getTask } from './core/api'

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
const loadingOverlay = document.getElementById('loadingOverlay') as HTMLDivElement;

const originalCtx = originalCanvas.getContext('2d');
const enhancedCtx = enhancedCanvas.getContext('2d');

let currentTaskId: string | null = null;
let enhancedBlob: Blob | null = null;
let originalImageWidth = 0;
let originalImageHeight = 0;

function updateAspectRatio(width: number, height: number) {
  const wrapper = document.querySelector('.image-wrapper') as HTMLElement;
  if (wrapper) {
    wrapper.style.aspectRatio = `${width} / ${height}`;
  }
}
function updateComparison(value: number) {
  originalContainer.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  enhancedContainer.style.clipPath = `inset(0 0 0 ${value}%)`;

  const divider = document.querySelector('.divider') as HTMLElement;
  if (divider) {
    divider.style.left = `${value}%`;
  }

  sliderRange.style.background = `linear-gradient(90deg, #6366f1 ${value}%, #444 ${value}%)`;
}

if (sliderRange) {
  sliderRange.addEventListener('input', (e) => {
    const value = (e.target as HTMLInputElement).value;
    updateComparison(Number(value));
  });
}

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

fileInput.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  enhancedBlob = null;
  downloadBtn.classList.remove('visible');

  loadingOverlay.classList.remove('hidden');
  
  statusDiv.textContent = 'Статус: Начинаем обработку... ⏳';
  statusDiv.style.color = 'blue';
  
  const originalImg = new Image();
  originalImg.onload = () => {
    sliderRange.value = '50';
    updateComparison(50);

    originalImageWidth = originalImg.width;
    originalImageHeight = originalImg.height;

    originalCanvas.width = originalImg.width;
    originalCanvas.height = originalImg.height;
    enhancedCanvas.width = originalImg.width;
    enhancedCanvas.height = originalImg.height;
    
    originalCtx?.drawImage(originalImg, 0, 0);
    
    enhancedCtx?.clearRect(0, 0, enhancedCanvas.width, enhancedCanvas.height);
    
    updateAspectRatio(originalImg.width, originalImg.height);
    
    comparisonContainer.classList.add('visible');
    comparisonSlider.classList.add('visible');
    
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
        
        console.log('🎨 Загружаем результат');
        
        const enhancedUrl = URL.createObjectURL(enhancedBlob);
        const enhancedImg = new Image();
        
        enhancedImg.onload = () => {
          console.log('📐 Результат:', enhancedImg.width, '×', enhancedImg.height);
          
          enhancedCanvas.width = originalImageWidth;
          enhancedCanvas.height = originalImageHeight;
          
          enhancedCtx?.drawImage(
            enhancedImg,
            0, 0, enhancedImg.width, enhancedImg.height,
            0, 0, enhancedCanvas.width, enhancedCanvas.height
          );
          downloadBtn.classList.add('visible');

          sliderRange.value = '50';
          updateComparison(50);
          
          URL.revokeObjectURL(enhancedUrl);
          console.log('✅ Изображение отрисовано');
        };
        loadingOverlay.classList.add('hidden');
        
        enhancedImg.onerror = (e) => {
          console.error('❌ Ошибка загрузки:', e);
          statusDiv.textContent = '❌ Ошибка отображения';
        };
        
        enhancedImg.src = enhancedUrl;
      }
    }
  } catch (error) {
    statusDiv.textContent = `Статус: Ошибка! ❌ ${error}`;
    statusDiv.style.color = 'red';
    console.error('Processing error:', error);
  }
});