// main.js – core logic for the Jail simulation.  This script builds a simple
// prison cell‑block using Three.js, spawns a player in a random cell and
// implements a basic third‑person follow camera.  Guards and other inmates
// patrol the corridor to give the scene life.

// DOM references
const startScreen = document.getElementById('start-screen');
const hud = document.getElementById('hud');
const timeDisplay = document.getElementById('time-elapsed');
const gameContainer = document.getElementById('game-container');
const controlsContainer = document.getElementById('controls');

// Character definitions.  Each inmate has a unique colour assigned to the
// player mesh.  Additional properties could be added here in future (e.g.
// movement speed, special abilities).
const characters = [
  { name: 'Inmate 1', color: 0x1e88e5 }, // blue
  { name: 'Inmate 2', color: 0xef6c00 }, // orange
  { name: 'Inmate 3', color: 0x388e3c }  // green
];

// Three.js variables
let scene, camera, renderer;
let player, cameraPivot;
let npcs = [];
let keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let startTime;
let animationId;

// Level parameters.  Adjust these values to tweak the size of the corridor,
// number of cells and NPC movement speeds.
const cellCount = 8;
const cellSpacing = 12;
const walkwayWidth = 14;
const walkwayLength = cellCount * cellSpacing;

/**
 * Initialises the Three.js renderer, camera and scene.  Builds the floor,
 * walls and prison cells.  Spawns NPCs and the player character.
 * @param {number} charIndex Index of the selected character.
 */
function initGame(charIndex) {
  // Create renderer and append its canvas into the container
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  gameContainer.appendChild(renderer.domElement);

  // Create a new scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101010);

  // Ambient and directional lighting to illuminate the scene
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(15, 20, 10);
  scene.add(dirLight);

  // Set up the perspective camera
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  // Build the level geometry
  buildLevel();

  // Spawn NPCs (guards and other inmates)
  spawnNPCs();

  // Spawn player at random cell
  spawnPlayer(charIndex);

  // Handle resize events
  window.addEventListener('resize', onWindowResize);

  // Start animation loop
  startTime = Date.now();
  animate();
}

/**
 * Constructs the floor, walls and cell blocks.  The corridor stretches
 * along the negative z‑axis.  Cells are represented by simple boxes on
 * either side of the walkway.
 */
function buildLevel() {
  // Floor
  const floorGeometry = new THREE.PlaneGeometry(walkwayWidth * 2, walkwayLength);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -walkwayLength / 2 + cellSpacing / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // Walls: left and right long walls
  const wallHeight = 6;
  const wallThickness = 0.5;
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const wallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, walkwayLength);

  const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
  leftWall.position.set(-walkwayWidth, wallHeight / 2, -walkwayLength / 2 + cellSpacing / 2);
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(wallGeometry, wallMaterial);
  rightWall.position.set(walkwayWidth, wallHeight / 2, -walkwayLength / 2 + cellSpacing / 2);
  scene.add(rightWall);

  // Cells: boxes on each side
  for (let i = 0; i < cellCount; i++) {
    const cellGeometry = new THREE.BoxGeometry(6, 6, 6);
    const cellMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
    // left cell
    const cellLeft = new THREE.Mesh(cellGeometry, cellMaterial);
    cellLeft.position.set(-walkwayWidth - 3, 3, -i * cellSpacing);
    scene.add(cellLeft);
    // right cell
    const cellRight = new THREE.Mesh(cellGeometry, cellMaterial);
    cellRight.position.set(walkwayWidth + 3, 3, -i * cellSpacing);
    scene.add(cellRight);
  }
}

/**
 * Creates a simple NPC mesh.  NPCs patrol the corridor by moving along
 * the z‑axis and bouncing back when they reach the end.  Each NPC has
 * an associated speed and direction.
 * @param {number} color  Colour of the NPC mesh.
 */
function createNPC(color) {
  const geometry = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 8);
  const material = new THREE.MeshStandardMaterial({ color });
  const npc = new THREE.Mesh(geometry, material);
  npc.position.set(0, 0.75, -Math.random() * walkwayLength);
  // Assign a random initial direction: 1 means moving towards positive z (towards start)
  npc.userData = {
    speed: 2 + Math.random() * 1.5, // units per second
    direction: Math.random() < 0.5 ? 1 : -1
  };
  scene.add(npc);
  return npc;
}

/**
 * Spawns a handful of NPCs (guards and inmates).  Guards are coloured red and
 * move slightly faster; other inmates are yellow.  NPCs are stored in the
 * global npcs array for update each frame.
 */
function spawnNPCs() {
  // Guards
  for (let i = 0; i < 2; i++) {
    const guard = createNPC(0xb71c1c);
    guard.userData.speed += 1; // guards move faster
    npcs.push(guard);
  }
  // Other inmates
  for (let i = 0; i < 3; i++) {
    const inmate = createNPC(0xffeb3b);
    npcs.push(inmate);
  }
}

/**
 * Spawns the player mesh based on the selected character.  The player is
 * represented by a cylinder.  A camera pivot is created to implement a
 * third‑person follow camera as described in the Three.js follow cam
 * tutorial【445902741675241†L310-L319】.  The camera pivot follows the
 * player's position smoothly and holds the camera at a fixed offset.
 * @param {number} charIndex Index of the selected character.
 */
function spawnPlayer(charIndex) {
  // Player geometry and material
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 12);
  const material = new THREE.MeshStandardMaterial({ color: characters[charIndex].color });
  player = new THREE.Mesh(geometry, material);
  player.position.set(0, 1, 0);
  scene.add(player);

  // Camera pivot for follow cam
  cameraPivot = new THREE.Object3D();
  scene.add(cameraPivot);
  cameraPivot.add(camera);
  // Place the camera behind and above the pivot
  camera.position.set(0, 3.5, 8);
  camera.lookAt(new THREE.Vector3());

  // Randomly choose a starting cell and side (left or right)
  const row = Math.floor(Math.random() * cellCount);
  const side = Math.random() < 0.5 ? -1 : 1;
  const xOffset = side * walkwayWidth;
  const zPos = -row * cellSpacing;
  player.position.set(xOffset, 1, zPos);
  cameraPivot.position.copy(player.position);
}

/**
 * Handles browser resize events to keep the game canvas filling the viewport
 * and maintain the correct aspect ratio of the camera.
 */
function onWindowResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Updates NPC positions each frame.  NPCs move along the z‑axis and
 * bounce between the start and end of the corridor.  Their direction
 * and speed are stored in userData.  @param {number} delta Time delta in seconds.
 */
function updateNPCs(delta) {
  npcs.forEach((npc) => {
    npc.position.z += npc.userData.direction * npc.userData.speed * delta;
    // Bounce back at corridor bounds
    const minZ = -walkwayLength + cellSpacing;
    const maxZ = 0;
    if (npc.position.z < minZ) {
      npc.position.z = minZ;
      npc.userData.direction *= -1;
    } else if (npc.position.z > maxZ) {
      npc.position.z = maxZ;
      npc.userData.direction *= -1;
    }
    // Simple rotation to face movement direction
    npc.rotation.y = npc.userData.direction === 1 ? Math.PI : 0;
  });
}

/**
 * Updates the player position based on current key states.  Movement is
 * restricted within the corridor boundaries.  After moving, the camera
 * pivot follows the player smoothly using linear interpolation (lerp).
 * @param {number} delta Time delta in seconds.
 */
function updatePlayer(delta) {
  const speed = 6; // units per second
  let dx = 0;
  let dz = 0;
  if (keys.ArrowUp) dz -= speed * delta;
  if (keys.ArrowDown) dz += speed * delta;
  if (keys.ArrowLeft) dx -= speed * delta;
  if (keys.ArrowRight) dx += speed * delta;
  if (dx !== 0 || dz !== 0) {
    player.position.x += dx;
    player.position.z += dz;
    // Clamp within corridor
    const minX = -walkwayWidth;
    const maxX = walkwayWidth;
    const minZ = -walkwayLength + cellSpacing;
    const maxZ = 0;
    player.position.x = Math.max(minX + 1, Math.min(maxX - 1, player.position.x));
    player.position.z = Math.max(minZ, Math.min(maxZ, player.position.z));
    // Face the direction of movement
    player.rotation.y = Math.atan2(dx, -dz);
  }
  // Smoothly move camera pivot towards player
  cameraPivot.position.lerp(player.position, 0.1);
  // Always look at the player
  camera.lookAt(player.position);
}

/**
 * Main animation loop.  Calculates delta time, updates all entities and
 * schedules the next frame.  Also updates the timer HUD.
 */
function animate() {
  animationId = requestAnimationFrame(animate);
  const now = Date.now();
  const delta = (now - (animate.lastTime || now)) / 1000;
  animate.lastTime = now;
  // Update timer display
  if (startTime) {
    const elapsed = Math.floor((now - startTime) / 1000);
    timeDisplay.textContent = elapsed.toString();
  }
  // Update world
  updatePlayer(delta);
  updateNPCs(delta);
  // Render scene
  renderer.render(scene, camera);
}

/**
 * Event handlers for keyboard controls.  We track arrow key states in
 * the keys object.  Additional keys (WASD) are mapped to the same values
 * for convenience.
 */
function setupKeyboardControls() {
  const map = {
    w: 'ArrowUp',
    a: 'ArrowLeft',
    s: 'ArrowDown',
    d: 'ArrowRight'
  };
  document.addEventListener('keydown', (e) => {
    const key = map[e.key.toLowerCase()] || e.key;
    if (key in keys) keys[key] = true;
  });
  document.addEventListener('keyup', (e) => {
    const key = map[e.key.toLowerCase()] || e.key;
    if (key in keys) keys[key] = false;
  });
}

/**
 * Sets up touch controls for mobile devices using the on‑screen d‑pad.  Each
 * button modifies the corresponding key state on touchstart and resets it on
 * touchend.  Buttons are enabled only after the game starts.
 */
function setupTouchControls() {
  const setKey = (key, pressed) => {
    if (key in keys) keys[key] = pressed;
  };
  const bindButton = (id, key) => {
    const btn = document.getElementById(id);
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      setKey(key, true);
    });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      setKey(key, false);
    });
  };
  bindButton('btn-up', 'ArrowUp');
  bindButton('btn-down', 'ArrowDown');
  bindButton('btn-left', 'ArrowLeft');
  bindButton('btn-right', 'ArrowRight');
}

// Handle character selection from the start screen
document.querySelectorAll('#start-screen button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const index = parseInt(btn.getAttribute('data-index'), 10);
    // Hide start screen and show HUD and game container
    startScreen.style.display = 'none';
    hud.style.display = 'flex';
    controlsContainer.style.display = 'flex';
    gameContainer.style.display = 'block';
    // Initialise controls
    setupKeyboardControls();
    setupTouchControls();
    // Initialise game
    initGame(index);
  });
});