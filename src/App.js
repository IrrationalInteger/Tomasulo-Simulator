import "./App.css";
import TextareaAutosize from "react-textarea-autosize";
import execution from "./logic/execution";
import { useState } from "react";

let decrementPc = false;

//current clock cycle
let clock = 1;

// Latency of different operations (Should be edited to take input from the user ??) Can the add and the sub have different latencies ??
const addLatency = 2;
const mulLatency = 10;
const divLatency = 40;
const loadLatency = 2;
const storeLatency = 2;

//Different Reservation Station and Buffers (Should be edited to take the size as input from the user??)
const reservationAdd = new Array(3);
const reservationMul = new Array(2);
const reservationLoad = new Array(3);
const reservationStore = new Array(3);

//Arrays for the busy bits of each reservation station of each type
const reservationAddAssignments = new Array(3);
const reservationMulAssignments = new Array(2);
const reservationLoadAssignments = new Array(3);
const reservationStoreAssignments = new Array(3);

//Number of busy reservation stations of each type
let addAmount = 0;
let mulAmount = 0;
let loadAmount = 0;
let storeAmount = 0;

// Number of the instructions currently in reservation stations
let existingInsts = 0; //Should we disable the button when it returns back to zero ??

//Register file with 32 floating point registers having 0 as initial value
const registerFile = new Array(32).fill(0);

//Memory cache of 1024 words having 0 as initial value
const cache = new Array(1024).fill(0);

// Hash map that maps each reservation station with the register and the other reservation stations waiting for the result produced by it
const writesTo = new Map();

//Variable contains the reservation station that will publish to the CDB this cycle
let writeBuffer = null;

/*Varibale to keep track of the tag of the reservation station of 
the instruction that has been issued this cycle to prevent it from executing in the same cycle*/
let issuedThisCycle = null;

/*Array to keep track of the tags of reservation stations containing 
instructions that have finished execution this cycle to prevent them from publishing in the same cycle*/
let finishedThisCycle = [];

//Flag to mark the end of the program entered by the user
let programEnd = false;

// Flag to indicate pipeline stalls
let stalled = false;

//for test
registerFile.forEach((elem, idx) => (registerFile[idx] = idx));

//for test
registerFile[2] = 3.5;
registerFile[3] = 7.2;
cache[2] = 2;
cache[3] = 3;

//fuction that returns the value of a key if the key exists in the map and an empty array other wise
function getOrDefault(map, key) {
  return map.has(key) ? map.get(key) : [];
}

/*function that reads an operand of an instruction from the register file if it is valid and returns null otherwise
 Used to fill the V fields of the reservation stations*/
function getV(arg) {
  return typeof registerFile[+arg.slice(1)] === "number"
    ? registerFile[+arg.slice(1)]
    : null;
}

/*function that gets the tag of the reservation station producing an operand of an instruction 
if it is not valid in the register file and returns null otherwise
 Used to fill the Q fields of the reservation stations*/
function getQ(identifier, arg) {
  const value =
    typeof registerFile[+arg.slice(1)] === "string"
      ? registerFile[+arg.slice(1)]
      : null;
  if (value) {
    writesTo.set(value, [...getOrDefault(writesTo, value), identifier]);
  }
  return value;
}

/*function that finds the first zero in an array 
  Used to find the first empty reservation station to issue a new instruction to it */
function findFirstZero(arr) {
  for (let i = 0; i < arr.length; i++) {
    if (!arr[i] || arr[i] === null) return i;
  }
  return -1;
}
/*function that counts the number of Instructions that will be ready to execute after publishing the result of an instruction 
Takes as input an array of tags of the reservation stations waiting for the result*/
function getDependentInsts(dependencies) {
  let insts = 0;
  dependencies.forEach((tag) => {
    let reservationStation;
    switch (tag.slice(0, 1)) {
      case "A":
        reservationStation = reservationAdd[+tag.slice(1) - 1];

        if (!reservationStation.Qj || !reservationStation.Qk) insts++;
        break;
      case "M":
        reservationStation = reservationMul[+tag.slice(1) - 1];
        if (!reservationStation.Qj || !reservationStation.Qk) insts++;
        break;
      case "S":
        insts++;
        break;
    }
  });
  return insts;
}

/*The main fuction that simulates tomasulo algorithm cycle by cycle
Takes as input the instruction that should be issued this cycle */
function runCycle(instruction, pc, setPc) {
  console.log(instruction);

  // Issue

  //nullify the tag of the Issued instruction at the beginning of each cycle
  issuedThisCycle = null;
  //try to issue the current instruction if the pipeline is not stalled and program hasn't ended yet
  if (!stalled && !programEnd) {
    let instructionArgs, instructionSplit, instructionType;

    // increment the number of instruction currently in the pipeline
    existingInsts++;

    // decode the different fields of the current instruction

    instructionSplit = instruction?.split(" ");
    instructionType = instructionSplit[0];
    instructionArgs = [
      instructionSplit[1],
      instructionSplit[2],
      instructionSplit[3],
    ];

    //place the current instruction in a reservation station of its type
    switch (instructionType) {
      //ADD and SUB instructions should be placed in the Add reservation stations
      case "ADD":
      case "SUB":
        //first check if there is an empty reservation station of that type
        if (reservationAdd.length !== addAmount) {
          //increment the number of busy reservation stations of type add
          addAmount++;
          //get the first empty reservation station
          const index = findFirstZero(reservationAddAssignments);

          //mark it as a busy one
          reservationAddAssignments[index] = 1;

          //set the different fields of that reservation station
          reservationAdd[index] = {
            Tag: "A" + (index + 1), // Add one to the index as it starts at 0 while the tags starts at 1
            CyclesLeft: addLatency, //The number of clock cycles left to finish execution
            Type: instructionType,
            Vj: getV(instructionArgs[1]),
            Vk: getV(instructionArgs[2]),
            Qj: getQ("A" + (index + 1), instructionArgs[1]),
            Qk: getQ("A" + (index + 1), instructionArgs[2]),
          };

          // store the tag of the reservation station to prevent this instruction from executing in the same cycle
          issuedThisCycle = reservationAdd[index].Tag;

          /*mark the content of the distination register as invalid in the register file
            and store the tag of the reservation as the one producing its value */
          registerFile[+instructionArgs[0].slice(1)] = "A" + (index + 1);

          // mark that the destination register is waiting for the result produced by the reservation station
          writesTo.set("A" + (index + 1), [+instructionArgs[0].slice(1)]);

          /* If the instruction is waiting for some operand add its tag to the waiting reservation stations of 
          the reservation station that operand */

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
        } else stalled = true; //stall the pipe line if all the reservation stations are busy
        break;
      //Mul and Div instructions should be placed in the Mul reservation stations
      case "DIV":
      case "MUL":
        if (reservationMul.length !== mulAmount) {
          mulAmount++;
          const index = findFirstZero(reservationMulAssignments);
          reservationMulAssignments[index] = 1;
          reservationMul[index] = {
            Tag: "M" + (index + 1),
            CyclesLeft: instructionType === "DIV" ? divLatency : mulLatency,
            Type: instructionType,
            Vj: getV(instructionArgs[1]),
            Vk: getV(instructionArgs[2]),
            Qj: getQ("M" + (index + 1), instructionArgs[1]),
            Qk: getQ("M" + (index + 1), instructionArgs[2]),
          };
          issuedThisCycle = reservationMul[index].Tag;
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
        } else stalled = true;
        break;
      case "LD":
        if (reservationLoad.length !== loadAmount) {
          loadAmount++;
          const index = findFirstZero(reservationLoadAssignments);

          reservationLoadAssignments[index] = 1;
          reservationLoad[index] = {
            Tag: "L" + (index + 1),
            CyclesLeft: loadLatency,
            Type: instructionType,
            V: +instructionArgs[1], //the effective address
          };
          issuedThisCycle = reservationLoad[index].Tag;
          registerFile[+instructionArgs[0].slice(1)] = "L" + (index + 1);
          writesTo.set("L" + (index + 1), [+instructionArgs[0].slice(1)]);
        } else stalled = true;
        break;
      case "SD":
        if (reservationStore.length !== storeAmount) {
          storeAmount++;
          const index = findFirstZero(reservationStoreAssignments);
          reservationStoreAssignments[index] = 1;
          reservationStore[index] = {
            Tag: "S" + (index + 1),
            CyclesLeft: storeLatency,
            Type: instructionType,
            Vj: getV(instructionArgs[0]), // source register to store its value in memory
            Vk: +instructionArgs[1], // effective address
            Qj: getQ("S" + (index + 1), instructionArgs[0]),
          };
          issuedThisCycle = reservationStore[index].Tag;
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
        } else stalled = true;
        break;
    }
  }

  // Execute

  //Empty the array of finished instructions in each cycle
  finishedThisCycle = [];

  //Check all Add reservation stations
  for (let i = 0; i < reservationAdd.length; i++) {
    // if the reservation station :
    if (
      reservationAdd[i] && //contains an instruction
      reservationAdd[i].Tag !== issuedThisCycle && //that is not issued this cyle
      reservationAdd[i].Qj === null && // , does not wait for any operand
      reservationAdd[i].Qk === null &&
      reservationAdd[i].CyclesLeft !== 0 // and still have cycles left to finish execution
    ) {
      reservationAdd[i].CyclesLeft--; //make the instruction execute for another cycle
      if (reservationAdd[i].CyclesLeft === 0) {
        //if the instruction finish execution
        //add the tag of its reservation station to the finished instructions
        finishedThisCycle.push(reservationAdd[i].Tag);
      }
    }
  }

  //Check all Mul reservation stations
  for (let i = 0; i < reservationMul.length; i++) {
    if (
      reservationMul[i] &&
      reservationMul[i].Tag !== issuedThisCycle &&
      reservationMul[i].Qj === null &&
      reservationMul[i].Qk === null &&
      reservationMul[i].CyclesLeft !== 0
    ) {
      reservationMul[i].CyclesLeft--;
      if (reservationMul[i].CyclesLeft === 0) {
        finishedThisCycle.push(reservationMul[i].Tag);
      }
    }
  }

  //Check all Load reservation stations
  for (let i = 0; i < reservationLoad.length; i++) {
    if (
      reservationLoad[i] &&
      reservationLoad[i].Tag !== issuedThisCycle &&
      reservationLoad[i].CyclesLeft !== 0
    ) {
      reservationLoad[i].CyclesLeft--;
      if (reservationLoad[i].CyclesLeft === 0) {
        finishedThisCycle.push(reservationLoad[i].Tag);
      }
    }
  }

  //Check all Store reservation stations
  for (let i = 0; i < reservationStore.length; i++) {
    if (
      reservationStore[i] &&
      reservationStore[i].Tag !== issuedThisCycle &&
      reservationStore[i].Qj === null &&
      reservationStore[i].CyclesLeft !== 0
    ) {
      reservationStore[i].CyclesLeft--;
      if (reservationStore[i].CyclesLeft === 0) {
        finishedThisCycle.push(reservationStore[i].Tag);
      }
    }
  }

  // Write Back

  for (let i = 0; i < reservationAdd.length; i++) {
    // if the reservation station holds an instruction that has finished execution in a previous cycle (not the current cycle)
    if (
      reservationAdd[i]?.CyclesLeft === 0 &&
      !finishedThisCycle.includes(reservationAdd[i]?.Tag)
    ) {
      // get the tags of reservation stations waiting for the result  (slice(1)--> removes the first element which is the register waiting the result)
      let dependencies = getOrDefault(writesTo, reservationAdd[i].Tag).slice(1);

      //get the number of instructions that will be ready to execute after publishin the result
      let numOfDependentInsts = getDependentInsts(dependencies);

      // if the write buffer
      if (
        !writeBuffer || //is still empty
        writeBuffer.numOfDependentInsts < numOfDependentInsts || //or contains an instruction that has smaller number of dependent insts
        (writeBuffer.numOfDependentInsts == numOfDependentInsts &&
          writeBuffer.numOfDependencies < dependencies.length) //or has same number of dependent insts but less number of dependencies
      )
        //put this current instruction in the write buffer
        writeBuffer = {
          ...reservationAdd[i],
          numOfDependencies: dependencies.length,
          numOfDependentInsts: numOfDependentInsts,
        };
    }
  }

  for (let i = 0; i < reservationMul.length; i++) {
    if (
      reservationMul[i]?.CyclesLeft === 0 &&
      !finishedThisCycle.includes(reservationMul[i]?.Tag)
    ) {
      let dependencies = getOrDefault(writesTo, reservationMul[i].Tag).slice(1);

      let numOfDependentInsts = getDependentInsts(dependencies);

      if (
        !writeBuffer ||
        writeBuffer.numOfDependentInsts < numOfDependentInsts ||
        (writeBuffer.numOfDependentInsts == numOfDependentInsts &&
          writeBuffer.numOfDependencies < dependencies.length)
      )
        writeBuffer = {
          ...reservationMul[i],
          numOfDependencies: dependencies.length,
          numOfDependentInsts: numOfDependentInsts,
        };
    }
  }
  for (let i = 0; i < reservationLoad.length; i++) {
    if (
      reservationLoad[i]?.CyclesLeft === 0 &&
      !finishedThisCycle.includes(reservationLoad[i]?.Tag)
    ) {
      let dependencies = getOrDefault(writesTo, reservationLoad[i].Tag).slice(
        1
      );

      let numOfDependentInsts = getDependentInsts(dependencies);

      if (
        !writeBuffer ||
        writeBuffer.numOfDependentInsts < numOfDependentInsts ||
        (writeBuffer.numOfDependentInsts == numOfDependentInsts &&
          writeBuffer.numOfDependencies < dependencies.length)
      )
        writeBuffer = {
          ...reservationLoad[i],
          numOfDependencies: dependencies.length,
          numOfDependentInsts: numOfDependentInsts,
        };
    }
  }

  for (let i = 0; i < reservationStore.length; i++) {
    if (
      reservationStore[i]?.CyclesLeft === 0 &&
      !finishedThisCycle.includes(reservationStore[i]?.Tag)
    ) {
      execution[reservationStore[i].Type](
        reservationStore[i].Vj,
        reservationStore[i].Vk,
        cache
      );
      reservationStore[i] = null;
      reservationStoreAssignments[i] = 0;
      existingInsts--;
      storeAmount--;

      if (instruction?.split(" ")[0] === "SD") {
        stalled = false;
        decrementPc = true;
      }
    }
  }

  //if there is an instruction that is ready to publish
  if (writeBuffer) {
    // compute the result of the instruction
    const result = execution[writeBuffer.Type](
      writeBuffer.Vj,
      writeBuffer.Vk,
      cache,
      writeBuffer.V
    );
    // get the register and the tags of reservation stations waiting for the result
    const dependencies = getOrDefault(writesTo, writeBuffer.Tag);

    // the index of the destination register in the register file
    const index = dependencies[0];

    // if the  register is still waiting for the result of this instruction
    if (index !== null && registerFile[index] === writeBuffer.Tag) {
      //update the value of the register
      registerFile[index] = result;
    }
    // remove  the register from the dependencies list to get only the tags of reservation stations waiting for the result
    dependencies.splice(0, 1);

    // update each reservation station with the computed result
    dependencies.forEach((tag) => {
      let reservationStation;
      //switch on the first char of tag to know the type of the reservation station
      switch (tag.slice(0, 1)) {
        case "A":
          // reservation station index starts from 0 while the tag starts from 1 so minus 1 from the tag number
          reservationStation = reservationAdd[+tag.slice(1) - 1];

          if (reservationStation.Qj === writeBuffer.Tag) {
            reservationStation.Qj = null;
            reservationStation.Vj = result;
          }
          if (reservationStation.Qk === writeBuffer.Tag) {
            reservationStation.Qk = null;
            reservationStation.Vk = result;
          }
          break;
        case "M":
          reservationStation = reservationMul[+tag.slice(1) - 1];
          if (reservationStation.Qj === writeBuffer.Tag) {
            reservationStation.Qj = null;
            reservationStation.Vj = result;
          }
          if (reservationStation.Qk === writeBuffer.Tag) {
            reservationStation.Qk = null;
            reservationStation.Vk = result;
          }
          break;
        case "S":
          reservationStation = reservationStore[+tag.slice(1) - 1];
          reservationStation.Qj = null;
          reservationStation.Vj = result;
          break;
      }
    });

    // Empty the reservation station from the instruction that has just published to the CDB
    switch (writeBuffer.Tag.slice(0, 1)) {
      case "A":
        //set the busy bit to 0
        reservationAddAssignments[+writeBuffer.Tag.slice(1) - 1] = 0;
        //set the reservation station to null
        reservationAdd[+writeBuffer.Tag.slice(1) - 1] = null;
        //decrement the number of busy add reservation station
        addAmount--;
        if (
          instruction?.split(" ")[0] === "ADD" ||
          instruction?.split(" ")[0] === "SUB"
        ) {
          stalled = false;
          decrementPc = true;
        }
        break;
      case "M":
        reservationMulAssignments[+writeBuffer.Tag.slice(1) - 1] = 0;
        reservationMul[+writeBuffer.Tag.slice(1) - 1] = null;
        mulAmount--;
        if (
          instruction?.split(" ")[0] === "MUL" ||
          instruction?.split(" ")[0] === "DIV"
        ) {
          stalled = false;
          decrementPc = true;
        }
        break;
      case "L":
        reservationLoadAssignments[+writeBuffer.Tag.slice(1) - 1] = 0;
        reservationLoad[+writeBuffer.Tag.slice(1) - 1] = null;
        loadAmount--;
        if (instruction?.split(" ")[0] === "LD") {
          stalled = false;
          decrementPc = true;
        }
        break;
    }
    //remove the list of dependencies of the instruction that has published
    writesTo.delete(writeBuffer.Tag);
    //nullify the write buffer
    writeBuffer = null;
    // decrement the number of the instructions
    existingInsts--;
  }

  return stalled;
}

function App() {
  const [pc, setPc] = useState(0);
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
          // get the next instruction in the instructions queue
          let currentInstruction = instructions.split(/\r?\n|\r|\n/g)[pc];
          // if  no more instructions then mark the end of the program
          if (!currentInstruction) programEnd = true;
          // Run for another cycle
          runCycle(currentInstruction);

          // increment the pc if the pipline is not stalled and the program has not ended yet

          if (!stalled && !programEnd && !decrementPc) {
            setPc(pc + 1);
          }
          if (decrementPc) {
            decrementPc = false;
          }
          setResult(
            "clock: " +
              (clock + "\n") +
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
              "\n"
          );
          // increment the current clock cycle
          clock++;
        }}
      >
        Next Cycle
      </button>
    </div>
  );
}

export default App;
