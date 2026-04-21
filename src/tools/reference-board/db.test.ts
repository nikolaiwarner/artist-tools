import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveImage,
  loadImage,
  deleteImage,
  saveLayer,
  loadLayersForProject,
  deleteLayer,
  deleteProjectData,
  estimateProjectStorageBytes,
  resetDBForTesting,
} from './db';
import type { ImageLayer, TextLayer } from './types';

beforeEach(() => {
  resetDBForTesting();
});

const makeImageLayer = (overrides?: Partial<ImageLayer>): ImageLayer => ({
  id: 'layer-1',
  projectId: 'proj-1',
  type: 'image',
  imageId: 'img-1',
  x: 100,
  y: 200,
  rotation: 0,
  opacity: 1,
  zIndex: 1,
  width: 400,
  height: 300,
  scaleX: 1,
  scaleY: 1,
  flipX: false,
  flipY: false,
  ...overrides,
});

const makeTextLayer = (overrides?: Partial<TextLayer>): TextLayer => ({
  id: 'layer-2',
  projectId: 'proj-1',
  type: 'text',
  text: 'Hello',
  x: 50,
  y: 50,
  rotation: 0,
  opacity: 1,
  zIndex: 2,
  fontSize: 24,
  fontFamily: 'IBM Plex Sans',
  bold: false,
  italic: false,
  fill: '#171717',
  align: 'left',
  width: 200,
  scaleX: 1,
  scaleY: 1,
  ...overrides,
});

describe('images', () => {
  it('saves and loads an image', async () => {
    await saveImage('img-1', 'data:image/png;base64,abc');
    const result = await loadImage('img-1');
    expect(result).toBe('data:image/png;base64,abc');
  });

  it('returns undefined for unknown image', async () => {
    const result = await loadImage('nope');
    expect(result).toBeUndefined();
  });

  it('deletes an image', async () => {
    await saveImage('img-1', 'data:...');
    await deleteImage('img-1');
    expect(await loadImage('img-1')).toBeUndefined();
  });
});

describe('layers', () => {
  it('saves and loads an image layer for a project', async () => {
    await saveLayer(makeImageLayer());
    const layers = await loadLayersForProject('proj-1');
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe('layer-1');
  });

  it('saves and loads a text layer', async () => {
    await saveLayer(makeTextLayer());
    const layers = await loadLayersForProject('proj-1');
    expect(layers[0].type).toBe('text');
    expect((layers[0] as TextLayer).text).toBe('Hello');
  });

  it('only returns layers for the requested project', async () => {
    await saveLayer(makeImageLayer({ id: 'l1', projectId: 'proj-1' }));
    await saveLayer(makeImageLayer({ id: 'l2', projectId: 'proj-2' }));
    const layers = await loadLayersForProject('proj-1');
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe('l1');
  });

  it('deletes a layer', async () => {
    await saveLayer(makeImageLayer());
    await deleteLayer('layer-1');
    expect(await loadLayersForProject('proj-1')).toHaveLength(0);
  });
});

describe('deleteProjectData', () => {
  it('removes all layers and images for a project', async () => {
    await saveImage('img-1', 'data:...');
    await saveLayer(makeImageLayer());
    await saveLayer(makeTextLayer());
    await deleteProjectData('proj-1');
    expect(await loadLayersForProject('proj-1')).toHaveLength(0);
    expect(await loadImage('img-1')).toBeUndefined();
  });
});

describe('estimateProjectStorageBytes', () => {
  it('includes layer data and image data for the requested project', async () => {
    await saveImage('img-1', 'data:image/png;base64,abcd');
    await saveLayer(makeImageLayer({ id: 'img-layer', imageId: 'img-1' }));
    await saveLayer(makeTextLayer({ id: 'text-layer' }));

    const bytes = await estimateProjectStorageBytes('proj-1');

    expect(bytes).toBeGreaterThan(0);
  });

  it('ignores layers from other projects', async () => {
    await saveImage('img-2', 'data:image/png;base64,zzzz');
    await saveLayer(makeImageLayer({ id: 'other-layer', projectId: 'proj-2', imageId: 'img-2' }));

    const bytes = await estimateProjectStorageBytes('proj-1');

    expect(bytes).toBe(0);
  });

  it('counts shared image data once even when multiple layers reference it', async () => {
    const dataUrl = 'data:image/png;base64,shared';
    const layer1 = makeImageLayer({ id: 'img-layer-1', imageId: 'img-shared' });
    const layer2 = makeImageLayer({ id: 'img-layer-2', imageId: 'img-shared', x: 140, y: 220 });
    await saveImage('img-shared', dataUrl);
    await saveLayer(layer1);
    await saveLayer(layer2);

    const bytes = await estimateProjectStorageBytes('proj-1');
    const enc = new TextEncoder();
    const expected =
      enc.encode(JSON.stringify(layer1)).length +
      enc.encode(JSON.stringify(layer2)).length +
      enc.encode(dataUrl).length;

    expect(bytes).toBe(expected);
  });
});
