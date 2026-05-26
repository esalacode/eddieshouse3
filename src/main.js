(() => {
  const canvas = document.getElementById('view');
  const ctx = canvas.getContext('2d');
  
  
  const renderCanvas = document.createElement('canvas');
  const rctx = renderCanvas.getContext('2d');

  const zBuffer = [];

  const TARGET_RENDER_PIXELS = 320 * 180;

  const moveInput = { x: 0, y: 0 };
  const lookInput = { x: 0, y: 0 };

  const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    left: false,
    right: false,
    interact: false,
  };

  let mouseLookDelta = 0;
  let walkAmount = 0;

  const ROOM_TOP = 2;
  const ROOM_BOTTOM = 10;

  const NORMAL_HALL_LEFT = 10;
  const NORMAL_HALL_RIGHT = 24;
  const LONG_HALL_RIGHT = 260;
  const LONG_HALL_LEFT = NORMAL_HALL_LEFT - (LONG_HALL_RIGHT - NORMAL_HALL_RIGHT);

  const LIVING_W = 8;
  const BEDROOM_W = 8;
  const PANEL_OFFSET = 2;

  

  const MAP_MIN_X = LONG_HALL_LEFT - LIVING_W - 4;
  const MAP_MAX_X = LONG_HALL_RIGHT + BEDROOM_W + 4;
  const MAP_HEIGHT = 13;

  

    const player = {
    x: 5.6,
    y: 6.0,
    dir: 0,
    moveSpeed: 2.0,
    rotSpeed: 2.3,
    bob: 0,
  };

   const hallway = {
  active: false,
  direction: 1,
  lengthMode: 'normal',
  widthMode: 'normal',
  appliedWidthMode: 'normal',
  pendingReset: false,
};

  const npc = {
  x: 4.2,
  y: 6.0,
  anim: 0,
  active: true,

  fearRadius: 4.2,
  panicRadius: 1.8,
  fleeSpeed: 1.05,
  panicSpeed: 2.15,

  roamSpeed: 0.55,
  roamPause: 0,
  roamTargetX: 4.2,
  roamTargetY: 6.0,
  roamThinkTime: 0,

    task: 'idle',
  targetRoom: null,
  lastPlayerRoom: 'living',
  path: null,
  pathIndex: 0,
  pathTargetKey: ''
};

const NPC_RADIUS = 0.32;
const NPC_WALL_REPEL_RADIUS = 0.46;
const NPC_SPRITE_PROJECTION_HEIGHT = 180;

  const plant = {
  x: 7.2,
  y: 6.0,
  active: true,

  carriedBy: null, // null | 'player' | 'npc'

  health: 0.78,
  growth: 0.58,
  anim: 0
};

const PLANT_RADIUS = 0.22;
const PLANT_SPRITE_PROJECTION_HEIGHT = 92;
const DEBUG = new URLSearchParams(location.search).has('debug');
let debugVisible = DEBUG;

    const wallStyles = {
    1: { base: '#FFFFFF', shade: '#F1F1F1' },
    2: { base: '#FFFFFF', shade: '#F1F1F1' }
  };

  function hallLeftForState(state) {
  return state.active && state.lengthMode === 'long' && state.direction === -1
    ? LONG_HALL_LEFT
    : NORMAL_HALL_LEFT;
}

function hallRightForState(state) {
  return state.active && state.lengthMode === 'long' && state.direction === 1
    ? LONG_HALL_RIGHT
    : NORMAL_HALL_RIGHT;
}

function hallY1ForState(state) {
  return state.appliedWidthMode === 'narrow' ? 6 : 5;
}

function hallY2ForState(state) {
  return state.appliedWidthMode === 'narrow' ? 6 : 7;
}

function hallWallTopForState(state) {
  return state.appliedWidthMode === 'narrow' ? 5 : 4;
}

function hallWallBottomForState(state) {
  return state.appliedWidthMode === 'narrow' ? 7 : 8;
}

function hallLeft() {
  return hallLeftForState(hallway);
}

function hallRight() {
  return hallRightForState(hallway);
}

function hallY1() {
  return hallY1ForState(hallway);
}

function hallY2() {
  return hallY2ForState(hallway);
}

function isWallAtState(x, y, state) {
  return getCellForState(Math.floor(x), Math.floor(y), state) !== 0;
}

function rayCanSeeHallwayState(state) {
  const left = hallLeftForState(state);
  const right = hallRightForState(state);
  const y1 = hallY1ForState(state);
  const y2 = hallY2ForState(state);

  const fov = Math.PI / 3;
  const rays = 56;
  const maxDist = state.lengthMode === 'long' ? 280 : 40;
  const step = 0.08;

  for (let i = 0; i < rays; i++) {
    const t = rays === 1 ? 0.5 : i / (rays - 1);
    const angle = player.dir + (t - 0.5) * fov;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    for (let dist = 0.12; dist <= maxDist; dist += step) {
      const sx = player.x + dx * dist;
      const sy = player.y + dy * dist;

      if (
        sx >= left + 0.08 &&
        sx <= right - 0.08 &&
        sy >= y1 + 0.08 &&
        sy <= y2 + 0.92
      ) {
        return true;
      }

      if (isWallAtState(sx, sy, state)) break;
    }
  }

  return false;
}

function canSwitchHallwayState(candidate) {
  const current = snapshotHallwayState();
  return !rayCanSeeHallwayState(current) && !rayCanSeeHallwayState(candidate);
}

  function livingBounds() {
    const right = hallLeft();
    return { x1: right - LIVING_W, x2: right, y1: ROOM_TOP, y2: ROOM_BOTTOM };
  }

  function bedroomBounds() {
    const left = hallRight();
    return { x1: left, x2: left + BEDROOM_W, y1: ROOM_TOP, y2: ROOM_BOTTOM };
  }

  

  

  function inRect(x, y, x1, y1, x2, y2) {
    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
  }

  function inLivingRoom(x = player.x, y = player.y) {
    const room = livingBounds();
    return inRect(x, y, room.x1, room.y1, room.x2, room.y2);
  }

  function inBedroom(x = player.x, y = player.y) {
    const room = bedroomBounds();
    return inRect(x, y, room.x1, room.y1, room.x2, room.y2);
  }

  function getCellForState(x, y, state) {
  if (x < MAP_MIN_X || y < 0 || x > MAP_MAX_X || y >= MAP_HEIGHT) return 1;

  const left = hallLeftForState(state);
  const right = hallRightForState(state);

  const living = {
    x1: left - LIVING_W,
    x2: left,
    y1: ROOM_TOP,
    y2: ROOM_BOTTOM
  };

  const bedroom = {
    x1: right,
    x2: right + BEDROOM_W,
    y1: ROOM_TOP,
    y2: ROOM_BOTTOM
  };

  const panelLeft = left - PANEL_OFFSET;
  const panelRight = right + PANEL_OFFSET;
  const y1 = hallY1ForState(state);
  const y2 = hallY2ForState(state);
  const wallTop = hallWallTopForState(state);
  const wallBottom = hallWallBottomForState(state);

  if (x === panelLeft && y >= 4 && y <= 8) return 2;
  if (x === panelRight && y >= 4 && y <= 8) return 2;

  if (inRect(x, y, living.x1, living.y1, living.x2, living.y2)) return 0;
  if (inRect(x, y, left, y1, right, y2)) return 0;
  if (inRect(x, y, bedroom.x1, bedroom.y1, bedroom.x2, bedroom.y2)) return 0;

  if ((y === wallTop || y === wallBottom) && x >= left && x <= right) {
    return ((x - left) % 6 === 0 || (x - left) % 6 === 1) ? 2 : 1;
  }

  return 1;
}

function getCell(x, y) {
  return getCellForState(x, y, hallway);
}

  function canOccupy(x, y, radius = 0.18) {
    const minX = Math.floor(x - radius);
    const maxX = Math.floor(x + radius);
    const minY = Math.floor(y - radius);
    const maxY = Math.floor(y + radius);

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (getCell(cx, cy) === 0) continue;

        const nearestX = Math.max(cx, Math.min(x, cx + 1));
        const nearestY = Math.max(cy, Math.min(y, cy + 1));
        const dx = x - nearestX;
        const dy = y - nearestY;

        if (dx * dx + dy * dy < radius * radius) return false;
      }
    }

    return true;
  }

  

  function shade(hex, amt) {
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 255) + amt;
    let b = (num & 255) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
  }

  function resize() {
    const vw = innerWidth;
    const vh = innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    const aspect = vw / vh;

    renderCanvas.height = Math.max(120, Math.round(Math.sqrt(TARGET_RENDER_PIXELS / aspect)));
    renderCanvas.width = Math.max(80, Math.round(renderCanvas.height * aspect));

    rctx.imageSmoothingEnabled = false;
  }
  resize();
  addEventListener('resize', resize, { passive: true });

  function inHallwayZone(x = player.x, y = player.y) {
  return x >= hallLeft() - 0.1 &&
    x <= hallRight() + 0.1 &&
    y >= hallY1() - 0.2 &&
    y <= hallY2() + 0.2;
}

function livingBoundsForState(state) {
  const right = hallLeftForState(state);
  return {
    x1: right - LIVING_W,
    x2: right,
    y1: ROOM_TOP,
    y2: ROOM_BOTTOM
  };
}

function bedroomBoundsForState(state) {
  const left = hallRightForState(state);
  return {
    x1: left,
    x2: left + BEDROOM_W,
    y1: ROOM_TOP,
    y2: ROOM_BOTTOM
  };
}

function inLivingRoomForState(x, y, state) {
  const room = livingBoundsForState(state);
  return inRect(x, y, room.x1, room.y1, room.x2, room.y2);
}

function inBedroomForState(x, y, state) {
  const room = bedroomBoundsForState(state);
  return inRect(x, y, room.x1, room.y1, room.x2, room.y2);
}

function inHallwayZoneForState(x, y, state) {
  return x >= hallLeftForState(state) - 0.1 &&
    x <= hallRightForState(state) + 0.1 &&
    y >= hallY1ForState(state) - 0.2 &&
    y <= hallY2ForState(state) + 0.2;
}

function canOccupyForState(x, y, radius, state) {
  const minX = Math.floor(x - radius);
  const maxX = Math.floor(x + radius);
  const minY = Math.floor(y - radius);
  const maxY = Math.floor(y + radius);

  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      if (getCellForState(cx, cy, state) === 0) continue;

      const nearestX = Math.max(cx, Math.min(x, cx + 1));
      const nearestY = Math.max(cy, Math.min(y, cy + 1));
      const dx = x - nearestX;
      const dy = y - nearestY;

      if (dx * dx + dy * dy < radius * radius) return false;
    }
  }

  return true;
}

function getEntityRoomState(entity, state) {
  const tileX = Math.floor(entity.x);
  const tileY = Math.floor(entity.y);

  const living = livingBoundsForState(state);
  if (
    tileX >= Math.floor(living.x1) &&
    tileX <= Math.floor(living.x2) &&
    tileY >= Math.floor(living.y1) &&
    tileY <= Math.floor(living.y2)
  ) {
    return 'living';
  }

  const bedroom = bedroomBoundsForState(state);
  if (
    tileX >= Math.floor(bedroom.x1) &&
    tileX <= Math.floor(bedroom.x2) &&
    tileY >= Math.floor(bedroom.y1) &&
    tileY <= Math.floor(bedroom.y2)
  ) {
    return 'bedroom';
  }

  if (inHallwayZoneForState(entity.x, entity.y, state)) return 'hallway';

  return 'other';
}

function getLooseRoomState(entity, state) {
  const strictRoom = getEntityRoomState(entity, state);

  if (strictRoom !== 'other') return strictRoom;

  const tolerance = 0.25;

  const living = livingBoundsForState(state);
  if (
    entity.x >= living.x1 - tolerance &&
    entity.x <= living.x2 + tolerance &&
    entity.y >= living.y1 - tolerance &&
    entity.y <= living.y2 + tolerance
  ) {
    return 'living';
  }

  const bedroom = bedroomBoundsForState(state);
  if (
    entity.x >= bedroom.x1 - tolerance &&
    entity.x <= bedroom.x2 + tolerance &&
    entity.y >= bedroom.y1 - tolerance &&
    entity.y <= bedroom.y2 + tolerance
  ) {
    return 'bedroom';
  }

  return strictRoom;
}

  function getSettledRoomState(entity, state) {
  const margin = 1.25;

  const living = livingBoundsForState(state);
  if (
    entity.x >= living.x1 + margin &&
    entity.x <= living.x2 - margin &&
    entity.y >= living.y1 + margin &&
    entity.y <= living.y2 - margin
  ) {
    return 'living';
  }

  const bedroom = bedroomBoundsForState(state);
  if (
    entity.x >= bedroom.x1 + margin &&
    entity.x <= bedroom.x2 - margin &&
    entity.y >= bedroom.y1 + margin &&
    entity.y <= bedroom.y2 - margin
  ) {
    return 'bedroom';
  }

  if (inHallwayZoneForState(entity.x, entity.y, state)) return 'hallway';

  return 'other';
}

function getRemappedEntityPosition(entity, oldState, newState, radius) {
  const oldRoomName = getEntityRoomState(entity, oldState);

  if (oldRoomName === 'hallway') {
    const oldLeft = hallLeftForState(oldState);
    const oldRight = hallRightForState(oldState);
    const oldY1 = hallY1ForState(oldState);
    const oldY2 = hallY2ForState(oldState);

    const newLeft = hallLeftForState(newState);
    const newRight = hallRightForState(newState);
    const newY1 = hallY1ForState(newState);
    const newY2 = hallY2ForState(newState);

    const oldWidth = Math.max(1, oldRight - oldLeft);
    const t = Math.max(0, Math.min(1, (entity.x - oldLeft) / oldWidth));

    const oldCenterY = (oldY1 + oldY2 + 1) * 0.5;
    const newCenterY = (newY1 + newY2 + 1) * 0.5;

    const nextX = newLeft + t * (newRight - newLeft);
    const nextY = newCenterY + (entity.y - oldCenterY);

    if (canOccupyForState(nextX, nextY, radius, newState)) {
      return { x: nextX, y: nextY };
    }

    if (canOccupyForState(nextX, newCenterY, radius, newState)) {
      return { x: nextX, y: newCenterY };
    }

    return null;
  }

  if (oldRoomName !== 'living' && oldRoomName !== 'bedroom') {
    return canOccupyForState(entity.x, entity.y, radius, newState)
      ? { x: entity.x, y: entity.y }
      : null;
  }

  const oldRoom = oldRoomName === 'living'
    ? livingBoundsForState(oldState)
    : bedroomBoundsForState(oldState);

  const newRoom = oldRoomName === 'living'
    ? livingBoundsForState(newState)
    : bedroomBoundsForState(newState);

  const localX = entity.x - oldRoom.x1;
  const localY = entity.y - oldRoom.y1;

  const nextX = newRoom.x1 + localX;
  const nextY = newRoom.y1 + localY;

  return canOccupyForState(nextX, nextY, radius, newState)
    ? { x: nextX, y: nextY }
    : null;
}

  function getNearestPlantRestingPositionForState(entity, state) {
  const allowedRooms = new Set(['living', 'bedroom', 'hallway']);

  if (
    canOccupyForState(entity.x, entity.y, PLANT_RADIUS, state) &&
    allowedRooms.has(getEntityRoomState(entity, state))
  ) {
    return { x: entity.x, y: entity.y };
  }

  for (let ring = 1; ring <= 28; ring++) {
    const dist = ring * 0.16;

    for (let i = 0; i < 24; i++) {
      const angle = (Math.PI * 2 * i) / 24;
      const x = entity.x + Math.cos(angle) * dist;
      const y = entity.y + Math.sin(angle) * dist;

      if (!canOccupyForState(x, y, PLANT_RADIUS, state)) continue;

      const room = getEntityRoomState({ x, y }, state);
      if (!allowedRooms.has(room)) continue;

      return { x, y };
    }
  }

  return null;
}

  function getPlantWorldPosition() {
  if (plant.carriedBy === 'player') {
    return {
      x: player.x + Math.cos(player.dir) * 0.52,
      y: player.y + Math.sin(player.dir) * 0.52
    };
  }

  if (plant.carriedBy === 'npc') {
    return {
      x: npc.x,
      y: npc.y
    };
  }

  return {
    x: plant.x,
    y: plant.y
  };
}

function getPlantRoomState(state) {
  if (plant.carriedBy === 'player') return getEntityRoomState(player, state);
  if (plant.carriedBy === 'npc') return getEntityRoomState(npc, state);
  return getEntityRoomState(plant, state);
}

function updatePlant(dt) {
  if (!plant.active) return;

  plant.anim += dt;

  const state = snapshotHallwayState();

  const playerRoom = getLooseRoomState(player, state);
  const ghostRoom = npc.active ? getEntityRoomState(npc, state) : 'none';
  const plantRoom = getPlantRoomState(state);

  const happy =
    plantRoom === playerRoom &&
    ghostRoom !== playerRoom;

  if (happy) {
    plant.growth = Math.min(1, plant.growth + dt * 0.025);
    plant.health = Math.min(1, plant.health + dt * 0.012);
  } else if (plantRoom !== playerRoom) {
    plant.health = Math.max(0, plant.health - dt * 0.01);
  } else {
    plant.health = Math.max(0, plant.health - dt * 0.002);
  }
}
  function getPlayerDropPosition() {
  const forwardX = Math.cos(player.dir);
  const forwardY = Math.sin(player.dir);

  return {
    x: player.x + forwardX * 0.72,
    y: player.y + forwardY * 0.72
  };
}

function isValidPlantDropPosition(x, y) {
  if (!canOccupy(x, y, PLANT_RADIUS)) return false;

  const room = getEntityRoomState({ x, y }, hallway);
  if (room !== 'living' && room !== 'bedroom' && room !== 'hallway') return false;

  return true;
}

function tryTogglePlayerPlantCarry() {
  if (!plant.active) return;

  if (plant.carriedBy === 'player') {
    const drop = getPlayerDropPosition();

    if (!isValidPlantDropPosition(drop.x, drop.y)) return;

    plant.x = drop.x;
    plant.y = drop.y;
    plant.carriedBy = null;
    return;
  }

  if (plant.carriedBy !== null) return;

  const pos = getPlantWorldPosition();
  const distance = Math.hypot(pos.x - player.x, pos.y - player.y);

  if (distance > 1.15) return;

  plant.carriedBy = 'player';
}

function updateInteraction() {
  if (!keys.interact) return;

  keys.interact = false;
  tryTogglePlayerPlantCarry();
}

    function randomizeHallwayMode() {
    hallway.lengthMode = Math.random() < 0.5 ? 'long' : 'normal';
    hallway.widthMode = Math.random() < 0.5 ? 'narrow' : 'normal';
  }

      function applyHallwayMode(direction, { immediateWidth = false } = {}) {
  hallway.active = true;
  hallway.direction = direction;

  randomizeHallwayMode();

  hallway.appliedWidthMode = immediateWidth ? hallway.widthMode : 'normal';
  hallway.pendingReset = false;
}

    function seedInitialHallway() {
    const initialDirection = inBedroom(player.x, player.y) ? -1 : 1;
    
    applyHallwayMode(initialDirection, { immediateWidth: true });
    
  }

 function requestHallwayReset() {
  hallway.pendingReset = true;
}

  function snapshotHallwayState() {
  return {
    active: hallway.active,
    direction: hallway.direction,
    lengthMode: hallway.lengthMode,
    widthMode: hallway.widthMode,
    appliedWidthMode: hallway.appliedWidthMode,
    pendingReset: hallway.pendingReset,
  };
}

function restoreHallwayState(state) {
  hallway.active = state.active;
  hallway.direction = state.direction;
  hallway.lengthMode = state.lengthMode;
  hallway.widthMode = state.widthMode;
  hallway.appliedWidthMode = state.appliedWidthMode;
  hallway.pendingReset = state.pendingReset;
}

  function makeResetCandidate(direction) {
  const lengthMode = Math.random() < 0.5 ? 'long' : 'normal';
  const widthMode = Math.random() < 0.5 ? 'narrow' : 'normal';

  return {
    active: true,
    direction,
    lengthMode,
    widthMode,
    appliedWidthMode: widthMode,
    pendingReset: false,
  };
}

function canCommitHallwayResetTo(candidate) {
  if (!hallway.pendingReset) return false;

  const current = snapshotHallwayState();

  if (inHallwayZoneForState(player.x, player.y, current)) return false;

  if (!canSwitchHallwayState(candidate)) return false;

  return true;
}

function resetHallway() {
  if (!hallway.pendingReset) return false;

  const prev = snapshotHallwayState();

  const oldPlayerX = player.x;
  const oldPlayerY = player.y;
  const oldNPCX = npc.x;
  const oldNPCY = npc.y;
  const oldPlantX = plant.x;
  const oldPlantY = plant.y;

  const playerRoom = getEntityRoomState(player, prev);

  const nextDirection =
    playerRoom === 'bedroom' ? -1 :
    playerRoom === 'living' ? 1 :
    hallway.direction;

  const candidate = makeResetCandidate(nextDirection);

  if (!canCommitHallwayResetTo(candidate)) return false;

  const nextPlayer = getRemappedEntityPosition(player, prev, candidate, 0.18);

    const nextNPC = npc.active
    ? getRemappedEntityPosition(npc, prev, candidate, NPC_RADIUS) || { x: npc.x, y: npc.y }
    : { x: npc.x, y: npc.y };

  const nextPlant =
  plant.active && plant.carriedBy === null
    ? getRemappedEntityPosition(plant, prev, candidate, PLANT_RADIUS) ||
      getNearestPlantRestingPositionForState(plant, candidate)
    : { x: plant.x, y: plant.y };

if (!nextPlayer || !nextPlant) {
  player.x = oldPlayerX;
  player.y = oldPlayerY;
  npc.x = oldNPCX;
  npc.y = oldNPCY;
  plant.x = oldPlantX;
  plant.y = oldPlantY;
  restoreHallwayState(prev);
  hallway.pendingReset = true;
  return false;
}

  player.x = nextPlayer.x;
  player.y = nextPlayer.y;
  npc.x = nextNPC.x;
  npc.y = nextNPC.y;

  if (plant.carriedBy === null) {
    plant.x = nextPlant.x;
    plant.y = nextPlant.y;
  }

  restoreHallwayState(candidate);

  return true;
}

function updateHallwayState() {
  const current = snapshotHallwayState();

  if (
    hallway.active &&
    !hallway.pendingReset &&
    !inHallwayZoneForState(player.x, player.y, current)
  ) {
    requestHallwayReset();
  }

  if (hallway.pendingReset) {
    resetHallway();
  }
}

function movePlayer(dt) {
    const keyboardForward = (keys.w ? 1 : 0) + (keys.s ? -1 : 0);
    const keyboardStrafe = (keys.d ? 1 : 0) + (keys.a ? -1 : 0);
    const keyboardLook = (keys.right ? 1 : 0) + (keys.left ? -1 : 0);

    player.dir += lookInput.x * player.rotSpeed * dt;
    player.dir += keyboardLook * player.rotSpeed * dt;
    player.dir += mouseLookDelta * 0.0022;
    mouseLookDelta = 0;

    let forwardInput = moveInput.y + keyboardForward;
    let strafeInput = moveInput.x + keyboardStrafe;

    const inputLen = Math.hypot(forwardInput, strafeInput);
    walkAmount = Math.min(1, inputLen);

    if (inputLen > 1) {
      forwardInput /= inputLen;
      strafeInput /= inputLen;
    }

    const speed = player.moveSpeed * dt;
    const forward = forwardInput * speed;
    const strafe = strafeInput * speed;

    const dx =
      Math.cos(player.dir) * forward +
      Math.cos(player.dir + Math.PI / 2) * strafe;

    const dy =
      Math.sin(player.dir) * forward +
      Math.sin(player.dir + Math.PI / 2) * strafe;

    const nextX = player.x + dx;
    const nextY = player.y + dy;

    if (canOccupy(nextX, player.y)) {
      player.x = nextX;
    } else if (Math.abs(dx) > 0.0001 && canOccupy(player.x + dx * 0.35, player.y)) {
      player.x += dx * 0.35;
    }

    if (canOccupy(player.x, nextY)) {
      player.y = nextY;
    } else if (Math.abs(dy) > 0.0001 && canOccupy(player.x, player.y + dy * 0.35)) {
      player.y += dy * 0.35;
    }

    player.bob += Math.hypot(dx, dy) * 14;
  }

  

function canNPCOccupy(x, y) {
  return canOccupy(x, y, NPC_RADIUS);
}

function repelNPCFromWalls() {
  let pushX = 0;
  let pushY = 0;

  const minX = Math.floor(npc.x - NPC_WALL_REPEL_RADIUS);
  const maxX = Math.floor(npc.x + NPC_WALL_REPEL_RADIUS);
  const minY = Math.floor(npc.y - NPC_WALL_REPEL_RADIUS);
  const maxY = Math.floor(npc.y + NPC_WALL_REPEL_RADIUS);

  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      if (getCell(cx, cy) === 0) continue;

      const nearestX = Math.max(cx, Math.min(npc.x, cx + 1));
      const nearestY = Math.max(cy, Math.min(npc.y, cy + 1));

      let dx = npc.x - nearestX;
      let dy = npc.y - nearestY;
      let dist = Math.hypot(dx, dy);

      if (dist < 0.0001) {
        dx = npc.x - (cx + 0.5);
        dy = npc.y - (cy + 0.5);
        dist = Math.hypot(dx, dy) || 1;
      }

      if (dist < NPC_WALL_REPEL_RADIUS) {
        const strength = (NPC_WALL_REPEL_RADIUS - dist) / NPC_WALL_REPEL_RADIUS;
        pushX += (dx / dist) * strength;
        pushY += (dy / dist) * strength;
      }
    }
  }

  const pushLen = Math.hypot(pushX, pushY);
  if (pushLen <= 0.0001) return;

  const step = Math.min(0.08, pushLen * 0.045);
  moveNPCWithCollision((pushX / pushLen) * step, (pushY / pushLen) * step);
}

function moveNPCWithCollision(dx, dy) {
  let moved = false;

  const nextX = npc.x + dx;
  const nextY = npc.y + dy;

  if (canNPCOccupy(nextX, nextY)) {
    npc.x = nextX;
    npc.y = nextY;
    return true;
  }

  if (Math.abs(dx) > 0.0001 && canNPCOccupy(nextX, npc.y)) {
    npc.x = nextX;
    moved = true;
  }

  if (Math.abs(dy) > 0.0001 && canNPCOccupy(npc.x, nextY)) {
    npc.y = nextY;
    moved = true;
  }

  return moved;
}

function pushNPCOutOfWalls() {
  if (canNPCOccupy(npc.x, npc.y)) return;

  const startX = npc.x;
  const startY = npc.y;

  for (let ring = 1; ring <= 18; ring++) {
    const dist = ring * 0.08;

    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 * i) / 20;
      const testX = startX + Math.cos(angle) * dist;
      const testY = startY + Math.sin(angle) * dist;

      if (canNPCOccupy(testX, testY)) {
        npc.x = testX;
        npc.y = testY;
        return;
      }
    }
  }
}

function randomFloorPointNearNPC(radius = 5.5) {
  for (let i = 0; i < 80; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 1.2 + Math.random() * radius;

    const x = npc.x + Math.cos(angle) * dist;
    const y = npc.y + Math.sin(angle) * dist;

    if (!canNPCOccupy(x, y)) continue;

    const playerDist = Math.hypot(x - player.x, y - player.y);
    if (playerDist < npc.panicRadius + 0.8) continue;

    return { x, y };
  }

  return { x: npc.x, y: npc.y };
}

function chooseNPCRoamTarget() {
  const target = randomFloorPointNearNPC();
  npc.roamTargetX = target.x;
  npc.roamTargetY = target.y;
  npc.roamThinkTime = 1.0 + Math.random() * 2.5;
}

function tryNPCMoveToward(targetX, targetY, speed, dt) {
  const toX = targetX - npc.x;
  const toY = targetY - npc.y;
  const dist = Math.hypot(toX, toY);

  if (dist < 0.08) return true;

  const step = Math.min(speed * dt, dist);
  const baseAngle = Math.atan2(toY, toX);

  const attempts = [
    0,
    0.25,
    -0.25,
    0.5,
    -0.5,
    0.85,
    -0.85,
    1.25,
    -1.25,
    Math.PI / 2,
    -Math.PI / 2
  ];

  for (const offset of attempts) {
    const angle = baseAngle + offset;
    const dx = Math.cos(angle) * step;
    const dy = Math.sin(angle) * step;

    const oldX = npc.x;
    const oldY = npc.y;
    const oldDist = Math.hypot(targetX - oldX, targetY - oldY);

    if (!moveNPCWithCollision(dx, dy)) continue;

    const newDist = Math.hypot(targetX - npc.x, targetY - npc.y);

    if (newDist <= oldDist + 0.01) {
      return true;
    }

    npc.x = oldX;
    npc.y = oldY;
  }

  return false;
}

  function hallCenterY() {
  return (hallY1() + hallY2() + 1) * 0.5;
}

function getRoomCenter(roomName) {
  const room = roomName === 'living' ? livingBounds() : bedroomBounds();

  return {
    x: (room.x1 + room.x2) * 0.5,
    y: hallCenterY()
  };
}

function getOppositeRoomName(roomName) {
  if (roomName === 'living') return 'bedroom';
  if (roomName === 'bedroom') return 'living';
  return 'living';
}

function setNPCTargetRoom(roomName, taskName) {
  if (npc.targetRoom === roomName && npc.task === taskName) return;

  npc.task = taskName;
  npc.targetRoom = roomName;
  npc.path = null;
  npc.pathIndex = 0;
  npc.pathTargetKey = '';
}

function clearNPCTargetRoom() {
  npc.task = 'idle';
  npc.targetRoom = null;
  npc.path = null;
  npc.pathIndex = 0;
  npc.pathTargetKey = '';
}

function setNPCTask(taskName) {
  if (npc.task === taskName && npc.targetRoom === null) return;

  npc.task = taskName;
  npc.targetRoom = null;
  npc.path = null;
  npc.pathIndex = 0;
  npc.pathTargetKey = '';
}

function getGhostTargetRoomPoint(roomName) {
  return getRoomCenter(roomName);
}

function moveNPCToRoom(roomName, speed, dt) {
  const settledRoom = getSettledRoomState(npc, hallway);

  if (settledRoom === roomName) {
    return true;
  }

  const target = getGhostTargetRoomPoint(roomName);
  return tryNPCMoveAlongRoute(target.x, target.y, speed, dt);
}

  function getPathKey(x, y) {
  return `${x},${y}`;
}

function getNearestWalkablePoint(x, y) {
  const startX = Math.floor(x);
  const startY = Math.floor(y);

  if (canNPCOccupy(startX + 0.5, startY + 0.5)) {
    return { x: startX, y: startY };
  }

  for (let r = 1; r <= 8; r++) {
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        const gx = startX + ox;
        const gy = startY + oy;

        if (canNPCOccupy(gx + 0.5, gy + 0.5)) {
          return { x: gx, y: gy };
        }
      }
    }
  }

  return { x: startX, y: startY };
}

  function buildNPCPath(targetX, targetY) {
  const start = getNearestWalkablePoint(npc.x, npc.y);
  const goal = getNearestWalkablePoint(targetX, targetY);

  const startKey = getPathKey(start.x, start.y);
  const goalKey = getPathKey(goal.x, goal.y);

  if (startKey === goalKey) {
    return [{ x: targetX, y: targetY }];
  }

  const queue = [start];
  const cameFrom = new Map();
  const visited = new Set([startKey]);

  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];

  let found = false;

  while (queue.length > 0 && visited.size < 5000) {
    const current = queue.shift();
    const currentKey = getPathKey(current.x, current.y);

    if (currentKey === goalKey) {
      found = true;
      break;
    }

    for (const dir of directions) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const nextKey = getPathKey(nx, ny);

      if (visited.has(nextKey)) continue;
      if (!canNPCOccupy(nx + 0.5, ny + 0.5)) continue;

      visited.add(nextKey);
      cameFrom.set(nextKey, currentKey);
      queue.push({ x: nx, y: ny });
    }
  }

  if (!found) {
    return [];
  }

  const path = [];
  let currentKey = goalKey;

  while (currentKey !== startKey) {
    const [x, y] = currentKey.split(',').map(Number);
    path.unshift({ x: x + 0.5, y: y + 0.5 });
    currentKey = cameFrom.get(currentKey);

    if (!currentKey) return [];
  }

  path.push({ x: targetX, y: targetY });

  return path;
}

  function tryNPCMoveAlongRoute(targetX, targetY, speed, dt) {
  const targetKey = `${targetX.toFixed(2)},${targetY.toFixed(2)}`;

  if (npc.pathTargetKey !== targetKey || !npc.path || npc.path.length === 0) {
    npc.pathTargetKey = targetKey;
    npc.path = buildNPCPath(targetX, targetY);
    npc.pathIndex = 0;
  }

  if (!npc.path || npc.path.length === 0) {
    return false;
  }

  npc.pathIndex = Math.max(0, Math.min(npc.pathIndex || 0, npc.path.length - 1));

  let waypoint = npc.path[npc.pathIndex];

  while (
    Math.hypot(npc.x - waypoint.x, npc.y - waypoint.y) < 0.32 &&
    npc.pathIndex < npc.path.length - 1
  ) {
    npc.pathIndex += 1;
    waypoint = npc.path[npc.pathIndex];
  }

  const moved = tryNPCMoveToward(waypoint.x, waypoint.y, speed, dt);

  if (!moved) {
    npc.path = buildNPCPath(targetX, targetY);
    npc.pathIndex = 0;
  }

  return moved;
}

    function findPlantDropNearPlayer() {
      
    const playerRoom = getLooseRoomState(player, hallway);

  if (playerRoom !== 'living' && playerRoom !== 'bedroom') return null;

  let best = null;
  let bestScore = Infinity;

  const distances = [0.65, 0.8, 1.0, 1.2, 1.45];

  for (const dist of distances) {
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16;

      const x = player.x + Math.cos(angle) * dist;
      const y = player.y + Math.sin(angle) * dist;

      if (!canOccupy(x, y, PLANT_RADIUS)) continue;
      if (inHallwayZone(x, y)) continue;
      if (getEntityRoomState({ x, y }, hallway) !== playerRoom) continue;

      const npcDistance = Math.hypot(x - npc.x, y - npc.y);
      const playerDistance = Math.hypot(x - player.x, y - player.y);

      const score = npcDistance + playerDistance * 0.35;

      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }

  if (best) return best;

  const roomCenter = getRoomCenter(playerRoom);
  const fallbackDistances = [0, 0.6, 0.9, 1.2, 1.6, 2.0];

  for (const dist of fallbackDistances) {
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16;

      const x = roomCenter.x + Math.cos(angle) * dist;
      const y = roomCenter.y + Math.sin(angle) * dist;

      if (!canOccupy(x, y, PLANT_RADIUS)) continue;
      if (inHallwayZone(x, y)) continue;
      if (getEntityRoomState({ x, y }, hallway) !== playerRoom) continue;

      const npcDistance = Math.hypot(x - npc.x, y - npc.y);
      const playerDistance = Math.hypot(x - player.x, y - player.y);

      const score = playerDistance + npcDistance * 0.35;

      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }

  return best;
}

  function getNPCFollowPlayerPoint() {
  const preferredDistance = 1.35;

  const behindX = player.x - Math.cos(player.dir) * preferredDistance;
  const behindY = player.y - Math.sin(player.dir) * preferredDistance;

  if (canNPCOccupy(behindX, behindY)) {
    return { x: behindX, y: behindY };
  }

  const angles = [
    player.dir + Math.PI,
    player.dir + Math.PI * 0.75,
    player.dir - Math.PI * 0.75,
    player.dir + Math.PI / 2,
    player.dir - Math.PI / 2
  ];

  for (const angle of angles) {
    const x = player.x + Math.cos(angle) * preferredDistance;
    const y = player.y + Math.sin(angle) * preferredDistance;

    if (canNPCOccupy(x, y)) {
      return { x, y };
    }
  }

  return null;
}

function followPlayerWithPlant(dt) {
  if (npc.task !== 'follow_player_with_plant') {
    npc.task = 'follow_player_with_plant';
    npc.targetRoom = null;
    npc.path = null;
    npc.pathIndex = 0;
    npc.pathTargetKey = '';
  }

  const distanceToPlayer = Math.hypot(player.x - npc.x, player.y - npc.y);

  if (distanceToPlayer < 1.05) {
    npc.anim += dt * 3.8;
    return true;
  }

  const follow = getNPCFollowPlayerPoint();
  const carrySpeed = npc.fleeSpeed * 2.0;

  let moved = false;

  if (follow) {
    moved = tryNPCMoveAlongRoute(follow.x, follow.y, carrySpeed, dt);
  }

  if (!moved && distanceToPlayer > 1.25) {
    moved = tryNPCMoveToward(player.x, player.y, carrySpeed, dt);
  }

  npc.anim += dt * (moved ? 8.8 : 4.4);
  return true;
}

  function updateNPCPlantTask(dt) {
  const state = snapshotHallwayState();

  const playerRoom = getLooseRoomState(player, state);
  const ghostRoom = getEntityRoomState(npc, state);
  const ghostSettledRoom = getSettledRoomState(npc, state);
  const plantRoom = getPlantRoomState(state);

  const playerIsInRoom =
    playerRoom === 'living' ||
    playerRoom === 'bedroom';

  if (playerIsInRoom) {
    npc.lastPlayerRoom = playerRoom;
  }

  const lastUsefulPlayerRoom =
    playerIsInRoom
      ? playerRoom
      : npc.lastPlayerRoom;

      if (plant.carriedBy === 'player') {
    if (lastUsefulPlayerRoom) {
      const fleeRoom = getOppositeRoomName(lastUsefulPlayerRoom);

      if (
        npc.targetRoom !== fleeRoom ||
        npc.task !== 'flee_from_player_with_plant'
      ) {
        setNPCTargetRoom(fleeRoom, 'flee_from_player_with_plant');
      }

      const distanceToPlayer = Math.hypot(player.x - npc.x, player.y - npc.y);

      if (
        (ghostRoom === playerRoom || ghostSettledRoom === playerRoom) &&
        distanceToPlayer < npc.fearRadius
      ) {
        const awayX = npc.x - player.x;
        const awayY = npc.y - player.y;

        updateNPCFear(dt, distanceToPlayer, awayX, awayY);

        if (distanceToPlayer < npc.panicRadius + 0.6) {
          return true;
        }
      }

      if (ghostSettledRoom === npc.targetRoom) {
        npc.anim += dt * 1.6;
        return true;
      }

      const moved = moveNPCToRoom(npc.targetRoom, npc.panicSpeed, dt);
      npc.anim += dt * (moved ? 7.2 : 3.5);
      return true;
    }

    clearNPCTargetRoom();
    return false;
  }

  if (plant.carriedBy === 'npc') {
    if (!playerIsInRoom) {
      return followPlayerWithPlant(dt);
    }

    setNPCTargetRoom(playerRoom, 'bring_plant_to_player');

    const carrySpeed = npc.fleeSpeed * 2.0;
    const drop = findPlantDropNearPlayer();

    if (drop) {
      const distToDrop = Math.hypot(drop.x - npc.x, drop.y - npc.y);

      if (distToDrop < 0.55) {
        plant.x = drop.x;
        plant.y = drop.y;
        plant.carriedBy = null;

        const fleeRoom = getOppositeRoomName(playerRoom);
        setNPCTargetRoom(fleeRoom, 'leave_room_so_plant_can_grow');

        return true;
      }

      const moved = tryNPCMoveAlongRoute(drop.x, drop.y, carrySpeed, dt);

      if (!moved) {
        npc.path = null;
        npc.pathIndex = 0;
        npc.pathTargetKey = '';

        const npcRoom = getEntityRoomState(npc, state);

        if (
          npcRoom === playerRoom &&
          isValidPlantDropPosition(npc.x, npc.y)
        ) {
          plant.x = npc.x;
          plant.y = npc.y;
          plant.carriedBy = null;

          const fleeRoom = getOppositeRoomName(playerRoom);
          setNPCTargetRoom(fleeRoom, 'leave_room_so_plant_can_grow');

          npc.anim += dt * 6.0;
          return true;
        }
      }

      npc.anim += dt * (moved ? 9.8 : 4.8);
      return true;
    }

    if (ghostRoom === playerRoom || ghostSettledRoom === playerRoom) {
      const distanceToPlayer = Math.hypot(player.x - npc.x, player.y - npc.y);

      if (distanceToPlayer > 0.9) {
        const moved = tryNPCMoveToward(player.x, player.y, carrySpeed, dt);
        npc.anim += dt * (moved ? 9.8 : 4.8);
      } else {
        npc.anim += dt * 4.8;
      }

      return true;
    }

    const moved = moveNPCToRoom(playerRoom, carrySpeed, dt);
    npc.anim += dt * (moved ? 9.8 : 4.8);
    return true;
  }

  if (plant.carriedBy === null) {
    if (!playerIsInRoom) {
      setNPCTask('fetch_plant');

      const pos = getPlantWorldPosition();
      const distToPlant = Math.hypot(pos.x - npc.x, pos.y - npc.y);

      if (distToPlant < 0.8) {
        plant.carriedBy = 'npc';
        npc.path = null;
        npc.pathIndex = 0;
        npc.pathTargetKey = '';
        return true;
      }

      const moved = tryNPCMoveAlongRoute(pos.x, pos.y, npc.fleeSpeed, dt);
      npc.anim += dt * (moved ? 5.8 : 3.0);
      return true;
    }

    if (plantRoom !== playerRoom) {
      setNPCTask('fetch_plant');

      const pos = getPlantWorldPosition();
      const distToPlant = Math.hypot(pos.x - npc.x, pos.y - npc.y);

      if (distToPlant < 0.8) {
        plant.carriedBy = 'npc';
        npc.path = null;
        npc.pathIndex = 0;
        npc.pathTargetKey = '';
        return true;
      }

      const moved = tryNPCMoveAlongRoute(pos.x, pos.y, npc.fleeSpeed, dt);
      npc.anim += dt * (moved ? 5.8 : 3.0);
      return true;
    }

    if (plantRoom === playerRoom) {
      const oppositeRoom = getOppositeRoomName(playerRoom);

      if (!npc.targetRoom || npc.task !== 'leave_room_so_plant_can_grow') {
        setNPCTargetRoom(oppositeRoom, 'leave_room_so_plant_can_grow');
      }

      if (ghostSettledRoom === npc.targetRoom) {
        clearNPCTargetRoom();
        npc.anim += dt * 1.6;
        return true;
      }

      const moved = moveNPCToRoom(npc.targetRoom, npc.panicSpeed, dt);
      npc.anim += dt * (moved ? 7.2 : 3.5);
      return true;
    }
  }

  return false;
}

function tryNPCFleeStep(angle, step, oldDistance) {
  const oldX = npc.x;
  const oldY = npc.y;

  const dx = Math.cos(angle) * step;
  const dy = Math.sin(angle) * step;

  if (!moveNPCWithCollision(dx, dy)) return false;

  const newDistance = Math.hypot(npc.x - player.x, npc.y - player.y);

  if (newDistance >= oldDistance - 0.005) {
    return true;
  }

  npc.x = oldX;
  npc.y = oldY;
  return false;
}

function updateNPCRoaming(dt) {
  if (npc.roamPause > 0) {
    npc.roamPause -= dt;
    npc.anim += dt * 2.2;
    return;
  }

  npc.roamThinkTime -= dt;

  const targetDist = Math.hypot(npc.roamTargetX - npc.x, npc.roamTargetY - npc.y);

  if (targetDist < 0.25 || npc.roamThinkTime <= 0) {
    if (Math.random() < 0.35) {
      npc.roamPause = 0.4 + Math.random() * 1.4;
    }

    chooseNPCRoamTarget();
    return;
  }

  const moved = tryNPCMoveToward(npc.roamTargetX, npc.roamTargetY, npc.roamSpeed, dt);

  npc.anim += dt * (moved ? 4.2 : 2.4);

  if (!moved) {
    chooseNPCRoamTarget();
  }
}

function updateNPCFear(dt, distance, awayX, awayY) {
  const urgency = 1 - Math.min(1, distance / npc.fearRadius);
  const speed = npc.fleeSpeed + urgency * (npc.panicSpeed - npc.fleeSpeed);
  const step = speed * dt;

  const baseAngle = distance > 0.01
    ? Math.atan2(awayY, awayX)
    : player.dir + Math.PI;

  const attempts = [
    0,
    0.25,
    -0.25,
    0.5,
    -0.5,
    0.85,
    -0.85,
    1.2,
    -1.2,
    Math.PI / 2,
    -Math.PI / 2,
    Math.PI
  ];

  for (const offset of attempts) {
    if (tryNPCFleeStep(baseAngle + offset, step, distance)) {
      npc.anim += dt * 8.2;
      npc.roamPause = 0;
      npc.roamThinkTime = 0.2;
      return;
    }
  }

  npc.anim += dt * 6.5;
}

function updateNPC(dt) {
  if (!npc.active) return;

  pushNPCOutOfWalls();
  repelNPCFromWalls();

  if (updateNPCPlantTask(dt)) {
    return;
  }

  updateNPCRoaming(dt);
}
  
  function updateDebugOverlay() {
  const el = document.getElementById('debugOverlay');
  if (!el) return;

  if (!DEBUG || !debugVisible) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';

  const state = snapshotHallwayState();

  const playerStrictRoom = getEntityRoomState(player, state);
  const playerRoom = getLooseRoomState(player, state);
  const ghostRoom = getEntityRoomState(npc, state);
  const ghostSettledRoom = getSettledRoomState(npc, state);
  const plantRoom = getPlantRoomState(state);

  const living = livingBoundsForState(state);
  const bedroom = bedroomBoundsForState(state);

  const playerIsInRoom =
    playerRoom === 'living' ||
    playerRoom === 'bedroom';

  const usefulPlayerRoom =
    playerIsInRoom
      ? playerRoom
      : npc.lastPlayerRoom;

  const desiredFleeRoom =
    plant.carriedBy === 'player' && usefulPlayerRoom
      ? getOppositeRoomName(usefulPlayerRoom)
      : 'n/a';

  let drop = null;
  let dropText = 'none';
  let routeText = 'n/a';
  let distToDropText = 'n/a';

  if (plant.carriedBy === 'npc' && playerIsInRoom) {
    drop = findPlantDropNearPlayer();

    if (drop) {
      const route = buildNPCPath(drop.x, drop.y);
      const distToDrop = Math.hypot(drop.x - npc.x, drop.y - npc.y);

      dropText = `${drop.x.toFixed(2)}, ${drop.y.toFixed(2)}`;
      routeText = `${route.length}`;
      distToDropText = distToDrop.toFixed(2);
    }
  }

  const npcDropHere =
    playerIsInRoom &&
    getEntityRoomState(npc, state) === playerRoom &&
    isValidPlantDropPosition(npc.x, npc.y);

  el.textContent = [
    `debug: p to toggle`,
    `carriedBy: ${plant.carriedBy}`,
    `npc.task: ${npc.task}`,
    `npc.targetRoom: ${npc.targetRoom}`,
    `desiredFleeRoom: ${desiredFleeRoom}`,
    `npc.lastPlayerRoom: ${npc.lastPlayerRoom}`,
    ``,
    `playerXY: ${player.x.toFixed(2)}, ${player.y.toFixed(2)}`,
    `playerTile: ${Math.floor(player.x)}, ${Math.floor(player.y)}`,
    `npcXY: ${npc.x.toFixed(2)}, ${npc.y.toFixed(2)}`,
    `npcTile: ${Math.floor(npc.x)}, ${Math.floor(npc.y)}`,
    `plantXY: ${plant.x.toFixed(2)}, ${plant.y.toFixed(2)}`,
    ``,
    `livingBounds: x ${living.x1.toFixed(2)}-${living.x2.toFixed(2)} y ${living.y1.toFixed(2)}-${living.y2.toFixed(2)}`,
    `bedroomBounds: x ${bedroom.x1.toFixed(2)}-${bedroom.x2.toFixed(2)} y ${bedroom.y1.toFixed(2)}-${bedroom.y2.toFixed(2)}`,
    ``,
    `playerStrictRoom: ${playerStrictRoom}`,
    `playerLooseRoom: ${playerRoom}`,
    `ghostRoom: ${ghostRoom}`,
    `ghostSettled: ${ghostSettledRoom}`,
    `plantRoom: ${plantRoom}`,
    ``,
    `drop: ${dropText}`,
    `distToDrop: ${distToDropText}`,
    `routeToDropLen: ${routeText}`,
    `npc.pathLen: ${npc.path ? npc.path.length : 0}`,
    `npc.pathIndex: ${npc.pathIndex}`,
    `npc.pathKey: ${npc.pathTargetKey}`,
    ``,
    `npcDropHere: ${npcDropHere}`,
    `distNPCPlayer: ${Math.hypot(player.x - npc.x, player.y - npc.y).toFixed(2)}`,
    `hallway pending: ${hallway.pendingReset}`,
    `hall len/width: ${hallway.lengthMode}/${hallway.appliedWidthMode}`
  ].join('\n');
}

        function drawBackground() {
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
  }

      function castRays() {
    const w = renderCanvas.width;
    const h = renderCanvas.height;

    zBuffer.length = w;

    const fov = Math.PI / 3;

    const bobOffset = Math.sin(player.bob * 0.9) * Math.min(1.4, walkAmount * 1.4);
    const horizon = h / 2 + bobOffset;

    const dirX = Math.cos(player.dir);
    const dirY = Math.sin(player.dir);
    const planeLen = Math.tan(fov / 2);
    const planeX = -dirY * planeLen;
    const planeY = dirX * planeLen;

    const rayDirX0 = dirX - planeX;
    const rayDirY0 = dirY - planeY;
    const rayDirX1 = dirX + planeX;
    const rayDirY1 = dirY + planeY;

    const planeBase = '#FFFFFF';
    const posZ = h * 0.5;

    for (let row = 1; row < h; row++) {
      const floorY = Math.floor(horizon + row);
      const ceilY = Math.floor(horizon - row);

      if (floorY >= h && ceilY < 0) break;

      const rowDistance = posZ / row;
      const stepX = rowDistance * (rayDirX1 - rayDirX0) / w;
      const stepY = rowDistance * (rayDirY1 - rayDirY0) / w;

      let worldX = player.x + rowDistance * rayDirX0;
      let worldY = player.y + rowDistance * rayDirY0;

      const floorColor = shade(planeBase, -Math.round(Math.min(34, 8 + rowDistance * 2.4)));
      const ceilingColor = shade(planeBase, -Math.round(Math.min(14, rowDistance * 0.8)));

      for (let x = 0; x < w; x++) {
        const cell = getCell(Math.floor(worldX), Math.floor(worldY));

        if (cell === 0) {
          if (floorY >= 0 && floorY < h) {
            rctx.fillStyle = floorColor;
            rctx.fillRect(x, floorY, 1, 1);
          }

          if (ceilY >= 0 && ceilY < h) {
            rctx.fillStyle = ceilingColor;
            rctx.fillRect(x, ceilY, 1, 1);
          }
        }

        worldX += stepX;
        worldY += stepY;
      }
    }

    for (let x = 0; x < w; x++) {
      const cameraX = 2 * x / w - 1;
      const rayDirX = dirX + planeX * cameraX;
      const rayDirY = dirY + planeY * cameraX;

      let mapX = Math.floor(player.x);
      let mapY = Math.floor(player.y);

      const deltaDistX = Math.abs(1 / (rayDirX || 0.0001));
      const deltaDistY = Math.abs(1 / (rayDirY || 0.0001));

      let stepX, stepY, sideDistX, sideDistY;

      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (player.x - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1 - player.x) * deltaDistX;
      }

      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (player.y - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1 - player.y) * deltaDistY;
      }

      let hit = 0;
      let side = 0;

      while (!hit) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        hit = getCell(mapX, mapY);
      }

      let perpWallDist;
      if (side === 0) {
        perpWallDist = (mapX - player.x + (1 - stepX) / 2) / (rayDirX || 0.0001);
      } else {
        perpWallDist = (mapY - player.y + (1 - stepY) / 2) / (rayDirY || 0.0001);
      }

      perpWallDist = Math.max(perpWallDist, 0.001);

      const lineHeight = Math.floor(h / perpWallDist);
      const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + horizon));
      const drawEnd = Math.min(h - 1, Math.floor(lineHeight / 2 + horizon));

      const style = wallStyles[hit] || wallStyles[1];
      const base = side ? style.shade : style.base;

      const wallDarkening = Math.round(Math.min(35, perpWallDist * 5.25));

zBuffer[x] = perpWallDist;

const color = shade(base, -wallDarkening);
rctx.fillStyle = color;
rctx.fillRect(x, drawStart, 1, drawEnd - drawStart + 1);      
    }
  }

  function projectWorldPoint(wx, wy, z = 0.5) {
  const w = renderCanvas.width;
  const h = renderCanvas.height;
  const fov = Math.PI / 3;

  const dirX = Math.cos(player.dir);
  const dirY = Math.sin(player.dir);
  const planeLen = Math.tan(fov / 2);
  const planeX = -dirY * planeLen;
  const planeY = dirX * planeLen;

  const relX = wx - player.x;
  const relY = wy - player.y;

  const invDet = 1 / (planeX * dirY - dirX * planeY);
  const transformX = invDet * (dirY * relX - dirX * relY);
  const transformY = invDet * (-planeY * relX + planeX * relY);

  if (transformY <= 0.06) return null;

  const cameraBobOffset = Math.sin(player.bob * 0.9) * Math.min(1.4, walkAmount * 1.4);
  const horizon = h / 2 + cameraBobOffset;

  return {
    x: (w / 2) * (1 + transformX / transformY),
    y: horizon + (0.5 - z) * h / transformY,
    depth: transformY
  };
}

  function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function roughLeaf(x, y, w, h, rot, color) {
  rctx.save();
  rctx.translate(x, y);
  rctx.rotate(rot);
  rctx.fillStyle = color;
  rctx.beginPath();
  rctx.moveTo(0, -h);
  rctx.quadraticCurveTo(w * 0.85, -h * 0.55, w * 0.72, 0);
  rctx.quadraticCurveTo(w * 0.5, h * 0.8, 0, h);
  rctx.quadraticCurveTo(-w * 0.8, h * 0.45, -w * 0.9, 0);
  rctx.quadraticCurveTo(-w * 0.55, -h * 0.7, 0, -h);
  rctx.fill();
  rctx.restore();
}

function drawPlantSprite(cx, baseY, spriteW, spriteH, life, growth, sway) {
  const deadness = 1 - life;

  const potDark = '#2A1710';
  const potMid = '#6A3B26';
  const potLight = '#875236';
  const soil = '#120D0A';

  const stem = life > 0.2 ? '#102816' : '#3A2618';
  const leafDark = life > 0.25 ? '#0F2415' : '#3A2618';
  const leafMid = life > 0.35 ? '#1D3A22' : '#4A4325';
  const leafHi = life > 0.75 ? '#31583A' : leafMid;

  const potH = spriteH * 0.26;
  const potTopW = spriteW * 0.43;
  const potBotW = spriteW * 0.31;
  const potTopY = baseY - potH;
  const plantBase = potTopY - spriteH * 0.035;

  rctx.save();

    rctx.fillStyle = 'rgba(0,0,0,0.22)';
  rctx.fillRect(
    Math.round(cx - potBotW * 0.46),
    Math.round(baseY),
    Math.round(potBotW * 0.92),
    1
  );

  rctx.fillStyle = potDark;
  rctx.beginPath();
  rctx.moveTo(cx - potTopW * 0.5, potTopY);
  rctx.lineTo(cx + potTopW * 0.5, potTopY);
  rctx.lineTo(cx + potBotW * 0.5, baseY);
  rctx.lineTo(cx - potBotW * 0.5, baseY);
  rctx.closePath();
  rctx.fill();

  rctx.fillStyle = potMid;
  rctx.fillRect(
    Math.round(cx - potTopW * 0.56),
    Math.round(potTopY - spriteH * 0.035),
    Math.round(potTopW * 1.12),
    Math.max(1, Math.round(spriteH * 0.055))
  );

  rctx.fillStyle = potLight;
  rctx.fillRect(
    Math.round(cx - potTopW * 0.48),
    Math.round(potTopY - spriteH * 0.028),
    Math.round(potTopW * 0.28),
    Math.max(1, Math.round(spriteH * 0.026))
  );

  rctx.fillStyle = soil;
  rctx.fillRect(
    Math.round(cx - potTopW * 0.4),
    Math.round(potTopY),
    Math.round(potTopW * 0.8),
    Math.max(1, Math.round(spriteH * 0.025))
  );

  const plantTop =
    plantBase -
    spriteH * (0.18 + growth * 0.38) +
    deadness * spriteH * 0.18;

  const leafCount = Math.round(6 + growth * 18);

  rctx.strokeStyle = stem;
  rctx.lineWidth = Math.max(1, spriteW * 0.018);
  rctx.lineCap = 'round';

  for (let i = 0; i < leafCount; i++) {
    const t = i / Math.max(1, leafCount - 1);
    const side = i % 2 === 0 ? -1 : 1;

    const px =
      cx +
      side * spriteW * (0.03 + t * 0.21) +
      Math.sin(i * 4.7) * spriteW * 0.07 +
      sway * (1 - t);

    const py =
      plantBase -
      (plantBase - plantTop) * t +
      Math.sin(i * 2.3) * spriteH * 0.035 +
      deadness * spriteH * t * 0.14;

    rctx.beginPath();
    rctx.moveTo(cx, plantBase);
    rctx.quadraticCurveTo(
      cx + (px - cx) * 0.25,
      plantBase - spriteH * 0.16,
      px,
      py
    );
    rctx.stroke();
  }

  if (life > 0.04) {
    for (let i = 0; i < leafCount; i++) {
      const t = i / Math.max(1, leafCount - 1);
      const side = i % 2 === 0 ? -1 : 1;

      const spread = spriteW * (0.055 + t * 0.29);
      const leafX =
        cx +
        side * spread +
        Math.sin(i * 3.9) * spriteW * 0.075 +
        sway * (1 - t);

      const leafY =
        plantBase -
        (plantBase - plantTop) * t +
        Math.sin(i * 2.1 + plant.anim * 0.7) * spriteH * 0.022 +
        deadness * spriteH * t * 0.16;

      const leafW =
        spriteW *
        (0.045 + growth * 0.022) *
        (1 - deadness * 0.35);

      const leafH =
        spriteH *
        (0.026 + growth * 0.014) *
        (1 - deadness * 0.3);

      const color =
        i % 7 === 0 ? leafHi :
        i % 2 === 0 ? leafDark :
        leafMid;

      roughLeaf(
        leafX,
        leafY,
        Math.max(1.2, leafW),
        Math.max(1.2, leafH),
        side * (0.5 + t * 0.7) + Math.sin(i) * 0.28,
        color
      );
    }
  }

  if (growth > 0.58 && life > 0.2) {
  const vineGrow = clamp01((growth - 0.58) / 0.42);
  const vineCount = Math.max(1, Math.round(1 + vineGrow * 2));

  rctx.strokeStyle = stem;
  rctx.lineWidth = Math.max(1, spriteW * 0.015);

  for (let i = 0; i < vineCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;

    const individualGrow = clamp01(vineGrow * 1.45 - i * 0.22);
    if (individualGrow <= 0) continue;

    const vinePhase = plant.anim * 0.55 + i * 1.7;
    const slowDrop = Math.sin(vinePhase) * spriteH * 0.018 * life * individualGrow;
    const slowSwing = Math.sin(vinePhase * 0.8) * spriteW * 0.025 * life * individualGrow;

    const startX = cx + side * spriteW * (0.12 + i * 0.04);
    const startY = potTopY;

    const fullEndX =
      startX +
      side * spriteW * (0.06 + i * 0.02) +
      slowSwing;

    const fullEndY =
      startY +
      spriteH * (0.08 + growth * 0.14) +
      slowDrop;

    const endX = startX + (fullEndX - startX) * individualGrow;
    const endY = startY + (fullEndY - startY) * individualGrow;

    const controlX =
      startX +
      (side * spriteW * 0.08 + slowSwing * 0.35) * individualGrow;

    const controlY =
      startY +
      spriteH * 0.08 * individualGrow;

    rctx.globalAlpha = individualGrow;

    rctx.beginPath();
    rctx.moveTo(startX, startY);
    rctx.quadraticCurveTo(controlX, controlY, endX + sway * 0.2, endY);
    rctx.stroke();

    if (individualGrow > 0.35) {
      roughLeaf(
        endX,
        endY,
        spriteW * 0.045 * individualGrow,
        spriteH * 0.026 * individualGrow,
        side * 0.75 + Math.sin(vinePhase) * 0.12,
        leafDark
      );
    }

    rctx.globalAlpha = 1;
  }
}

  if (life < 0.1) {
    rctx.strokeStyle = '#3A2618';
    rctx.lineWidth = Math.max(1, spriteW * 0.018);

    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      rctx.beginPath();
      rctx.moveTo(cx, plantBase);
      rctx.lineTo(
        cx + side * spriteW * (0.06 + i * 0.024),
        plantBase + spriteH * (0.035 + i * 0.02)
      );
      rctx.stroke();
    }
  }

  rctx.restore();
}

function drawPlant() {
  if (!plant.active) return;
  if (plant.carriedBy === 'player') return;
  if (plant.carriedBy === 'npc') return;

  const pos = getPlantWorldPosition();
  const base = projectWorldPoint(pos.x, pos.y, 0.03);

  if (!base) return;

  if (
    base.x < -120 ||
    base.x > renderCanvas.width + 120 ||
    base.y < -120 ||
    base.y > renderCanvas.height + 120
  ) {
    return;
  }

  const life = clamp01(plant.health);
  const growth = clamp01(plant.growth);

  const spriteH = Math.floor(
  PLANT_SPRITE_PROJECTION_HEIGHT *
  1.27 /
  base.depth
);

  const spriteW = Math.floor(spriteH * 0.56);

  if (spriteH < 4 || spriteW < 3) return;

  const sway =
    Math.sin(plant.anim * 1.2) *
    Math.max(0.3, spriteW * 0.02) *
    life;

  const startX = Math.floor(base.x - spriteW / 2);
  const endX = Math.floor(base.x + spriteW / 2);
  const baseY = Math.floor(base.y);

  for (let x = startX; x <= endX; x++) {
    if (x < 0 || x >= renderCanvas.width) continue;

    const wallDepth = zBuffer[x];

    if (wallDepth !== undefined && base.depth >= wallDepth - 0.04) {
      continue;
    }

    rctx.save();
    rctx.beginPath();
    rctx.rect(x, baseY - spriteH - 4, 1, spriteH + 8);
    rctx.clip();

    drawPlantSprite(base.x, baseY, spriteW, spriteH, life, growth, sway);

    rctx.restore();
  }
}

  function drawHeldPlant() {
  if (!plant.active) return;
  if (plant.carriedBy !== 'player') return;

  const life = clamp01(plant.health);
  const growth = clamp01(plant.growth);

  const w = renderCanvas.width;
  const h = renderCanvas.height;

  const walkBob = Math.sin(player.bob * 0.9) * Math.min(4.5, walkAmount * 4.5);
  const handSway = Math.sin(plant.anim * 1.4) * 2.4;

  const spriteH = Math.floor(h * 0.72);
  const spriteW = Math.floor(spriteH * 0.56);

  const cx = Math.floor(w * 0.58 + handSway);
  const baseY = Math.floor(h * 1.04 + walkBob);

  const plantSway =
    Math.sin(plant.anim * 1.2) *
    Math.max(0.8, spriteW * 0.02) *
    life;

  rctx.save();
  rctx.globalAlpha = 0.98;

  rctx.beginPath();
  rctx.rect(
    Math.floor(cx - spriteW * 0.72),
    Math.floor(baseY - spriteH - 8),
    Math.ceil(spriteW * 1.44),
    Math.ceil(spriteH + 12)
  );
  rctx.clip();

  drawPlantSprite(
    cx,
    baseY,
    spriteW,
    spriteH,
    life,
    growth,
    plantSway
  );

  rctx.restore();
}

function drawWallClockHand3D(cx, cy, cz, angle, length, width, color, tail = 0.035) {
  const dirY = Math.sin(angle);
  const dirZ = Math.cos(angle);

  const perpY = Math.cos(angle);
  const perpZ = -Math.sin(angle);

  const tipY = cy + dirY * length;
  const tipZ = cz + dirZ * length;

  const baseY = cy - dirY * tail;
  const baseZ = cz - dirZ * tail;

  const halfWidth = width * 0.5;

  const pTip = projectWorldPoint(cx, tipY, tipZ);

  const pBaseLeft = projectWorldPoint(
    cx,
    baseY + perpY * halfWidth,
    baseZ + perpZ * halfWidth
  );

  const pBaseRight = projectWorldPoint(
    cx,
    baseY - perpY * halfWidth,
    baseZ - perpZ * halfWidth
  );

  if (!pTip || !pBaseLeft || !pBaseRight) return;

  rctx.save();
  rctx.fillStyle = color;
  rctx.beginPath();
  rctx.moveTo(pTip.x, pTip.y);
  rctx.lineTo(pBaseLeft.x, pBaseLeft.y);
  rctx.lineTo(pBaseRight.x, pBaseRight.y);
  rctx.closePath();
  rctx.fill();
  rctx.restore();
}

function drawPanelClock() {
  const panelX = hallLeft() - PANEL_OFFSET;

  const clockX = panelX - 0.012;
  const clockY = 6.0;
  const clockZ = 0.57;

  const center = projectWorldPoint(clockX, clockY, clockZ);
  if (!center) return;

  if (
    center.x < -120 ||
    center.x > renderCanvas.width + 120 ||
    center.y < -120 ||
    center.y > renderCanvas.height + 120
  ) {
    return;
  }

  const screenX = Math.max(0, Math.min(renderCanvas.width - 1, Math.floor(center.x)));
  const wallDepth = zBuffer[screenX];

  if (wallDepth !== undefined && center.depth > wallDepth + 0.18) return;

  const now = new Date();
  const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;

  const secondAngle = seconds / 60 * Math.PI * 2;
  const minuteAngle = minutes / 60 * Math.PI * 2;
  const hourAngle = hours / 12 * Math.PI * 2;

  drawWallClockHand3D(clockX, clockY, clockZ, hourAngle, 0.095, 0.017, 'rgba(0,0,0,0.96)', 0);
drawWallClockHand3D(clockX, clockY, clockZ, minuteAngle, 0.43, 0.009, 'rgba(0,0,0,0.92)', 0);
drawWallClockHand3D(clockX, clockY, clockZ, secondAngle, 0.46, 0.0028, 'rgba(0,0,0,0.38)', 0.025);

const dotRadius = Math.min(1.7, Math.max(0.35, renderCanvas.height * 0.011 / center.depth));

if (dotRadius > 0.45) {
  rctx.save();
  rctx.fillStyle = 'rgba(0,0,0,0.82)';
  rctx.beginPath();
  rctx.arc(center.x, center.y, dotRadius, 0, Math.PI * 2);
  rctx.fill();
  rctx.restore();
}
}
  
  function drawNPC() {
  if (!npc.active) return;

  const w = renderCanvas.width;
  const h = renderCanvas.height;
  const fov = Math.PI / 3;

  const dirX = Math.cos(player.dir);
  const dirY = Math.sin(player.dir);
  const planeLen = Math.tan(fov / 2);
  const planeX = -dirY * planeLen;
  const planeY = dirX * planeLen;

    const relX = npc.x - player.x;
  const relY = npc.y - player.y;

  const invDet = 1 / (planeX * dirY - dirX * planeY);
  const baseTransformX = invDet * (dirY * relX - dirX * relY);
  const baseTransformY = invDet * (-planeY * relX + planeX * relY);

  if (baseTransformY <= 0.1) return;

  const swayAmount = Math.min(0.12, baseTransformY * 0.04);
  const swayX = Math.sin(npc.anim * 0.42) * swayAmount;

  const transformX = baseTransformX + swayX;
  const transformY = baseTransformY;

  const cameraBobOffset = Math.sin(player.bob * 0.9) * Math.min(1.4, walkAmount * 1.4);
  const horizon = h / 2 + cameraBobOffset;

  const spriteH = Math.floor(NPC_SPRITE_PROJECTION_HEIGHT / (transformY * 1.08));
const spriteW = Math.floor(spriteH * 0.72);
const screenX = Math.floor((w / 2) * (1 + transformX / transformY));

  const ghostFloat = Math.sin(npc.anim * 0.55) * Math.max(1, spriteH * 0.012);
  const npcBobOffset = Math.sin(npc.anim * 0.75) * Math.max(1, spriteH * 0.01);

  const startY = Math.floor(horizon - spriteH / 2 + ghostFloat + npcBobOffset);
  const startX = Math.floor(screenX - spriteW / 2);

    for (let stripe = 0; stripe < spriteW; stripe++) {
    const x = startX + stripe;
    if (x < 0 || x >= w) continue;

    const wallDepth = zBuffer[x];

    if (wallDepth !== undefined && transformY >= wallDepth - 0.04) {
      continue;
    }

    const u = (stripe / spriteW - 0.5) * 2;
    const bodyRound = Math.sqrt(Math.max(0, 1 - u * u)) * spriteH;

    const torsoTop = Math.floor(startY + (spriteH - bodyRound) / 2);
    const torsoH = Math.max(1, Math.ceil(bodyRound * 0.68));

    const legSwing = Math.round(Math.sin(npc.anim + u * Math.PI * 1.6) * (spriteH * 0.13));
    const legY = torsoTop + torsoH;
    const legH = Math.max(1, Math.ceil(spriteH * 0.34));

    rctx.fillStyle = '#000000';
    rctx.fillRect(x, torsoTop, 1, torsoH);
    rctx.fillRect(x, legY, 1, legH + legSwing);
    rctx.fillRect(x, legY, 1, legH - legSwing);
  }
}

  function drawNPCHeldPlant() {
  if (!npc.active) return;
  if (!plant.active) return;
  if (plant.carriedBy !== 'npc') return;

  const base = projectWorldPoint(npc.x, npc.y, 0.48);

  if (!base) return;

  if (
    base.x < -120 ||
    base.x > renderCanvas.width + 120 ||
    base.y < -120 ||
    base.y > renderCanvas.height + 120
  ) {
    return;
  }

  const life = clamp01(plant.health);
  const growth = clamp01(plant.growth);

  const spriteH = Math.floor(
  PLANT_SPRITE_PROJECTION_HEIGHT *
  1.18 *
  1.27 /
  base.depth
);

  const spriteW = Math.floor(spriteH * 0.56);

  if (spriteH < 5 || spriteW < 4) return;

  const sway =
    Math.sin(plant.anim * 1.2) *
    Math.max(0.4, spriteW * 0.022) *
    life;

  const holdBob = Math.sin(npc.anim * 0.75) * Math.max(1, spriteH * 0.018);
  const baseY = Math.floor(base.y - spriteH * 0.12 + holdBob);

  const startX = Math.floor(base.x - spriteW / 2);
  const endX = Math.floor(base.x + spriteW / 2);

  for (let x = startX; x <= endX; x++) {
    if (x < 0 || x >= renderCanvas.width) continue;

    const wallDepth = zBuffer[x];

    if (wallDepth !== undefined && base.depth >= wallDepth - 0.04) {
      continue;
    }

    rctx.save();
    rctx.globalAlpha = 0.99;
    rctx.beginPath();
    rctx.rect(x, baseY - spriteH - 4, 1, spriteH + 8);
    rctx.clip();

    drawPlantSprite(
      base.x,
      baseY,
      spriteW,
      spriteH,
      life,
      growth,
      sway
    );

    rctx.restore();
  }
}

  function drawOverlays() {
  const w = renderCanvas.width;
  const h = renderCanvas.height;

  rctx.fillStyle = 'rgba(12,12,14,0.05)';
  rctx.fillRect(0, 0, w, h);
}

  function present() {
    const vw = innerWidth;
    const vh = innerHeight;
    ctx.clearRect(0, 0, vw, vh);
    ctx.drawImage(renderCanvas, 0, 0, vw, vh);
  }

    function loop(now) {
    const dt = Math.min(0.033, ((loop.last ?? now) ? (now - (loop.last ?? now)) / 1000 : 0));
    loop.last = now;
    

    movePlayer(dt);
updateInteraction();
updateNPC(dt);
updatePlant(dt);
updateHallwayState();
updateDebugOverlay();

    drawBackground();
castRays();
drawPanelClock();
drawPlant();
drawNPC();
drawNPCHeldPlant();
drawHeldPlant();
drawOverlays();
present();
    requestAnimationFrame(loop);
  }
  seedInitialHallway();
  requestAnimationFrame(loop);

  function bindPad(pad, stick, target, opts = {}) {
    const radius = 44;
    const active = new Map();

    function updateVisual(id, x, y) {
      if (id == null) {
        stick.style.transform = 'translate(-50%,-50%)';
        target.x = 0;
        target.y = 0;
        return;
      }

      const len = Math.hypot(x, y) || 1;
      const nx = len > radius ? x / len * radius : x;
      const ny = len > radius ? y / len * radius : y;

      stick.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
      target.x = Math.max(-1, Math.min(1, nx / radius));
      target.y = Math.max(-1, Math.min(1, ny / radius));
      if (opts.invertY) target.y *= -1;
    }

    function posFromTouch(touch) {
      const rect = pad.getBoundingClientRect();
      return {
        x: touch.clientX - (rect.left + rect.width / 2),
        y: touch.clientY - (rect.top + rect.height / 2)
      };
    }

    pad.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = posFromTouch(t);
        active.set(t.identifier, p);
        updateVisual(t.identifier, p.x, p.y);
      }
    }, { passive: false });

    pad.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (!active.has(t.identifier)) continue;
        const p = posFromTouch(t);
        active.set(t.identifier, p);
        updateVisual(t.identifier, p.x, p.y);
      }
    }, { passive: false });

    function endTouch(e) {
      e.preventDefault();
      for (const t of e.changedTouches) active.delete(t.identifier);
      const first = active.entries().next();
      if (first.done) updateVisual(null, 0, 0);
      else updateVisual(first.value[0], first.value[1].x, first.value[1].y);
    }

    pad.addEventListener('touchend', endTouch, { passive: false });
    pad.addEventListener('touchcancel', endTouch, { passive: false });
  }

    bindPad(document.getElementById('movePad'), document.getElementById('moveStick'), moveInput, { invertY: true });
  bindPad(document.getElementById('lookPad'), document.getElementById('lookStick'), lookInput, { invertY: false });

  function setKey(code, down) {
    if (code === 'KeyW') keys.w = down;
    if (code === 'KeyA') keys.a = down;
    if (code === 'KeyS') keys.s = down;
    if (code === 'KeyD') keys.d = down;
    if (code === 'ArrowLeft') keys.left = down;
    if (code === 'ArrowRight') keys.right = down;
    if (code === 'KeyE' && down) keys.interact = true;

    if (code === 'KeyP' && down) {
      debugVisible = !debugVisible;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && e.repeat) {
      e.preventDefault();
      return;
    }

    setKey(e.code, true);

    if (
      e.code === 'KeyW' ||
      e.code === 'KeyA' ||
      e.code === 'KeyS' ||
      e.code === 'KeyD' ||
      e.code === 'KeyE' ||
      e.code === 'KeyP' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('keyup', (e) => {
    setKey(e.code, false);
  }, { passive: true });

  canvas.addEventListener('click', () => {
    keys.interact = true;

    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      canvas.requestPointerLock();
    }
  });

  let tapStartX = 0;
  let tapStartY = 0;
  let tapStartTime = 0;

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;

    const t = e.touches[0];
    tapStartX = t.clientX;
    tapStartY = t.clientY;
    tapStartTime = performance.now();
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - tapStartX;
    const dy = t.clientY - tapStartY;
    const dist = Math.hypot(dx, dy);
    const elapsed = performance.now() - tapStartTime;

    if (dist <= 14 && elapsed <= 260) {
      keys.interact = true;
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      mouseLookDelta += e.movementX || 0;
    }
  });

  window.addEventListener('blur', () => {
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
    keys.left = false;
    keys.right = false;
    keys.interact = false;
    mouseLookDelta = 0;
  });
})();
