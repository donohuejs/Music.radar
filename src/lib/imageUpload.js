const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_DATA_URL_LENGTH = 720_000;

export async function compressedImageDataUrl(file) {
  if (!file || !ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP poster image.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    let maxDimension = 1600;
    while (maxDimension >= 640) {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.74, 0.66, 0.58, 0.5, 0.44]) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length <= MAX_DATA_URL_LENGTH) return dataUrl;
      }
      maxDimension = Math.floor(maxDimension * 0.78);
    }
    throw new Error("This image is still too large for the no-cost poster queue after compression.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
