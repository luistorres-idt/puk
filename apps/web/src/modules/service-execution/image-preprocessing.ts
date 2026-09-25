function isHeicFile(file: File): boolean {
  const normalizedType = file.type.toLowerCase();
  const normalizedName = file.name.toLowerCase();
  return (
    normalizedType === 'image/heic' ||
    normalizedType === 'image/heif' ||
    normalizedName.endsWith('.heic') ||
    normalizedName.endsWith('.heif')
  );
}

async function convertHeicIfNeeded(file: File, onConverting: () => void): Promise<File> {
  if (!isHeicFile(file)) return file;

  onConverting();
  const { default: heic2any } = await import('heic2any');
  const converted = await heic2any({
    blob: file,
    quality: 0.85,
    toType: 'image/jpeg',
  });
  const jpeg = Array.isArray(converted) ? converted[0] : converted;
  if (!(jpeg instanceof Blob)) {
    throw new Error('No fue posible convertir la foto HEIC a JPEG');
  }

  return new File([jpeg], `${file.name.replace(/\.(heic|heif)$/i, '')}.jpg`, {
    lastModified: file.lastModified,
    type: 'image/jpeg',
  });
}

async function resizeImageIfNeeded(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen seleccionado'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo decodificar la imagen seleccionada'));
      img.onload = () => {
        const maxDimension = 1920;
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            resolve({ blob: blob || file, width, height });
          },
          'image/jpeg',
          0.85,
        );
      };
      img.src = String(e.target?.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function preprocessEvidenceImage(file: File, onConverting: () => void) {
  const normalizedFile = await convertHeicIfNeeded(file, onConverting);
  return resizeImageIfNeeded(normalizedFile);
}
