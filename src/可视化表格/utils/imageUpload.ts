/**
 * 图片上传和压缩工具函数
 * 用于悬浮球图标、人际关系图头像等
 */

/**
 * 将文件转换为 Base64
 * @param file 文件对象
 * @returns Base64 字符串 (含 data:image/xxx;base64, 前缀)
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

/**
 * 压缩图片
 * @param base64 原始 Base64 字符串
 * @param maxWidth 最大宽度 (默认 100)
 * @param quality 压缩质量 0-1 (默认 0.8)
 * @returns 压缩后的 Base64 字符串
 */
export function compressImage(base64: string, maxWidth = 100, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建 canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = base64;
  });
}

/**
 * 获取 Base64 图片的大小（字节）
 * @param base64 Base64 字符串
 * @returns 大小（字节）
 */
export function getBase64Size(base64: string): number {
  // 移除 data:image/xxx;base64, 前缀
  const base64Data = base64.split(',')[1] || base64;
  // Base64 编码后大小约为原始的 4/3
  return Math.ceil(base64Data.length * 0.75);
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的字符串 (如 "50 KB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 上传图片并压缩
 * @param options.maxWidth 最大宽度 (默认 100)
 * @param options.quality 压缩质量 (默认 0.8)
 * @param options.maxSizeKB 最大文件大小 KB (默认 50)
 * @returns Base64 字符串，用户取消返回 null
 */
export function uploadImage(options?: {
  maxWidth?: number;
  quality?: number;
  maxSizeKB?: number;
}): Promise<string | null> {
  const { maxWidth = 100, quality = 0.8, maxSizeKB = 50 } = options || {};

  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        let base64 = await fileToBase64(file);

        // 压缩
        base64 = await compressImage(base64, maxWidth, quality);

        // 检查大小
        const sizeKB = getBase64Size(base64) / 1024;
        if (sizeKB > maxSizeKB) {
          // 如果还是太大，尝试更高压缩
          base64 = await compressImage(base64, maxWidth * 0.7, quality * 0.7);
          const newSizeKB = getBase64Size(base64) / 1024;
          if (newSizeKB > maxSizeKB) {
            console.warn(`[ACU] 图片压缩后仍超过 ${maxSizeKB}KB (${newSizeKB.toFixed(1)}KB)`);
          }
        }

        resolve(base64);
      } catch (e) {
        console.error('[ACU] 图片上传失败:', e);
        resolve(null);
      }
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * 将 hex 颜色转换为 rgba
 * @param hex Hex 颜色值 (如 '#ff0000')
 * @param opacity 透明度 0-100
 * @returns rgba 字符串
 */
export function hexToRgba(hex: string, opacity: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

/**
 * 将 rgba 转换为 hex 和 opacity
 * @param rgba rgba 字符串
 * @returns { hex, opacity }
 */
export function rgbaToHex(rgba: string): { hex: string; opacity: number } {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return { hex: rgba, opacity: 100 };

  const r = parseInt(match[1]).toString(16).padStart(2, '0');
  const g = parseInt(match[2]).toString(16).padStart(2, '0');
  const b = parseInt(match[3]).toString(16).padStart(2, '0');
  const opacity = match[4] ? Math.round(parseFloat(match[4]) * 100) : 100;

  return { hex: `#${r}${g}${b}`, opacity };
}
