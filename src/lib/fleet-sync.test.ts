import assert from "node:assert/strict";
import test from "node:test";
import {
  localFleetsToDrop,
  planVehicleSync,
  serverFleetForLocal,
  unconfirmedLocalFleetIds,
  type SyncFleet,
  type SyncVehicle,
} from "./fleet-sync.ts";

const serverFleets: SyncFleet[] = [
  { id: "fleet-rad-cab", name: "Rad Cab", type: "taxi", companyId: "company-rad-cab" },
  { id: "fleet-1st-choice", name: "1st Choice Recovery", type: "tow", companyId: "company-1st-choice" },
  { id: "fleet-pinkie-tow", name: "Pinkie Tow", type: "tow", companyId: "company-pinkie-tow" },
  { id: "fleet-turo", name: "Turo", type: "turo", companyId: "company-turo" },
  { id: "fleet-other-fleets", name: "Other fleets", type: "service_vehicle", companyId: "company-other-fleets" },
];

test("two local taxi rows collapse onto the one server fleet", () => {
  const local: SyncFleet[] = [
    { id: "local-taxi-a", name: "Taxi", type: "taxi", companyId: "company-rad-cab" },
    { id: "local-taxi-b", name: "Taxi", type: "taxi", companyId: "company-rad-cab" },
  ];
  assert.equal(serverFleetForLocal(local[0], serverFleets)?.id, "fleet-rad-cab");
  assert.equal(serverFleetForLocal(local[1], serverFleets)?.id, "fleet-rad-cab");
  const vehicles: SyncVehicle[] = [
    { id: "v12", fleetId: "local-taxi-a", companyId: "company-rad-cab", unitNumber: "12", plate: "RC-0012" },
    { id: "v23", fleetId: "local-taxi-b", companyId: "company-rad-cab", unitNumber: "23", plate: "ABC-1234" },
  ];
  const plan = planVehicleSync(vehicles, [], local, serverFleets);
  assert.deepEqual(
    plan.upload.map((item) => item.serverFleetId),
    ["fleet-rad-cab", "fleet-rad-cab"]
  );
  assert.deepEqual(plan.already, []);
});

test("a plate or unit number already on the server is not uploaded again", () => {
  const localFleets: SyncFleet[] = [
    { id: "local-taxi", name: "Taxi", type: "taxi", companyId: "company-rad-cab" },
  ];
  const local: SyncVehicle[] = [
    { id: "local-cxb", fleetId: "local-taxi", companyId: "company-rad-cab", unitNumber: "9", plate: "CXB-9373" },
    { id: "local-18", fleetId: "local-taxi", companyId: "company-rad-cab", unitNumber: "18", plate: "RC-0018" },
    { id: "local-new", fleetId: "local-taxi", companyId: "company-rad-cab", unitNumber: "23", plate: "ABC-1234" },
  ];
  const server: SyncVehicle[] = [
    { id: "server-cxb", companyId: "company-rad-cab", unitNumber: "9", plate: "CXB9373" },
    { id: "server-other", companyId: "company-rad-cab", unitNumber: "18", plate: "DIFFERENT" },
  ];
  const plan = planVehicleSync(local, server, localFleets, serverFleets);
  assert.deepEqual(
    plan.already.map((item) => item.local.id),
    ["local-cxb", "local-18"]
  );
  assert.equal(plan.already[0].serverVehicleId, "server-cxb");
  assert.deepEqual(
    plan.upload.map((item) => item.local.id),
    ["local-new"]
  );
});

test("the same plate in another company is a different vehicle", () => {
  const localFleets: SyncFleet[] = [
    { id: "local-tow", name: "Tow", type: "tow", companyId: "company-pinkie-tow" },
  ];
  const plan = planVehicleSync(
    [
      {
        id: "pinkie",
        fleetId: "local-tow",
        companyId: "company-pinkie-tow",
        unitNumber: "1",
        plate: "CXB9373",
      },
    ],
    [
      {
        id: "rad",
        companyId: "company-rad-cab",
        unitNumber: "9",
        plate: "CXB9373",
      },
    ],
    localFleets,
    serverFleets
  );
  assert.equal(plan.upload.length, 1);
  assert.equal(plan.upload[0].serverFleetId, "fleet-pinkie-tow");
  assert.equal(serverFleetForLocal(localFleets[0], serverFleets)?.id, "fleet-pinkie-tow");
});

test("a fleet with no server match stays on the phone", () => {
  const localFleets: SyncFleet[] = [
    { id: "local-extra", name: "Night", type: "taxi", companyId: "company-missing" },
  ];
  const plan = planVehicleSync(
    [
      {
        id: "keep",
        fleetId: "local-extra",
        companyId: "company-missing",
        unitNumber: "4",
        plate: "NIGHT1",
      },
    ],
    [],
    localFleets,
    serverFleets
  );
  assert.deepEqual(plan.waiting.map((vehicle) => vehicle.id), ["keep"]);
  assert.deepEqual(localFleetsToDrop(localFleets, serverFleets, []), []);
});

test("a local fleet is dropped only after every vehicle on it is confirmed", () => {
  const localFleets: SyncFleet[] = [
    { id: "local-taxi-a", name: "Taxi", type: "taxi", companyId: "company-rad-cab" },
    { id: "local-taxi-b", name: "Taxi", type: "taxi", companyId: "company-rad-cab" },
    { id: "fleet-rad-cab", name: "Rad Cab", type: "taxi", companyId: "company-rad-cab" },
  ];
  const vehicles: SyncVehicle[] = [
    { id: "v12", fleetId: "local-taxi-a", companyId: "company-rad-cab", plate: "RC0012" },
    { id: "v18", fleetId: "local-taxi-a", companyId: "company-rad-cab", plate: "RC0018" },
    { id: "v23", fleetId: "local-taxi-b", companyId: "company-rad-cab", plate: "ABC1234" },
  ];
  const blocked = unconfirmedLocalFleetIds(vehicles, ["v12", "v23"]);
  assert.deepEqual(blocked, ["local-taxi-a"]);
  assert.deepEqual(localFleetsToDrop(localFleets, serverFleets, blocked), ["local-taxi-b"]);
  assert.deepEqual(localFleetsToDrop(localFleets, serverFleets, []), [
    "local-taxi-a",
    "local-taxi-b",
  ]);
});
