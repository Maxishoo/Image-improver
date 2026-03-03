// Слушаем сообщения от главного потока
self.onmessage = (event) => {
    const { type, payload } = event.data;
  
    if (type === 'INIT_TASK') {
      console.log('Worker: Получил задачу', payload);
      
      // Имитируем работу (позже здесь будет ML)
      setTimeout(() => {
        // Сообщаем обратно, что задача выполнена
        self.postMessage({
          type: 'TASK_COMPLETE',
          payload: {
            messageId: payload.id,
            status: 'done',
            message: 'Изображение загружено в воркер'
          }
        });
      }, 5000);
    }
  };
  
  export {}; // Нужно для TypeScript