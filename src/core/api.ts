// Создаем воркера
const worker = new Worker(
  new URL('../workers/imageWorker.ts', import.meta.url),
  { type: 'module' }
);

// Хранилище задач
interface Task {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
  progress: number;
  result?: any;
  error?: string;
}

const tasks = new Map<string, Task>();
let taskIdCounter = 0;

// Создаем новую задачу
export function createTask(): Task {
  const id = `task_${Date.now()}_${taskIdCounter++}`;
  const task: Task = {
    id,
    status: 'pending',
    progress: 0
  };
  tasks.set(id, task);
  return task;
}

// Получаем задачу по ID
export function getTask(taskId: string): Task | undefined {
  return tasks.get(taskId);
}

// Обновляем статус задачи
export function updateTaskStatus(
  taskId: string, 
  status: Task['status'], 
  progress?: number,
  result?: any
) {
  const task = tasks.get(taskId);
  if (task) {
    task.status = status;
    if (progress !== undefined) task.progress = progress;
    if (result !== undefined) task.result = result;
  }
}

// Отправка задачи в воркер
export async function submitTask(
  file: File, 
  onProgress?: (progress: number) => void
): Promise<string> {
  const task = createTask();
  
  return new Promise((resolve, reject) => {
    // Отправляем данные рабочему
    worker.postMessage({
      type: 'PROCESS_IMAGE',
      payload: {
        taskId: task.id,
        file: file
      }
    });

    // Обработчик ответов
    const handler = (event: MessageEvent) => {
      if (event.data.taskId === task.id) {
        switch (event.data.type) {
          case 'PROGRESS':
            updateTaskStatus(task.id, 'processing', event.data.progress);
            onProgress?.(event.data.progress);
            break;
            
          case 'COMPLETE':
            updateTaskStatus(task.id, 'completed', 100, event.data.result);
            worker.removeEventListener('message', handler);
            resolve(task.id);
            break;
            
          case 'ERROR':
            updateTaskStatus(task.id, 'error', 0);
            worker.removeEventListener('message', handler);
            reject(new Error(event.data.error));
            break;
        }
      }
    };

    worker.addEventListener('message', handler);
  });
}

// Отмена задачи
export function cancelTask(taskId: string) {
  worker.postMessage({
    type: 'CANCEL',
    payload: { taskId }
  });
  updateTaskStatus(taskId, 'cancelled');
}

// Подписка на все события
export function onStatusChange(callback: (data: any) => void) {
  worker.addEventListener('message', callback);
}