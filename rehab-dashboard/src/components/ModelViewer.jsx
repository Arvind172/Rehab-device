import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const MODEL_PATH = "/models/model.glb";
const DEG_TO_RAD = Math.PI / 180;
const MODEL_SCALE = 1.85;
const LEG_FOCUS_RATIO = 0.34;
const CAMERA_TARGET = new THREE.Vector3(0, 0.85, 0);
const CAMERA_VIEW_DIRECTION = new THREE.Vector3(1.15, 0.18, 2.35).normalize();
const EXERCISE_SCENE_TRANSFORMS = {
  "short-arc-quad": {
    rotation: new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2),
    position: new THREE.Vector3(0, 0.05, 0),
  },
};

const demoMotions = {
  "knee-flexion": {
    thigh: [0, 2],
    calf: [0, 56],
    foot: [0, -4],
    speed: 1.25,
  },
  "knee-extension": {
    thigh: [90, 90],
    calf: [88, -10],
    foot: [10, -8],
    speed: 1.15,
    multipliers: {
      thigh: 1,
      calf: 0.95,
      foot: 0.45,
    },
    supportLeg: {
      thigh: 90,
      calf: 88,
      foot: 8,
    },
    armPose: {
      upperArmLeft: { x: 8, y: 0, z: -10 },
      lowerArmLeft: { x: 10, y: 0, z: 6 },
      handLeft: { x: -4, y: 0, z: 0 },
      upperArmRight: { x: 8, y: 0, z: 10 },
      lowerArmRight: { x: 10, y: 0, z: -6 },
      handRight: { x: -4, y: 0, z: 0 },
    },
  },
  "straight-leg-raise": {
    thigh: [0, 34],
    calf: [0, 4],
    foot: [0, 0],
    speed: 1,
  },
  "heel-slides": {
    thigh: [0, 8],
    calf: [0, 62],
    foot: [0, -8],
    speed: 0.95,
  },
  "short-arc-quad": {
    thigh: [90, 90],
    calf: [70, 36],
    foot: [0, 0],
    speed: 1.2,
    liveLock: {
      thigh: 90,
    },
  },
  "ankle-pumps": {
    thigh: [0, 0],
    calf: [0, 0],
    foot: [-26, 26],
    speed: 1.65,
    liveLock: {
      thigh: 0,
      calf: 0,
    },
  },
  "ankle-dorsiflexion": {
    thigh: [0, 0],
    calf: [0, 0],
    foot: [0, 24],
    speed: 1.25,
    liveLock: {
      thigh: 0,
      calf: 0,
    },
  },
};

const boneNames = {
  thigh: ["thigh_R", "thigh.R", "rightthigh", "rightupperleg"],
  calf: ["calf_R", "calf.R", "rightcalf", "rightshin"],
  foot: ["foot_R", "foot.R", "rightfoot"],
  supportThigh: ["thigh_L", "thigh.L", "leftthigh", "leftupperleg"],
  supportCalf: ["calf_L", "calf.L", "leftcalf", "leftshin"],
  supportFoot: ["foot_L", "foot.L", "leftfoot"],
  upperArmLeft: ["upperarm_L", "upperarm.L", "leftupperarm"],
  lowerArmLeft: ["lowerarm_L", "lowerarm.L", "leftlowerarm", "leftforearm"],
  handLeft: ["hand_L", "hand.L", "lefthand"],
  upperArmRight: ["upperarm_R", "upperarm.R", "rightupperarm"],
  lowerArmRight: ["lowerarm_R", "lowerarm.R", "rightlowerarm", "rightforearm"],
  handRight: ["hand_R", "hand.R", "righthand"],
};

function safeAngle(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function kneeToFlexion(angle) {
  return 180 - safeAngle(angle);
}

function ankleToFlexion(angle) {
  return 90 - safeAngle(angle);
}

function findBone(scene, candidates) {
  let match = null;
  const normalizedCandidates = candidates.map((candidate) =>
    candidate.toLowerCase().replace(/[_\s-]/g, ""),
  );

  scene.traverse((object) => {
    if (match || !object.name) return;

    const normalizedName = object.name.toLowerCase().replace(/[_\s-]/g, "");
    const isCandidate =
      normalizedCandidates.includes(normalizedName) ||
      normalizedCandidates.some((candidate) => normalizedName.includes(candidate));

    if (isCandidate) {
      match = object;
    }
  });

  return match;
}

function centerModel(scene) {
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());

  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= box.min.y;
}

function fitCameraToModel(scene, camera, controls, size) {
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return;

  const modelSize = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const target = new THREE.Vector3(
    center.x,
    box.min.y + modelSize.y * LEG_FOCUS_RATIO,
    center.z,
  );

  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (size.width / size.height));
  const topOffset = Math.abs(box.max.y - target.y);
  const bottomOffset = Math.abs(target.y - box.min.y);
  const verticalDistance = Math.max(topOffset, bottomOffset) / Math.tan(verticalFov / 2);
  const horizontalDistance = (modelSize.x / 2) / Math.tan(horizontalFov / 2);
  const depthDistance = modelSize.z * 1.2;
  const distance = Math.max(verticalDistance, horizontalDistance, depthDistance) * 1.12;

  camera.position.copy(target).addScaledVector(CAMERA_VIEW_DIRECTION, distance);
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  camera.lookAt(target);

  if (controls) {
    controls.target.copy(target);
    controls.minDistance = distance * 0.65;
    controls.maxDistance = distance * 1.9;
    controls.update();
  }
}

function interpolateRange([from, to], progress) {
  return THREE.MathUtils.lerp(from, to, progress);
}

function getDemoMotion(exerciseId) {
  return demoMotions[exerciseId] ?? demoMotions["knee-flexion"];
}

function getDemoAngles(motion, elapsedTime) {
  const progress = (Math.sin(elapsedTime * motion.speed) + 1) / 2;

  return {
    thigh: interpolateRange(motion.thigh, progress),
    calf: interpolateRange(motion.calf, progress),
    foot: interpolateRange(motion.foot, progress),
  };
}

function getBoneRole(key) {
  if (key.toLowerCase().includes("thigh")) return "thigh";
  if (key.toLowerCase().includes("calf")) return "calf";
  if (key.toLowerCase().includes("foot")) return "foot";
  return key;
}

function isSupportBone(key) {
  return key.startsWith("support");
}

function isArmBone(key) {
  return key.includes("Arm") || key.includes("hand");
}

function applyRotationOffset(target, offset) {
  if (!offset) return;

  target.x += (offset.x ?? 0) * DEG_TO_RAD;
  target.y += (offset.y ?? 0) * DEG_TO_RAD;
  target.z += (offset.z ?? 0) * DEG_TO_RAD;
}

function CameraFramer({ scene, controlsRef }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useEffect(() => {
    if (!scene) return;

    fitCameraToModel(scene, camera, controlsRef.current, size);
  }, [camera, controlsRef, scene, size]);

  return null;
}

function LegModel({ angles, connected, exerciseId, mode, onReady }) {
  const { scene } = useGLTF(MODEL_PATH);
  const rootRef = useRef(null);
  const bones = useRef({
    thigh: null,
    calf: null,
    foot: null,
    supportThigh: null,
    supportCalf: null,
    supportFoot: null,
    upperArmLeft: null,
    lowerArmLeft: null,
    handLeft: null,
    upperArmRight: null,
    lowerArmRight: null,
    handRight: null,
  });
  const restPose = useRef(new Map());
  const exerciseTransform = EXERCISE_SCENE_TRANSFORMS[exerciseId];

  const targetAngles = useMemo(
    () => ({
      thigh: connected ? safeAngle(angles?.thigh) : 0,
      // The live sensor angles are anatomical values, so convert them into model flexion.
      calf: connected ? kneeToFlexion(angles?.knee ?? angles?.calf) : 0,
      foot: connected ? ankleToFlexion(angles?.ankle ?? angles?.foot) : 0,
    }),
    [angles, connected],
  );

  useEffect(() => {
    centerModel(scene);
    scene.scale.setScalar(MODEL_SCALE);

    bones.current = {
      thigh: findBone(scene, boneNames.thigh),
      calf: findBone(scene, boneNames.calf),
      foot: findBone(scene, boneNames.foot),
      supportThigh: findBone(scene, boneNames.supportThigh),
      supportCalf: findBone(scene, boneNames.supportCalf),
      supportFoot: findBone(scene, boneNames.supportFoot),
      upperArmLeft: findBone(scene, boneNames.upperArmLeft),
      lowerArmLeft: findBone(scene, boneNames.lowerArmLeft),
      handLeft: findBone(scene, boneNames.handLeft),
      upperArmRight: findBone(scene, boneNames.upperArmRight),
      lowerArmRight: findBone(scene, boneNames.lowerArmRight),
      handRight: findBone(scene, boneNames.handRight),
    };

    Object.values(bones.current).forEach((bone) => {
      if (bone && !restPose.current.has(bone.uuid)) {
        restPose.current.set(bone.uuid, bone.rotation.clone());
      }
    });

    onReady(scene);
  }, [onReady, scene]);

  useFrame(({ clock }, delta) => {
    const isLive = mode === "live" && connected;
    const damping = isLive ? 9 : 6;
    const demoMotion = getDemoMotion(exerciseId);
    const demoAngles = getDemoAngles(demoMotion, clock.elapsedTime);
    const demoMultipliers = demoMotion.multipliers ?? {};
    const supportLeg = demoMotion.supportLeg;
    const armPose = demoMotion.armPose;
    const liveLock = demoMotion.liveLock ?? {};

    Object.entries(bones.current).forEach(([key, bone]) => {
      if (!bone) return;

      const restRotation = restPose.current.get(bone.uuid);
      if (!restRotation) return;

      const target = restRotation.clone();
      if (armPose && isArmBone(key)) {
        applyRotationOffset(target, armPose[key]);
        bone.rotation.x = THREE.MathUtils.damp(bone.rotation.x, target.x, damping, delta);
        bone.rotation.y = THREE.MathUtils.damp(bone.rotation.y, target.y, damping, delta);
        bone.rotation.z = THREE.MathUtils.damp(bone.rotation.z, target.z, damping, delta);
        return;
      }

      if (isArmBone(key)) return;

      const role = getBoneRole(key);
      const shouldUseDemoPose =
        !isLive ||
        isSupportBone(key) ||
        Object.hasOwn(liveLock, role) ||
        (exerciseId === "knee-extension" && role === "thigh");
      const angle = isSupportBone(key)
        ? (supportLeg?.[role] ?? 0)
        : Object.hasOwn(liveLock, role)
          ? liveLock[role]
        : shouldUseDemoPose
          ? demoAngles[role]
          : isLive
          ? targetAngles[role]
          : demoAngles[role];
      const thighMultiplier = shouldUseDemoPose ? (demoMultipliers.thigh ?? 0.22) : 0.22;
      const calfMultiplier = shouldUseDemoPose ? (demoMultipliers.calf ?? 0.8) : 0.8;
      const footMultiplier = shouldUseDemoPose ? (demoMultipliers.foot ?? 0.45) : 0.45;

      if (role === "thigh") {
        target.x -= angle * DEG_TO_RAD * thighMultiplier;
      }

      if (role === "calf") {
        target.x -= angle * DEG_TO_RAD * calfMultiplier;
      }

      if (role === "foot") {
        target.x += angle * DEG_TO_RAD * footMultiplier;
      }

      bone.rotation.x = THREE.MathUtils.damp(bone.rotation.x, target.x, damping, delta);
      bone.rotation.y = THREE.MathUtils.damp(bone.rotation.y, target.y, damping, delta);
      bone.rotation.z = THREE.MathUtils.damp(bone.rotation.z, target.z, damping, delta);
    });
  });

  return (
    <group
      ref={rootRef}
      position={exerciseTransform?.position ?? [0, 0, 0]}
      rotation={
        exerciseTransform
          ? [exerciseTransform.rotation.x, exerciseTransform.rotation.y, exerciseTransform.rotation.z]
          : [0, 0, 0]
      }
    >
      <primitive object={scene} />
    </group>
  );
}

export default function ModelViewer({ angles, connected, exerciseId, mode = "demo" }) {
  const controlsRef = useRef(null);
  const [modelScene, setModelScene] = useState(null);

  return (
    <div className="model-stage">
      <Canvas
        camera={{ position: [1.6, 1, 3], fov: 31 }}
      >
        <CameraFramer scene={modelScene} controlsRef={controlsRef} />
        <ambientLight intensity={1.3} />
        <directionalLight position={[2, 5, 3]} intensity={1.4} />
        <directionalLight position={[-3, 2, -2]} intensity={0.45} />

        <Suspense fallback={null}>
          <LegModel
            angles={angles}
            connected={connected}
            exerciseId={exerciseId}
            mode={mode}
            onReady={setModelScene}
          />
        </Suspense>

        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          target={CAMERA_TARGET}
        />
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_PATH);
