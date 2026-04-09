#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const [,, inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: decode-draco.mjs <input.glb> <output.glb>');
  process.exit(2);
}

try {
  const { NodeIO } = await import('@gltf-transform/core');
  const { KHRDracoMeshCompression } = await import('@gltf-transform/extensions');
  const draco3d = await import('draco3d');

  const decoderModule = await draco3d.createDecoderModule();
  let encoderModule = null;
  if (typeof draco3d.createEncoderModule === 'function') {
    encoderModule = await draco3d.createEncoderModule();
  }
  const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]);
  const deps = { 'draco3d.decoder': decoderModule };
  if (encoderModule) deps['draco3d.encoder'] = encoderModule;
  io.registerDependencies(deps);

  const doc = await io.read(inputPath);
  const decoded = await io.writeBinary(doc);
  const outBuf = Buffer.isBuffer(decoded) ? decoded : Buffer.from(decoded);
  fs.writeFileSync(outputPath, outBuf);
  console.log('OK');
  process.exit(0);
} catch (e) {
  console.error('ERR', e instanceof Error ? e.message : String(e));
  process.exit(1);
}
