import "./App.css";
import TextareaAutosize from "react-textarea-autosize";
import execution from "./logic/execution";
import { useState } from "react";
import * as React from "react";
import { styled } from "@mui/material/styles";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell, { tableCellClasses } from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";

function deepEqual(x, y) {
  return x && y && typeof x === "object" && typeof y === "object"
    ? Object.keys(x).length === Object.keys(y).length &&
        Object.keys(x).reduce(function (isEqual, key) {
          return isEqual && deepEqual(x[key], y[key]);
        }, true)
    : x === y;
}

const StyledTableCell = styled(TableCell)(({ theme }) => ({
  [`&.${tableCellClasses.head}`]: {
    backgroundColor: theme.palette.common.black,
    color: theme.palette.common.white,
  },
  [`&.${tableCellClasses.body}`]: {
    fontSize: 14,
  },
}));

const StyledTableRow = styled(TableRow)(({ theme }) => ({
  "&:nth-of-type(odd)": {
    backgroundColor: theme.palette.action.hover,
  },
  // hide last border
  "&:last-child td, &:last-child th": {
    border: 0,
  },
}));

//---------------------------
let decrementPc = false;

//current clock cycle
let clock = 1;

// Latency of different operations (Should be edited to take input from the user ??) Can the add and the sub have different latencies ??
let addLatency;
let mulLatency;
let divLatency;
let loadLatency;
let storeLatency;

//Different Reservation Station and Buffers (Should be edited to take the size as input from the user??)
let reservationAdd = new Array(3);
let reservationMul = new Array(2);
let reservationLoad = new Array(3);
let reservationStore = new Array(3);

//Arrays for the busy bits of each reservation station of each type
let reservationAddAssignments = new Array(3);
let reservationMulAssignments = new Array(2);
let reservationLoadAssignments = new Array(3);
let reservationStoreAssignments = new Array(3);

//Number of busy reservation stations of each type
let addAmount = 0;
let mulAmount = 0;
let loadAmount = 0;
let storeAmount = 0;

// Number of the instructions currently in reservation stations
let existingInsts = 0;

//Register file with 32 floating point registers having 0 as initial value
let registerFile = new Array(32).fill(0);

//Memory cache of 1024 words having 0 as initial value
let cache = new Array(1024).fill(0);

// Hash map that maps each reservation station with the register and the other reservation stations waiting for the result produced by it
let writesTo = new Map();

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
cache.forEach((elem, idx) => (cache[idx] = idx));

//for test

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
function runCycle(instruction, handleStop) {
  let reservationAddAvailable = false;
  for (let i = 0; i < reservationAddAssignments.length; i++) {
    if (reservationAddAssignments[i] === 0) {
      reservationAddAvailable = true;
    }
  }

  let reservationStoreAvailable = false;
  for (let i = 0; i < reservationStoreAssignments.length; i++) {
    if (reservationStoreAssignments[i] === 0) reservationStoreAvailable = true;
  }

  let reservationMulAvailable = false;
  for (let i = 0; i < reservationMulAssignments.length; i++) {
    if (reservationMulAssignments[i] === 0) {
      reservationMulAvailable = true;
    }
  }

  let reservationLoadAvailable = false;
  for (let i = 0; i < reservationLoadAssignments.length; i++) {
    if (reservationLoadAssignments[i] === 0) {
      reservationLoadAvailable = true;
    }
  }
  // Issue

  //nullify the tag of the Issued instruction at the beginning of each cycle
  issuedThisCycle = null;
  //try to issue the current instruction if the pipeline is not stalled and program hasn't ended yet
  if (!stalled && !programEnd) {
    let instructionArgs, instructionSplit, instructionType;

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
          // increment the number of instruction currently in the pipeline
          existingInsts++;
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
        } else {
          stalled = true;
        } //stall the pipe line if all the reservation stations are busy
        break;
      //Mul and Div instructions should be placed in the Mul reservation stations
      case "DIV":
      case "MUL":
        if (reservationMul.length !== mulAmount) {
          // increment the number of instruction currently in the pipeline
          existingInsts++;
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
          // increment the number of instruction currently in the pipeline
          existingInsts++;
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
          // increment the number of instruction currently in the pipeline
          existingInsts++;
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
      if (existingInsts === 0) handleStop();
      storeAmount--;
      if (!reservationStoreAvailable)
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
        if (!reservationAddAvailable) {
          if (
            instruction?.split(" ")[0] === "ADD" ||
            instruction?.split(" ")[0] === "SUB"
          ) {
            stalled = false;
            decrementPc = true;
          }
        }
        break;
      case "M":
        reservationMulAssignments[+writeBuffer.Tag.slice(1) - 1] = 0;
        reservationMul[+writeBuffer.Tag.slice(1) - 1] = null;
        mulAmount--;
        if (!reservationMulAvailable) {
          if (
            instruction?.split(" ")[0] === "MUL" ||
            instruction?.split(" ")[0] === "DIV"
          ) {
            stalled = false;
            decrementPc = true;
          }
        }
        break;
      case "L":
        reservationLoadAssignments[+writeBuffer.Tag.slice(1) - 1] = 0;
        reservationLoad[+writeBuffer.Tag.slice(1) - 1] = null;
        loadAmount--;
        if (!reservationLoadAvailable) {
          if (instruction?.split(" ")[0] === "LD") {
            stalled = false;
            decrementPc = true;
          }
        }
        break;
    }
    //remove the list of dependencies of the instruction that has published
    writesTo.delete(writeBuffer.Tag);
    //nullify the write buffer
    writeBuffer = null;
    // decrement the number of the instructions
    existingInsts--;
    if (existingInsts === 0) handleStop();
  }

  return stalled;
}

let flag = false;

function App() {
  const [pc, setPc] = useState(0);
  const [instructions, setInstructions] = useState();
  const [regFile, setRegFile] = useState([]);
  const [resAdd, setResAdd] = useState([]);
  const [resMul, setResMul] = useState([]);
  const [resStore, setResStore] = useState([]);
  const [resLoad, setResLoad] = useState([]);
  const [resCache, setResCache] = useState([]);
  const [instQueue, setInstQueue] = useState([]);

  const [regFileOld, setRegFileOld] = useState([]);
  const [resAddOld, setResAddOld] = useState([]);
  const [resMulOld, setResMulOld] = useState([]);
  const [resStoreOld, setResStoreOld] = useState([]);
  const [resLoadOld, setResLoadOld] = useState([]);
  const [resCacheOld, setResCacheOld] = useState([]);
  const [instQueueOld, setInstQueueOld] = useState([]);

  const [aL, setAL] = useState(1);
  const [mL, setML] = useState(1);
  const [lL, setLL] = useState(1);
  const [sL, setSL] = useState(1);

  const [stop, setStop] = useState(false);

  function handleStop() {
    setStop(true);
  }

  const [running, setRunning] = useState(false);
  console.log("running", stop);
  return (
    <div>
      {!running && (
        <>
          <p style={{ marginTop: "0px" }}>Enter Add/Sub latencies : </p>
          <input
            type="number"
            onChange={(e) => {
              setAL(e.target.value);
              addLatency = e.target.value;
            }}
          />
          <p>Enter Mul latencies : </p>
          <input
            type="number"
            onChange={(e) => {
              setML(e.target.value);
              mulLatency = e.target.value;
            }}
          ></input>
          <p>Enter Load latencies : </p>
          <input
            type="number"
            onChange={(e) => {
              setLL(e.target.value);
              loadLatency = e.target.value;
            }}
          ></input>
          <p>Enter Store latencies : </p>
          <input
            type="number"
            onChange={(e) => {
              setSL(e.target.value);
              storeLatency = e.target.value;
            }}
          ></input>

          <p>Enter your instructions in assembly</p>
        </>
      )}

      <div>
        <TextareaAutosize
          disabled={running}
          onChange={(e) => setInstructions(e.target.value)}
        ></TextareaAutosize>
      </div>
      {running ? (
        <>
          <p>{"Clock Cycle : " + clock}</p>
          {stop ? (
            <h1>Finished Execution. Click reset to run again.</h1>
          ) : (
            <button
              onClick={() => {
                // get the next instruction in the instructions queue
                let currentInstruction = instructions.split(/\r?\n|\r|\n/g)[pc];
                // if  no more instructions then mark the end of the program
                if (!currentInstruction) programEnd = true;
                // Run for another cycle
                runCycle(currentInstruction, handleStop);

                // increment the pc if the pipline is not stalled and the program has not ended yet
                if (!stalled && !programEnd && !decrementPc) {
                  setPc(pc + 1);
                } else {
                  flag = true;
                }
                console.log(flag);
                if (decrementPc) {
                  decrementPc = false;
                }

                // set the old states
                setRegFileOld([...regFile]);
                setResAddOld([...resAdd]);
                setResMulOld([...resMul]);
                setResStoreOld([...resStore]);
                setResLoadOld([...resLoad]);
                setResCacheOld([...resCache]);

                // set the new states
                setRegFile([...registerFile]);
                setResAdd([...reservationAdd]);
                setResMul([...reservationMul]);
                setResStore([...reservationStore]);
                setResLoad([...reservationLoad]);
                setResCache([...cache]);
                if (!flag) {
                  setInstQueueOld([...instQueue]);
                  setInstQueue([...instQueue].splice(0, instQueue.length - 1));
                }
                flag = false;
                // increment the current clock cycle
                clock++;
              }}
            >
              Next Cycle
            </button>
          )}
        </>
      ) : (
        <button
          onClick={() => {
            setRunning(true);
            setInstQueue(instructions.split(/\r?\n|\r|\n/g).reverse());
          }}
          disabled={
            !aL || !mL || !lL || !sL || !instructions || instructions === ""
          }
        >
          Start
        </button>
      )}
      <button
        onClick={() => {
          document.location.reload(true);
        }}
      >
        Reset
      </button>
      {running && (
        <>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{ display: "flex", flexDirection: "row", gap: "400px" }}
            >
              <div>
                <p>Instruction Queue :</p>
                <TableContainer
                  className="scroll-hidden"
                  component={Paper}
                  sx={{ maxHeight: 325, width: "fit-content" }}
                >
                  <Table aria-label="customized table" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <StyledTableCell>No.</StyledTableCell>
                        <StyledTableCell>Instruction</StyledTableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {instQueue.map((row, idx) => (
                        <StyledTableRow key={idx}>
                          <StyledTableCell
                            component="th"
                            scope="row"
                            sx={
                              !deepEqual(row, instQueueOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {instQueue.length - idx}
                          </StyledTableCell>
                          <StyledTableCell
                            sx={
                              !deepEqual(row, instQueueOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row}
                          </StyledTableCell>
                        </StyledTableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
              <div>
                <p>Register File</p>
                <TableContainer
                  className="scroll-hidden"
                  component={Paper}
                  sx={{ maxHeight: 325, width: "fit-content" }}
                >
                  {" "}
                  <Table aria-label="customized table" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <StyledTableCell>No.</StyledTableCell>
                        <StyledTableCell align="right">Value</StyledTableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {regFile.map((row, idx) => (
                        <StyledTableRow
                          key={idx}
                          style={
                            !deepEqual(row, regFileOld[idx])
                              ? {
                                  color: "5px solid red",
                                }
                              : undefined
                          }
                        >
                          <StyledTableCell
                            component="th"
                            scope="row"
                            sx={
                              !deepEqual(row, regFileOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {"F" + idx}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, regFileOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row}
                          </StyledTableCell>
                        </StyledTableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
              <div>
                <p>Memory : </p>
                <TableContainer
                  className="scroll-hidden"
                  component={Paper}
                  sx={{ maxHeight: 325, width: "fit-content" }}
                >
                  <Table aria-label="customized table" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <StyledTableCell>No.</StyledTableCell>
                        <StyledTableCell align="right">Value</StyledTableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {resCache.map((row, idx) => (
                        <StyledTableRow
                          key={idx}
                          style={
                            !deepEqual(row, resCacheOld[idx])
                              ? {
                                  color: "5px solid red",
                                }
                              : undefined
                          }
                        >
                          <StyledTableCell
                            component="th"
                            scope="row"
                            sx={
                              !deepEqual(row, resCacheOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {idx}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resCacheOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row}
                          </StyledTableCell>
                        </StyledTableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
            </div>
            <div
              style={{ display: "flex", flexDirection: "row", gap: "100px" }}
            >
              {" "}
              <div>
                <p>Store Buffer :</p>
                <TableContainer
                  className="scroll-hidden"
                  component={Paper}
                  sx={{ maxHeight: 325, width: "fit-content" }}
                >
                  <Table aria-label="customized table" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <StyledTableCell>Tag</StyledTableCell>
                        <StyledTableCell align="right">
                          Cycles Left
                        </StyledTableCell>
                        <StyledTableCell align="right">Type</StyledTableCell>
                        <StyledTableCell align="right">Vj</StyledTableCell>
                        <StyledTableCell align="right">Vk</StyledTableCell>
                        <StyledTableCell align="right">Qj</StyledTableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {resStore.map((row, idx) => (
                        <StyledTableRow
                          key={idx}
                          style={
                            !deepEqual(row, resStoreOld[idx])
                              ? {
                                  color: "5px solid red",
                                }
                              : undefined
                          }
                        >
                          <StyledTableCell
                            component="th"
                            scope="row"
                            sx={
                              !deepEqual(row, resStoreOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Tag}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resStoreOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.CyclesLeft}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resStoreOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Type}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resStoreOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Vj}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resStoreOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Vk}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resStoreOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Qj}
                          </StyledTableCell>
                        </StyledTableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
              <div>
                <p>Load Buffer :</p>
                <TableContainer
                  className="scroll-hidden"
                  component={Paper}
                  sx={{ maxHeight: 325, width: "fit-content" }}
                >
                  <Table aria-label="customized table" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <StyledTableCell>Tag</StyledTableCell>
                        <StyledTableCell align="right">
                          Cycles Left
                        </StyledTableCell>
                        <StyledTableCell align="right">Type</StyledTableCell>
                        <StyledTableCell align="right">V</StyledTableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {resLoad.map((row, idx) => (
                        <StyledTableRow
                          key={idx}
                          style={
                            !deepEqual(row, resLoadOld[idx])
                              ? {
                                  color: "5px solid red",
                                }
                              : undefined
                          }
                        >
                          <StyledTableCell
                            component="th"
                            scope="row"
                            sx={
                              !deepEqual(row, resLoadOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Tag}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resLoadOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.CyclesLeft}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resLoadOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Type}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resLoadOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.V}
                          </StyledTableCell>
                        </StyledTableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
              <div>
                <p>Add Reservation Station : </p>
                <TableContainer
                  className="scroll-hidden"
                  component={Paper}
                  sx={{ maxHeight: 325, width: "fit-content" }}
                >
                  <Table aria-label="customized table" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <StyledTableCell>Tag</StyledTableCell>
                        <StyledTableCell align="right">
                          Cycles Left
                        </StyledTableCell>
                        <StyledTableCell align="right">Type</StyledTableCell>
                        <StyledTableCell align="right">Vj</StyledTableCell>

                        <StyledTableCell align="right">Vk</StyledTableCell>

                        <StyledTableCell align="right">Qj</StyledTableCell>

                        <StyledTableCell align="right">Qk</StyledTableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {resAdd.map((row, idx) => (
                        <StyledTableRow
                          key={idx}
                          style={
                            !deepEqual(row, resAddOld[idx])
                              ? {
                                  color: "5px solid red",
                                }
                              : undefined
                          }
                        >
                          <StyledTableCell
                            component="th"
                            scope="row"
                            sx={
                              !deepEqual(row, resAddOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Tag}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resAddOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.CyclesLeft}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resAddOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Type}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resAddOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Vj}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resAddOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Vk}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resAddOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Qj}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resAddOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Qk}
                          </StyledTableCell>
                        </StyledTableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
              <div>
                <p>Mul Reservation Station</p>
                <TableContainer
                  className="scroll-hidden"
                  component={Paper}
                  sx={{ maxHeight: 325, width: "fit-content" }}
                >
                  <Table aria-label="customized table" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <StyledTableCell>Tag</StyledTableCell>
                        <StyledTableCell align="right">
                          Cycles Left
                        </StyledTableCell>
                        <StyledTableCell align="right">Type</StyledTableCell>
                        <StyledTableCell align="right">Vj</StyledTableCell>

                        <StyledTableCell align="right">Vk</StyledTableCell>

                        <StyledTableCell align="right">Qj</StyledTableCell>

                        <StyledTableCell align="right">Qk</StyledTableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {resMul.map((row, idx) => (
                        <StyledTableRow
                          key={idx}
                          style={
                            !deepEqual(row, resMulOld[idx])
                              ? {
                                  color: "5px solid red",
                                }
                              : undefined
                          }
                        >
                          <StyledTableCell
                            component="th"
                            scope="row"
                            sx={
                              !deepEqual(row, resMulOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Tag}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resMulOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.CyclesLeft}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resMulOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Type}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resMulOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Vj}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resMulOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Vk}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resMulOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Qj}
                          </StyledTableCell>
                          <StyledTableCell
                            align="right"
                            sx={
                              !deepEqual(row, resMulOld[idx])
                                ? {
                                    color: "red",
                                  }
                                : undefined
                            }
                          >
                            {row?.Qk}
                          </StyledTableCell>
                        </StyledTableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
