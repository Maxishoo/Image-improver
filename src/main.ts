import './style.css'
import { submitTask, getTask, cancelTask } from './core/api'

// Элементы
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;
const canvas = document.getElementById('previewCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

// Обработка загрузки файла
fileInput.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  // Сбрасываем UI
  statusDiv.textContent = 'Статус: Обработка... ⏳';
  statusDiv.style.color = 'blue';
  canvas.style.display = 'none';

  // Показываем превью
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx?.drawImage(img, 0, 0);
    canvas.style.display = 'block';
  };
  img.src = URL.createObjectURL(file);

  // Отправляем на обработку
  try {
    const taskId = await submitTask(file, (progress) => {
      statusDiv.textContent = `Статус: Обработка... ${progress}% ⏳`;
    });

    const task = getTask(taskId);
    if (task?.status === 'completed') {
      statusDiv.textContent = 'Статус: Обработка завершена! ✅';
      statusDiv.style.color = 'green';
      
      // Показываем результаты ML (пока в консоль)
      console.log('ML параметры:', task.result?.params);
    }
  } catch (error) {
    statusDiv.textContent = `Статус: Ошибка! ❌ ${error}`;
    statusDiv.style.color = 'red';
  }
});