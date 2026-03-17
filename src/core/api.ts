const worker = new Worker(
  new URL('../workers/imageWorker.ts', import.meta.url),
  { type: 'module' }
);

interface Task {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
  progress: number;
  result?: any;
  error?: string;
}

const tasks = new Map<string, Task>();
let taskIdCounter = 0;

export function createTask(): Task {
  const id = `task_${Date.now()}_${taskIdCounter++}`;
  const task: Task = { id, status: 'pending', progress: 0 };
  tasks.set(id, task);
  return task;
}

export function getTask(taskId: string): Task | undefined {
  return tasks.get(taskId);
}

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

export async function submitTask(
  file: File, 
  onProgress?: (progress: number) => void
): Promise<string> {
  const task = createTask();
  
  return new Promise((resolve, reject) => {
    worker.postMessage({
      type: 'PROCESS_IMAGE',
      payload: {
        taskId: task.id,
        file: file
      }
    });

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
          
          case 'PREVIEW':
            updateTaskStatus(task.id, 'processing', event.data.progress);
            // Можно показать промежуточный результат
            onProgress?.(event.data.progress);
            // Отправляем превью в main
            const previewEvent = new CustomEvent('preview', { 
              detail: { taskId: task.id, preview: event.data.preview } 
            });
            window.dispatchEvent(previewEvent);
            break;
        }
      }
    };

    worker.addEventListener('message', handler);
  });
}

export function cancelTask(taskId: string) {
  worker.postMessage({
    type: 'CANCEL',
    payload: { taskId }
  });
  updateTaskStatus(taskId, 'cancelled');
}

export function onStatusChange(callback: ( any) => void) {
  worker.addEventListener('message', callback);
}