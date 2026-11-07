import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectMediaBytes, inspectMediaFile } from '../src/lib/media/inspection.ts';

const bytes = (...values) => new Uint8Array(values);
const text = (value) => new TextEncoder().encode(value);

test('content signatures identify safe media independently of its filename or browser MIME', () => {
  assert.equal(inspectMediaBytes(bytes(0xff, 0xd8, 0xff, 0x00)).format, 'jpeg');
  assert.equal(inspectMediaBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)).format, 'png');
  assert.equal(inspectMediaBytes(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).format, 'svg');
  assert.equal(inspectMediaBytes(text('%PDF-1.7')).format, 'pdf');
  assert.equal(inspectMediaBytes(text('PK\u0003\u0004[Content_Types].xmlword/document.xml')).format, 'docx');
  assert.equal(inspectMediaBytes(text('PK\u0003\u0004[Content_Types].xmlxl/workbook.xml')).format, 'xlsx');
  assert.equal(inspectMediaBytes(text('PK\u0003\u0004[Content_Types].xmlppt/presentation.xml')).format, 'pptx');
  assert.equal(inspectMediaBytes(text('This is a plain text provider note.')).format, 'txt');
});

test('common image, video and audio containers are recognized from file signatures', () => {
  assert.equal(inspectMediaBytes(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)).format, 'webp');
  assert.equal(inspectMediaBytes(text('GIF89a')).format, 'gif');
  assert.equal(inspectMediaBytes(bytes(0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66)).format, 'avif');
  assert.equal(inspectMediaBytes(bytes(0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63)).format, 'heic');
  assert.equal(inspectMediaBytes(bytes(0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d)).format, 'mp4');
  assert.equal(inspectMediaBytes(bytes(0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20)).format, 'mov');
  assert.equal(inspectMediaBytes(bytes(0x1a, 0x45, 0xdf, 0xa3)).format, 'webm');
  assert.equal(inspectMediaBytes(text('ID3\u0004\u0000\u0000')).format, 'mp3');
  assert.equal(inspectMediaBytes(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45)).format, 'wav');
  assert.equal(inspectMediaBytes(bytes(0xff, 0xf1)).format, 'aac');
  assert.equal(inspectMediaBytes(bytes(0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20)).format, 'm4a');
});

test('executables, unknown containers and macro-enabled Office packages are rejected', () => {
  assert.throws(() => inspectMediaBytes(text('MZ executable')), (error) => error.code === 'EXECUTABLE_REJECTED');
  assert.throws(() => inspectMediaBytes(bytes(0x50, 0x4b, 0x03, 0x04)), (error) => error.code === 'UNSUPPORTED_OR_MALFORMED');
  assert.throws(() => inspectMediaBytes(text('PK\u0003\u0004[Content_Types].xmlword/document.xmlvbaProject.bin')), (error) => error.code === 'UNSUPPORTED_OR_MALFORMED');
});

test('content-based per-format size limits are enforced after sniffing', async () => {
  const signature = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a).buffer;
  const fakePng = { size: 16 * 1024 * 1024, arrayBuffer: async () => signature, slice: () => ({ arrayBuffer: async () => signature }) };
  await assert.rejects(inspectMediaFile(fakePng), (error) => error.code === 'FILE_TOO_LARGE');
});
