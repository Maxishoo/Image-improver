// Создаем рабочего
const worker = new Worker(
    new URL('../workers/imageWorker.ts', import.meta.url),
    { type: 'module' }
  );
  
  let taskIdCounter = 0;
  
  // Функция отправки задачи
  export function submitTask(imageFile: File): Promise<string> {
    return new Promise((resolve) => {
      const taskId = `task_${Date.now()}_${taskIdCounter++}`;
      
      // Отправляем данные рабочему
      worker.postMessage({
        type: 'INIT_TASK',
        payload: {
          id: taskId,
          file: imageFile
        }
      });
  
      // Ждем ответа
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'TASK_COMPLETE' && event.data.payload.messageId === taskId) {
          worker.removeEventListener('message', handler);
          resolve(taskId);
        }
      };
  
      worker.addEventListener('message', handler);
    });
  }
  
  // Подписка на события (для будущего прогресс-бара)
  export function onStatusChange(callback: (data: any) => void) {
    worker.addEventListener('message', (event) => {
      callback(event.data);
    });
  }