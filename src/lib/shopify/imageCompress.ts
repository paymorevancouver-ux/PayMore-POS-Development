function canvasFromSize(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest > maxEdge) {
    const scale = maxEdge / longest;
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
  }
  return { width, height };
}

export async function compressImageFile(file: File, maxEdge = 2800, quality = 0.86): Promise<string> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const size = canvasFromSize(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', quality);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const size = canvasFromSize(img.width, img.height, maxEdge);
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, size.width, size.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = String(event.target?.result || '');
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
