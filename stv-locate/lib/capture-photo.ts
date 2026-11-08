import { readApiResponse } from "./api-response";
import { saveDevicePhoto } from "./field-store";

export async function preparePhoto(file: File, deviceOnly: boolean): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPG, PNG or WebP photo. On iPhone, use the camera or export an HEIC photo as JPG.");
  if (file.size > 24000000) throw Error("Choose a photo smaller than 24 MB.");
  if (file.size <= 180000) return file;
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const scale = Math.min(1, (deviceOnly ? 1024 : 1920) / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("This browser could not prepare the photo.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(Error("Photo conversion failed. Try another photo."))),
        "image/jpeg",
        deviceOnly ? 0.68 : 0.85,
      ),
    );
  } finally {
    URL.revokeObjectURL(source);
  }
}

export async function capturePhoto(file: File, deviceOnly = false): Promise<string> {
  return uploadPreparedPhoto(await preparePhoto(file, deviceOnly), deviceOnly, file.name);
}

/** Store an already prepared photo; safe to call again for a retry. */
export async function uploadPreparedPhoto(
  photo: Blob,
  deviceOnly = false,
  name = "photo.jpg",
): Promise<string> {
  if (deviceOnly) {
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error("This photo could not be read. Try again."));
      reader.readAsDataURL(photo);
    });
    return saveDevicePhoto(source);
  }
  const form = new FormData();
  form.append("file", photo, name);
  let reply: Response;
  try {
    reply = await fetch("/api/files", { method: "POST", body: form, signal: AbortSignal.timeout(60000) });
  } catch {
    throw Error("The photo upload did not finish. Check your signal and tap Retry — the photo is kept.");
  }
  const response = await readApiResponse(reply);
  if (typeof response.key !== "string") throw Error("The photo upload was not confirmed. Tap Retry.");
  return response.key;
}
