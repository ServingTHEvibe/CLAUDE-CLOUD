export const MAX_MODEL_BYTES = 24000000;

export function validateModel(buffer: ArrayBuffer) {
  if (buffer.byteLength < 20 || buffer.byteLength > MAX_MODEL_BYTES)
    throw Error("Choose a self-contained GLB model under 24 MB.");
  const view = new DataView(buffer);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength
  )
    throw Error("This file is not a valid GLB 2 model.");
  const length = view.getUint32(12, true);
  if (length > buffer.byteLength - 20 || view.getUint32(16, true) !== 0x4e4f534a)
    throw Error("The model metadata is invalid.");
  const model = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)).trim());
  if (model.asset?.version !== "2.0" || !Array.isArray(model.scenes) || !model.scenes.length)
    throw Error("The model needs a GLTF 2 scene.");
  if (
    [...(model.buffers || []), ...(model.images || [])].some(
      (entry: { uri?: string }) => entry.uri && !entry.uri.startsWith("data:"),
    )
  )
    throw Error("Export a GLB with all textures and geometry embedded in the file.");
  if (
    model.extensionsRequired?.includes("KHR_draco_mesh_compression") ||
    model.extensionsRequired?.includes("EXT_meshopt_compression") ||
    model.extensionsRequired?.includes("KHR_texture_basisu")
  )
    throw Error(
      "Export the GLB with standard geometry and JPG or PNG textures. Compressed model extensions are unsupported.",
    );
  return model;
}
