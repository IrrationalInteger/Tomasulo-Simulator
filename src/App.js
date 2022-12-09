import "./App.css";
import TextareaAutosize from "react-textarea-autosize";
import execution from "./logic/execution";
import { useState } from "react";
let clock = 0;
const addLatency = 2;
const mulLatency = 10;
const divLatency = 40;
const loadLatency = 2;
const storeLatency = 2;
const reservationAdd = new Array(3);
const reservationMul = new Array(2);
const reservationLoad = new Array(3);
const reservationStore = new Array(3);
const reservationAddAssignments = new Array(3);
const reservationMulAssignments = new Array(2);
const reservationLoadAssignments = new Array(3);
const reservationStoreAssignments = new Array(3);
const writesTo = new Map();
let addAmount = 0;
let mulAmount = 0;
let loadAmount = 0;
let storeAmount = 0;
const registerFile = new Array(32).fill(0);
let exitingInsts = 0;
let programEnd = false;
let finishedThisCycle = [];

//for test
registerFile.forEach((elem, idx) => (registerFile[idx] = idx));
const cache = new Array(1024).fill(0);
let canNotIssue = false;
let writeBuffer = null;

//for test
registerFile[2] = 3.5;
registerFile[3] = 7.2;
cache[2] = 2;
cache[3] = 3;

function getOrDefault(map, key) {
  return map.has(key) ? map.get(key) : [];
}

function getV(arg) {
  console.log(arg, registerFile[+arg.slice(1)]);
  return typeof registerFile[+arg.slice(1)] === "number"
    ? registerFile[+arg.slice(1)]
    : null;
}

function getQ(identifier, arg) {
  console.log(writesTo, identifier, getOrDefault(writesTo, identifier));
  const value =
    typeof registerFile[+arg.slice(1)] === "string"
      ? registerFile[+arg.slice(1)]
      : null;
  if (value) {
    writesTo.set(value, [...getOrDefault(writesTo, value), identifier]);
  }
  return value;
}

function findFirstZero(arr) {
  for (let i = 0; i < arr.length; i++) {
    console.log(arr[i]);
    if (!arr[i] || arr[i] === null) return i;
  }
  return -1;
}

function runCycle(instruction) {
  let instructionArgs, instructionSplit, instructionType;
  if (instruction) {
    exitingInsts++;
    instructionSplit = instruction.split(" ");
    instructionType = instructionSplit[0];
    instructionArgs = [
      instructionSplit[1],
      instructionSplit[2],
      instructionSplit[3],
    ];
    canNotIssue = false;
  } else programEnd = true;

  // Execute
  finishedThisCycle = [];
  for (let i = 0; i < reservationAdd.length; i++) {
    if (
      reservationAdd[i] &&
      reservationAdd[i].Qj === null &&
      reservationAdd[i].Qk === null &&
      reservationAdd[i].CyclesLeft !== 0
    ) {
      reservationAdd[i].CyclesLeft--;
      if (reservationAdd[i].CyclesLeft === 0) {
        finishedThisCycle.push(reservationAdd[i].A);
      }
    }
  }

  for (let i = 0; i < reservationMul.length; i++) {
    if (
      reservationMul[i] &&
      reservationMul[i].Qj === null &&
      reservationMul[i].Qk === null &&
      reservationMul[i].CyclesLeft !== 0
    ) {
      reservationMul[i].CyclesLeft--;
      if (reservationMul[i].CyclesLeft === 0) {
        finishedThisCycle.push(reservationMul[i].A);
      }
    }
  }

  for (let i = 0; i < reservationLoad.length; i++) {
    if (reservationLoad[i] && reservationLoad[i].CyclesLeft !== 0) {
      reservationLoad[i].CyclesLeft--;
      if (reservationLoad[i].CyclesLeft === 0) {
        finishedThisCycle.push(reservationLoad[i].A);
      }
    }
  }

  for (let i = 0; i < reservationStore.length; i++) {
    if (
      reservationStore[i] &&
      reservationStore[i].Qj === null &&
      reservationStore[i].CyclesLeft !== 0
    ) {
      reservationStore[i].CyclesLeft--;
      if (reservationStore[i].CyclesLeft === 0) {
        finishedThisCycle.push(reservationStore[i].A);
      }
    }
  }

  // Issue
  if (!programEnd) {
    switch (instructionType) {
      case "ADD":
      case "SUB":
        console.log("amount before check", addAmount);
        if (reservationAdd.length !== addAmount) {
          addAmount++;
          const index = findFirstZero(reservationAddAssignments);
          console.log("index=", index);
          reservationAddAssignments[index] = 1;
          reservationAdd[index] = {
            A: "A" + (index + 1),
            CyclesLeft: addLatency,
            Type: instructionType,
            Vj: getV(instructionArgs[1]),
            Vk: getV(instructionArgs[2]),
            Qj: getQ("A" + (index + 1), instructionArgs[1]),
            Qk: getQ("A" + (index + 1), instructionArgs[2]),
          };
          registerFile[+instructionArgs[0].slice(1)] = "A" + (index + 1);
          writesTo.set("A" + (index + 1), [+instructionArgs[0].slice(1)]);
          if (reservationAdd[index].Qj !== null)
            writesTo.set(reservationAdd[index].Qj, [
              ...getOrDefault(writesTo, reservationAdd[index].Qj),
              "A" + (index + 1),
            ]);
          if (reservationAdd[index].Qk !== null)
            writesTo.set(reservationAdd[index].Qk, [
              ...getOrDefault(writesTo, reservationAdd[index].Qk),
              "A" + (index + 1),
            ]);
        } else canNotIssue = true;
        console.log("can issue=", !canNotIssue);
        console.log("writesTo=", writesTo);
        break;
      case "DIV":
      case "MUL":
        if (reservationMul.length !== mulAmount) {
          mulAmount++;
          const index = findFirstZero(reservationMulAssignments);
          reservationMulAssignments[index] = 1;
          reservationMul[index] = {
            A: "M" + (index + 1),
            CyclesLeft: instructionType === "DIV" ? divLatency : mulLatency,
            Type: instructionType,
            Vj: getV(instructionArgs[1]),
            Vk: getV(instructionArgs[2]),
            Qj: getQ("M" + (index + 1), instructionArgs[1]),
            Qk: getQ("M" + (index + 1), instructionArgs[2]),
          };
          registerFile[+instructionArgs[0].slice(1)] = "M" + (index + 1);
          writesTo.set("M" + (index + 1), [+instructionArgs[0].slice(1)]);
          if (reservationMul[index].Qj !== null)
            writesTo.set(reservationMul[index].Qj, [
              ...getOrDefault(writesTo, reservationMul[index].Qj),
              "M" + (index + 1),
            ]);
          if (reservationMul[index].Qk !== null)
            writesTo.set(reservationMul[index].Qk, [
              ...getOrDefault(writesTo, reservationMul[index].Qk),
              "M" + (index + 1),
            ]);
        } else canNotIssue = true;
        break;
      case "LD":
        if (reservationLoad.length !== loadAmount) {
          loadAmount++;
          const index = findFirstZero(reservationLoadAssignments);

          reservationLoadAssignments[index] = 1;
          reservationLoad[index] = {
            A: "L" + (index + 1),
            CyclesLeft: loadLatency,
            Type: instructionType,
            V: +instructionArgs[1],
          };
          registerFile[+instructionArgs[0].slice(1)] = "L" + (index + 1);
          writesTo.set("L" + (index + 1), [+instructionArgs[0].slice(1)]);
        } else canNotIssue = true;
        break;
      case "SD":
        if (reservationStore.length !== storeAmount) {
          storeAmount++;
          const index = findFirstZero(reservationStoreAssignments);
          reservationStoreAssignments[index] = 1;
          reservationStore[index] = {
            A: "S" + (index + 1),
            CyclesLeft: storeLatency,
            Type: instructionType,
            Vj: getV(instructionArgs[0]),
            Vk: +instructionArgs[1],
            Qj: getQ("S" + (index + 1), instructionArgs[0]),
          };
          if (reservationStore[index].Qj !== null) {
            writesTo.set(reservationStore[index].Qj, [
              ...getOrDefault(writesTo, reservationStore[index].Qj),
              "S" + (index + 1),
            ]);
          }

          if (reservationStore[index].Qk !== null) {
            writesTo.set(reservationStore[index].Qk, [
              ...getOrDefault(writesTo, reservationStore[index].Qk),
              "S" + (index + 1),
            ]);
          }
        } else canNotIssue = true;
        break;
    }
  }

  clock++;

  // Write Back
  if (exitingInsts > 0) {
    for (let i = 0; i < reservationAdd.length; i++) {
      if (
        reservationAdd[i]?.CyclesLeft === 0 &&
        !finishedThisCycle.includes(reservationAdd[i]?.A)
      ) {
        console.log("writeBuffer=", writeBuffer);
        writeBuffer =
          writeBuffer === null
            ? {
                ...reservationAdd[i],
                numOfDependencies: getOrDefault(writesTo, reservationAdd[i].A)
                  .length,
              }
            : writeBuffer.numOfDependencies <
              writesTo.get(reservationAdd[i].A).length
            ? {
                ...reservationAdd[i],
                numOfDependencies: getOrDefault(writesTo, reservationAdd[i].A)
                  .length,
              }
            : writeBuffer;
      }
    }

    for (let i = 0; i < reservationMul.length; i++) {
      if (
        reservationMul[i]?.CyclesLeft === 0 &&
        !finishedThisCycle.includes(reservationMul[i]?.A)
      ) {
        writeBuffer =
          writeBuffer === null
            ? {
                ...reservationMul[i],
                numOfDependencies: getOrDefault(writesTo, reservationMul[i].A)
                  .length,
              }
            : writeBuffer.numOfDependencies <
              writesTo.get(reservationMul[i].A).length
            ? {
                ...reservationMul[i],
                numOfDependencies: getOrDefault(writesTo, reservationMul[i].A)
                  .length,
              }
            : writeBuffer;
      }
    }
    for (let i = 0; i < reservationLoad.length; i++) {
      if (
        reservationLoad[i]?.CyclesLeft === 0 &&
        !finishedThisCycle.includes(reservationLoad[i]?.A)
      ) {
        writeBuffer =
          writeBuffer === null
            ? {
                ...reservationLoad[i],
                numOfDependencies: getOrDefault(writesTo, reservationLoad[i].A)
                  .length,
              }
            : writeBuffer.numOfDependencies <
              writesTo.get(reservationLoad[i].A).length
            ? {
                ...reservationLoad[i],
                numOfDependencies: getOrDefault(writesTo, reservationLoad[i].A)
                  .length,
              }
            : writeBuffer;
      }
    }
    // I dont like this i dont like it at all
    for (let i = 0; i < reservationStore.length; i++) {
      if (
        reservationStore[i]?.CyclesLeft === 0 &&
        !finishedThisCycle.includes(reservationStore[i]?.A)
      ) {
        execution[reservationStore[i].Type](
          reservationStore[i].Vj,
          reservationStore[i].Vk,
          cache
        );
        reservationStore[i] = null;
        reservationStoreAssignments[i] = 0;
        exitingInsts--;
        storeAmount--;
      }
    }
    if (writeBuffer) {
      const dependencies = getOrDefault(writesTo, writeBuffer.A);

      const index = dependencies[0];
      const result = execution[writeBuffer.Type](
        writeBuffer.Vj,
        writeBuffer.Vk,
        cache,
        writeBuffer.V
      );

      if (index !== null && registerFile[index] === writeBuffer.A) {
        registerFile[index] = result;
      }

      dependencies.splice(0, 1);
      dependencies.forEach((reservationStationName) => {
        let reservationStation;
        if (reservationStationName.slice(0, 1) === "A") {
          reservationStation =
            reservationAdd[+reservationStationName.slice(1) - 1];

          if (reservationStation.Qj === writeBuffer.A) {
            reservationStation.Qj = null;
            reservationStation.Vj = result;
          }
          if (reservationStation.Qk === writeBuffer.A) {
            reservationStation.Qk = null;
            reservationStation.Vk = result;
          }
        } else if (reservationStationName.charAt(0) === "M") {
          reservationStation =
            reservationMul[+reservationStationName.slice(1) - 1];
          if (reservationStation.Qj === writeBuffer.A) {
            reservationStation.Qj = null;
            reservationStation.Vj = result;
          }
          if (reservationStation.Qk === writeBuffer.A) {
            reservationStation.Qk = null;
            reservationStation.Vk = result;
          }
        } else if (reservationStationName.charAt(0) === "L") {
          reservationStation =
            reservationLoad[+reservationStationName.slice(1) - 1];
          if (reservationStation.Qj === writeBuffer.A) {
            reservationStation.Qj = null;
            reservationStation.Vj = result;
          }
          if (reservationStation.Qk === writeBuffer.A) {
            reservationStation.Qk = null;
            reservationStation.Vk = result;
          }
        }
      });
      console.log("wb=", writeBuffer);
      writesTo.delete(writeBuffer.A);

      if (writeBuffer.A.slice(0, 1) === "A") {
        reservationAddAssignments[+writeBuffer.A.slice(1) - 1] = 0;
        reservationAdd[+writeBuffer.A.slice(1) - 1] = null;
        addAmount--;
      } else if (writeBuffer.A.slice(0, 1) === "M") {
        reservationMulAssignments[+writeBuffer.A.slice(1) - 1] = 0;
        reservationMul[+writeBuffer.A.slice(1) - 1] = null;
        mulAmount--;
      } else if (writeBuffer.A.slice(0, 1) === "L") {
        reservationLoadAssignments[+writeBuffer.A.slice(1) - 1] = 0;
        reservationLoad[+writeBuffer.A.slice(1) - 1] = null;
        loadAmount--;
      }

      writeBuffer = null;
      exitingInsts--;
      console.log("amount after sub=", addAmount);
    }
  }

  return canNotIssue;
}

function App() {
  const [pc, setPC] = useState(0);
  const [instructions, setInstructions] = useState();
  const [result, setResult] = useState("");

  return (
    <div>
      <div>
        <TextareaAutosize
          onChange={(e) => setInstructions(e.target.value)}
        ></TextareaAutosize>
        <TextareaAutosize
          contentEditable={false}
          value={result}
        ></TextareaAutosize>
      </div>
      <button
        onClick={() => {
          console.log("pc=", pc);
          runCycle(instructions.split(/\r?\n|\r|\n/g)[pc]);
          if (!canNotIssue && !programEnd) {
            setPC(pc + 1);
          }
          setResult(
            "clock: " +
              clock +
              +"\n" +
              "reservationAdd: " +
              JSON.stringify(reservationAdd) +
              "\n" +
              "reservationMul: " +
              JSON.stringify(reservationMul) +
              "\n" +
              "reservationLoad: " +
              JSON.stringify(reservationLoad) + // Should we add Qi to the register file?
              "\n" +
              "reservationStore: " +
              JSON.stringify(reservationStore) +
              "\n" +
              "registerFile: " +
              JSON.stringify(registerFile) +
              "\n" +
              "writesTo: " +
              JSON.stringify(writesTo) +
              "\n"
          );
        }}
      >
        Next Cycle
      </button>
    </div>
  );
}

export default App;
