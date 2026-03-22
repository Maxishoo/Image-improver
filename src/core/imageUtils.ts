import heic2any from 'heic2any';

export async function convertHeicToJpeg(file: File): Promise<File> {
  const blob = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.9
  });

  return new File([blob as Blob], file.name.replace(/\.heic$/i, '.jpg'), {
    type: 'image/jpeg'
  });
}

export function isHeicFile(file: File): boolean {
  return file.type === 'image/heic' || 
         file.type === 'image/heif' || 
         file.name.toLowerCase().endsWith('.heic') ||
         file.name.toLowerCase().endsWith('.heif');
}


export async function downscaleImage(file: File, maxSize: number = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
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

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Cannot get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      }, 'image/jpeg', 0.9);
    };
    
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}