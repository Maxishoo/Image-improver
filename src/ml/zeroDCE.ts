import * as ort from 'onnxruntime-web';

export interface CurvesResult {
  data: Float32Array;
  width: number;
  height: number;
}

function clamp(v: number) {
  return Math.max(0, Math.min(255, v));
}

export interface EnhancementResult {
  imageData: ImageData;
  width: number;
  height: number;
}

export class ZeroDCEModel {
  private session: ort.InferenceSession | null = null;
  public isLoaded = false;

  private readonly SIZE = 256;

  async load(path = '/models/zero_dce.onnx') {
    this.session = await ort.InferenceSession.create(path, {
      executionProviders: ['wasm'],
    });
    this.isLoaded = true;
  }

  async enhance(blob: Blob): Promise<CurvesResult> {
    if (!this.session) throw new Error('Model not loaded');

    const bmp = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(this.SIZE, this.SIZE);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0, this.SIZE, this.SIZE);

    const img = ctx.getImageData(0, 0, this.SIZE, this.SIZE).data;

    const input = new Float32Array(3 * this.SIZE * this.SIZE);
    const total = this.SIZE * this.SIZE;

    for (let i = 0; i < total; i++) {
      const px = i * 4;
      input[i] = img[px] / 255;
      input[total + i] = img[px + 1] / 255;
      input[2 * total + i] = img[px + 2] / 255;
    }

    const tensor = new ort.Tensor('float32', input, [1, 3, this.SIZE, this.SIZE]);

    const res = await this.session.run({ input: tensor });
    const out = res[this.session.outputNames[0]];

    const data = out.data as Float32Array;

    bmp.close();

    return {
      data,
      width: this.SIZE,
      height: this.SIZE,
    };
  }

  async autoContrast(
    imageData: ImageData,
    clipPercent = 0.5,
    strength = 0.5
  ) {
    const data = imageData.data;
  
    const hist = new Array(256).fill(0);
  
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(
        0.299 * data[i] +
        0.587 * data[i + 1] +
        0.114 * data[i + 2]
      );
      hist[gray]++;
    }
  
    const total = data.length / 4;
    const clip = (clipPercent / 100) * total;
  
    let acc = 0;
    let min = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc > clip) {
        min = i;
        break;
      }
    }
  
    acc = 0;
    let max = 255;
    for (let i = 255; i >= 0; i--) {
      acc += hist[i];
      if (acc > clip) {
        max = i;
        break;
      }
    }
  
    const scale = 255 / (max - min);
  
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const original = data[i + c];
        const stretched = clamp((original - min) * scale);
        data[i + c] = original * (1 - strength) + stretched * strength;
      }
    }
  
    return imageData;
  }

  async autoWhiteBalance(imageData: ImageData) {
    const data = imageData.data;
  
    let rSum = 0, gSum = 0, bSum = 0;
    let count = 0;
  
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
  
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  
      if (luminance < 30 || luminance > 220) continue;
  
      rSum += r;
      gSum += g;
      bSum += b;
      count++;
    }
  
    if (count === 0) return imageData;
  
    const rAvg = rSum / count;
    const gAvg = gSum / count;
    const bAvg = bSum / count;
  
    const gray = (rAvg + gAvg + bAvg) / 3;
  
    const kr = gray / rAvg;
    const kg = gray / gAvg;
    const kb = gray / bAvg;
  
    const strength = 0.3;
  
    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp(data[i] * (1 + (kr - 1) * strength));
      data[i + 1] = clamp(data[i + 1] * (1 + (kg - 1) * strength));
      data[i + 2] = clamp(data[i + 2] * (1 + (kb - 1) * strength));
    }
  
    return imageData;
  }

  async applyCurvesToOriginal(
    originalBlob: Blob,
    curves: CurvesResult
  ): Promise<EnhancementResult> {

    const bmp = await createImageBitmap(originalBlob);
    const W = bmp.width;
    const H = bmp.height;

    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);

    const img = ctx.getImageData(0, 0, W, H);
    const data = img.data;

    const total = W * H;

    const R = new Float32Array(total);
    const G = new Float32Array(total);
    const B = new Float32Array(total);

    for (let i = 0; i < total; i++) {
      R[i] = data[i * 4] / 255;
      G[i] = data[i * 4 + 1] / 255;
      B[i] = data[i * 4 + 2] / 255;
    }

    const cw = curves.width;
    const ch = curves.height;
    const cdata = curves.data;

    const iterations = 8;
    const strength = 0.2;

    for (let iter = 0; iter < iterations; iter++) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {

          const fx = (x / W) * (cw - 1);
          const fy = (y / H) * (ch - 1);

          const ix = Math.floor(fx);
          const iy = Math.floor(fy);

          const idxCurve = iy * cw + ix;
          const idx = y * W + x;

          const r = cdata[(iter * 3 + 0) * cw * ch + idxCurve];
          const g = cdata[(iter * 3 + 1) * cw * ch + idxCurve];
          const b = cdata[(iter * 3 + 2) * cw * ch + idxCurve];

          R[idx] = R[idx] + strength * r * (R[idx] * R[idx] - R[idx]);
          G[idx] = G[idx] + strength * g * (G[idx] * G[idx] - G[idx]);
          B[idx] = B[idx] + strength * b * (B[idx] * B[idx] - B[idx]);
        }
      }
    }

    for (let i = 0; i < total; i++) {
      data[i * 4] = Math.max(0, Math.min(1, R[i])) * 255;
      data[i * 4 + 1] = Math.max(0, Math.min(1, G[i])) * 255;
      data[i * 4 + 2] = Math.max(0, Math.min(1, B[i])) * 255;
    }

    return {
      imageData: img,
      width: W,
      height: H,
    };
  }

  async imageDataToBlob(imageData: ImageData, w: number, h: number) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);
    return await canvas.convertToBlob({ type: 'image/png' });
  }
}

export const zeroDCE = new ZeroDCEModel();