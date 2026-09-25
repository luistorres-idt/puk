import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preprocessEvidenceImage } from './image-preprocessing.js';

const { heic2any } = vi.hoisted(() => ({ heic2any: vi.fn() }));
vi.mock('heic2any', () => ({ default: heic2any }));

let dimensions = { width: 4000, height: 2000 };
let readerFails = false;
let imageFails = false;
let exportedBlob: Blob | null;
let readFile: File | undefined;
let imageSource: string | undefined;
const drawImage = vi.fn();
const getContext = vi.fn(() => ({ drawImage }));
const toBlob = vi.fn((callback: BlobCallback) => callback(exportedBlob));
const createElement = vi.fn(() => ({ width: 0, height: 0, getContext, toBlob }));

class MockFileReader {
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;

  readAsDataURL(file: File) {
    readFile = file;
    if (readerFails) {
      this.onerror?.({} as ProgressEvent<FileReader>);
    } else {
      this.onload?.({
        target: { result: 'data:image/jpeg;base64,abc' },
      } as ProgressEvent<FileReader>);
    }
  }
}

class MockImage {
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  width = dimensions.width;
  height = dimensions.height;

  set src(value: string) {
    imageSource = value;
    if (imageFails) this.onerror?.();
    else this.onload?.();
  }
}

beforeEach(() => {
  dimensions = { width: 4000, height: 2000 };
  readerFails = false;
  imageFails = false;
  exportedBlob = new Blob(['jpeg'], { type: 'image/jpeg' });
  readFile = undefined;
  imageSource = undefined;
  vi.stubGlobal('FileReader', MockFileReader);
  vi.stubGlobal('Image', MockImage);
  vi.stubGlobal('document', { createElement });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('preprocessEvidenceImage', () => {
  it('resizes a landscape image to 1920px and encodes JPEG at quality 0.85', async () => {
    const file = new File(['original'], 'photo.png', { type: 'image/png' });
    const onConverting = vi.fn();

    const result = await preprocessEvidenceImage(file, onConverting);

    expect(result).toEqual({ blob: exportedBlob, width: 1920, height: 960 });
    expect(readFile).toBe(file);
    expect(imageSource).toBe('data:image/jpeg;base64,abc');
    expect(createElement).toHaveBeenCalledWith('canvas');
    expect(drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 1920, 960);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
    expect(onConverting).not.toHaveBeenCalled();
    expect(heic2any).not.toHaveBeenCalled();
  });

  it('uses the original file if canvas encoding returns null and preserves portrait dimensions', async () => {
    dimensions = { width: 1000, height: 4000 };
    exportedBlob = null;
    const file = new File(['original'], 'photo.jpg', { type: 'image/jpeg' });

    const result = await preprocessEvidenceImage(file, vi.fn());

    expect(result).toEqual({ blob: file, width: 480, height: 1920 });
  });

  it('converts HEIF by extension and preserves its name and modification time', async () => {
    exportedBlob = null;
    const converted = new Blob(['converted'], { type: 'image/jpeg' });
    heic2any.mockResolvedValueOnce([converted]);
    const file = new File(['original'], 'vehicle.HEIF', {
      type: 'application/octet-stream',
      lastModified: 123456789,
    });
    const onConverting = vi.fn();

    const result = await preprocessEvidenceImage(file, onConverting);

    expect(onConverting).toHaveBeenCalledExactlyOnceWith();
    expect(heic2any).toHaveBeenCalledWith({ blob: file, quality: 0.85, toType: 'image/jpeg' });
    expect(readFile).toBeInstanceOf(File);
    expect(readFile).toMatchObject({
      name: 'vehicle.jpg',
      type: 'image/jpeg',
      lastModified: 123456789,
    });
    expect(await readFile?.text()).toBe('converted');
    expect(result.blob).toBe(readFile);
  });

  it('keeps reader and decoder errors unchanged', async () => {
    const file = new File(['original'], 'photo.jpg', { type: 'image/jpeg' });
    readerFails = true;
    await expect(preprocessEvidenceImage(file, vi.fn())).rejects.toThrow(
      'No se pudo leer el archivo de imagen seleccionado',
    );

    readerFails = false;
    imageFails = true;
    await expect(preprocessEvidenceImage(file, vi.fn())).rejects.toThrow(
      'No se pudo decodificar la imagen seleccionada',
    );
  });

  it('keeps the conversion error for non-blob HEIC results', async () => {
    heic2any.mockResolvedValueOnce(null);
    const file = new File(['original'], 'photo.heic', { type: 'image/heic' });

    await expect(preprocessEvidenceImage(file, vi.fn())).rejects.toThrow(
      'No fue posible convertir la foto HEIC a JPEG',
    );
    expect(readFile).toBeUndefined();
  });
});
