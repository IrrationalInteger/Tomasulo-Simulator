let clock = 0;
let currentInstruction = 0;
let reservationAdd = new Array(3);
let reservationMul = new Array(2);
let reservationLoad = new Array(3);
let reservationStore = new Array(3);
let queue = [];
let registerFile = new Array(32);
let cache = new Array(1024);

export default function runCycle() {
  clock++;
}
