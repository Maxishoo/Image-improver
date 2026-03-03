import './style.css'
import { submitTask, onStatusChange } from './core/api'

// Находим элементы на странице
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;
const canvas = document.getElementById('previewCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

// Подписываемся на события от воркера
onStatusChange((data) => {
  console.log('Событие от воркера:', data);
  if (data.type === 'TASK_COMPLETE') {
    statusDiv.textContent = 'Статус: Обработка завершена! ✅';
    statusDiv.style.color = 'green';
  }
});

// Обработка загрузки файла
fileInput.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  // 1. Обновляем статус
  statusDiv.textContent = 'Статус: Загрузка и отправка в воркер... ⏳';
  statusDiv.style.color = 'blue';
  canvas.style.display = 'none';

  // 2. Показываем картинку пользователю (превью)
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx?.drawImage(img, 0, 0);
    canvas.style.display = 'block';
  };
  img.src = URL.createObjectURL(file);

  // 3. Отправляем задачу в воркер
  try {
    const taskId = await submitTask(file);
    console.log('Задача создана:', taskId);
  } catch (e) {
    statusDiv.textContent = 'Статус: Ошибка! ❌';
    statusDiv.style.color = 'red';
  }
});