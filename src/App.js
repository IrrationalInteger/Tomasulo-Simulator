import "./App.css";
import TextareaAutosize from "react-textarea-autosize";
import execution from "./logic/execution";
import { useState } from "react";
let clock = 0;
let addLatency = 4;
let mulLatency = 10;
let loadLatency = 2;
let storeLatency = 2;
let reservationAdd = new Array(3);
let reservationMul = new Array(2);
let reservationLoad = new Array(3);
let reservationStore = new Array(3);
let reservationAddAssignments = new Array(3);
let reservationMulAssignments = new Array(2);
let reservationLoadAssignments = new Array(3);
let reservationStoreAssignments = new Array(3);
let writesTo = new Map();
let addAmount = 0;
let mulAmount = 0;
let loadAmount = 0;
let storeAmount = 0;
let registerFile = new Array(32);
let enteringInsts = 0,
    exitingInsts = 0,
    moreToWrite = 0;

registerFile.fill(0);

//for test
registerFile.forEach((elem, idx) => (registerFile[idx] = idx));
let cache = new Array(1024);
let canNotIssue = false;
let writeBuffer = null;

let lookUpTable = new Map();

//for test
registerFile[2] = 3.5;
registerFile[3] = 7.2;

for (let i = 0; i < 32; i++) {
    lookUpTable.set("F" + i, i);
}

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
    const value =
        typeof registerFile[+arg.slice(1)] === "string"
            ? registerFile[+arg.slice(1)]
            : null;
    if (value) {
        writesTo.set(identifier, getOrDefault(writesTo, identifier).push(arg));
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
        enteringInsts++;
        exitingInsts++;
        instructionSplit = instruction.split(" ");
        instructionType = instructionSplit[0];
        instructionArgs = [
            instructionSplit[1],
            instructionSplit[2],
            instructionSplit[3],
        ];
        canNotIssue = false;
    }
    // Write Back
    console.log("running cycle");
    if (exitingInsts > 0) {
        for (let i = 0; i < reservationAdd.length; i++) {
            if (reservationAdd[i]?.CyclesLeft === 0) {
                console.log("writeBuffer=", writeBuffer);
                writeBuffer =
                    writeBuffer === null
                        ? {
                              ...reservationAdd[i],
                              numOfDependencies: getOrDefault(
                                  writesTo,
                                  reservationAdd[i].A
                              ).length,
                          }
                        : writeBuffer.numOfDependencies <
                          writesTo.get(reservationAdd[i].A).length
                        ? {
                              ...reservationAdd[i],
                              numOfDependencies: getOrDefault(
                                  writesTo,
                                  reservationAdd[i].A
                              ).length,
                          }
                        : writeBuffer;
            }
        }

        for (let i = 0; i < reservationMul.length; i++) {
            if (reservationMul[i]?.CyclesLeft === 0) {
                writeBuffer =
                    writeBuffer === null
                        ? {
                              ...reservationMul[i],
                              numOfDependencies: getOrDefault(
                                  writesTo,
                                  reservationMul[i].A
                              ).length,
                          }
                        : writeBuffer.numOfDependencies <
                          writesTo.get(reservationMul[i].A).length
                        ? {
                              ...reservationMul[i],
                              numOfDependencies: getOrDefault(
                                  writesTo,
                                  reservationMul[i].A
                              ).length,
                          }
                        : writeBuffer;
            }
        }
        for (let i = 0; i < reservationLoad.length; i++) {
            if (reservationLoad[i]?.CyclesLeft === 0) {
                writeBuffer =
                    writeBuffer === null
                        ? {
                              ...reservationLoad[i],
                              numOfDependencies: getOrDefault(
                                  writesTo,
                                  reservationLoad[i].A
                              ).length,
                          }
                        : writeBuffer.numOfDependencies <
                          writesTo.get(reservationLoad[i].A).length
                        ? {
                              ...reservationLoad[i],
                              numOfDependencies: getOrDefault(
                                  writesTo,
                                  reservationLoad[i].A
                              ).length,
                          }
                        : writeBuffer;
            }
        }
        if (writeBuffer) {
            const dependencies = getOrDefault(writesTo, writeBuffer.A);
            console.log("depdep=", dependencies);
            const index = dependencies[0];
            const result = execution[writeBuffer.Type](
                writeBuffer.Vj,
                writeBuffer.Vk
            );
            if (index && registerFile[index] == writeBuffer.A)
                registerFile[index] = result;
            console.log("dep1=", dependencies);
            dependencies.splice(0, 1);
            console.log("dep2=", dependencies);
            dependencies.forEach((reservationStationName) => {
                let reservationStation;
                if (reservationStationName.slice(0, 1) === "A") {
                    reservationStation =
                        reservationAdd[+reservationStationName.slice(1) - 1];
                    console.log("res station", reservationStation);
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
                } else {
                    reservationStation =
                        reservationStore[+reservationStationName.slice(1) - 1];
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
            reservationAddAssignments[+writeBuffer.A.slice(1) - 1] = 0;
            reservationAdd[+writeBuffer.A.slice(1) - 1] = null;
            addAmount--;
            writeBuffer = null;
            exitingInsts--;
            console.log("amount after sub=", addAmount);
        }
    }
    // Execute

    console.log("exec");
    for (let i = 0; i < reservationAdd.length; i++) {
        if (
            reservationAdd[i] &&
            reservationAdd[i].Qj === null &&
            reservationAdd[i].Qk === null &&
            reservationAdd[i].CyclesLeft !== 0
        )
            reservationAdd[i].CyclesLeft--;
    }

    for (let i = 0; i < reservationMul.length; i++) {
        if (
            reservationMul[i] &&
            reservationMul[i].Qj === null &&
            reservationMul[i].Qk === null &&
            reservationMul[i].CyclesLeft !== 0
        )
            reservationMul[i].CyclesLeft--;
    }

    for (let i = 0; i < reservationLoad.length; i++) {
        if (
            reservationLoad[i] &&
            reservationLoad[i].Qj === null &&
            reservationLoad[i].Qk === null &&
            reservationLoad[i].CyclesLeft !== 0
        )
            reservationLoad[i].CyclesLeft--;
    }

    for (let i = 0; i < reservationStore.length; i++) {
        if (
            reservationStore[i] &&
            reservationStore[i].Qj === null &&
            reservationStore[i].Qk === null &&
            reservationStore[i].CyclesLeft !== 0
        )
            reservationStore[i].CyclesLeft--;
    }

    // Issue
    if (enteringInsts > 0) {
        console.log(
            "issue with type=",
            instructionType,
            "args=",
            instructionArgs
        );
        enteringInsts--;
        switch (instructionType) {
            case "add":
            case "sub":
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
                    registerFile[+instructionArgs[0].slice(1)] =
                        "A" + (index + 1);
                    writesTo.set("A" + (index + 1), [
                        +instructionArgs[0].slice(1),
                    ]);
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
            case "div":
            case "mul":
                if (reservationMul.length !== reservationMul) {
                    mulAmount++;
                    const index = findFirstZero(reservationMulAssignments);
                    reservationMulAssignments[index] = 1;
                    reservationMul[index] = {
                        A: "M" + (index + 1),
                        CyclesLeft: mulLatency,
                        Type: instructionType,
                        Vj: getV(instructionArgs[1]),
                        Vk: getV(instructionArgs[2]),
                        Qj: getQ("M" + (index + 1), instructionArgs[1]),
                        Qk: getQ("M" + (index + 1), instructionArgs[2]),
                    };
                    registerFile[+instructionArgs[0].slice(1)] =
                        "M" + (index + 1);
                    writesTo.set("M" + (index + 1), [
                        +instructionArgs[1].slice(1),
                    ]);
                } else canNotIssue = true;
                break;
            case "load":
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
                    registerFile[+instructionArgs[0].slice(1)] =
                        "L" + (index + 1);
                } else canNotIssue = true;
                break;
            case "store":
                if (reservationStore.length !== reservationStore) {
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
                    registerFile[instructionArgs[0].slice(1)] =
                        "S" + (index + 1);
                    writesTo.set("S" + (index + 1), [
                        instructionArgs[0].slice(1),
                    ]);
                } else canNotIssue = true;
                break;
        }
    }

    clock++;
    return canNotIssue ? -1 : 0;
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
                    const result = runCycle(instructions.split("\n")[pc]);
                    if (result !== -1) {
                        setPC(pc + 1);
                    }
                    setResult(
                        "clock: " +
                            clock +
                            "reservationAdd: " +
                            JSON.stringify(reservationAdd) +
                            "\n" +
                            "reservationMul: " +
                            JSON.stringify(reservationMul) +
                            "\n" +
                            "reservationLoad: " +
                            JSON.stringify(reservationLoad) +
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
