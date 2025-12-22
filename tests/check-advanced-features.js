/**
 * Tests for ACIS Parser, Point Cloud Loader, SHX Font Loader,
 * Catmull-Clark Subdivision, and Procedural Surfaces
 */

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`ASSERTION FAILED: ${message} - Expected ${expected}, got ${actual} (diff: ${diff})`);
  }
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    return false;
  }
}

// Load modules
let DxfRendering;
if (typeof require !== 'undefined') {
  // Node.js environment
  require('../components/acis-parser.js');
  require('../components/point-cloud-loader.js');
  require('../components/shx-font-loader.js');
  require('../components/catmull-clark-subdivision.js');
  require('../components/procedural-surfaces.js');
  DxfRendering = global.DxfRendering;
} else {
  // Browser environment
  DxfRendering = window.DxfRendering;
}

// =============================================
// ACIS Parser Tests
// =============================================
function testACISParser() {
  console.log('\n=== ACIS Parser Tests ===');
  let passed = 0, failed = 0;

  // Test Vector3D
  if (runTest('Vector3D creation and operations', () => {
    const v1 = new DxfRendering.Vector3D(1, 2, 3);
    const v2 = new DxfRendering.Vector3D(4, 5, 6);
    
    assert(v1.x === 1 && v1.y === 2 && v1.z === 3, 'Vector creation');
    
    const sum = v1.add(v2);
    assert(sum.x === 5 && sum.y === 7 && sum.z === 9, 'Vector addition');
    
    const diff = v2.subtract(v1);
    assert(diff.x === 3 && diff.y === 3 && diff.z === 3, 'Vector subtraction');
    
    const scaled = v1.scale(2);
    assert(scaled.x === 2 && scaled.y === 4 && scaled.z === 6, 'Vector scaling');
    
    const dot = v1.dot(v2);
    assert(dot === 32, 'Dot product'); // 1*4 + 2*5 + 3*6 = 32
    
    const cross = v1.cross(v2);
    assert(cross.x === -3 && cross.y === 6 && cross.z === -3, 'Cross product');
  })) passed++; else failed++;

  // Test Matrix4x4
  if (runTest('Matrix4x4 identity and transformations', () => {
    const identity = DxfRendering.Matrix4x4.identity();
    const v = new DxfRendering.Vector3D(1, 2, 3);
    const transformed = identity.transformPoint(v);
    
    assertApprox(transformed.x, 1, 0.001, 'Identity X');
    assertApprox(transformed.y, 2, 0.001, 'Identity Y');
    assertApprox(transformed.z, 3, 0.001, 'Identity Z');
  })) passed++; else failed++;

  // Test ACISParser creation
  if (runTest('ACISParser instantiation', () => {
    const parser = new DxfRendering.ACISParser();
    assert(parser !== null, 'Parser created');
    assert(typeof parser.parse === 'function', 'Parse method exists');
  })) passed++; else failed++;

  // Test parseACIS function
  if (runTest('parseACIS with null data', () => {
    const result = DxfRendering.parseACIS(null);
    assert(result === null, 'Returns null for null input');
  })) passed++; else failed++;

  if (runTest('parseACIS with empty string', () => {
    const result = DxfRendering.parseACIS('');
    assert(result === null, 'Returns null for empty string');
  })) passed++; else failed++;

  // Test basic SAT parsing
  if (runTest('parseACIS with basic SAT header', () => {
    const satData = `400 0 1 0
    body $1 $2 $-1 $-1 #
    `;
    const result = DxfRendering.parseACIS(satData);
    // May or may not parse successfully depending on completeness
    // At minimum should not throw
    assert(true, 'Did not throw');
  })) passed++; else failed++;

  // Test acisToRenderGeometry
  if (runTest('acisToRenderGeometry with null', () => {
    const result = DxfRendering.acisToRenderGeometry(null);
    assert(result === null, 'Returns null for null input');
  })) passed++; else failed++;

  console.log(`ACIS Parser: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// =============================================
// Point Cloud Loader Tests
// =============================================
function testPointCloudLoader() {
  console.log('\n=== Point Cloud Loader Tests ===');
  let passed = 0, failed = 0;

  // Test Point3D
  if (runTest('Point3D creation', () => {
    const p = new DxfRendering.Point3D(1, 2, 3);
    assert(p.x === 1 && p.y === 2 && p.z === 3, 'Point creation');
    
    const p2 = new DxfRendering.Point3D(4, 5, 6);
    const dist = p.distanceTo(p2);
    assertApprox(dist, Math.sqrt(27), 0.001, 'Distance calculation');
  })) passed++; else failed++;

  // Test Color
  if (runTest('Color creation and conversion', () => {
    const c = new DxfRendering.Color(255, 128, 0);
    assert(c.r === 255 && c.g === 128 && c.b === 0, 'Color values');
    assert(c.toHex() === '#ff8000', 'Hex conversion');
  })) passed++; else failed++;

  // Test BoundingBox3D
  if (runTest('BoundingBox3D operations', () => {
    const bb = new DxfRendering.BoundingBox3D();
    bb.extend(new DxfRendering.Point3D(0, 0, 0));
    bb.extend(new DxfRendering.Point3D(10, 10, 10));
    
    const center = bb.getCenter();
    assertApprox(center.x, 5, 0.001, 'Center X');
    assertApprox(center.y, 5, 0.001, 'Center Y');
    assertApprox(center.z, 5, 0.001, 'Center Z');
    
    const size = bb.getSize();
    assertApprox(size.x, 10, 0.001, 'Size X');
  })) passed++; else failed++;

  // Test PointCloud
  if (runTest('PointCloud creation and points', () => {
    const cloud = new DxfRendering.PointCloud();
    cloud.addPoint(1, 2, 3, 0.5, new DxfRendering.Color(255, 0, 0));
    cloud.addPoint(4, 5, 6, 0.8, new DxfRendering.Color(0, 255, 0));
    
    assert(cloud.pointCount === 2, 'Point count');
    assert(cloud.positions[0].x === 1, 'First point X');
    assert(cloud.colors[0].r === 255, 'First point color R');
    assert(cloud.intensities[1] === 0.8, 'Second point intensity');
  })) passed++; else failed++;

  // Test PointCloud subsample
  if (runTest('PointCloud subsampling', () => {
    const cloud = new DxfRendering.PointCloud();
    for (let i = 0; i < 100; i++) {
      cloud.addPoint(i, i, i);
    }
    
    const subsampled = cloud.subsample(10);
    assert(subsampled.pointCount === 10, 'Subsampled count');
  })) passed++; else failed++;

  // Test PointCloudLoader format detection
  if (runTest('PointCloudLoader format detection', () => {
    const loader = new DxfRendering.PointCloudLoader();
    
    assert(loader.detectFormatFromExtension('file.xyz') === DxfRendering.PointCloudFormat.XYZ, 'XYZ detection');
    assert(loader.detectFormatFromExtension('file.pts') === DxfRendering.PointCloudFormat.PTS, 'PTS detection');
    assert(loader.detectFormatFromExtension('file.ply') === DxfRendering.PointCloudFormat.PLY, 'PLY detection');
    assert(loader.detectFormatFromExtension('file.las') === DxfRendering.PointCloudFormat.LAS, 'LAS detection');
  })) passed++; else failed++;

  // Test XYZ parsing
  if (runTest('XYZ file parsing', () => {
    const xyzData = `1.0 2.0 3.0
4.0 5.0 6.0
7.0 8.0 9.0`;
    
    const parser = new DxfRendering.XYZParser();
    const cloud = parser.parse(xyzData);
    
    assert(cloud.pointCount === 3, 'Point count');
    assertApprox(cloud.positions[0].x, 1.0, 0.001, 'First X');
    assertApprox(cloud.positions[2].z, 9.0, 0.001, 'Last Z');
  })) passed++; else failed++;

  // Test XYZ with RGB
  if (runTest('XYZ file parsing with RGB', () => {
    const xyzData = `1.0 2.0 3.0 255 0 0
4.0 5.0 6.0 0 255 0`;
    
    const parser = new DxfRendering.XYZParser({ includeColor: true });
    const cloud = parser.parse(xyzData);
    
    assert(cloud.pointCount === 2, 'Point count');
    assert(cloud.colors[0].r === 255, 'First color R');
    assert(cloud.colors[1].g === 255, 'Second color G');
  })) passed++; else failed++;

  // Test PTS parsing
  if (runTest('PTS file parsing', () => {
    const ptsData = `3
0 0 0 100
1 1 1 200
2 2 2 255`;
    
    const parser = new DxfRendering.PTSParser();
    const cloud = parser.parse(ptsData);
    
    assert(cloud.pointCount === 3, 'Point count');
    assert(cloud.metadata.declaredPointCount === 3, 'Declared count');
  })) passed++; else failed++;

  // Test PLY parsing
  if (runTest('PLY file parsing', () => {
    const plyData = `ply
format ascii 1.0
element vertex 2
property float x
property float y
property float z
end_header
1.0 2.0 3.0
4.0 5.0 6.0`;
    
    const parser = new DxfRendering.PLYParser();
    const cloud = parser.parse(plyData);
    
    assert(cloud.pointCount === 2, 'Point count');
    assertApprox(cloud.positions[0].x, 1.0, 0.001, 'First X');
  })) passed++; else failed++;

  // Test pointCloudToRenderData
  if (runTest('pointCloudToRenderData conversion', () => {
    const cloud = new DxfRendering.PointCloud();
    cloud.addPoint(1, 2, 3, 0.5);
    cloud.addPoint(4, 5, 6, 1.0);
    
    const renderData = DxfRendering.pointCloudToRenderData(cloud, {
      pointSize: 3,
      useIntensityAsColor: true
    });
    
    assert(renderData.points.length === 2, 'Render point count');
    assert(renderData.points[0].size === 3, 'Point size');
    assert(renderData.count === 2, 'Count');
  })) passed++; else failed++;

  console.log(`Point Cloud Loader: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// =============================================
// SHX Font Loader Tests
// =============================================
function testSHXFontLoader() {
  console.log('\n=== SHX Font Loader Tests ===');
  let passed = 0, failed = 0;

  // Test Glyph
  if (runTest('Glyph creation', () => {
    const glyph = new DxfRendering.Glyph(65); // 'A'
    assert(glyph.code === 65, 'Glyph code');
    assert(glyph.paths.length === 0, 'Empty paths');
    
    glyph.paths.push({ type: 'M', x: 0, y: 0 });
    glyph.paths.push({ type: 'L', x: 5, y: 10 });
    glyph.paths.push({ type: 'L', x: 10, y: 0 });
    
    const bounds = glyph.computeBounds();
    assertApprox(bounds.minX, 0, 0.001, 'Min X');
    assertApprox(bounds.maxX, 10, 0.001, 'Max X');
    assertApprox(bounds.maxY, 10, 0.001, 'Max Y');
  })) passed++; else failed++;

  // Test SHXFont
  if (runTest('SHXFont operations', () => {
    const font = new DxfRendering.SHXFont();
    font.above = 10;
    font.below = 2;
    
    const glyph = new DxfRendering.Glyph(65);
    glyph.width = 8;
    font.glyphs.set(65, glyph);
    
    assert(font.hasGlyph(65), 'Has glyph A');
    assert(!font.hasGlyph(66), 'Does not have glyph B');
    assert(font.getAdvanceWidth(65) === 8, 'Advance width');
    assert(font.getAdvanceWidth(66) === font.above, 'Fallback width');
  })) passed++; else failed++;

  // Test SHXFontLoader
  if (runTest('SHXFontLoader instantiation', () => {
    const loader = new DxfRendering.SHXFontLoader();
    assert(loader !== null, 'Loader created');
    assert(typeof loader.loadBinary === 'function', 'loadBinary exists');
    assert(typeof loader.loadText === 'function', 'loadText exists');
  })) passed++; else failed++;

  // Test SHP text parsing
  if (runTest('SHP format parsing', () => {
    const shpData = `*65,4,uca
2,8,(0,10),1,8,(5,-10),8,(5,10),0`;
    
    const parser = new DxfRendering.SHPParser();
    const font = parser.parse(shpData);
    
    assert(font.glyphs.has(65), 'Has glyph 65');
    const glyph = font.glyphs.get(65);
    assert(glyph.name === 'uca', 'Glyph name');
    assert(glyph.defBytes === 4, 'Definition bytes');
  })) passed++; else failed++;

  // Test font text measurement
  if (runTest('Font text measurement', () => {
    const font = new DxfRendering.SHXFont();
    font.above = 10;
    
    const glyphA = new DxfRendering.Glyph(65);
    glyphA.width = 8;
    font.glyphs.set(65, glyphA);
    
    const glyphB = new DxfRendering.Glyph(66);
    glyphB.width = 7;
    font.glyphs.set(66, glyphB);
    
    const width = font.measureText('AB');
    assert(width === 15, 'Text width'); // 8 + 7
  })) passed++; else failed++;

  // Test getShapeOutlines
  if (runTest('getShapeOutlines function', () => {
    const font = new DxfRendering.SHXFont();
    const shape = new DxfRendering.Glyph(1);
    shape.paths = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'L', x: 0, y: 10 }
    ];
    shape.width = 10;
    shape.height = 10;
    font.shapes.set(1, shape);
    
    const outlines = DxfRendering.getShapeOutlines(font, 1, 2);
    assert(outlines !== null, 'Outlines returned');
    assert(outlines.width === 20, 'Scaled width');
    assert(outlines.outlines.length > 0, 'Has outline paths');
  })) passed++; else failed++;

  console.log(`SHX Font Loader: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// =============================================
// Catmull-Clark Subdivision Tests
// =============================================
function testCatmullClarkSubdivision() {
  console.log('\n=== Catmull-Clark Subdivision Tests ===');
  let passed = 0, failed = 0;

  // Test SubdivVertex
  if (runTest('SubdivVertex operations', () => {
    const v1 = new DxfRendering.SubdivVertex(1, 2, 3);
    const v2 = new DxfRendering.SubdivVertex(4, 5, 6);
    
    const sum = v1.add(v2);
    assert(sum.x === 5 && sum.y === 7 && sum.z === 9, 'Addition');
    
    const diff = v2.subtract(v1);
    assert(diff.x === 3 && diff.y === 3 && diff.z === 3, 'Subtraction');
    
    const scaled = v1.scale(2);
    assert(scaled.x === 2 && scaled.y === 4 && scaled.z === 6, 'Scaling');
    
    const normalized = new DxfRendering.SubdivVertex(3, 0, 4).normalize();
    assertApprox(normalized.length(), 1.0, 0.001, 'Normalized length');
  })) passed++; else failed++;

  // Test SubdivisionMesh creation
  if (runTest('SubdivisionMesh from arrays', () => {
    // Simple cube
    const vertices = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
      [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
    ];
    const faces = [
      [0, 3, 2, 1], // bottom
      [4, 5, 6, 7], // top
      [0, 1, 5, 4], // front
      [2, 3, 7, 6], // back
      [0, 4, 7, 3], // left
      [1, 2, 6, 5]  // right
    ];
    
    const mesh = DxfRendering.SubdivisionMesh.fromArrays(vertices, faces);
    
    assert(mesh.vertices.length === 8, 'Vertex count');
    assert(mesh.faces.length === 6, 'Face count');
    assert(mesh.edges.length === 12, 'Edge count');
  })) passed++; else failed++;

  // Test Catmull-Clark subdivision
  if (runTest('CatmullClarkSubdivision one level', () => {
    // Simple quad
    const vertices = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]
    ];
    const faces = [[0, 1, 2, 3]];
    
    const mesh = DxfRendering.SubdivisionMesh.fromArrays(vertices, faces);
    const subdivider = new DxfRendering.CatmullClarkSubdivision();
    const subdivided = subdivider.subdivide(mesh);
    
    // After one level of Catmull-Clark on a quad:
    // - 1 face point
    // - 4 edge points  
    // - 4 new vertex positions
    // = 9 vertices, 4 new quad faces
    assert(subdivided.vertices.length === 9, 'Subdivided vertex count');
    assert(subdivided.faces.length === 4, 'Subdivided face count');
  })) passed++; else failed++;

  // Test subdivideMesh function
  if (runTest('subdivideMesh high-level function', () => {
    const vertices = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]
    ];
    const faces = [[0, 1, 2, 3]];
    
    const result = DxfRendering.subdivideMesh(vertices, faces, 2);
    
    assert(result.vertices.length > 9, 'Multi-level subdivision increases vertices');
    assert(result.faces.length === 16, 'Two levels = 4*4 = 16 faces');
  })) passed++; else failed++;

  // Test Loop subdivision
  if (runTest('LoopSubdivision on triangle mesh', () => {
    // Simple triangle
    const vertices = [
      [0, 0, 0], [1, 0, 0], [0.5, 1, 0]
    ];
    const faces = [[0, 1, 2]];
    
    const mesh = DxfRendering.SubdivisionMesh.fromArrays(vertices, faces);
    const subdivider = new DxfRendering.LoopSubdivision();
    const subdivided = subdivider.subdivide(mesh);
    
    // Loop subdivision: 3 original + 3 edge points = 6 vertices
    // 4 triangles
    assert(subdivided.vertices.length === 6, 'Loop subdivided vertex count');
    assert(subdivided.faces.length === 4, 'Loop subdivided face count');
  })) passed++; else failed++;

  // Test toTriangles
  if (runTest('Mesh toTriangles conversion', () => {
    const vertices = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]
    ];
    const faces = [[0, 1, 2, 3]];
    
    const mesh = DxfRendering.SubdivisionMesh.fromArrays(vertices, faces);
    const result = mesh.toTriangles();
    
    assert(result.triangles.length === 2, 'Quad splits into 2 triangles');
    assert(result.triangles[0].length === 3, 'Triangle has 3 indices');
  })) passed++; else failed++;

  // Test computeSmoothNormals
  if (runTest('computeSmoothNormals', () => {
    const vertices = [
      [0, 0, 0], [1, 0, 0], [0.5, 1, 0]
    ];
    const triangles = [[0, 1, 2]];
    
    const normals = DxfRendering.computeSmoothNormals(vertices, triangles);
    
    assert(normals.length === 3, 'Normal count');
    // All normals should point in Z direction for flat triangle
    assertApprox(Math.abs(normals[0][2]), 1, 0.001, 'Normal Z component');
  })) passed++; else failed++;

  console.log(`Catmull-Clark Subdivision: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// =============================================
// Procedural Surfaces Tests
// =============================================
function testProceduralSurfaces() {
  console.log('\n=== Procedural Surfaces Tests ===');
  let passed = 0, failed = 0;

  // Test Vec3
  if (runTest('Vec3 operations', () => {
    const v1 = new DxfRendering.Vec3(1, 2, 3);
    const v2 = new DxfRendering.Vec3(4, 5, 6);
    
    const sum = v1.add(v2);
    assert(sum.x === 5 && sum.y === 7 && sum.z === 9, 'Addition');
    
    const lerp = DxfRendering.Vec3.lerp(v1, v2, 0.5);
    assertApprox(lerp.x, 2.5, 0.001, 'Lerp X');
    assertApprox(lerp.y, 3.5, 0.001, 'Lerp Y');
  })) passed++; else failed++;

  // Test Mat4
  if (runTest('Mat4 transformations', () => {
    const translation = DxfRendering.Mat4.translation(10, 20, 30);
    const v = new DxfRendering.Vec3(1, 2, 3);
    const transformed = translation.transformPoint(v);
    
    assertApprox(transformed.x, 11, 0.001, 'Translated X');
    assertApprox(transformed.y, 22, 0.001, 'Translated Y');
    assertApprox(transformed.z, 33, 0.001, 'Translated Z');
  })) passed++; else failed++;

  // Test ExtrudedSurfaceTessellator
  if (runTest('ExtrudedSurfaceTessellator', () => {
    const tessellator = new DxfRendering.ExtrudedSurfaceTessellator({ uSegments: 8, vSegments: 4 });
    
    const entity = {
      profile: [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }
      ],
      direction: { x: 0, y: 0, z: 1 },
      height: 2
    };
    
    const result = tessellator.tessellate(entity);
    
    assert(result !== null, 'Result returned');
    assert(result.vertices.length > 0, 'Has vertices');
    assert(result.triangles.length > 0, 'Has triangles');
    assert(result.normals.length === result.vertices.length, 'Normals match vertices');
  })) passed++; else failed++;

  // Test RevolvedSurfaceTessellator
  if (runTest('RevolvedSurfaceTessellator', () => {
    const tessellator = new DxfRendering.RevolvedSurfaceTessellator({ uSegments: 16, vSegments: 8 });
    
    const entity = {
      profile: [
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 1 },
        { x: 0.5, y: 0, z: 1.5 }
      ],
      axisPoint: { x: 0, y: 0, z: 0 },
      axisDirection: { x: 0, y: 0, z: 1 },
      startAngle: 0,
      endAngle: Math.PI * 2
    };
    
    const result = tessellator.tessellate(entity);
    
    assert(result !== null, 'Result returned');
    assert(result.vertices.length > 0, 'Has vertices');
    assert(result.triangles.length > 0, 'Has triangles');
  })) passed++; else failed++;

  // Test SweptSurfaceTessellator
  if (runTest('SweptSurfaceTessellator', () => {
    const tessellator = new DxfRendering.SweptSurfaceTessellator({ uSegments: 8, vSegments: 16 });
    
    const entity = {
      profile: [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }
      ],
      path: [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 0, z: 5 },
        { x: 10, y: 0, z: 5 }
      ]
    };
    
    const result = tessellator.tessellate(entity);
    
    assert(result !== null, 'Result returned');
    assert(result.vertices.length > 0, 'Has vertices');
    assert(result.triangles.length > 0, 'Has triangles');
  })) passed++; else failed++;

  // Test LoftedSurfaceTessellator
  if (runTest('LoftedSurfaceTessellator', () => {
    const tessellator = new DxfRendering.LoftedSurfaceTessellator({ uSegments: 8, vSegments: 8 });
    
    const entity = {
      crossSections: [
        [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }],
        [{ x: 0.2, y: 0.2, z: 1 }, { x: 0.8, y: 0.2, z: 1 }, { x: 0.8, y: 0.8, z: 1 }, { x: 0.2, y: 0.8, z: 1 }],
        [{ x: 0.4, y: 0.4, z: 2 }, { x: 0.6, y: 0.4, z: 2 }, { x: 0.6, y: 0.6, z: 2 }, { x: 0.4, y: 0.6, z: 2 }]
      ]
    };
    
    const result = tessellator.tessellate(entity);
    
    assert(result !== null, 'Result returned');
    assert(result.vertices.length > 0, 'Has vertices');
    assert(result.triangles.length > 0, 'Has triangles');
  })) passed++; else failed++;

  // Test PlaneSurfaceTessellator
  if (runTest('PlaneSurfaceTessellator', () => {
    const tessellator = new DxfRendering.PlaneSurfaceTessellator();
    
    const entity = {
      boundary: [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }
      ],
      normal: { x: 0, y: 0, z: 1 }
    };
    
    const result = tessellator.tessellate(entity);
    
    assert(result !== null, 'Result returned');
    assert(result.vertices.length >= 4, 'Has vertices');
  })) passed++; else failed++;

  // Test NurbsSurfaceTessellator
  if (runTest('NurbsSurfaceTessellator', () => {
    const tessellator = new DxfRendering.NurbsSurfaceTessellator({ uSegments: 8, vSegments: 8 });
    
    // Simple 3x3 control point grid
    const controlPoints = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        controlPoints.push({ x: i, y: j, z: Math.sin(i + j) });
      }
    }
    
    const entity = {
      controlPoints,
      degreeU: 2,
      degreeV: 2,
      numU: 3,
      numV: 3
    };
    
    const result = tessellator.tessellate(entity);
    
    assert(result !== null, 'Result returned');
    assert(result.vertices.length > 0, 'Has vertices');
    assert(result.triangles.length > 0, 'Has triangles');
  })) passed++; else failed++;

  // Test ProceduralSurfaceFactory
  if (runTest('ProceduralSurfaceFactory', () => {
    const factory = new DxfRendering.ProceduralSurfaceFactory();
    
    const extruded = factory.tessellate({
      type: 'EXTRUDEDSURFACE',
      profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      height: 1
    });
    assert(extruded !== null, 'Extruded surface tessellated');
    
    const revolved = factory.tessellate({
      type: 'REVOLVEDSURFACE',
      profile: [{ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }],
      axisPoint: { x: 0, y: 0, z: 0 },
      axisDirection: { x: 0, y: 0, z: 1 }
    });
    assert(revolved !== null, 'Revolved surface tessellated');
  })) passed++; else failed++;

  // Test CurveUtils
  if (runTest('CurveUtils B-spline basis', () => {
    const knots = [0, 0, 0, 0, 1, 1, 1, 1];
    const degree = 3;
    
    // At t=0, only first basis function should be 1
    const b0 = DxfRendering.CurveUtils.bsplineBasis(0, degree, 0.001, knots);
    assert(b0 > 0.9, 'First basis at start');
    
    // At t=1, only last basis function should be 1
    const b3 = DxfRendering.CurveUtils.bsplineBasis(3, degree, 0.999, knots);
    assert(b3 > 0.9, 'Last basis at end');
  })) passed++; else failed++;

  console.log(`Procedural Surfaces: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// =============================================
// Run all tests
// =============================================
function runAllTests() {
  console.log('========================================');
  console.log('  DxfParser Advanced Features Tests');
  console.log('========================================');

  const results = [];
  
  results.push(testACISParser());
  results.push(testPointCloudLoader());
  results.push(testSHXFontLoader());
  results.push(testCatmullClarkSubdivision());
  results.push(testProceduralSurfaces());

  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

  console.log('\n========================================');
  console.log(`  TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('========================================');

  return totalFailed === 0;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAllTests,
    testACISParser,
    testPointCloudLoader,
    testSHXFontLoader,
    testCatmullClarkSubdivision,
    testProceduralSurfaces
  };
}

// Run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  const success = runAllTests();
  process.exit(success ? 0 : 1);
}
