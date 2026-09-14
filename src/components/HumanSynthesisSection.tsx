import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createNoise3D } from 'simplex-noise';
export interface BoneSynapse {
  x: number;
  y: number;
  z: number;
  ox: number;
  oy: number;
  oz: number;
  rx: number;
  ry: number;
  rz: number;
}

export function generateBoneParticles(createNoise3D: () => (x: number, y: number, z: number) => number) {
  const tempBonePositions: number[] = [];
  const tempBoneColors: number[] = [];
  const tempBoneAmberColors: number[] = [];

  const noise3DForBone = createNoise3D();

  // --- Smooth Minimum Blending Function ---
  function smin(d1: number, d2: number, k: number): number {
    const h = Math.max(k - Math.abs(d1 - d2), 0.0) / k;
    return Math.min(d1, d2) - h * h * h * k * (1.0 / 6.0);
  }

  // --- Perfectly Symmetrical Classic Bone SDF ---
  function getSDF(x: number, y: number, z: number): number {
    // 1. Central shaft (diaphysis)
    const absY = Math.abs(y);
    const rShaft = 0.48 + 0.12 * Math.pow(absY / 3.8, 2) + 0.3 * Math.pow(absY / 3.8, 6);

    // Segment distance from (x, y, z) to A=(0, -3.8, 0) and B=(0, 3.8, 0)
    const h_shaft = Math.max(0.0, Math.min(1.0, (y + 3.8) / 7.6));
    const proj_y = -3.8 + h_shaft * 7.6;

    const dx_shaft = x;
    const dy_shaft = y - proj_y;
    const dz_shaft = z;
    const distToShaftCenter = Math.sqrt(dx_shaft * dx_shaft + dy_shaft * dy_shaft + dz_shaft * dz_shaft);
    const d_shaft = distToShaftCenter - rShaft;

    // 2. Top Lobes (y ~ 3.7) - perfectly symmetrical double-lobed head
    const dx_topLeft = x - (-0.6);
    const dy_topLeft = y - 3.7;
    const dz_topLeft = z;
    const d_topLeft = Math.sqrt(dx_topLeft * dx_topLeft + dy_topLeft * dy_topLeft + dz_topLeft * dz_topLeft) - 0.78;

    const dx_topRight = x - 0.6;
    const dy_topRight = y - 3.7;
    const dz_topRight = z;
    const d_topRight = Math.sqrt(dx_topRight * dx_topRight + dy_topRight * dy_topRight + dz_topRight * dz_topRight) - 0.78;

    // 3. Bottom Lobes (y ~ -3.7) - perfectly symmetrical double-lobed base
    const dx_botLeft = x - (-0.6);
    const dy_botLeft = y - (-3.7);
    const dz_botLeft = z;
    const d_botLeft = Math.sqrt(dx_botLeft * dx_botLeft + dy_botLeft * dy_botLeft + dz_botLeft * dz_botLeft) - 0.78;

    const dx_botRight = x - 0.6;
    const dy_botRight = y - (-3.7);
    const dz_botRight = z;
    const d_botRight = Math.sqrt(dx_botRight * dx_botRight + dy_botRight * dy_botRight + dz_botRight * dz_botRight) - 0.78;

    // Smooth Union for organic continuous blending
    let d = d_shaft;
    d = smin(d, d_topLeft, 0.65);
    d = smin(d, d_topRight, 0.65);
    d = smin(d, d_botLeft, 0.65);
    d = smin(d, d_botRight, 0.65);

    return d;
  }

  // --- SDF Surface Projection ---
  function projectToBoneSurface(x: number, y: number, z: number, noiseVal: number): { x: number, y: number, z: number } {
    const dVal = getSDF(x, y, z);
    
    // Snaps points slightly inside or outside the zero-isovalue to give a nice realistic volume thickness
    const targetD = -0.12 + noiseVal * 0.18;
    
    // Numerical gradient of the bone SDF
    const eps = 0.005;
    const d_x_plus = getSDF(x + eps, y, z);
    const d_x_minus = getSDF(x - eps, y, z);
    const d_y_plus = getSDF(x, y + eps, z);
    const d_y_minus = getSDF(x, y - eps, z);
    const d_z_plus = getSDF(x, y, z + eps);
    const d_z_minus = getSDF(x, y, z - eps);
    
    let gx = (d_x_plus - d_x_minus) / (2 * eps);
    let gy = (d_y_plus - d_y_minus) / (2 * eps);
    let gz = (d_z_plus - d_z_minus) / (2 * eps);
    
    const len = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (len > 0.0001) {
      gx /= len;
      gy /= len;
      gz /= len;
    } else {
      gx = 0;
      gy = 1;
      gz = 0;
    }
    
    const correction = dVal - targetD;
    return {
      x: x - gx * correction,
      y: y - gy * correction,
      z: z - gz * correction
    };
  }

  // Generate 12,000 points perfectly distributed across the classic symmetrical bone shape
  const totalBonePoints = 12000;
  for (let i = 0; i < totalBonePoints; i++) {
    let x = 0, y = 0, z = 0;
    const seg = Math.random();

    if (seg < 0.5) {
      // Shaft segment
      y = -3.4 + Math.random() * 6.8;
      const theta = Math.random() * Math.PI * 2;
      const r = 0.48 + 0.12 * Math.pow(Math.abs(y) / 3.8, 2);
      x = r * Math.cos(theta);
      z = r * Math.sin(theta);
    } else if (seg < 0.75) {
      // Top lobes
      const isLeft = Math.random() < 0.5;
      const cx = isLeft ? -0.6 : 0.6;
      const cy = 3.7;
      const cz = 0;
      const phi = Math.acos(1 - 2 * Math.random());
      const theta = Math.random() * Math.PI * 2;
      const r = 0.78;
      x = cx + r * Math.sin(phi) * Math.cos(theta);
      y = cy + r * Math.cos(phi);
      z = cz + r * Math.sin(phi) * Math.sin(theta);
    } else {
      // Bottom lobes
      const isLeft = Math.random() < 0.5;
      const cx = isLeft ? -0.6 : 0.6;
      const cy = -3.7;
      const cz = 0;
      const phi = Math.acos(1 - 2 * Math.random());
      const theta = Math.random() * Math.PI * 2;
      const r = 0.78;
      x = cx + r * Math.sin(phi) * Math.cos(theta);
      y = cy + r * Math.cos(phi);
      z = cz + r * Math.sin(phi) * Math.sin(theta);
    }

    const noiseVal = noise3DForBone(x, y, z);
    const pt = projectToBoneSurface(x, y, z, noiseVal);
    
    tempBonePositions.push(pt.x, pt.y, pt.z);
  }

  // Glowing Red Color Design for the entire bone structure
  for (let i = 0; i < totalBonePoints; i++) {
    const c = new THREE.Color();
    const ac = new THREE.Color();
    
    // Original state: elegant crimson / glowing red tones
    const redSeed = Math.random();
    if (redSeed < 0.4) {
      c.set('#ff1a41'); // bright neon red
    } else if (redSeed < 0.8) {
      c.set('#ff002d'); // vibrant red
    } else {
      c.set('#ff4c6c'); // lighter glowing red-pink
    }
    
    // Active/Amber state: dazzling, brilliant neon crimson and white-hot cores
    const sparkSeed = Math.random();
    if (sparkSeed < 0.5) {
      ac.set('#fe0023'); // pure radiant red
    } else if (sparkSeed < 0.8) {
      ac.set('#fe3354'); // neon pinkish red
    } else {
      ac.set('#fffffe'); // white core sparkles
    }
    
    tempBoneColors.push(c.r, c.g, c.b);
    tempBoneAmberColors.push(ac.r, ac.g, ac.b);
  }

  return {
    tempBonePositions,
    tempBoneColors,
    tempBoneAmberColors,
    totalBonePoints
  };
}

export function generateBoneSynapses(tempBonePositions: number[], totalBonePoints: number) {
  const numBoneSynapses = 180;
  const boneSynapsePositions = new Float32Array(numBoneSynapses * 3);
  const originalBoneSynapseColors = new Float32Array(numBoneSynapses * 3);
  const amberBoneSynapseColors = new Float32Array(numBoneSynapses * 3);
  
  const boneSynapses: BoneSynapse[] = [];
  const chosenBoneIndices = new Set<number>();
  
  while (chosenBoneIndices.size < numBoneSynapses) {
    const randIdx = Math.floor(Math.random() * totalBonePoints);
    chosenBoneIndices.add(randIdx);
  }
  const chosenBoneIdxArray = Array.from(chosenBoneIndices);

  for (let i = 0; i < numBoneSynapses; i++) {
    const sIdx = chosenBoneIdxArray[i];
    const px = tempBonePositions[sIdx * 3];
    const py = tempBonePositions[sIdx * 3 + 1];
    const pz = tempBonePositions[sIdx * 3 + 2];

    boneSynapses.push({
      x: px,
      y: py,
      z: pz,
      ox: px,
      oy: py,
      oz: pz,
      rx: 0,
      ry: 0,
      rz: 0
    });

    boneSynapsePositions[i * 3] = px;
    boneSynapsePositions[i * 3 + 1] = py;
    boneSynapsePositions[i * 3 + 2] = pz;

    // Symmetrical Red Color Theme for Synapses
    const c = new THREE.Color('#ff1a41'); // Glowing bright neon red
    originalBoneSynapseColors[i * 3] = c.r;
    originalBoneSynapseColors[i * 3 + 1] = c.g;
    originalBoneSynapseColors[i * 3 + 2] = c.b;

    const dc = new THREE.Color();
    const dSeed = Math.random();
    if (dSeed < 0.5) {
      dc.set('#fffffe'); // brilliant white sparkle cores
    } else if (dSeed < 0.85) {
      dc.set('#ff1a41'); // vivid red
    } else {
      dc.set('#ff8192'); // light coral red
    }
    amberBoneSynapseColors[i * 3] = dc.r;
    amberBoneSynapseColors[i * 3 + 1] = dc.g;
    amberBoneSynapseColors[i * 3 + 2] = dc.b;
  }

  return {
    boneSynapses,
    boneSynapsePositions,
    originalBoneSynapseColors,
    amberBoneSynapseColors,
    numBoneSynapses
  };
}

export function generateBoneConnections(boneSynapses: BoneSynapse[]) {
  const boneConnections: { a: number; b: number }[] = [];
  const maxBoneConnectDist = 2.4;
  const numBoneSynapses = boneSynapses.length;

  for (let i = 0; i < numBoneSynapses; i++) {
    const s1 = boneSynapses[i];
    const dists = boneSynapses.map((s2, idx) => ({
      idx,
      dist: Math.sqrt((s1.ox - s2.ox) ** 2 + (s1.oy - s2.oy) ** 2 + (s1.oz - s2.oz) ** 2)
    })).filter(item => item.idx !== i);

    dists.sort((a, b) => a.dist - b.dist);

    const numConn = Math.min(3, dists.length);
    for (let j = 0; j < numConn; j++) {
      if (dists[j].dist < maxBoneConnectDist) {
        boneConnections.push({ a: i, b: dists[j].idx });
      }
    }
  }

  const boneLinePositions = new Float32Array(boneConnections.length * 6);
  const originalBoneLineColors = new Float32Array(boneConnections.length * 6);
  const amberBoneLineColors = new Float32Array(boneConnections.length * 6);

  for (let i = 0; i < boneConnections.length; i++) {
    const conn = boneConnections[i];
    const sA = boneSynapses[conn.a];
    const sB = boneSynapses[conn.b];

    boneLinePositions[i * 6] = sA.x;
    boneLinePositions[i * 6 + 1] = sA.y;
    boneLinePositions[i * 6 + 2] = sA.z;
    boneLinePositions[i * 6 + 3] = sB.x;
    boneLinePositions[i * 6 + 4] = sB.y;
    boneLinePositions[i * 6 + 5] = sB.z;

    const c1 = new THREE.Color('#ff002d');
    const c2 = new THREE.Color('#fe3354');

    originalBoneLineColors[i * 6] = c1.r;
    originalBoneLineColors[i * 6 + 1] = c1.g;
    originalBoneLineColors[i * 6 + 2] = c1.b;
    originalBoneLineColors[i * 6 + 3] = c2.r;
    originalBoneLineColors[i * 6 + 4] = c2.g;
    originalBoneLineColors[i * 6 + 5] = c2.b;

    const dc1 = new THREE.Color();
    const dc2 = new THREE.Color();
    const dSeed = Math.random();
    if (dSeed < 0.5) {
      dc1.set('#fffffe'); // high-contrast white-red lines
      dc2.set('#ff0100');
    } else {
      dc1.set('#ff1a41');
      dc2.set('#ff8192');
    }
    amberBoneLineColors[i * 6] = dc1.r;
    amberBoneLineColors[i * 6 + 1] = dc1.g;
    amberBoneLineColors[i * 6 + 2] = dc1.b;
    amberBoneLineColors[i * 6 + 3] = dc2.r;
    amberBoneLineColors[i * 6 + 4] = dc2.g;
    amberBoneLineColors[i * 6 + 5] = dc2.b;
  }

  return {
    boneConnections,
    boneLinePositions,
    originalBoneLineColors,
    amberBoneLineColors
  };
}

export interface SkullSynapse {
  x: number;
  y: number;
  z: number;
  ox: number;
  oy: number;
  oz: number;
  rx: number;
  ry: number;
  rz: number;
}

export function generateSkullParticles(createNoise3D: () => (x: number, y: number, z: number) => number) {
  const noise3DForSkull = createNoise3D();
  const tempSkullPositions: number[] = [];
  const tempSkullColors: number[] = [];
  const tempSkullAmberColors: number[] = [];

  function smin(d1: number, d2: number, k: number): number {
    const h = Math.max(k - Math.abs(d1 - d2), 0.0) / k;
    return Math.min(d1, d2) - h * h * h * k * (1.0 / 6.0);
  }

  function smax(d1: number, d2: number, k: number): number {
    const h = Math.max(k - Math.abs(d1 - d2), 0.0) / k;
    return Math.max(d1, d2) + h * h * h * k * (1.0 / 6.0);
  }

  function getSDF(x: number, y: number, z: number): number {
    const craniumScaleX = 1.15;
    const craniumScaleZ = 0.95; 
    const dx_cran = x * craniumScaleX;
    const dy_cran = (y - 1.25);
    const dz_cran = z * craniumScaleZ;
    const d_cran = Math.sqrt(dx_cran * dx_cran + dy_cran * dy_cran + dz_cran * dz_cran) - 3.25;

    const dx_max = x * 1.35;
    const dy_max = y + 0.15;
    const dz_max = z - 0.95;
    const d_max = Math.sqrt(dx_max * dx_max + dy_max * dy_max + dz_max * dz_max) - 1.95;

    const jawTaper = 1.0 - Math.max(0.0, (-y - 0.8) * 0.18);
    const dx_jaw = (x * 1.4) / jawTaper;
    const dy_jaw = y + 1.85;
    const dz_jaw = z - 0.65;
    const d_jaw = Math.sqrt(dx_jaw * dx_jaw + dy_jaw * dy_jaw + dz_jaw * dz_jaw) - 1.6;

    const dx_cheekL = x - (-1.8);
    const dy_cheekL = y - 0.05;
    const dz_cheekL = z - 0.7;
    const d_cheekL = Math.sqrt(dx_cheekL * dx_cheekL + dy_cheekL * dy_cheekL + dz_cheekL * dz_cheekL) - 0.75;

    const dx_cheekR = x - 1.8;
    const dy_cheekR = y - 0.05;
    const dz_cheekR = z - 0.7;
    const d_cheekR = Math.sqrt(dx_cheekR * dx_cheekR + dy_cheekR * dy_cheekR + dz_cheekR * dz_cheekR) - 0.75;

    let d = smin(d_cran, d_max, 0.8);
    d = smin(d, d_jaw, 0.85);
    d = smin(d, d_cheekL, 0.55);
    d = smin(d, d_cheekR, 0.55);

    const d_eyeL = Math.sqrt(Math.pow(x + 1.1, 2) * 1.1 + Math.pow(y - 0.55, 2) * 1.35 + Math.pow(z - 1.8, 2)) - 0.85;
    const d_eyeR = Math.sqrt(Math.pow(x - 1.1, 2) * 1.1 + Math.pow(y - 0.55, 2) * 1.35 + Math.pow(z - 1.8, 2)) - 0.85;
    const d_nose = Math.sqrt(Math.pow(x, 2) * 2.1 + Math.pow(y + 0.35, 2) * 1.25 + Math.pow(z - 1.9, 2)) - 0.55;

    d = smax(d, -d_eyeL, 0.25);
    d = smax(d, -d_eyeR, 0.25);
    d = smax(d, -d_nose, 0.18);

    if (z > 1.0 && y > -1.75 && y < -0.9) {
      const archZ = 1.7 - x * x * 0.45;
      const distToArch = Math.abs(z - archZ);
      if (distToArch < 0.45 && Math.abs(x) < 1.35) {
        const theta = Math.atan2(x, z - 0.3);
        const toothFrequency = 14.0;
        const wave = Math.sin(theta * toothFrequency) * 0.12;
        const jawSplit = Math.abs(y + 1.35) - 0.05;
        const toothBump = -Math.max(0.0, 0.15 - distToArch) * (Math.abs(wave) + Math.max(0.0, 0.08 - jawSplit) * 1.8);
        d += toothBump;
      }
    }

    return d;
  }

  function projectToSkullSurface(x: number, y: number, z: number, noiseVal: number) {
    let px = x;
    let py = y;
    let pz = z;

    const targetD = -0.12 + noiseVal * 0.16;
    const eps = 0.005;
    for (let iter = 0; iter < 4; iter++) {
      const dVal = getSDF(px, py, pz);
      const d_x_plus = getSDF(px + eps, py, pz);
      const d_x_minus = getSDF(px - eps, py, pz);
      const d_y_plus = getSDF(px, py + eps, pz);
      const d_y_minus = getSDF(px, py - eps, pz);
      const d_z_plus = getSDF(px, py, pz + eps);
      const d_z_minus = getSDF(px, py, pz - eps);

      const gradX = (d_x_plus - d_x_minus) / (2 * eps);
      const gradY = (d_y_plus - d_y_minus) / (2 * eps);
      const gradZ = (d_z_plus - d_z_minus) / (2 * eps);

      const gradLen = Math.sqrt(gradX * gradX + gradY * gradY + gradZ * gradZ);
      if (gradLen < 0.0001) break;

      const nx = gradX / gradLen;
      const ny = gradY / gradLen;
      const nz = gradZ / gradLen;

      const diff = dVal - targetD;
      px -= nx * diff * 0.85;
      py -= ny * diff * 0.85;
      pz -= nz * diff * 0.85;
    }

    return { x: px, y: py, z: pz };
  }

  const totalPointsTarget = 12000;
  let generatedCount = 0;

  while (generatedCount < totalPointsTarget) {
    let rx = (Math.random() - 0.5) * 7.5;
    let ry = -3.2 + Math.random() * 7.4;
    let rz = (Math.random() - 0.5) * 6.5;

    const distLeftEye = Math.sqrt(Math.pow(rx + 1.05, 2) + Math.pow(ry - 0.6, 2) * 1.3 + Math.pow(rz - 1.8, 2));
    const distRightEye = Math.sqrt(Math.pow(rx - 1.05, 2) + Math.pow(ry - 0.6, 2) * 1.3 + Math.pow(rz - 1.8, 2));
    if (distLeftEye < 0.82 || distRightEye < 0.82) {
      continue;
    }

    const distNose = Math.sqrt(Math.pow(rx, 2) * 1.8 + Math.pow(ry + 0.35, 2) * 1.1 + Math.pow(rz - 1.9, 2));
    if (distNose < 0.52) {
      continue;
    }

    if (rz > 1.2 && ry > -1.7 && ry < -1.4 && Math.abs(rx) < 1.3) {
      if (Math.random() < 0.6) continue;
    }

    const dVal = getSDF(rx, ry, rz);
    if (dVal < 0.85) {
      const noiseVal = noise3DForSkull(rx, ry, rz);
      const pt = projectToSkullSurface(rx, ry, rz, noiseVal);

      const postLeftEye = Math.sqrt(Math.pow(pt.x + 1.05, 2) + Math.pow(pt.y - 0.6, 2) * 1.3 + Math.pow(pt.z - 1.8, 2));
      const postRightEye = Math.sqrt(Math.pow(pt.x - 1.05, 2) + Math.pow(pt.y - 0.6, 2) * 1.3 + Math.pow(pt.z - 1.8, 2));
      const postNose = Math.sqrt(Math.pow(pt.x, 2) * 1.8 + Math.pow(pt.y + 0.35, 2) * 1.1 + Math.pow(pt.z - 1.9, 2));

      if (postLeftEye < 0.55 || postRightEye < 0.55 || postNose < 0.35) {
        continue;
      }

      tempSkullPositions.push(pt.x, pt.y, pt.z);
      generatedCount++;

      const c = new THREE.Color();
      const ac = new THREE.Color();
      
      const isTeethRegion = (pt.z > 1.25 && pt.y > -1.75 && pt.y < -0.95 && Math.abs(pt.x) < 1.35);

      if (isTeethRegion) {
        c.set('#f0eadc');
        ac.set('#fffffe');
      } else {
        const pSeed = Math.random();
        if (pSeed < 0.45) {
          c.set('#9d4edd');
        } else if (pSeed < 0.8) {
          c.set('#c67dff');
        } else {
          c.set('#e0abff');
        }

        const sSeed = Math.random();
        if (sSeed < 0.5) {
          ac.set('#fe01a1');
        } else if (sSeed < 0.85) {
          ac.set('#fe5c8a');
        } else {
          ac.set('#fffffe');
        }
      }

      tempSkullColors.push(c.r, c.g, c.b);
      tempSkullAmberColors.push(ac.r, ac.g, ac.b);
    }
  }

  return {
    tempSkullPositions,
    tempSkullColors,
    tempSkullAmberColors,
    totalSkullPoints: generatedCount
  };
}

export function generateSkullSynapses(tempSkullPositions: number[], totalSkullPoints: number) {
  const numSkullSynapses = 220;
  const skullSynapsePositions = new Float32Array(numSkullSynapses * 3);
  const originalSkullSynapseColors = new Float32Array(numSkullSynapses * 3);
  const amberSkullSynapseColors = new Float32Array(numSkullSynapses * 3);

  const skullSynapses: SkullSynapse[] = [];
  const chosenIndices = new Set<number>();
  while (chosenIndices.size < numSkullSynapses) {
    const randIdx = Math.floor(Math.random() * totalSkullPoints);
    chosenIndices.add(randIdx);
  }
  const chosenIdxArray = Array.from(chosenIndices);

  for (let i = 0; i < numSkullSynapses; i++) {
    const sIdx = chosenIdxArray[i];
    const px = tempSkullPositions[sIdx * 3];
    const py = tempSkullPositions[sIdx * 3 + 1];
    const pz = tempSkullPositions[sIdx * 3 + 2];

    skullSynapses.push({
      x: px,
      y: py,
      z: pz,
      ox: px,
      oy: py,
      oz: pz,
      rx: 0,
      ry: 0,
      rz: 0
    });

    skullSynapsePositions[i * 3] = px;
    skullSynapsePositions[i * 3 + 1] = py;
    skullSynapsePositions[i * 3 + 2] = pz;

    const c = new THREE.Color('#9d4edd'); 
    originalSkullSynapseColors[i * 3] = c.r;
    originalSkullSynapseColors[i * 3 + 1] = c.g;
    originalSkullSynapseColors[i * 3 + 2] = c.b;

    const dc = new THREE.Color();
    const dSeed = Math.random();
    if (dSeed < 0.5) {
      dc.set('#fffffe');
    } else if (dSeed < 0.85) {
      dc.set('#fe017e');
    } else {
      dc.set('#ff80df');
    }
    amberSkullSynapseColors[i * 3] = dc.r;
    amberSkullSynapseColors[i * 3 + 1] = dc.g;
    amberSkullSynapseColors[i * 3 + 2] = dc.b;
  }

  return {
    skullSynapses,
    skullSynapsePositions,
    originalSkullSynapseColors,
    amberSkullSynapseColors,
    numSkullSynapses
  };
}

export function generateSkullConnections(skullSynapses: SkullSynapse[]) {
  const skullConnections: { a: number; b: number }[] = [];
  const maxSkullConnectDist = 1.95;

  for (let i = 0; i < skullSynapses.length; i++) {
    const s1 = skullSynapses[i];
    const dists = skullSynapses.map((s2, idx) => ({
      idx,
      dist: Math.sqrt((s1.ox - s2.ox) ** 2 + (s1.oy - s2.oy) ** 2 + (s1.oz - s2.oz) ** 2)
    })).filter(item => item.idx !== i);

    dists.sort((a, b) => a.dist - b.dist);

    const numConn = Math.min(2, dists.length);
    for (let j = 0; j < numConn; j++) {
      if (dists[j].dist < maxSkullConnectDist) {
        skullConnections.push({ a: i, b: dists[j].idx });
      }
    }
  }

  const skullLinePositions = new Float32Array(skullConnections.length * 6);
  const originalSkullLineColors = new Float32Array(skullConnections.length * 6);
  const amberSkullLineColors = new Float32Array(skullConnections.length * 6);

  for (let i = 0; i < skullConnections.length; i++) {
    const conn = skullConnections[i];
    const sA = skullSynapses[conn.a];
    const sB = skullSynapses[conn.b];

    skullLinePositions[i * 6] = sA.x;
    skullLinePositions[i * 6 + 1] = sA.y;
    skullLinePositions[i * 6 + 2] = sA.z;
    skullLinePositions[i * 6 + 3] = sB.x;
    skullLinePositions[i * 6 + 4] = sB.y;
    skullLinePositions[i * 6 + 5] = sB.z;

    const c1 = new THREE.Color('#7b2cbf');
    const c2 = new THREE.Color('#9d4edd');

    originalSkullLineColors[i * 6] = c1.r;
    originalSkullLineColors[i * 6 + 1] = c1.g;
    originalSkullLineColors[i * 6 + 2] = c1.b;
    originalSkullLineColors[i * 6 + 3] = c2.r;
    originalSkullLineColors[i * 6 + 4] = c2.g;
    originalSkullLineColors[i * 6 + 5] = c2.b;

    const dc1 = new THREE.Color();
    const dc2 = new THREE.Color();
    const dSeed = Math.random();
    if (dSeed < 0.5) {
      dc1.set('#fffffe');
      dc2.set('#fe017e');
    } else {
      dc1.set('#e0abff');
      dc2.set('#fe5c8a');
    }
    amberSkullLineColors[i * 6] = dc1.r;
    amberSkullLineColors[i * 6 + 1] = dc1.g;
    amberSkullLineColors[i * 6 + 2] = dc1.b;
    amberSkullLineColors[i * 6 + 3] = dc2.r;
    amberSkullLineColors[i * 6 + 4] = dc2.g;
    amberSkullLineColors[i * 6 + 5] = dc2.b;
  }

  return {
    skullConnections,
    skullLinePositions,
    originalSkullLineColors,
    amberSkullLineColors
  };
}

export default function HumanSynthesisSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const bottomTextRef = useRef<HTMLDivElement>(null);
  const diamondTextRef = useRef<HTMLDivElement>(null);
  const boneTextRef = useRef<HTMLDivElement>(null);
  const skullTextRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#010001');

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.z = 24;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);

    // 4. Post-processing Bloom setup
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.55, // Strength
      0.18, // Radius
      0.35  // Threshold
    );

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    // 5. Helper function to generate glowing 2D diamond texture
    const createGlowTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillRect(0, 0, 64, 64);

        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.95)');
        gradient.addColorStop(0.5, 'rgba(0, 255, 230, 0.6)');
        gradient.addColorStop(0.8, 'rgba(0, 100, 255, 0.2)');
        gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(32, 4);
        ctx.lineTo(60, 32);
        ctx.lineTo(32, 60);
        ctx.lineTo(4, 32);
        ctx.closePath();
        ctx.fill();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      return texture;
    };

    const createRingTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillRect(0, 0, 64, 64);

        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        gradient.addColorStop(0.3, 'rgba(0, 255, 240, 0.8)');
        gradient.addColorStop(0.7, 'rgba(0, 150, 255, 0.35)');
        gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(32, 6);
        ctx.lineTo(58, 32);
        ctx.lineTo(32, 58);
        ctx.lineTo(6, 32);
        ctx.closePath();
        ctx.fill();

        // Draw a bright sharp white inner diamond core
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(32, 14);
        ctx.lineTo(50, 32);
        ctx.lineTo(32, 50);
        ctx.lineTo(14, 32);
        ctx.closePath();
        ctx.stroke();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      return texture;
    };

    // 6. 3D GLOWING CYBER-MASK
    const maskRadius = 4.0;
    const cols = 90;
    const rows = 90;
    const tempMaskPositions: number[] = [];
    const tempMaskColors: number[] = [];

    for (let rIndex = 0; rIndex < rows; rIndex++) {
      const v = (rIndex / (rows - 1)) * 2.0 - 1.0; // v goes from -1.0 to 1.0
      for (let cIndex = 0; cIndex < cols; cIndex++) {
        const u = (cIndex / (cols - 1)) * 2.0 - 1.0; // u goes from -1.0 to 1.0

        // Horizontal angle theta (spanning center of face)
        const theta = u * (Math.PI / 2.6); // covers approx -70 to +70 degrees
        const phi = v * (Math.PI / 2.8);   // vertical angle

        // Define base cylindrical/spherical curvature
        const baseRadius = maskRadius * (1.05 - 0.12 * v * v); // slight barrel shape
        let x = baseRadius * Math.sin(theta);
        let y = maskRadius * 1.25 * Math.sin(phi);
        let z = baseRadius * Math.cos(theta) * 0.72; // flatten depth slightly

        // Cheek / chin tapering at the bottom
        if (v < -0.2) {
          const taper = 1.0 - Math.abs(v + 0.2) * 0.45;
          x *= taper;
        }

        // Nose bridge and tip sculpture
        const distFromCenter = Math.abs(theta);
        let isNose = false;
        if (distFromCenter < 0.26 && v > -0.25 && v < 0.45) {
          const nw = 1.0 - (distFromCenter / 0.26);
          const nh = Math.cos(((v - 0.1) / 0.35) * (Math.PI / 2));
          if (nh > 0) {
            z += 1.15 * nw * nh;
            isNose = true;
          }
        }

        // Forehead curvature
        if (v > 0.5) {
          const foreheadCurve = Math.pow((v - 0.5) / 0.5, 2) * 0.45;
          z -= foreheadCurve;
        }

        // Define eye cutout regions (ellipses)
        const leftEyeX = -0.42;
        const rightEyeX = 0.42;
        const eyeY = 0.22;
        const eyeWidth = 0.22;
        const eyeHeight = 0.14;

        const distLeftEye = Math.sqrt(Math.pow((u - leftEyeX) / eyeWidth, 2) + Math.pow((v - eyeY) / eyeHeight, 2));
        const distRightEye = Math.sqrt(Math.pow((u - rightEyeX) / eyeWidth, 2) + Math.pow((v - eyeY) / eyeHeight, 2));

        // Skip adding the particles inside the eye holes to create clean eye cutouts!
        if (distLeftEye < 0.85 || distRightEye < 0.85) {
          continue;
        }

        // Mouth cutout / slit
        const mouthX = 0.0;
        const mouthY = -0.42;
        const distMouth = Math.sqrt(Math.pow((u - mouthX) / 0.34, 2) + Math.pow((v - mouthY) / 0.06, 2));
        if (distMouth < 0.7) {
          continue; // create a clean mouth opening
        }

        // Sculpt lip shape contours around the mouth opening
        if (v > -0.55 && v < -0.3 && distFromCenter < 0.4) {
          const lipFactor = (1.0 - distFromCenter / 0.4) * 0.25 * Math.sin((v + 0.42) * 10.0);
          z += lipFactor;
        }

        // Add a tiny bit of high-tech organic jitter
        const jitter = 0.015;
        x += (Math.random() - 0.5) * jitter;
        y += (Math.random() - 0.5) * jitter;
        z += (Math.random() - 0.5) * jitter;

        tempMaskPositions.push(x, y, z);

        // Styling and Color design for cyber mask
        const c = new THREE.Color();
        const edgeLeftEye = Math.abs(distLeftEye - 1.0);
        const edgeRightEye = Math.abs(distRightEye - 1.0);
        const isNearEyeBorder = edgeLeftEye < 0.18 || edgeRightEye < 0.18;

        if (isNearEyeBorder) {
          // Intense neon cyan outline for the eyes
          c.set('#fffffe');
        } else if (isNose) {
          // Soft teal/white highlighting the nose bridge
          c.set('#01fefe');
        } else if (Math.abs(u) > 0.85 || Math.abs(v) > 0.85) {
          // Beautiful dark cyan borders
          c.set('#00a291');
        } else {
          // Standard face body blend of cyan-white
          const blend = Math.random();
          if (blend < 0.35) c.set('#00ffd0');
          else if (blend < 0.7) c.set('#01fefe');
          else c.set('#01abfe');
        }

        tempMaskColors.push(c.r, c.g, c.b);
      }
    }

    const maskParticleCount = tempMaskPositions.length / 3;
    const maskGeometry = new THREE.BufferGeometry();
    const maskPositions = new Float32Array(tempMaskPositions);
    const maskColors = new Float32Array(tempMaskColors);

    maskGeometry.setAttribute('position', new THREE.BufferAttribute(maskPositions, 3));
    maskGeometry.setAttribute('color', new THREE.BufferAttribute(maskColors, 3));

    const maskMaterial = new THREE.PointsMaterial({
      size: 0.16,
      map: createRingTexture(),
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    });

    const maskPoints = new THREE.Points(maskGeometry, maskMaterial);
    scene.add(maskPoints);

    const originalMaskPositions = new Float32Array(maskPositions);
    const maskRepulsionOffsets = new Float32Array(maskParticleCount * 3);


    // 6b. 3D GLOWING CYBER-BRAIN
    const numSurfacePoints = 15000;
    const tempBrainPositions: number[] = [];
    const tempBrainColors: number[] = [];
    const tempDiamondColors: number[] = [];
    const originalBrainPositionsList: number[] = [];

    const noise3DForBrain = createNoise3D();

    // Helper to mold any 3D point into a highly detailed 3D human face shape
    const applyFaceMolding = (x: number, y: number, z: number) => {
      // Standardize head proportions and positioning
      let fx = x * 0.95;
      let fy = y;
      let fz = z * 0.95;

      const normY = fy / 3.0; // Scale vertical to -1.0 to 1.0 range

      // Overall head structure (wider skull top, tapering jaw and chin)
      let taper = 1.0;
      if (normY < 0) {
        // Jaw tapering to chin
        taper = 1.0 + normY * 0.42;
      } else {
        // Forehead narrowing slightly
        taper = 1.0 - (normY * normY) * 0.12;
      }
      fx *= taper;

      // Sculpt features on the front half (z > 0)
      if (z > 0) {
        const dx = Math.abs(fx);

        // 1. Nose bridge and tip sculpting
        if (dx < 0.65 && fy > -0.4 && fy < 0.8) {
          const nw = Math.cos((dx / 0.65) * Math.PI / 2); // horizontal influence
          const ny = Math.cos(((fy - 0.2) / 0.6) * Math.PI / 2); // vertical influence
          if (ny > 0) {
            fz += 1.85 * nw * ny;
          }
        }

        // 2. Eye socket indentation
        const leftEyeDist = Math.sqrt(Math.pow(fx + 0.85, 2) + Math.pow(fy - 0.9, 2) * 1.5);
        const rightEyeDist = Math.sqrt(Math.pow(fx - 0.85, 2) + Math.pow(fy - 0.9, 2) * 1.5);
        if (leftEyeDist < 0.7) {
          fz -= 0.55 * Math.cos((leftEyeDist / 0.7) * Math.PI / 2);
        }
        if (rightEyeDist < 0.7) {
          fz -= 0.55 * Math.cos((rightEyeDist / 0.7) * Math.PI / 2);
        }

        // 3. Lips and mouth protrusion
        const mouthDist = Math.sqrt(fx * fx + Math.pow(fy + 0.5, 2) * 3.5);
        if (mouthDist < 0.72) {
          const lipShape = Math.cos((mouthDist / 0.72) * Math.PI / 2) * Math.sin(((fy + 0.5) / 0.36) * Math.PI);
          fz += 0.45 * lipShape;
        }

        // 4. Chin protrusion
        const chinDist = Math.sqrt(fx * fx + Math.pow(fy + 1.5, 2) * 2.5);
        if (chinDist < 0.65) {
          fz += 0.65 * Math.cos((chinDist / 0.65) * Math.PI / 2);
        }

        // 5. Cheekbones
        const leftCheekDist = Math.sqrt(Math.pow(fx + 1.25, 2) + Math.pow(fy + 0.1, 2) * 2.0);
        const rightCheekDist = Math.sqrt(Math.pow(fx - 1.25, 2) + Math.pow(fy + 0.1, 2) * 2.0);
        if (leftCheekDist < 0.9) {
          fz += 0.35 * Math.cos((leftCheekDist / 0.9) * Math.PI / 2);
        }
        if (rightCheekDist < 0.9) {
          fz += 0.35 * Math.cos((rightCheekDist / 0.9) * Math.PI / 2);
        }
      }

      return { x: fx, y: fy, z: fz };
    };

    // 1. CEREBRUM
    for (let i = 0; i < numSurfacePoints; i++) {
      const phi = Math.acos(1 - 2 * (i / numSurfacePoints));
      const theta = Math.PI * (1 + Math.sqrt(5)) * i; // Golden ratio spherical distribution

      // Base sphere coordinates
      const sx = Math.sin(phi) * Math.cos(theta);
      const sy = Math.cos(phi);
      const sz = Math.sin(phi) * Math.sin(theta);

      // Deform sphere into high-fidelity brain cerebrum proportions
      let x = sx * 3.3;
      let y = sy * 2.4 + 0.35; // Position shifted upwards slightly
      let z = sz * 3.8;

      // Front of the brain is +z, back of the brain is -z.
      // Frontal lobe tapering: slightly narrower at the front
      if (z > 0) {
        const frontalTaper = 1.0 - (z / 3.8) * 0.14;
        x *= frontalTaper;
        y *= (1.0 - (z / 3.8) * 0.08);
      }

      // Anatomical pocket/cleft at the lower-rear (z < -0.3, y < 0.4) to slot the cerebellum in
      if (z < -0.3 && y < 0.4) {
        const factor = Math.min(1.0, (z + 0.3) / -2.5); // 0 at z=-0.3, 1 at z=-2.8
        const lift = factor * 0.95;
        y += lift;
      }

      // Lateral/Sylvian fissure indentation
      const absX = Math.abs(x);
      if (absX > 0.8 && y > -0.6 && y < 0.8 && z > -0.8 && z < 1.4) {
        const fissureDepth = 0.12 * Math.exp(-2.0 * Math.pow(y - 0.1, 2));
        x -= (x > 0 ? 1 : -1) * fissureDepth;
      }

      // Longitudinal fissure (sagittal plane division between left & right hemispheres)
      const fissureFactor = 1.0 - 0.28 * Math.exp(-6.0 * x * x);
      x *= fissureFactor;

      // Mold into human face shape BEFORE applying the brain folds
      const molded = applyFaceMolding(x, y, z);
      x = molded.x;
      y = molded.y;
      z = molded.z;

      // High-definition brain folds (gyri & sulci) via Simplex Noise frequencies
      const n1 = noise3DForBrain(x * 0.55, y * 0.55, z * 0.55);
      const n2 = noise3DForBrain(x * 1.5, y * 1.5, z * 1.5);
      const foldVal = Math.sin(n1 * 13.0 + n2 * 4.5) * 0.28;

      // Displace coordinates outward along surface normals of the diamond
      const rLen = Math.sqrt(x * x + y * y + z * z);
      const nx = x / rLen;
      const ny = y / rLen;
      const nz = z / rLen;

      x += nx * foldVal;
      y += ny * foldVal;
      z += nz * foldVal;

      // Subtle organic jitter
      x += (Math.random() - 0.5) * 0.02;
      y += (Math.random() - 0.5) * 0.02;
      z += (Math.random() - 0.5) * 0.02;

      tempBrainPositions.push(x, y, z);
      originalBrainPositionsList.push(x, y, z);

      // Self-illuminated dual-color styling
      const c = new THREE.Color();
      const dc = new THREE.Color();
      const dSeed = Math.random();

      if (foldVal > 0.08) {
        // Ridge peaks - extremely bright neon cyan and white-cyan
        const blend = Math.random();
        if (blend < 0.6) {
          c.set('#01ffea');
        } else {
          c.set('#a7fffe'); // white-cyan hot spot
        }
        if (dSeed < 0.7) {
          dc.set('#fffffe'); // dazzling white core
        } else {
          dc.set('#eafefe'); // shimmering cyan-white
        }
      } else if (foldVal > -0.05) {
        // Slopes - bright neon cyan and royal blue
        const blend = Math.random();
        if (blend < 0.5) {
          c.set('#01a2ff');
        } else {
          c.set('#01fefe');
        }
        if (dSeed < 0.5) {
          dc.set('#b6f7ff'); // crystal clear ice blue
        } else {
          dc.set('#6afdff'); // bright diamond cyan
        }
      } else {
        // Valley crevices - deep electric blue and indigo
        const blend = Math.random();
        if (blend < 0.6) {
          c.set('#0051ff');
        } else {
          c.set('#0026b2');
        }
        if (dSeed < 0.5) {
          dc.set('#0089fe'); // royal diamond blue
        } else if (dSeed < 0.8) {
          dc.set('#e9ccff'); // prismatic violet
        } else {
          dc.set('#1b3cfd'); // deep sapphire refraction
        }
      }
      tempBrainColors.push(c.r, c.g, c.b);
      tempDiamondColors.push(dc.r, dc.g, dc.b);
    }

    // 2. CEREBELLUM
    const numCerebellumPoints = 4000;
    for (let i = 0; i < numCerebellumPoints; i++) {
      const phi = Math.acos(1 - 2 * (i / numCerebellumPoints));
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;

      const sx = Math.sin(phi) * Math.cos(theta);
      const sy = Math.cos(phi);
      const sz = Math.sin(phi) * Math.sin(theta);

      // Compact ellipsoid situated perfectly in the lower-rear pocket of the cerebrum
      let x = sx * 1.85;
      let y = sy * 0.95 - 0.7;
      let z = sz * 1.45 - 1.4;

      // Mold into human face shape first
      const molded = applyFaceMolding(x, y, z);
      x = molded.x;
      y = molded.y;
      z = molded.z;

      // Apply dense horizontal folds (folia) characteristic of cerebellum anatomy
      const foliaNoise = noise3DForBrain(x * 1.5, y * 3.5, z * 1.5);
      const folia = Math.sin(y * 45.0 + foliaNoise * 1.8) * 0.08;

      const rLen = Math.sqrt(x * x + y * y + z * z);
      x += (x / rLen) * folia;
      y += (y / rLen) * folia;
      z += (z / rLen) * folia;

      // Subtle organic jitter
      x += (Math.random() - 0.5) * 0.02;
      y += (Math.random() - 0.5) * 0.02;
      z += (Math.random() - 0.5) * 0.02;

      tempBrainPositions.push(x, y, z);
      originalBrainPositionsList.push(x, y, z);

      // Cerebellum color theme (dense glowing cyan-teal and vibrant blue stripes)
      const c = new THREE.Color();
      const dc = new THREE.Color();
      const dSeed = Math.random();
      if (folia > 0.02) {
        c.set('#01fedb'); // glowing cyan
        if (dSeed < 0.6) {
          dc.set('#fffffe');
        } else {
          dc.set('#a1fef0');
        }
      } else {
        c.set('#0062ff'); // electric blue
        if (dSeed < 0.5) {
          dc.set('#01a2ff');
        } else {
          dc.set('#bafdfe');
        }
      }
      tempBrainColors.push(c.r, c.g, c.b);
      tempDiamondColors.push(dc.r, dc.g, dc.b);
    }

    // 3. BRAIN STEM
    const numStemPoints = 2000;
    for (let i = 0; i < numStemPoints; i++) {
      const t = i / numStemPoints;
      const y = -0.9 - t * 2.2; // Extends downwards to a lower sharp tip
      const angle = Math.random() * Math.PI * 2;
      
      // Hexagonal faceting for crystal stem
      const numStemFacets = 6;
      const quantizedAngle = Math.round(angle / (Math.PI * 2 / numStemFacets)) * (Math.PI * 2 / numStemFacets);
      const finalAngle = angle + (quantizedAngle - angle) * 0.85;

      const baseRadius = 0.45 * (1.0 - t * 0.95); // Tapering strongly to a sharp tip
      const fiberNoise = Math.sin(angle * 6.0) * 0.04;
      const r = baseRadius + fiberNoise;

      const x = r * Math.cos(finalAngle);
      const z = r * Math.sin(finalAngle) - t * 0.15; // slightly sloped

      tempBrainPositions.push(x, y, z);
      originalBrainPositionsList.push(x, y, z);

      const c = new THREE.Color();
      const dc = new THREE.Color();
      const rSeed = Math.random();
      if (rSeed < 0.4) {
        c.set('#01affe');
      } else if (rSeed < 0.8) {
        c.set('#0155fe');
      } else {
        c.set('#01ffea');
      }
      
      const dSeed = Math.random();
      if (dSeed < 0.4) {
        dc.set('#fffffe');
      } else if (dSeed < 0.8) {
        dc.set('#9ff5fe');
      } else {
        dc.set('#e0ccfe'); // crystal lavender
      }
      tempBrainColors.push(c.r, c.g, c.b);
      tempDiamondColors.push(dc.r, dc.g, dc.b);
    }

    const brainParticleCount = tempBrainPositions.length / 3;

    const brainGeometry = new THREE.BufferGeometry();
    const brainPositions = new Float32Array(tempBrainPositions);
    const brainColors = new Float32Array(tempBrainColors);
    const originalBrainColors = new Float32Array(tempBrainColors);
    const diamondBrainColors = new Float32Array(tempDiamondColors);

    brainGeometry.setAttribute('position', new THREE.BufferAttribute(brainPositions, 3));
    brainGeometry.setAttribute('color', new THREE.BufferAttribute(brainColors, 3));

    const brainMaterial = new THREE.PointsMaterial({
      size: 0.09,
      map: createRingTexture(),
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.0, // Initially invisible
    });

    const brainPoints = new THREE.Points(brainGeometry, brainMaterial);

    const originalBrainPositions = new Float32Array(brainPositions);
    const brainRepulsionOffsets = new Float32Array(brainParticleCount * 3);

    // Generate highlighted Synapse Hotspots (Stars) sitting perfectly on the brain surface folds
    const numSynapses = 280;
    const synapsePositions = new Float32Array(numSynapses * 3);
    const synapseColors = new Float32Array(numSynapses * 3);
    
    interface Synapse {
      x: number;
      y: number;
      z: number;
      ox: number;
      oy: number;
      oz: number;
      rx: number;
      ry: number;
      rz: number;
    }
    const synapses: Synapse[] = [];
    const chosenIndices = new Set<number>();
    while (chosenIndices.size < numSynapses) {
      const randIdx = Math.floor(Math.random() * numSurfacePoints);
      chosenIndices.add(randIdx);
    }
    const chosenIdxArray = Array.from(chosenIndices);

    const originalSynapseColors = new Float32Array(numSynapses * 3);
    const diamondSynapseColors = new Float32Array(numSynapses * 3);

    for (let i = 0; i < numSynapses; i++) {
      const sIdx = chosenIdxArray[i];
      const px = tempBrainPositions[sIdx * 3];
      const py = tempBrainPositions[sIdx * 3 + 1];
      const pz = tempBrainPositions[sIdx * 3 + 2];

      synapses.push({
        x: px,
        y: py,
        z: pz,
        ox: px,
        oy: py,
        oz: pz,
        rx: 0,
        ry: 0,
        rz: 0
      });

      synapsePositions[i * 3] = px;
      synapsePositions[i * 3 + 1] = py;
      synapsePositions[i * 3 + 2] = pz;

      const c = new THREE.Color('#fffffe'); // High intense glowing synapse
      synapseColors[i * 3] = c.r;
      synapseColors[i * 3 + 1] = c.g;
      synapseColors[i * 3 + 2] = c.b;

      originalSynapseColors[i * 3] = c.r;
      originalSynapseColors[i * 3 + 1] = c.g;
      originalSynapseColors[i * 3 + 2] = c.b;

      const dc = new THREE.Color();
      const dSeed = Math.random();
      if (dSeed < 0.6) {
        dc.set('#fffffe'); // hot crystal white
      } else if (dSeed < 0.8) {
        dc.set('#b7feff'); // brilliant electric cyan
      } else {
        dc.set('#f2d9ff'); // glittering prismatic pink-lavender
      }
      diamondSynapseColors[i * 3] = dc.r;
      diamondSynapseColors[i * 3 + 1] = dc.g;
      diamondSynapseColors[i * 3 + 2] = dc.b;
    }

    const synapseGeometry = new THREE.BufferGeometry();
    synapseGeometry.setAttribute('position', new THREE.BufferAttribute(synapsePositions, 3));
    synapseGeometry.setAttribute('color', new THREE.BufferAttribute(synapseColors, 3));

    const synapseMaterial = new THREE.PointsMaterial({
      size: 0.42, // Larger glowing synapse stars
      map: createGlowTexture(),
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.0, // Initially invisible
    });

    const synapsePoints = new THREE.Points(synapseGeometry, synapseMaterial);

    // Establishing structural neural connections (Lines) between nearby synapse hubs
    const connections: { a: number; b: number }[] = [];
    const maxConnectDist = 2.1;
    for (let i = 0; i < numSynapses; i++) {
      const s1 = synapses[i];
      const dists = synapses.map((s2, idx) => ({
        idx,
        dist: Math.sqrt((s1.ox - s2.ox) ** 2 + (s1.oy - s2.oy) ** 2 + (s1.oz - s2.oz) ** 2)
      })).filter(item => item.idx !== i);

      dists.sort((a, b) => a.dist - b.dist);

      // Connect to up to 3 closest neighbors
      const numConn = Math.min(3, dists.length);
      for (let j = 0; j < numConn; j++) {
        if (dists[j].dist < maxConnectDist) {
          connections.push({ a: i, b: dists[j].idx });
        }
      }
    }

    const linePositions = new Float32Array(connections.length * 6);
    const lineColors = new Float32Array(connections.length * 6);
    const originalLineColors = new Float32Array(connections.length * 6);
    const diamondLineColors = new Float32Array(connections.length * 6);

    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      const sA = synapses[conn.a];
      const sB = synapses[conn.b];

      linePositions[i * 6] = sA.x;
      linePositions[i * 6 + 1] = sA.y;
      linePositions[i * 6 + 2] = sA.z;
      linePositions[i * 6 + 3] = sB.x;
      linePositions[i * 6 + 4] = sB.y;
      linePositions[i * 6 + 5] = sB.z;

      // High-tech neon gradient colors for connections
      const c1 = new THREE.Color('#01fefe');
      const c2 = new THREE.Color('#0155fe');

      lineColors[i * 6] = c1.r;
      lineColors[i * 6 + 1] = c1.g;
      lineColors[i * 6 + 2] = c1.b;
      lineColors[i * 6 + 3] = c2.r;
      lineColors[i * 6 + 4] = c2.g;
      lineColors[i * 6 + 5] = c2.b;

      originalLineColors[i * 6] = c1.r;
      originalLineColors[i * 6 + 1] = c1.g;
      originalLineColors[i * 6 + 2] = c1.b;
      originalLineColors[i * 6 + 3] = c2.r;
      originalLineColors[i * 6 + 4] = c2.g;
      originalLineColors[i * 6 + 5] = c2.b;

      const dc1 = new THREE.Color();
      const dc2 = new THREE.Color();
      const dSeed = Math.random();
      if (dSeed < 0.4) {
        dc1.set('#fffffe');
        dc2.set('#9af7ff');
      } else if (dSeed < 0.7) {
        dc1.set('#9af7ff');
        dc2.set('#fed1ff'); // prismatic pink
      } else {
        dc1.set('#01a2ff');
        dc2.set('#fffffe');
      }
      diamondLineColors[i * 6] = dc1.r;
      diamondLineColors[i * 6 + 1] = dc1.g;
      diamondLineColors[i * 6 + 2] = dc1.b;
      diamondLineColors[i * 6 + 3] = dc2.r;
      diamondLineColors[i * 6 + 4] = dc2.g;
      diamondLineColors[i * 6 + 5] = dc2.b;
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.0, // Initially invisible
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const neuralLines = new THREE.LineSegments(lineGeometry, lineMaterial);

    // Grouping all brain elements together so they scale & rotate as one unit
    const brainGroup = new THREE.Group();
    brainGroup.add(brainPoints);
    brainGroup.add(synapsePoints);
    brainGroup.add(neuralLines);

    brainGroup.rotation.y = Math.PI / 4.5;
    brainGroup.rotation.x = 0.15;
    brainGroup.scale.setScalar(0.1);

    scene.add(brainGroup);

    // 6c. 3D GLOWING HUMAN BONE (Femur bone structure for Phase 3)
    const {
      tempBonePositions,
      tempBoneColors,
      tempBoneAmberColors,
      totalBonePoints
    } = generateBoneParticles(createNoise3D);

    const boneGeometry = new THREE.BufferGeometry();
    const bonePositions = new Float32Array(tempBonePositions);
    const boneColors = new Float32Array(tempBoneColors);
    const originalBoneColors = new Float32Array(tempBoneColors);
    const amberBoneColors = new Float32Array(tempBoneAmberColors);

    boneGeometry.setAttribute('position', new THREE.BufferAttribute(bonePositions, 3));
    boneGeometry.setAttribute('color', new THREE.BufferAttribute(boneColors, 3));

    const boneMaterial = new THREE.PointsMaterial({
      size: 0.11,
      map: createRingTexture(),
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.0,
    });

    const bonePoints = new THREE.Points(boneGeometry, boneMaterial);

    const originalBonePositions = new Float32Array(bonePositions);
    const boneRepulsionOffsets = new Float32Array(totalBonePoints * 3);

    // Synapses
    const {
      boneSynapses,
      boneSynapsePositions,
      originalBoneSynapseColors,
      amberBoneSynapseColors,
      numBoneSynapses
    } = generateBoneSynapses(tempBonePositions, totalBonePoints);

    const boneSynapseGeometry = new THREE.BufferGeometry();
    boneSynapseGeometry.setAttribute('position', new THREE.BufferAttribute(boneSynapsePositions, 3));
    boneSynapseGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(originalBoneSynapseColors), 3));

    const boneSynapseMaterial = new THREE.PointsMaterial({
      size: 0.42,
      map: createGlowTexture(),
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.0,
    });

    const boneSynapsePoints = new THREE.Points(boneSynapseGeometry, boneSynapseMaterial);

    // Lines / Connections
    const {
      boneConnections,
      boneLinePositions,
      originalBoneLineColors,
      amberBoneLineColors
    } = generateBoneConnections(boneSynapses);

    const boneLineGeometry = new THREE.BufferGeometry();
    boneLineGeometry.setAttribute('position', new THREE.BufferAttribute(boneLinePositions, 3));
    boneLineGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(originalBoneLineColors), 3));

    const boneLineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const boneNeuralLines = new THREE.LineSegments(boneLineGeometry, boneLineMaterial);

    const boneGroup = new THREE.Group();
    boneGroup.add(bonePoints);
    boneGroup.add(boneSynapsePoints);
    boneGroup.add(boneNeuralLines);

    boneGroup.rotation.y = Math.PI / 6;
    boneGroup.rotation.x = 0.1;
    boneGroup.scale.setScalar(0.1);

    scene.add(boneGroup);

    // 6d. 3D GLOWING HUMAN SKULL (Human Head/Skull structure for Phase 4)
    const {
      tempSkullPositions,
      tempSkullColors,
      tempSkullAmberColors,
      totalSkullPoints
    } = generateSkullParticles(createNoise3D);

    const skullGeometry = new THREE.BufferGeometry();
    const skullPositions = new Float32Array(tempSkullPositions);
    const skullColors = new Float32Array(tempSkullColors);
    const originalSkullColors = new Float32Array(tempSkullColors);
    const amberSkullColors = new Float32Array(tempSkullAmberColors);

    skullGeometry.setAttribute('position', new THREE.BufferAttribute(skullPositions, 3));
    skullGeometry.setAttribute('color', new THREE.BufferAttribute(skullColors, 3));

    const skullMaterial = new THREE.PointsMaterial({
      size: 0.11,
      map: createRingTexture(),
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.0,
    });

    const skullPoints = new THREE.Points(skullGeometry, skullMaterial);

    const originalSkullPositions = new Float32Array(skullPositions);
    const skullRepulsionOffsets = new Float32Array(totalSkullPoints * 3);

    // Synapses
    const {
      skullSynapses,
      skullSynapsePositions,
      originalSkullSynapseColors,
      amberSkullSynapseColors,
      numSkullSynapses
    } = generateSkullSynapses(tempSkullPositions, totalSkullPoints);

    const skullSynapseGeometry = new THREE.BufferGeometry();
    skullSynapseGeometry.setAttribute('position', new THREE.BufferAttribute(skullSynapsePositions, 3));
    skullSynapseGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(originalSkullSynapseColors), 3));

    const skullSynapseMaterial = new THREE.PointsMaterial({
      size: 0.42,
      map: createGlowTexture(),
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.0,
    });

    const skullSynapsePoints = new THREE.Points(skullSynapseGeometry, skullSynapseMaterial);

    // Lines / Connections
    const {
      skullConnections,
      skullLinePositions,
      originalSkullLineColors,
      amberSkullLineColors
    } = generateSkullConnections(skullSynapses);

    const skullLineGeometry = new THREE.BufferGeometry();
    skullLineGeometry.setAttribute('position', new THREE.BufferAttribute(skullLinePositions, 3));
    skullLineGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(originalSkullLineColors), 3));

    const skullLineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const skullNeuralLines = new THREE.LineSegments(skullLineGeometry, skullLineMaterial);

    const skullGroup = new THREE.Group();
    skullGroup.add(skullPoints);
    skullGroup.add(skullSynapsePoints);
    skullGroup.add(skullNeuralLines);

    skullGroup.rotation.y = -Math.PI / 6;
    skullGroup.rotation.x = 0.05;
    skullGroup.scale.setScalar(0.1);

    scene.add(skullGroup);

    // 7. OUTER SCATTERED CLOUD (rotates on Y-axis)
    const particleCount = 14000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const originalPositions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const originalOuterColors = new Float32Array(particleCount * 3);
    const diamondOuterColors = new Float32Array(particleCount * 3);
    const amberOuterColors = new Float32Array(particleCount * 3);
    const purpleOuterColors = new Float32Array(particleCount * 3);

    const coreColor = new THREE.Color('#00fec8');
    const outerColor = new THREE.Color('#062d30');
    const maxRadius = 15;
    // FIX: hollow gap - nothing spawns closer than the brain + a margin
    const hollowGapRadius = 3.5 + 1.4;

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      let r = 0;

      const distributionSeed = Math.random();
      if (distributionSeed < 0.55) {
        // Structured halo/ring band (Gaussian)
        const u1 = Math.random() || 0.0001;
        const u2 = Math.random();
        const stdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
        r = maxRadius * (0.55 + stdNormal * 0.08);
      } else {
        // Soft outer ambient cloud
        r = hollowGapRadius + (maxRadius - hollowGapRadius) * Math.pow(Math.random(), 1.5);
      }

      // FIX: hard clamp so absolutely nothing can land inside the ring's hollow interior
      r = Math.max(r, hollowGapRadius);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      const rRatio = Math.min(r / maxRadius, 1.0);
      const particleColor = new THREE.Color();

      if (rRatio < 0.45) {
        const t = rRatio / 0.45;
        particleColor.lerpColors(coreColor, coreColor.clone().lerp(outerColor, 0.45), t);
      } else {
        const t = (rRatio - 0.45) / 0.55;
        particleColor.lerpColors(coreColor.clone().lerp(outerColor, 0.45), outerColor, t);
      }

      particleColor.r += (Math.random() - 0.5) * 0.03;
      particleColor.g += (Math.random() - 0.5) * 0.03;
      particleColor.b += (Math.random() - 0.5) * 0.03;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      originalPositions[i * 3] = x;
      originalPositions[i * 3 + 1] = y;
      originalPositions[i * 3 + 2] = z;

      colors[i * 3] = THREE.MathUtils.clamp(particleColor.r, 0, 1);
      colors[i * 3 + 1] = THREE.MathUtils.clamp(particleColor.g, 0, 1);
      colors[i * 3 + 2] = THREE.MathUtils.clamp(particleColor.b, 0, 1);

      originalOuterColors[i * 3] = colors[i * 3];
      originalOuterColors[i * 3 + 1] = colors[i * 3 + 1];
      originalOuterColors[i * 3 + 2] = colors[i * 3 + 2];

       const dc = new THREE.Color();
      const dSeed = Math.random();
      if (dSeed < 0.1) {
        dc.set('#fffffe'); // brilliant white sparkle
      } else if (dSeed < 0.4) {
        dc.set('#c9faff'); // icy diamond blue
      } else if (dSeed < 0.7) {
        dc.set('#01fed5'); // bright cyan
      } else if (dSeed < 0.85) {
        dc.set('#e9ccff'); // crystal lavender
      } else {
        dc.set('#031c25'); // deep space black-blue
      }
      diamondOuterColors[i * 3] = dc.r;
      diamondOuterColors[i * 3 + 1] = dc.g;
      diamondOuterColors[i * 3 + 2] = dc.b;

      const ac = new THREE.Color();
      const aSeed = Math.random();
      if (aSeed < 0.1) {
        ac.set('#fffffe'); // brilliant white sparkle
      } else if (aSeed < 0.4) {
        ac.set('#ff4c6c'); // glowing pinkish red
      } else if (aSeed < 0.7) {
        ac.set('#ff003c'); // vibrant crimson red
      } else if (aSeed < 0.85) {
        ac.set('#cc0001'); // deep red
      } else {
        ac.set('#1a0102'); // deep dark celestial space red-black
      }
      amberOuterColors[i * 3] = ac.r;
      amberOuterColors[i * 3 + 1] = ac.g;
      amberOuterColors[i * 3 + 2] = ac.b;

      const pc = new THREE.Color();
      const pSeed = Math.random();
      if (pSeed < 0.1) {
        pc.set('#fffffe'); // brilliant white sparkle
      } else if (pSeed < 0.4) {
        pc.set('#e0abff'); // glowing lavender orchid
      } else if (pSeed < 0.7) {
        pc.set('#9d4edd'); // neon violet/purple
      } else if (pSeed < 0.85) {
        pc.set('#ff01aa'); // vibrant magenta
      } else {
        pc.set('#11011a'); // deep dark celestial space purple-black
      }
      purpleOuterColors[i * 3] = pc.r;
      purpleOuterColors[i * 3 + 1] = pc.g;
      purpleOuterColors[i * 3 + 2] = pc.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.26,
      map: createGlowTexture(),
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Mouse Interaction State
    const mouse2D = new THREE.Vector2(-9999, -9999);
    const mouse3D = new THREE.Vector3(-9999, -9999, -9999);
    let isMouseActive = false;

    const onMouseMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse2D.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse2D.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      isMouseActive = true;
    };

    const onMouseLeave = () => {
      isMouseActive = false;
      mouse2D.set(-9999, -9999);
    };

    window.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseleave', onMouseLeave);

    // Scroll state tracking
    let targetScrollProgress = 0;
    let currentScrollProgress = 0;

    const onScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight > 0) {
        targetScrollProgress = window.scrollY / scrollHeight;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    const repulsionOffsets = new Float32Array(particleCount * 3);

    const noise3D = createNoise3D();
    const clock = new THREE.Clock();
    let animationFrameId: number;
    let lastColorProgress = -1;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Smoothly interpolate scroll progress for liquid motion
      currentScrollProgress += (targetScrollProgress - currentScrollProgress) * 0.08;

      // --- PHASE 1: Cyber-Mask Animation ---
      const normalizedMaskProgress = Math.min(1.0, currentScrollProgress / 0.20);
      const maskScale = 1.0 + normalizedMaskProgress * 6.5;
      maskPoints.scale.setScalar(maskScale);

      let currentMaskOpacity = 0.0;
      if (currentScrollProgress < 0.26) {
        const fadeProgress = Math.min(1.0, Math.max(0.0, (currentScrollProgress - 0.10) / 0.14));
        currentMaskOpacity = 0.9 * (1.0 - fadeProgress);
      }
      maskMaterial.opacity = currentMaskOpacity;

      // --- TEXT: Screen 1 Text (Human Synthesis) Animation ---
      let textOpacity = 1.0;
      let translateY = 0;
      if (currentScrollProgress >= 0.10) {
        const textScrollFactor = Math.min(1.0, (currentScrollProgress - 0.10) / 0.14);
        textOpacity = Math.max(0.0, 1.0 - textScrollFactor * 1.5);
        translateY = -textScrollFactor * 600;
      }

      if (bottomTextRef.current) {
        bottomTextRef.current.style.opacity = textOpacity.toString();
        bottomTextRef.current.style.transform = `translateY(${translateY}px)`;
        if (textOpacity > 0.1) {
          bottomTextRef.current.style.pointerEvents = 'auto';
        } else {
          bottomTextRef.current.style.pointerEvents = 'none';
        }
      }

      // --- PHASE 2: Brain smoothly scales, fades in, and then zooms out and fades out ---
      let brainProgress = 0.0;
      let brainOpacity = 0.0;
      let brainScale = 0.1;
      
      if (currentScrollProgress >= 0.26 && currentScrollProgress < 0.44) {
        const t = (currentScrollProgress - 0.26) / 0.18;
        brainProgress = t;
        brainOpacity = 0.9 * t;
        brainScale = 0.1 + t * 1.65;
      } else if (currentScrollProgress >= 0.44 && currentScrollProgress < 0.52) {
        brainProgress = 1.0;
        brainOpacity = 0.9;
        brainScale = 1.75;
      } else if (currentScrollProgress >= 0.52 && currentScrollProgress < 0.64) {
        const t = (currentScrollProgress - 0.52) / 0.12;
        brainProgress = 1.0 - t;
        brainOpacity = 0.9 * (1.0 - t);
        brainScale = 1.75 + t * 4.5;
      } else if (currentScrollProgress >= 0.64) {
        brainProgress = 0.0;
        brainOpacity = 0.0;
        brainScale = 6.25;
      }

      brainGroup.scale.setScalar(brainScale);
      brainMaterial.opacity = brainOpacity;
      synapseMaterial.opacity = brainProgress;
      lineMaterial.opacity = 0.55 * brainProgress;

      // --- DIAMOND TEXT: Fade-in and slide-up/down in sync with Diamond Shape ---
      let diamondTextOpacity = 0.0;
      let diamondTextTranslateY = 40;
      if (currentScrollProgress >= 0.26 && currentScrollProgress < 0.52) {
        const t = Math.min(1.0, (currentScrollProgress - 0.26) / 0.18);
        diamondTextOpacity = t;
        diamondTextTranslateY = 40 * (1.0 - t);
      } else if (currentScrollProgress >= 0.52 && currentScrollProgress < 0.64) {
        const t = Math.min(1.0, (currentScrollProgress - 0.52) / 0.12);
        diamondTextOpacity = Math.max(0.0, 1.0 - t * 1.5);
        diamondTextTranslateY = -t * 600;
      }

      if (diamondTextRef.current) {
        diamondTextRef.current.style.opacity = diamondTextOpacity.toString();
        diamondTextRef.current.style.transform = `translateY(${diamondTextTranslateY}px)`;
        if (diamondTextOpacity > 0.1) {
          diamondTextRef.current.style.pointerEvents = 'auto';
        } else {
          diamondTextRef.current.style.pointerEvents = 'none';
        }
      }

      // --- PHASE 3: Human Bone smoothly scales and fades in, then zooms out/fades out ---
      let boneProgress = 0.0;
      let boneOpacity = 0.0;
      let boneScale = 0.1;
      
      if (currentScrollProgress >= 0.62 && currentScrollProgress < 0.78) {
        const t = (currentScrollProgress - 0.62) / 0.16;
        boneProgress = t;
        boneOpacity = 0.95 * t;
        boneScale = 0.1 + t * 1.55;
      } else if (currentScrollProgress >= 0.78 && currentScrollProgress < 0.84) {
        boneProgress = 1.0;
        boneOpacity = 0.95;
        boneScale = 1.65;
      } else if (currentScrollProgress >= 0.84 && currentScrollProgress < 0.92) {
        const t = (currentScrollProgress - 0.84) / 0.08;
        boneProgress = 1.0 - t;
        boneOpacity = 0.95 * (1.0 - t);
        boneScale = 1.65 + t * 4.5;
      } else if (currentScrollProgress >= 0.92) {
        boneProgress = 0.0;
        boneOpacity = 0.0;
        boneScale = 6.15;
      }

      boneGroup.scale.setScalar(boneScale);
      boneMaterial.opacity = boneOpacity;
      boneSynapseMaterial.opacity = boneProgress;
      boneLineMaterial.opacity = 0.55 * boneProgress;

      // --- BONE TEXT: Fade-in and slide-up/down in sync with Human Bone Shape ---
      let boneTextOpacity = 0.0;
      let boneTextTranslateY = 40;
      if (currentScrollProgress >= 0.62 && currentScrollProgress < 0.84) {
        const t = Math.min(1.0, (currentScrollProgress - 0.62) / 0.16);
        boneTextOpacity = t;
        boneTextTranslateY = 40 * (1.0 - t);
      } else if (currentScrollProgress >= 0.84 && currentScrollProgress < 0.92) {
        const t = Math.min(1.0, (currentScrollProgress - 0.84) / 0.08);
        boneTextOpacity = Math.max(0.0, 1.0 - t * 1.5);
        boneTextTranslateY = -t * 600;
      }

      if (boneTextRef.current) {
        boneTextRef.current.style.opacity = boneTextOpacity.toString();
        boneTextRef.current.style.transform = `translateY(${boneTextTranslateY}px)`;
        if (boneTextOpacity > 0.1) {
          boneTextRef.current.style.pointerEvents = 'auto';
        } else {
          boneTextRef.current.style.pointerEvents = 'none';
        }
      }

      // --- PHASE 4: Human Head/Skull smoothly scales and fades in ---
      let skullProgress = 0.0;
      let skullOpacity = 0.0;
      let skullScale = 0.1;

      if (currentScrollProgress >= 0.90 && currentScrollProgress < 0.98) {
        const t = (currentScrollProgress - 0.90) / 0.08;
        skullProgress = t;
        skullOpacity = 0.95 * t;
        skullScale = 0.1 + t * 1.60;
      } else if (currentScrollProgress >= 0.98) {
        skullProgress = 1.0;
        skullOpacity = 0.95;
        skullScale = 1.70;
      }

      skullGroup.scale.setScalar(skullScale);
      skullMaterial.opacity = skullOpacity;
      skullSynapseMaterial.opacity = skullProgress;
      skullLineMaterial.opacity = 0.55 * skullProgress;

      // --- SKULL TEXT: Fade-in and slide-up in sync with Skull Shape ---
      let skullTextOpacity = 0.0;
      let skullTextTranslateY = 40;
      if (currentScrollProgress >= 0.90) {
        const t = Math.min(1.0, (currentScrollProgress - 0.90) / 0.08);
        skullTextOpacity = t;
        skullTextTranslateY = 40 * (1.0 - t);
      }

      if (skullTextRef.current) {
        skullTextRef.current.style.opacity = skullTextOpacity.toString();
        skullTextRef.current.style.transform = `translateY(${skullTextTranslateY}px)`;
        if (skullTextOpacity > 0.1) {
          skullTextRef.current.style.pointerEvents = 'auto';
        } else {
          skullTextRef.current.style.pointerEvents = 'none';
        }
      }

      // --- Dynamic color morphing into beautiful colors along with scrolling ---
      if (Math.abs(currentScrollProgress - lastColorProgress) > 0.001) {
        lastColorProgress = currentScrollProgress;

        // 1. Interpolate outer cloud background dots
        const oColAttr = geometry.attributes.color;
        const oColArr = oColAttr.array as Float32Array;
        
        if (currentScrollProgress < 0.30) {
          for (let i = 0; i < oColArr.length; i++) {
            oColArr[i] = originalOuterColors[i];
          }
        } else if (currentScrollProgress < 0.45) {
          const t = (currentScrollProgress - 0.30) / 0.15;
          for (let i = 0; i < oColArr.length; i++) {
            oColArr[i] = originalOuterColors[i] + (diamondOuterColors[i] - originalOuterColors[i]) * t;
          }
        } else if (currentScrollProgress < 0.62) {
          for (let i = 0; i < oColArr.length; i++) {
            oColArr[i] = diamondOuterColors[i];
          }
        } else if (currentScrollProgress < 0.82) {
          const t = (currentScrollProgress - 0.62) / 0.20;
          for (let i = 0; i < oColArr.length; i++) {
            oColArr[i] = diamondOuterColors[i] + (amberOuterColors[i] - diamondOuterColors[i]) * t;
          }
        } else if (currentScrollProgress < 0.90) {
          for (let i = 0; i < oColArr.length; i++) {
            oColArr[i] = amberOuterColors[i];
          }
        } else if (currentScrollProgress < 0.98) {
          const t = (currentScrollProgress - 0.90) / 0.08;
          for (let i = 0; i < oColArr.length; i++) {
            oColArr[i] = amberOuterColors[i] + (purpleOuterColors[i] - amberOuterColors[i]) * t;
          }
        } else {
          for (let i = 0; i < oColArr.length; i++) {
            oColArr[i] = purpleOuterColors[i];
          }
        }
        oColAttr.needsUpdate = true;
        
        // 2. Interpolate brain surface and stem points (Phase 2 fade-in morph)
        if (currentScrollProgress >= 0.26 && currentScrollProgress < 0.44) {
          const t = Math.min(1.0, (currentScrollProgress - 0.26) / 0.18);
          const bColAttr = brainGeometry.attributes.color;
          const bColArr = bColAttr.array as Float32Array;
          for (let i = 0; i < bColArr.length; i++) {
            bColArr[i] = originalBrainColors[i] + (diamondBrainColors[i] - originalBrainColors[i]) * t;
          }
          bColAttr.needsUpdate = true;
          
          const sColAttr = synapseGeometry.attributes.color;
          const sColArr = sColAttr.array as Float32Array;
          for (let i = 0; i < sColArr.length; i++) {
            sColArr[i] = originalSynapseColors[i] + (diamondSynapseColors[i] - originalSynapseColors[i]) * t;
          }
          sColAttr.needsUpdate = true;
          
          const lColAttr = lineGeometry.attributes.color;
          const lColArr = lColAttr.array as Float32Array;
          for (let i = 0; i < lColArr.length; i++) {
            lColArr[i] = originalLineColors[i] + (diamondLineColors[i] - originalLineColors[i]) * t;
          }
          lColAttr.needsUpdate = true;
        }

        // 3. Interpolate bone surface and connections (Phase 3 fade-in morph)
        if (currentScrollProgress >= 0.62 && currentScrollProgress < 0.78) {
          const t = Math.min(1.0, (currentScrollProgress - 0.62) / 0.16);
          const boneColAttr = boneGeometry.attributes.color;
          const boneColArr = boneColAttr.array as Float32Array;
          for (let i = 0; i < boneColArr.length; i++) {
            boneColArr[i] = originalBoneColors[i] + (amberBoneColors[i] - originalBoneColors[i]) * t;
          }
          boneColAttr.needsUpdate = true;

          const bsColAttr = boneSynapseGeometry.attributes.color;
          const bsColArr = bsColAttr.array as Float32Array;
          for (let i = 0; i < bsColArr.length; i++) {
            bsColArr[i] = originalBoneSynapseColors[i] + (amberBoneSynapseColors[i] - originalBoneSynapseColors[i]) * t;
          }
          bsColAttr.needsUpdate = true;

          const blColAttr = boneLineGeometry.attributes.color;
          const blColArr = blColAttr.array as Float32Array;
          for (let i = 0; i < blColArr.length; i++) {
            blColArr[i] = originalBoneLineColors[i] + (amberBoneLineColors[i] - originalBoneLineColors[i]) * t;
          }
          blColAttr.needsUpdate = true;
        }

        // 4. Interpolate skull surface and connections (Phase 4 fade-in morph)
        if (currentScrollProgress >= 0.90 && currentScrollProgress < 0.98) {
          const t = Math.min(1.0, (currentScrollProgress - 0.90) / 0.08);
          const skullColAttr = skullGeometry.attributes.color;
          const skullColArr = skullColAttr.array as Float32Array;
          for (let i = 0; i < skullColArr.length; i++) {
            skullColArr[i] = originalSkullColors[i] + (amberSkullColors[i] - originalSkullColors[i]) * t;
          }
          skullColAttr.needsUpdate = true;

          const sksColAttr = skullSynapseGeometry.attributes.color;
          const sksColArr = sksColAttr.array as Float32Array;
          for (let i = 0; i < sksColArr.length; i++) {
            sksColArr[i] = originalSkullSynapseColors[i] + (amberSkullSynapseColors[i] - originalSkullSynapseColors[i]) * t;
          }
          sksColAttr.needsUpdate = true;

          const sklColAttr = skullLineGeometry.attributes.color;
          const sklColArr = sklColAttr.array as Float32Array;
          for (let i = 0; i < sklColArr.length; i++) {
            sklColArr[i] = originalSkullLineColors[i] + (amberSkullLineColors[i] - originalSkullLineColors[i]) * t;
          }
          sklColAttr.needsUpdate = true;
        }
      }

      // Rotate the outer star cloud on the Y-axis
      points.rotation.y += 0.001;
      
      // Smooth interactive mouse-based rotation/tilt for the mask (if visible)
      if (currentMaskOpacity > 0.01) {
        const targetMaskRotY = isMouseActive ? mouse2D.x * 0.22 : 0;
        const targetMaskRotX = isMouseActive ? -mouse2D.y * 0.22 : 0;
        maskPoints.rotation.y += (targetMaskRotY - maskPoints.rotation.y) * 0.06;
        maskPoints.rotation.x += (targetMaskRotX - maskPoints.rotation.x) * 0.06;
        maskPoints.rotation.z += (0 - maskPoints.rotation.z) * 0.06;
      }

      // --- Smooth interactive mouse-based rotation/tilt for the entire brain group (if visible) ---
      if (brainProgress > 0.01) {
        const baseRotY = -Math.PI / 4.5; // Three-quarters profile view
        const baseRotX = 0.08;
        const targetBrainRotY = baseRotY + (isMouseActive ? mouse2D.x * 0.3 : 0);
        const targetBrainRotX = baseRotX + (isMouseActive ? -mouse2D.y * 0.3 : 0);
        brainGroup.rotation.y += (targetBrainRotY - brainGroup.rotation.y) * 0.06;
        brainGroup.rotation.x += (targetBrainRotX - brainGroup.rotation.x) * 0.06;
      }

      // --- Smooth interactive mouse-based rotation/tilt for the entire bone group (if visible) ---
      if (boneProgress > 0.01) {
        const baseRotY = Math.PI / 6;
        const baseRotX = 0.1;
        const targetBoneRotY = baseRotY + (isMouseActive ? mouse2D.x * 0.35 : 0);
        const targetBoneRotX = baseRotX + (isMouseActive ? -mouse2D.y * 0.35 : 0);
        boneGroup.rotation.y += (targetBoneRotY - boneGroup.rotation.y) * 0.06;
        boneGroup.rotation.x += (targetBoneRotX - boneGroup.rotation.x) * 0.06;
      }

      // --- Smooth interactive mouse-based rotation/tilt for the entire skull group (if visible) ---
      if (skullProgress > 0.01) {
        const baseRotY = -Math.PI / 6;
        const baseRotX = 0.05;
        const targetSkullRotY = baseRotY + (isMouseActive ? mouse2D.x * 0.35 : 0);
        const targetSkullRotX = baseRotX + (isMouseActive ? -mouse2D.y * 0.35 : 0);
        skullGroup.rotation.y += (targetSkullRotY - skullGroup.rotation.y) * 0.06;
        skullGroup.rotation.x += (targetSkullRotX - skullGroup.rotation.x) * 0.06;
      }

      // Capture and interpolate mouse 3D position
      if (isMouseActive) {
        const tempVec = new THREE.Vector3(mouse2D.x, mouse2D.y, 0.5);
        tempVec.unproject(camera);
        const dir = tempVec.sub(camera.position).normalize();
        const distance = -camera.position.z / dir.z;
        const targetMouse3D = camera.position.clone().add(dir.multiplyScalar(distance));
        mouse3D.lerp(targetMouse3D, 0.1);
      } else {
        mouse3D.lerp(new THREE.Vector3(-9999, -9999, -9999), 0.1);
      }

      const elapsed = clock.getElapsedTime();

      // --- Interactive Hover for Cyber-Mask particles ---
      if (currentMaskOpacity > 0.01) {
        const localMaskMouse3D = new THREE.Vector3().copy(mouse3D);
        maskPoints.worldToLocal(localMaskMouse3D);

        const maskPositionsAttr = maskGeometry.attributes.position;
        const maskPosArray = maskPositionsAttr.array as Float32Array;
        const maxMaskRepulsionDist = 6.0;

        for (let i = 0; i < maskParticleCount; i++) {
          const idx = i * 3;
          const ox = originalMaskPositions[idx];
          const oy = originalMaskPositions[idx + 1];
          const oz = originalMaskPositions[idx + 2];

          const vx = ox - localMaskMouse3D.x;
          const vy = oy - localMaskMouse3D.y;
          const vz = oz - localMaskMouse3D.z;
          const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);

          let targetRx = 0;
          let targetRy = 0;
          let targetRz = 0;

          if (dist < maxMaskRepulsionDist && dist > 0.01) {
            const force = 1.0 - dist / maxMaskRepulsionDist;
            const strength = force * force * 3.2;
            const wave = Math.sin(elapsed * 7.5 + dist * 4.0) * 0.35 * force;

            targetRx = (vx / dist) * (strength + wave);
            targetRy = (vy / dist) * (strength + wave);
            targetRz = (vz / dist) * (strength + wave);
          }

          const lerpFactor = 0.12;
          maskRepulsionOffsets[idx] += (targetRx - maskRepulsionOffsets[idx]) * lerpFactor;
          maskRepulsionOffsets[idx + 1] += (targetRy - maskRepulsionOffsets[idx + 1]) * lerpFactor;
          maskRepulsionOffsets[idx + 2] += (targetRz - maskRepulsionOffsets[idx + 2]) * lerpFactor;

          maskPosArray[idx] = ox + maskRepulsionOffsets[idx];
          maskPosArray[idx + 1] = oy + maskRepulsionOffsets[idx + 1];
          maskPosArray[idx + 2] = oz + maskRepulsionOffsets[idx + 2];
        }
        maskPositionsAttr.needsUpdate = true;
      }

      // --- Interactive Hover for Brain Surface & Stem particles ---
      if (brainProgress > 0.01) {
        const localBrainMouse3D = new THREE.Vector3().copy(mouse3D);
        brainPoints.worldToLocal(localBrainMouse3D);

        const brainPositionsAttr = brainGeometry.attributes.position;
        const brainPosArray = brainPositionsAttr.array as Float32Array;
        const maxBrainRepulsionDist = 6.0;

        for (let i = 0; i < brainParticleCount; i++) {
          const idx = i * 3;
          const ox = originalBrainPositions[idx];
          const oy = originalBrainPositions[idx + 1];
          const oz = originalBrainPositions[idx + 2];

          const vx = ox - localBrainMouse3D.x;
          const vy = oy - localBrainMouse3D.y;
          const vz = oz - localBrainMouse3D.z;
          const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);

          let targetRx = 0;
          let targetRy = 0;
          let targetRz = 0;

          if (dist < maxBrainRepulsionDist && dist > 0.01) {
            const force = 1.0 - dist / maxBrainRepulsionDist;
            // Create smooth elastic wave movement on hover
            const strength = force * force * 3.2;
            const wave = Math.sin(elapsed * 7.5 + dist * 4.0) * 0.35 * force;

            targetRx = (vx / dist) * (strength + wave);
            targetRy = (vy / dist) * (strength + wave);
            targetRz = (vz / dist) * (strength + wave);
          }

          const lerpFactor = 0.12;
          brainRepulsionOffsets[idx] += (targetRx - brainRepulsionOffsets[idx]) * lerpFactor;
          brainRepulsionOffsets[idx + 1] += (targetRy - brainRepulsionOffsets[idx + 1]) * lerpFactor;
          brainRepulsionOffsets[idx + 2] += (targetRz - brainRepulsionOffsets[idx + 2]) * lerpFactor;

          brainPosArray[idx] = ox + brainRepulsionOffsets[idx];
          brainPosArray[idx + 1] = oy + brainRepulsionOffsets[idx + 1];
          brainPosArray[idx + 2] = oz + brainRepulsionOffsets[idx + 2];
        }
        brainPositionsAttr.needsUpdate = true;

        // --- Interactive Hover for Brain Synapses & Connecting Paths ---
        const localSynapseMouse3D = new THREE.Vector3().copy(mouse3D);
        synapsePoints.worldToLocal(localSynapseMouse3D);

        const synapsePositionsAttr = synapseGeometry.attributes.position;
        const synapsePosArray = synapsePositionsAttr.array as Float32Array;

        const linePositionsAttr = lineGeometry.attributes.position;
        const linePosArray = linePositionsAttr.array as Float32Array;

        for (let i = 0; i < numSynapses; i++) {
          const s = synapses[i];
          const vx = s.ox - localSynapseMouse3D.x;
          const vy = s.oy - localSynapseMouse3D.y;
          const vz = s.oz - localSynapseMouse3D.z;
          const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);

          let targetRx = 0;
          let targetRy = 0;
          let targetRz = 0;

          if (dist < maxBrainRepulsionDist && dist > 0.01) {
            const force = 1.0 - dist / maxBrainRepulsionDist;
            const strength = force * force * 3.2;
            const wave = Math.sin(elapsed * 7.5 + dist * 4.0) * 0.35 * force;

            targetRx = (vx / dist) * (strength + wave);
            targetRy = (vy / dist) * (strength + wave);
            targetRz = (vz / dist) * (strength + wave);
          }

          const lerpFactor = 0.12;
          s.rx += (targetRx - s.rx) * lerpFactor;
          s.ry += (targetRy - s.ry) * lerpFactor;
          s.rz += (targetRz - s.rz) * lerpFactor;

          s.x = s.ox + s.rx;
          s.y = s.oy + s.ry;
          s.z = s.oz + s.rz;

          synapsePosArray[i * 3] = s.x;
          synapsePosArray[i * 3 + 1] = s.y;
          synapsePosArray[i * 3 + 2] = s.z;
        }
        synapsePositionsAttr.needsUpdate = true;

        // Update the neural lines connecting the synapses
        for (let i = 0; i < connections.length; i++) {
          const conn = connections[i];
          const sA = synapses[conn.a];
          const sB = synapses[conn.b];

          linePosArray[i * 6] = sA.x;
          linePosArray[i * 6 + 1] = sA.y;
          linePosArray[i * 6 + 2] = sA.z;
          linePosArray[i * 6 + 3] = sB.x;
          linePosArray[i * 6 + 4] = sB.y;
          linePosArray[i * 6 + 5] = sB.z;
        }
        linePositionsAttr.needsUpdate = true;
      }

      // --- Interactive Hover for Bone Surface & Synapse particles ---
      if (boneProgress > 0.01) {
        const localBoneMouse3D = new THREE.Vector3().copy(mouse3D);
        bonePoints.worldToLocal(localBoneMouse3D);

        const bonePositionsAttr = boneGeometry.attributes.position;
        const bonePosArray = bonePositionsAttr.array as Float32Array;
        const maxBoneRepulsionDist = 6.0;

        for (let i = 0; i < totalBonePoints; i++) {
          const idx = i * 3;
          const ox = originalBonePositions[idx];
          const oy = originalBonePositions[idx + 1];
          const oz = originalBonePositions[idx + 2];

          const vx = ox - localBoneMouse3D.x;
          const vy = oy - localBoneMouse3D.y;
          const vz = oz - localBoneMouse3D.z;
          const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);

          let targetRx = 0;
          let targetRy = 0;
          let targetRz = 0;

          if (dist < maxBoneRepulsionDist && dist > 0.01) {
            const force = 1.0 - dist / maxBoneRepulsionDist;
            const strength = force * force * 3.2;
            const wave = Math.sin(elapsed * 7.5 + dist * 4.0) * 0.35 * force;

            targetRx = (vx / dist) * (strength + wave);
            targetRy = (vy / dist) * (strength + wave);
            targetRz = (vz / dist) * (strength + wave);
          }

          const lerpFactor = 0.12;
          boneRepulsionOffsets[idx] += (targetRx - boneRepulsionOffsets[idx]) * lerpFactor;
          boneRepulsionOffsets[idx + 1] += (targetRy - boneRepulsionOffsets[idx + 1]) * lerpFactor;
          boneRepulsionOffsets[idx + 2] += (targetRz - boneRepulsionOffsets[idx + 2]) * lerpFactor;

          bonePosArray[idx] = ox + boneRepulsionOffsets[idx];
          bonePosArray[idx + 1] = oy + boneRepulsionOffsets[idx + 1];
          bonePosArray[idx + 2] = oz + boneRepulsionOffsets[idx + 2];
        }
        bonePositionsAttr.needsUpdate = true;

        const localBoneSynapseMouse3D = new THREE.Vector3().copy(mouse3D);
        boneSynapsePoints.worldToLocal(localBoneSynapseMouse3D);

        const boneSynapsePositionsAttr = boneSynapseGeometry.attributes.position;
        const boneSynapsePosArray = boneSynapsePositionsAttr.array as Float32Array;

        const boneLinePositionsAttr = boneLineGeometry.attributes.position;
        const boneLinePosArray = boneLinePositionsAttr.array as Float32Array;

        for (let i = 0; i < numBoneSynapses; i++) {
          const s = boneSynapses[i];
          const vx = s.ox - localBoneSynapseMouse3D.x;
          const vy = s.oy - localBoneSynapseMouse3D.y;
          const vz = s.oz - localBoneSynapseMouse3D.z;
          const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);

          let targetRx = 0;
          let targetRy = 0;
          let targetRz = 0;

          if (dist < maxBoneRepulsionDist && dist > 0.01) {
            const force = 1.0 - dist / maxBoneRepulsionDist;
            const strength = force * force * 3.2;
            const wave = Math.sin(elapsed * 7.5 + dist * 4.0) * 0.35 * force;

            targetRx = (vx / dist) * (strength + wave);
            targetRy = (vy / dist) * (strength + wave);
            targetRz = (vz / dist) * (strength + wave);
          }

          const lerpFactor = 0.12;
          s.rx += (targetRx - s.rx) * lerpFactor;
          s.ry += (targetRy - s.ry) * lerpFactor;
          s.rz += (targetRz - s.rz) * lerpFactor;

          s.x = s.ox + s.rx;
          s.y = s.oy + s.ry;
          s.z = s.oz + s.rz;

          boneSynapsePosArray[i * 3] = s.x;
          boneSynapsePosArray[i * 3 + 1] = s.y;
          boneSynapsePosArray[i * 3 + 2] = s.z;
        }
        boneSynapsePositionsAttr.needsUpdate = true;

        for (let i = 0; i < boneConnections.length; i++) {
          const conn = boneConnections[i];
          const sA = boneSynapses[conn.a];
          const sB = boneSynapses[conn.b];

          boneLinePosArray[i * 6] = sA.x;
          boneLinePosArray[i * 6 + 1] = sA.y;
          boneLinePosArray[i * 6 + 2] = sA.z;
          boneLinePosArray[i * 6 + 3] = sB.x;
          boneLinePosArray[i * 6 + 4] = sB.y;
          boneLinePosArray[i * 6 + 5] = sB.z;
        }
        boneLinePositionsAttr.needsUpdate = true;
      }

      // --- Interactive Hover for Skull Surface & Synapse particles ---
      if (skullProgress > 0.01) {
        const localSkullMouse3D = new THREE.Vector3().copy(mouse3D);
        skullPoints.worldToLocal(localSkullMouse3D);

        const skullPositionsAttr = skullGeometry.attributes.position;
        const skullPosArray = skullPositionsAttr.array as Float32Array;
        const maxSkullRepulsionDist = 6.0;

        for (let i = 0; i < totalSkullPoints; i++) {
          const idx = i * 3;
          const ox = originalSkullPositions[idx];
          const oy = originalSkullPositions[idx + 1];
          const oz = originalSkullPositions[idx + 2];

          const vx = ox - localSkullMouse3D.x;
          const vy = oy - localSkullMouse3D.y;
          const vz = oz - localSkullMouse3D.z;
          const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);

          let targetRx = 0;
          let targetRy = 0;
          let targetRz = 0;

          if (dist < maxSkullRepulsionDist && dist > 0.01) {
            const force = 1.0 - dist / maxSkullRepulsionDist;
            const strength = force * force * 3.2;
            const wave = Math.sin(elapsed * 7.5 + dist * 4.0) * 0.35 * force;

            targetRx = (vx / dist) * (strength + wave);
            targetRy = (vy / dist) * (strength + wave);
            targetRz = (vz / dist) * (strength + wave);
          }

          const lerpFactor = 0.12;
          skullRepulsionOffsets[idx] += (targetRx - skullRepulsionOffsets[idx]) * lerpFactor;
          skullRepulsionOffsets[idx + 1] += (targetRy - skullRepulsionOffsets[idx + 1]) * lerpFactor;
          skullRepulsionOffsets[idx + 2] += (targetRz - skullRepulsionOffsets[idx + 2]) * lerpFactor;

          skullPosArray[idx] = ox + skullRepulsionOffsets[idx];
          skullPosArray[idx + 1] = oy + skullRepulsionOffsets[idx + 1];
          skullPosArray[idx + 2] = oz + skullRepulsionOffsets[idx + 2];
        }
        skullPositionsAttr.needsUpdate = true;

        const localSkullSynapseMouse3D = new THREE.Vector3().copy(mouse3D);
        skullSynapsePoints.worldToLocal(localSkullSynapseMouse3D);

        const skullSynapsePositionsAttr = skullSynapseGeometry.attributes.position;
        const skullSynapsePosArray = skullSynapsePositionsAttr.array as Float32Array;

        const skullLinePositionsAttr = skullLineGeometry.attributes.position;
        const skullLinePosArray = skullLinePositionsAttr.array as Float32Array;

        for (let i = 0; i < numSkullSynapses; i++) {
          const s = skullSynapses[i];
          const vx = s.ox - localSkullSynapseMouse3D.x;
          const vy = s.oy - localSkullSynapseMouse3D.y;
          const vz = s.oz - localSkullSynapseMouse3D.z;
          const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);

          let targetRx = 0;
          let targetRy = 0;
          let targetRz = 0;

          if (dist < maxSkullRepulsionDist && dist > 0.01) {
            const force = 1.0 - dist / maxSkullRepulsionDist;
            const strength = force * force * 3.2;
            const wave = Math.sin(elapsed * 7.5 + dist * 4.0) * 0.35 * force;

            targetRx = (vx / dist) * (strength + wave);
            targetRy = (vy / dist) * (strength + wave);
            targetRz = (vz / dist) * (strength + wave);
          }

          const lerpFactor = 0.12;
          s.rx += (targetRx - s.rx) * lerpFactor;
          s.ry += (targetRy - s.ry) * lerpFactor;
          s.rz += (targetRz - s.rz) * lerpFactor;

          s.x = s.ox + s.rx;
          s.y = s.oy + s.ry;
          s.z = s.oz + s.rz;

          skullSynapsePosArray[i * 3] = s.x;
          skullSynapsePosArray[i * 3 + 1] = s.y;
          skullSynapsePosArray[i * 3 + 2] = s.z;
        }
        skullSynapsePositionsAttr.needsUpdate = true;

        for (let i = 0; i < skullConnections.length; i++) {
          const conn = skullConnections[i];
          const sA = skullSynapses[conn.a];
          const sB = skullSynapses[conn.b];

          skullLinePosArray[i * 6] = sA.x;
          skullLinePosArray[i * 6 + 1] = sA.y;
          skullLinePosArray[i * 6 + 2] = sA.z;
          skullLinePosArray[i * 6 + 3] = sB.x;
          skullLinePosArray[i * 6 + 4] = sB.y;
          skullLinePosArray[i * 6 + 5] = sB.z;
        }
        skullLinePositionsAttr.needsUpdate = true;
      }

      // --- Interactive Hover for Outer Cloud Dots ---
      const localMouse3D = new THREE.Vector3().copy(mouse3D);
      points.worldToLocal(localMouse3D);

      const tOffset = elapsed * 0.25;
      const positionsAttr = geometry.attributes.position;
      const posArray = positionsAttr.array as Float32Array;
      const noiseScale = 0.085;
      const drift = 0.35;
      const maxRepulsionDist = 9.0;
      const spreadFactor = 1.0 + currentScrollProgress * 1.6;

      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3;
        const ox = originalPositions[idx];
        const oy = originalPositions[idx + 1];
        const oz = originalPositions[idx + 2];

        // Apply dynamic radial spreading based on scroll
        const baseOx = ox * spreadFactor;
        const baseOy = oy * spreadFactor;
        const baseOz = oz * spreadFactor;

        const dx = noise3D(baseOx * noiseScale, baseOy * noiseScale, baseOz * noiseScale + tOffset) * drift;
        const dy = noise3D(baseOy * noiseScale, baseOz * noiseScale, baseOx * noiseScale + tOffset * 1.15) * drift;
        const dz = noise3D(baseOz * noiseScale, baseOx * noiseScale, baseOy * noiseScale + tOffset * 0.9) * drift;

        const ax = baseOx + dx;
        const ay = baseOy + dy;
        const az = baseOz + dz;

        const vx = ax - localMouse3D.x;
        const vy = ay - localMouse3D.y;
        const vz = az - localMouse3D.z;
        const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);

        let targetRx = 0;
        let targetRy = 0;
        let targetRz = 0;

        if (dist < maxRepulsionDist && dist > 0.01) {
          const force = 1.0 - dist / maxRepulsionDist;
          // Smooth reactive organic wave movement
          const strength = force * force * 7.5;
          const wave = Math.sin(elapsed * 5.0 + dist * 3.0) * 0.55 * force;

          targetRx = (vx / dist) * (strength + wave);
          targetRy = (vy / dist) * (strength + wave);
          targetRz = (vz / dist) * (strength + wave);
        }

        const lerpFactor = 0.08;
        repulsionOffsets[idx] += (targetRx - repulsionOffsets[idx]) * lerpFactor;
        repulsionOffsets[idx + 1] += (targetRy - repulsionOffsets[idx + 1]) * lerpFactor;
        repulsionOffsets[idx + 2] += (targetRz - repulsionOffsets[idx + 2]) * lerpFactor;

        posArray[idx] = ax + repulsionOffsets[idx];
        posArray[idx + 1] = ay + repulsionOffsets[idx + 1];
        posArray[idx + 2] = az + repulsionOffsets[idx + 2];
      }

      positionsAttr.needsUpdate = true;

      composer.render();
    };

    animate();

    const handleResize = (entries: ResizeObserverEntry[]) => {
      for (const entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;

        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(newWidth, newHeight);
        composer.setSize(newWidth, newHeight);
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      window.requestAnimationFrame(() => handleResize(entries));
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('scroll', onScroll);

      if (renderer.domElement) {
        renderer.domElement.remove();
      }

      geometry.dispose();
      material.dispose();
      maskGeometry.dispose();
      maskMaterial.dispose();
      brainGeometry.dispose();
      brainMaterial.dispose();
      synapseGeometry.dispose();
      synapseMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      boneGeometry.dispose();
      boneMaterial.dispose();
      boneSynapseGeometry.dispose();
      boneSynapseMaterial.dispose();
      boneLineGeometry.dispose();
      boneLineMaterial.dispose();
      skullGeometry.dispose();
      skullMaterial.dispose();
      skullSynapseGeometry.dispose();
      skullSynapseMaterial.dispose();
      skullLineGeometry.dispose();
      skullLineMaterial.dispose();
    };
  }, []);

  return (
    <div className="relative w-screen h-[750vh] bg-[#010001] select-none">
      <div className="fixed top-0 left-0 w-full h-screen overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
        
        {/* Responsive Overlay Texts using 'Anybody' font */}
        <div 
          ref={overlayRef} 
          className="absolute inset-0 z-10 flex flex-col justify-between p-6 sm:p-12 md:p-16 pointer-events-none select-none transition-opacity duration-150"
          style={{ opacity: 1 }}
        >
          {/* Top Row: THE WORLD and MENU */}
          <div className="flex justify-between items-start w-full mt-4 sm:mt-0">
            <div 
              style={{
                color: '#FFF',
                fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace",
                fontStyle: 'normal',
                fontWeight: 600,
                fontSize: '24px',
                lineHeight: '30px',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                letterSpacing: '2px',
              }}
              className="tracking-[0.2em]"
            >
              <svg width="22" height="22" viewBox="0 0 64 64" fill="none" className="shrink-0">
                <rect x="2" y="2" width="60" height="60" rx="14" stroke="#01fefe" strokeOpacity="0.55" strokeWidth="5" />
                <circle cx="20" cy="20" r="7" fill="#01fefe" />
                <circle cx="44" cy="20" r="4.5" fill="#ff01aa" />
                <circle cx="32" cy="44" r="8" fill="#01fefe" />
              </svg>
              <span className="text-[#01fefe]">Pulseframe</span>
            </div>
            
            {/* Right Side Menu */}
            <div 
              style={{
                color: '#FFF',
                textAlign: 'center',
                fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace",
                fontStyle: 'normal',
                fontWeight: 400,
                lineHeight: 'normal',
                textTransform: 'uppercase',
              }}
              className="flex flex-col items-end space-y-2 sm:space-y-4 md:space-y-5 text-right text-[14px] sm:text-[18px] md:text-[22px]"
            >
              {['Protocol', 'Architecture', 'Signal', 'Continuum', 'Terminal'].map((item) => (
                <div key={item} className="flex items-center space-x-2 md:space-x-3 justify-end hover:text-[#00ffd0] transition-colors cursor-pointer pointer-events-auto">
                  <span>{item}</span>
                  <span className="text-[#01fefe] font-bold">•</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Bottom Row: HUMAN SYNTHESIS (Header + Paragraph) */}
          <div 
            ref={bottomTextRef} 
            className="absolute bottom-6 sm:bottom-12 md:bottom-16 left-6 sm:left-12 md:left-16 right-6 sm:right-12 md:right-16 flex justify-start items-end mb-4 sm:mb-0 transition-opacity duration-150"
            style={{ opacity: 0 }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end w-full">
              {/* Left Side: Header */}
              <div className="max-w-xl">
                <h1
                  style={{
                    color: '#FFF',
                    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace",
                    fontStyle: 'normal',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                  className="text-[52px] sm:text-[96px] md:text-[135px] leading-[50px] sm:leading-[92px] md:leading-[128px] whitespace-pre-line tracking-tight pointer-events-auto"
                >
                  The Mask{"\n"}Of Dawn
                </h1>
              </div>
              
              {/* Right Side: Paragraph */}
              <div className="max-w-md md:ml-auto">
                <p
                  style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace",
                    fontWeight: 300,
                  }}
                  className="text-[14px] sm:text-[16px] md:text-[18px] leading-[22px] sm:leading-[26px] md:leading-[30px] tracking-normal pointer-events-auto"
                >
                  Chords of starlight fold into the quiet geometry of a human face — the first veil where the invisible learns to take shape.
                </p>
              </div>
            </div>
          </div>

          {/* New Bottom Row: EVERY CELL IS FALLING APART */}
          <div 
            ref={diamondTextRef} 
            className="absolute bottom-6 sm:bottom-12 md:bottom-16 left-6 sm:left-12 md:left-16 right-6 sm:right-12 md:right-16 flex justify-start items-end mb-4 sm:mb-0 transition-opacity duration-150"
            style={{ opacity: 0, transform: 'translateY(40px)', pointerEvents: 'none' }}
          >
            <h1 
              style={{
                width: '1050px',
                maxWidth: '100%',
                color: '#FFF',
                fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace",
                fontStyle: 'normal',
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
              className="text-[42px] sm:text-[72px] md:text-[105px] leading-[44px] sm:leading-[72px] md:leading-[100px] whitespace-pre-line tracking-tighter pointer-events-auto"
            >
              The Living{"\n"}Labyrinth
            </h1>
          </div>

          {/* New Bottom Row 3: STRUCTURE OF LIFE / BONE SCREEN */}
          <div 
            ref={boneTextRef} 
            className="absolute bottom-6 sm:bottom-12 md:bottom-16 left-6 sm:left-12 md:left-16 right-6 sm:right-12 md:right-16 flex justify-start items-end mb-4 sm:mb-0 transition-opacity duration-150"
            style={{ opacity: 0, transform: 'translateY(40px)', pointerEvents: 'none' }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end w-full">
              {/* Left Side: Header */}
              <div className="max-w-xl">
                <h1 
                  style={{
                    color: '#FFF',
                    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace",
                    fontStyle: 'normal',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                  className="text-[42px] sm:text-[72px] md:text-[105px] leading-[44px] sm:leading-[72px] md:leading-[100px] whitespace-pre-line tracking-tighter pointer-events-auto"
                >
                  The Marrow{"\n"}Throne
                </h1>
              </div>
              
              {/* Right Side: Paragraph */}
              <div className="max-w-md md:ml-auto">
                <p
                  style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace",
                    fontWeight: 300,
                  }}
                  className="text-[14px] sm:text-[16px] md:text-[18px] leading-[22px] sm:leading-[26px] md:leading-[30px] tracking-normal pointer-events-auto"
                >
                  Bone remembers what the body forgets. Beneath the skin, a silent armature of calcium and light stands undefeated against the years.
                </p>
              </div>
            </div>
          </div>

          {/* New Bottom Row 4: VESSEL OF THE MIND / SKULL SCREEN */}
          <div 
            ref={skullTextRef} 
            className="absolute bottom-6 sm:bottom-12 md:bottom-16 left-6 sm:left-12 md:left-16 right-6 sm:right-12 md:right-16 flex justify-start items-end mb-4 sm:mb-0 transition-opacity duration-150"
            style={{ opacity: 0, transform: 'translateY(40px)', pointerEvents: 'none' }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end w-full">
              {/* Left Side: Header */}
              <div className="max-w-xl">
                <h1 
                  style={{
                    color: '#FFF',
                    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace",
                    fontStyle: 'normal',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                  className="text-[42px] sm:text-[72px] md:text-[105px] leading-[44px] sm:leading-[72px] md:leading-[100px] whitespace-pre-line tracking-tighter pointer-events-auto"
                >
                  The Ivory{"\n"}Dome
                </h1>
                <span className="block text-xs uppercase tracking-[0.3em] text-[#c67dff] mt-4 font-mono font-semibold pointer-events-auto">
                  The Cranial Chamber
                </span>
              </div>
              
              {/* Right Side: Paragraph */}
              <div className="max-w-md md:ml-auto">
                <p
                  style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace",
                    fontWeight: 300,
                  }}
                  className="text-[14px] sm:text-[16px] md:text-[18px] leading-[22px] sm:leading-[26px] md:leading-[30px] tracking-normal pointer-events-auto"
                >
                  A chamber of ivory built to outlast its tenant. Here memory was stored, thought was cast, and the echoes of a mind still flicker within the bone.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}